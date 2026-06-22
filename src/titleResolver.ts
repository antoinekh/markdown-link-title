import type { ExtensionConfig, ProxyConfig } from "./config";
import { httpGet } from "./http";
import { decodeHtml, extractTitle, truncateTitle } from "./titleParser";
import { escapeLinkLabel } from "./url";

/**
 * Fetch `url` and resolve a Markdown-safe link label from its page title.
 * Returns `undefined` (so the caller falls back to an empty label) on any
 * non-success status, non-HTML response, missing title, or network error.
 */
export async function resolveTitle(
  url: string,
  config: ExtensionConfig,
  proxy: ProxyConfig,
  signal?: AbortSignal,
): Promise<string | undefined> {
  const response = await httpGet(
    url,
    {
      timeoutMs: config.timeoutMs,
      maxRedirects: config.maxRedirects,
      maxBytes: config.maxBodyKb * 1024,
      userAgent: config.userAgent,
      proxy,
      stopAtMarker: "</head>",
    },
    signal,
  );

  if (response.statusCode < 200 || response.statusCode >= 300) {
    return undefined;
  }

  const contentType = String(response.headers["content-type"] ?? "");
  if (!/html/i.test(contentType)) {
    return undefined;
  }

  const html = decodeHtml(response.body, contentType);
  const title = extractTitle(html, config.preferOpenGraph);
  if (!title) {
    return undefined;
  }
  return escapeLinkLabel(truncateTitle(title, config.maxTitleLength));
}
