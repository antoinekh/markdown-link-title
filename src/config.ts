import * as vscode from "vscode";

// Default User-Agent: a link-preview bot. Many sites (Unsplash, Reddit, …) serve
// a JavaScript bot-wall to browser/unknown agents but whitelist link-unfurling
// bots so their pages unfurl in chat/social apps, returning clean og:title
// metadata. That is exactly what this extension wants. Override via the setting.
export const DEFAULT_USER_AGENT = "Twitterbot/1.0";

export type LinkStyle = "inline" | "reference";

/** Behaviour settings contributed under the `markdownLinkTitle.*` namespace. */
export interface ExtensionConfig {
  enabled: boolean;
  fetchTitle: boolean;
  timeoutMs: number;
  preferOpenGraph: boolean;
  maxRedirects: number;
  userAgent: string;
  placeholder: string;
  maxBodyKb: number;
  maxTitleLength: number;
  linkStyle: LinkStyle;
}

export function readExtensionConfig(): ExtensionConfig {
  const config = vscode.workspace.getConfiguration("markdownLinkTitle");
  return {
    enabled: config.get("enabled", true),
    fetchTitle: config.get("fetchTitle", true),
    timeoutMs: config.get("timeoutMs", 5000),
    preferOpenGraph: config.get("preferOpenGraph", true),
    maxRedirects: config.get("maxRedirects", 5),
    userAgent: config.get("userAgent", "").trim() || DEFAULT_USER_AGENT,
    placeholder: config.get("placeholder", "fetching…"),
    maxBodyKb: config.get("maxBodyKb", 512),
    maxTitleLength: config.get("maxTitleLength", 0),
    linkStyle: config.get<LinkStyle>("linkStyle", "inline"),
  };
}

export type ProxySupport = "off" | "on" | "fallback" | "override";

/**
 * The standard VS Code `http.*` proxy settings. We never contribute our own
 * proxy settings so there is a single source of truth shared with the editor.
 */
export interface ProxyConfig {
  proxySupport: ProxySupport;
  proxy?: string;
  proxyStrictSSL: boolean;
  proxyAuthorization?: string;
  noProxy: string[];
}

export function readProxyConfig(): ProxyConfig {
  const config = vscode.workspace.getConfiguration("http");
  return {
    proxySupport: config.get<ProxySupport>("proxySupport", "override"),
    proxy: config.get<string>("proxy") || undefined,
    proxyStrictSSL: config.get("proxyStrictSSL", true),
    proxyAuthorization: config.get<string>("proxyAuthorization") || undefined,
    noProxy: config.get<string[]>("noProxy", []),
  };
}
