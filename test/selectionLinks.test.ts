import assert from "node:assert/strict";
import { test } from "node:test";
import { findUrlMatches } from "../src/selectionLinks";

test("finds a bare URL", () => {
  const matches = findUrlMatches("see https://example.com/path here");
  assert.deepEqual(matches, [
    { start: 4, end: 28, url: "https://example.com/path", kind: "bare" },
  ]);
});

test("finds an empty Markdown link and replaces the whole link", () => {
  const text = "a [](https://example.com) b";
  const matches = findUrlMatches(text);
  assert.equal(matches.length, 1);
  assert.equal(matches[0].kind, "empty");
  assert.equal(matches[0].url, "https://example.com");
  assert.equal(text.slice(matches[0].start, matches[0].end), "[](https://example.com)");
});

test("leaves labelled inline links untouched", () => {
  assert.deepEqual(findUrlMatches("[GitHub](https://github.com)"), []);
});

test("leaves reference definitions untouched", () => {
  assert.deepEqual(findUrlMatches("[1]: https://example.com/\n"), []);
});

test("trims trailing sentence punctuation off a bare URL", () => {
  const matches = findUrlMatches("read https://example.com/path.");
  assert.equal(matches.length, 1);
  assert.equal(matches[0].url, "https://example.com/path");
  assert.equal(matches[0].end, "read https://example.com/path".length);
});

test("stops a bare URL at a closing parenthesis", () => {
  const matches = findUrlMatches("(see https://example.com)");
  assert.equal(matches.length, 1);
  assert.equal(matches[0].url, "https://example.com");
});

test("finds several URLs of mixed kinds in order", () => {
  const text = "https://a.com and [](https://b.com) and [x](https://c.com)";
  const matches = findUrlMatches(text);
  assert.deepEqual(
    matches.map((m) => [m.url, m.kind]),
    [
      ["https://a.com", "bare"],
      ["https://b.com", "empty"],
    ],
  );
});

test("ignores non-http(s) schemes", () => {
  assert.deepEqual(findUrlMatches("ftp://example.com file:///etc/hosts"), []);
});
