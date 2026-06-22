// Pure scanner that finds the URLs to resolve inside a block of text. No
// `vscode` import, no I/O, so this module is directly unit-testable.

export type UrlMatchKind = "bare" | "empty";

export interface UrlMatch {
  /** Start offset of the text to replace, within the scanned string. */
  start: number;
  /** End offset (exclusive) of the text to replace, within the scanned string. */
  end: number;
  /** The http(s) URL to resolve a title for. */
  url: string;
  /** `bare` for a plain URL, `empty` for an empty Markdown link `[](url)`. */
  kind: UrlMatchKind;
}

// A single left-to-right scan whose alternatives are ordered so that link
// syntax is consumed (and either converted or skipped) before a bare URL can be
// matched inside it. The alternatives, in priority order:
//   1. an empty Markdown link `[](url)`        -> convert
//   2. a reference definition `[label]: url`   -> skip (leave the definition)
//   3. a labelled inline link `[text](url)`    -> skip (already has a label)
//   4. a bare URL                              -> convert
const SCAN_RE = new RegExp(
  [
    "\\[\\]\\((?<empty>https?:\\/\\/[^\\s)]+)\\)",
    "^\\s*\\[[^\\]]*\\]:\\s*https?:\\/\\/\\S+",
    "\\[[^\\]]*\\]\\(https?:\\/\\/[^\\s)]+\\)",
    "(?<bare>https?:\\/\\/[^\\s<>)\\]]+)",
  ].join("|"),
  "gm",
);

// Trailing punctuation that is almost always sentence punctuation rather than
// part of a bare URL, so it is trimmed off the matched URL.
const TRAILING_PUNCTUATION_RE = /[.,;:!?]+$/;

function isValidHttpUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
}

/**
 * Find every URL in `text` that should be turned into a `[title](url)` link: all
 * bare http(s) URLs and all empty Markdown links `[](url)`. URLs that already sit
 * inside a labelled link `[text](url)` or a reference definition `[label]: url`
 * are deliberately left untouched. Offsets are relative to `text`.
 */
export function findUrlMatches(text: string): UrlMatch[] {
  const matches: UrlMatch[] = [];
  for (const match of text.matchAll(SCAN_RE)) {
    const index = match.index ?? 0;
    if (match.groups?.empty) {
      const url = match.groups.empty;
      if (isValidHttpUrl(url)) {
        matches.push({ start: index, end: index + match[0].length, url, kind: "empty" });
      }
      continue;
    }
    if (match.groups?.bare) {
      const url = match.groups.bare.replace(TRAILING_PUNCTUATION_RE, "");
      if (url.length > 0 && isValidHttpUrl(url)) {
        matches.push({ start: index, end: index + url.length, url, kind: "bare" });
      }
    }
    // Reference definitions and labelled links are matched only so their inner
    // URL is consumed and not re-matched as bare; they produce no UrlMatch.
  }
  return matches;
}
