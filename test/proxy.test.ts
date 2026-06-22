import assert from "node:assert/strict";
import { test } from "node:test";
import { URL } from "node:url";
import type { ProxyConfig } from "../src/config";
import { matchesNoProxy, resolveProxyUrl } from "../src/http";

function proxyConfig(overrides: Partial<ProxyConfig>): ProxyConfig {
  return {
    proxySupport: "off",
    proxyStrictSSL: true,
    noProxy: [],
    ...overrides,
  };
}

test("matchesNoProxy handles exact, suffix and wildcard entries", () => {
  assert.equal(matchesNoProxy("example.com", ["example.com"]), true);
  assert.equal(matchesNoProxy("api.example.com", ["example.com"]), true);
  assert.equal(matchesNoProxy("api.example.com", [".example.com"]), true);
  assert.equal(matchesNoProxy("example.org", ["example.com"]), false);
  assert.equal(matchesNoProxy("anything.test", ["*"]), true);
});

test("resolveProxyUrl defers to the global agent unless proxySupport is off", () => {
  const target = new URL("https://example.com");
  assert.equal(resolveProxyUrl(target, proxyConfig({ proxySupport: "override", proxy: "http://p:3128" })), undefined);
});

test("resolveProxyUrl returns the configured proxy when proxySupport is off", () => {
  const target = new URL("https://example.com");
  const resolved = resolveProxyUrl(target, proxyConfig({ proxy: "http://proxy.local:3128" }));
  assert.equal(resolved?.href, "http://proxy.local:3128/");
});

test("resolveProxyUrl honours noProxy", () => {
  const target = new URL("https://internal.example.com");
  const resolved = resolveProxyUrl(
    target,
    proxyConfig({ proxy: "http://proxy.local:3128", noProxy: ["example.com"] }),
  );
  assert.equal(resolved, undefined);
});
