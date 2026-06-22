import assert from "node:assert/strict";
import { test } from "node:test";
import { assignReferenceLabels, resolveReferenceLabel } from "../src/references";

test("starts numbering at 1 in a document with no references", () => {
  const result = resolveReferenceLabel("# Title\n\nsome text\n", "https://example.com/");
  assert.deepEqual(result, { label: "1", alreadyDefined: false });
});

test("picks one past the highest existing numeric reference", () => {
  const doc = "text\n\n[1]: https://a.com/\n[3]: https://b.com/\n";
  const result = resolveReferenceLabel(doc, "https://new.com/");
  assert.deepEqual(result, { label: "4", alreadyDefined: false });
});

test("reuses an existing label when the URL is already defined", () => {
  const doc = "text\n\n[1]: https://a.com/\n[2]: https://b.com/\n";
  const result = resolveReferenceLabel(doc, "https://b.com/");
  assert.deepEqual(result, { label: "2", alreadyDefined: true });
});

test("ignores non-numeric labels when computing the next number", () => {
  const doc = "[note]: https://a.com/\n[2]: https://b.com/\n";
  const result = resolveReferenceLabel(doc, "https://c.com/");
  assert.deepEqual(result, { label: "3", alreadyDefined: false });
});

test("assignReferenceLabels allocates sequential labels for new URLs", () => {
  const result = assignReferenceLabels("[1]: https://a.com/\n", [
    "https://b.com/",
    "https://c.com/",
  ]);
  assert.deepEqual(result.get("https://b.com/"), { label: "2", alreadyDefined: false });
  assert.deepEqual(result.get("https://c.com/"), { label: "3", alreadyDefined: false });
});

test("assignReferenceLabels reuses existing definitions and dedupes repeats", () => {
  const result = assignReferenceLabels("[1]: https://a.com/\n", [
    "https://a.com/",
    "https://b.com/",
    "https://b.com/",
  ]);
  assert.equal(result.size, 2);
  assert.deepEqual(result.get("https://a.com/"), { label: "1", alreadyDefined: true });
  assert.deepEqual(result.get("https://b.com/"), { label: "2", alreadyDefined: false });
});
