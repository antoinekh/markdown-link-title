import * as http from "node:http";
import * as https from "node:https";
import * as tls from "node:tls";
import { URL } from "node:url";
import type { ProxyConfig } from "./config";

// Type-only import above: this module pulls in no `vscode` runtime code and only
// the Node standard library, which keeps the proxy logic auditable and testable.

export interface HttpGetOptions {
  timeoutMs: number;
  maxRedirects: number;
  maxBytes: number;
  userAgent: string;
  proxy: ProxyConfig;
  /** Best-effort: stop reading the body once this marker is seen (e.g. "</head>"). */
  stopAtMarker?: string;
}

export interface HttpResponse {
  statusCode: number;
  headers: http.IncomingHttpHeaders;
  body: Buffer;
  /** The final URL after any redirects. */
  url: string;
}

/**
 * Decide whether `host` matches any entry in a `noProxy` list. An entry matches
 * when it is `*`, equal to the host, or a domain suffix of the host (with or
 * without a leading dot, e.g. `example.com` matches `api.example.com`).
 */
export function matchesNoProxy(host: string, noProxy: string[]): boolean {
  const target = host.toLowerCase();
  for (const raw of noProxy) {
    const entry = raw.trim().toLowerCase().replace(/^\./, "");
    if (!entry) {
      continue;
    }
    if (entry === "*" || target === entry || target.endsWith(`.${entry}`)) {
      return true;
    }
  }
  return false;
}

function envProxy(target: URL): string | undefined {
  const fromEnv =
    target.protocol === "https:"
      ? process.env.HTTPS_PROXY ?? process.env.https_proxy
      : process.env.HTTP_PROXY ?? process.env.http_proxy;
  return fromEnv ?? process.env.ALL_PROXY ?? process.env.all_proxy;
}

/**
 * Resolve the proxy to use for `target`, or `undefined` to connect directly /
 * via VS Code's patched global agent.
 *
 * When `proxySupport` is anything other than `off`, we return `undefined` so the
 * request uses the default global agent that the VS Code extension host has
 * already patched to honour `http.proxy`, PAC, system proxy and authenticated
 * proxies. We only resolve a proxy ourselves in the rare `off` case.
 */
export function resolveProxyUrl(target: URL, proxy: ProxyConfig): URL | undefined {
  if (proxy.proxySupport !== "off") {
    return undefined;
  }
  const proxyUrl = proxy.proxy ?? envProxy(target);
  if (!proxyUrl) {
    return undefined;
  }
  const envNoProxy = (process.env.NO_PROXY ?? process.env.no_proxy ?? "").split(",");
  if (matchesNoProxy(target.hostname, [...proxy.noProxy, ...envNoProxy])) {
    return undefined;
  }
  try {
    return new URL(proxyUrl);
  } catch {
    return undefined;
  }
}

function proxyAuthHeader(proxyUrl: URL, configured?: string): string | undefined {
  if (configured) {
    return configured;
  }
  if (proxyUrl.username || proxyUrl.password) {
    const creds = `${decodeURIComponent(proxyUrl.username)}:${decodeURIComponent(proxyUrl.password)}`;
    return `Basic ${Buffer.from(creds).toString("base64")}`;
  }
  return undefined;
}

function collectBody(
  res: http.IncomingMessage,
  opts: HttpGetOptions,
  signal: AbortSignal | undefined,
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let total = 0;
    // The marker may straddle a chunk boundary, so each chunk is scanned together
    // with the tail of the previous one. This stays O(body size) overall, unlike
    // re-scanning the whole accumulated buffer on every chunk.
    const marker = opts.stopAtMarker ? Buffer.from(opts.stopAtMarker) : undefined;
    let tail = Buffer.alloc(0);

    const finish = (): void => {
      res.removeAllListeners();
      resolve(Buffer.concat(chunks));
    };

    res.on("data", (chunk: Buffer) => {
      chunks.push(chunk);
      total += chunk.length;
      if (total >= opts.maxBytes) {
        res.destroy();
        finish();
        return;
      }
      if (marker) {
        if (Buffer.concat([tail, chunk]).includes(marker)) {
          res.destroy();
          finish();
          return;
        }
        tail = Buffer.from(chunk.subarray(Math.max(0, chunk.length - marker.length + 1)));
      }
    });
    res.on("end", finish);
    res.on("error", (err) => {
      // A self-inflicted destroy() after we have the bytes we need is not an error.
      if (chunks.length > 0) {
        finish();
      } else {
        reject(err);
      }
    });
    signal?.addEventListener("abort", () => res.destroy(), { once: true });
  });
}

