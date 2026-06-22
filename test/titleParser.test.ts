import assert from "node:assert/strict";
import { test } from "node:test";
import { decodeEntities, decodeHtml, extractTitle, truncateTitle } from "../src/titleParser";

test("decodeHtml honours the charset from the Content-Type header", () => {
  // "日本" in Shift_JIS.
  const body = Buffer.from([0x93, 0xfa, 0x96, 0x7b]);
  assert.equal(decodeHtml(body, "text/html; charset=Shift_JIS"), "日本");
});

test("decodeHtml falls back to a <meta> charset when the header has none", () => {
  // "中文" in Big5, with a meta declaration the parser must read as ASCII first.
  const meta = Buffer.from('<meta charset="big5">', "latin1");
  const body = Buffer.concat([meta, Buffer.from([0xa4, 0xa4, 0xa4, 0xe5])]);
  assert.equal(decodeHtml(body, "text/html"), '<meta charset="big5">中文');
});

test("decodeHtml defaults to UTF-8 and survives an unknown charset", () => {
  const utf8 = Buffer.from("café 日本", "utf-8");
  assert.equal(decodeHtml(utf8, "text/html"), "café 日本");
  assert.equal(decodeHtml(utf8, "text/html; charset=made-up"), "café 日本");
});

test("decodes named and numeric HTML entities", () => {
  assert.equal(decodeEntities("Tom &amp; Jerry"), "Tom & Jerry");
  assert.equal(decodeEntities("it&#39;s"), "it's");
  assert.equal(decodeEntities("&#x2014;"), "—");
  assert.equal(decodeEntities("&unknown;"), "&unknown;");
});

test("prefers og:title when requested and present", () => {
  const html = `<head>
    <meta property="og:title" content="Open Graph Title" />
    <title>Document Title</title>
  </head>`;
  assert.equal(extractTitle(html, true), "Open Graph Title");
  assert.equal(extractTitle(html, false), "Document Title");
});

test("falls back to <title> when og:title is absent", () => {
  const html = "<head><title>  Spaced   Title  </title></head>";
  assert.equal(extractTitle(html, true), "Spaced Title");
});

test("reads meta content regardless of attribute order", () => {
  const html = `<meta content="Reordered" name="og:title">`;
  assert.equal(extractTitle(html, true), "Reordered");
});

test("returns undefined when no title is found", () => {
  assert.equal(extractTitle("<head></head>", true), undefined);
});

test("truncateTitle caps at a word boundary with an ellipsis", () => {
  const title = "About 9 format or 8 format of the master-password documentation";
  assert.equal(truncateTitle(title, 0), title); // disabled
  assert.equal(truncateTitle("short", 40), "short"); // under cap
  assert.equal(truncateTitle(title, 20), "About 9 format or 8…");
  assert.equal(truncateTitle("supercalifragilistic", 8), "supercal…"); // no space to break on
});
