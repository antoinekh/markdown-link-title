import assert from "node:assert/strict";
import { test } from "node:test";
import { escapeLinkLabel, labelFromUrl, parseSingleUrl } from "../src/url";

test("accepts a single bare http(s) URL", () => {
  assert.equal(parseSingleUrl("https://example.com/path"), "https://example.com/path");
  assert.equal(parseSingleUrl("  http://example.com  "), "http://example.com");
});

test("rejects non-URL or multi-token text", () => {
  assert.equal(parseSingleUrl("just some text"), undefined);
  assert.equal(parseSingleUrl("https://example.com and more"), undefined);
  assert.equal(parseSingleUrl("line1\nhttps://example.com"), undefined);
  assert.equal(parseSingleUrl("ftp://example.com"), undefined);
  assert.equal(parseSingleUrl("file:///etc/hosts"), undefined);
  assert.equal(parseSingleUrl(""), undefined);
});

test("labelFromUrl derives the hostname as a usable fallback label", () => {
  assert.equal(labelFromUrl("http://ahahahahaha.fre"), "ahahahahaha.fre");
  assert.equal(labelFromUrl("https://github.com/foo/bar"), "github.com");
  assert.equal(labelFromUrl("https://www.reddit.com/"), "reddit.com");
});

test("escapes characters that break a Markdown label", () => {
  assert.equal(escapeLinkLabel("a [b] c"), "a \\[b\\] c");
  assert.equal(escapeLinkLabel("back\\slash"), "back\\\\slash");
  assert.equal(escapeLinkLabel("multi\n line\t title"), "multi line title");
});