function baseHeaders(target: URL, userAgent: string): http.OutgoingHttpHeaders {
  return {
    "User-Agent": userAgent,
    Accept: "text/html,application/xhtml+xml",
    "Accept-Encoding": "identity",
    Host: target.host,
  };
}

function attachTimeout(req: http.ClientRequest, ms: number, message: string): void {
  req.setTimeout(ms, () => req.destroy(new Error(message)));
}

/** Perform a single GET (no redirect following) and return the response + body. */
function singleRequest(
  target: URL,
  opts: HttpGetOptions,
  signal: AbortSignal | undefined,
): Promise<{ res: http.IncomingMessage; body: Buffer }> {
  return new Promise((resolve, reject) => {
    const isHttps = target.protocol === "https:";
    const proxyUrl = resolveProxyUrl(target, opts.proxy);
    const headers = baseHeaders(target, opts.userAgent);

    const onResponse = (res: http.IncomingMessage): void => {
      collectBody(res, opts, signal)
        .then((body) => resolve({ res, body }))
        .catch(reject);
    };

    // Direct connection (or via VS Code's patched global agent).
    if (!proxyUrl) {
      const lib = isHttps ? https : http;
      const req = lib.request(
        target,
        { method: "GET", headers, signal, rejectUnauthorized: opts.proxy.proxyStrictSSL },
        onResponse,
      );
      attachTimeout(req, opts.timeoutMs, "Title fetch timed out");
      req.on("error", reject);
      req.end();
      return;
    }

    const proxyHost = proxyUrl.hostname;
    const proxyPort = Number(proxyUrl.port) || (proxyUrl.protocol === "https:" ? 443 : 80);
    const auth = proxyAuthHeader(proxyUrl, opts.proxy.proxyAuthorization);

    // Plain HTTP through an explicit proxy: send the absolute URL as the path.
    if (!isHttps) {
      const proxyHeaders = { ...headers };
      if (auth) {
        proxyHeaders["Proxy-Authorization"] = auth;
      }
      const req = http.request(
        { host: proxyHost, port: proxyPort, method: "GET", path: target.toString(), headers: proxyHeaders, signal },
        onResponse,
      );
      attachTimeout(req, opts.timeoutMs, "Title fetch timed out");
      req.on("error", reject);
      req.end();
      return;
    }

    // HTTPS through an explicit proxy: open a CONNECT tunnel, then TLS over it.
    const connectHeaders: http.OutgoingHttpHeaders = { Host: target.host };
    if (auth) {
      connectHeaders["Proxy-Authorization"] = auth;
    }
    const connectReq = http.request({
      host: proxyHost,
      port: proxyPort,
      method: "CONNECT",
      path: `${target.hostname}:${target.port || 443}`,
      headers: connectHeaders,
      signal,
    });
    attachTimeout(connectReq, opts.timeoutMs, "Proxy CONNECT timed out");
    connectReq.on("error", reject);
    connectReq.on("connect", (proxyRes, socket) => {
      if (proxyRes.statusCode !== 200) {
        socket.destroy();
        reject(new Error(`Proxy CONNECT failed with status ${proxyRes.statusCode}`));
        return;
      }
      const tlsSocket = tls.connect(
        { socket, servername: target.hostname, rejectUnauthorized: opts.proxy.proxyStrictSSL },
        () => {
          // Pass the target URL so the request line carries the real path; the
          // already-connected TLS socket is reused via createConnection.
          const req = https.request(
            target,
            { method: "GET", headers, createConnection: () => tlsSocket, signal },
            onResponse,
          );
          attachTimeout(req, opts.timeoutMs, "Title fetch timed out");
          req.on("error", reject);
          req.end();
        },
      );
      tlsSocket.on("error", reject);
    });
    connectReq.end();
  });
}

/**
 * GET a URL using only the Node standard library, following redirects up to
 * `maxRedirects` and capping the body at `maxBytes`. Proxy behaviour is governed
 * by {@link resolveProxyUrl}.
 */
export async function httpGet(
  rawUrl: string,
  opts: HttpGetOptions,
  signal?: AbortSignal,
): Promise<HttpResponse> {
  let current = new URL(rawUrl);
  for (let redirect = 0; ; redirect++) {
    const { res, body } = await singleRequest(current, opts, signal);
    const status = res.statusCode ?? 0;
    const location = res.headers.location;
    if (status >= 300 && status < 400 && location && redirect < opts.maxRedirects) {
      const next = new URL(location, current);
      // Only follow redirects to http(s); stop at anything else (file:, data:, …).
      if (next.protocol !== "http:" && next.protocol !== "https:") {
        return { statusCode: status, headers: res.headers, body, url: current.toString() };
      }
      current = next;
      continue;
    }
    return { statusCode: status, headers: res.headers, body, url: current.toString() };
  }
}
