// Pure URL and Markdown-label helpers. No `vscode` import, so this module is
// directly unit-testable with `node --test`.

// A clipboard payload is treated as a link only when it is a single bare token
// (no internal whitespace, no newlines) that parses as an http(s) URL.
const SINGLE_URL_RE = /^https?:\/\/\S+$/i;

/**
 * Returns the trimmed URL when `raw` is a single bare http(s) URL, otherwise
 * `undefined`. Anything with internal whitespace, multiple lines, or a
 * non-http(s) scheme is rejected so ordinary text pastes are left untouched.
 */
export function parseSingleUrl(raw: string): string | undefined {
  const text = raw.trim();
  if (!SINGLE_URL_RE.test(text)) {
    return undefined;
  }
  try {
    const url = new URL(text);
    if (url.protocol !== "http:" && url.protocol !== "https:") {
      return undefined;
    }
    return text;
  } catch {
    return undefined;
  }
}

/**
 * Derive a readable, Markdown-safe link label from a URL, for use when no page
 * title can be fetched (unreachable host, non-success status, timeout). Uses the
 * hostname, e.g. `https://github.com/foo` -> `github.com`, so the link is still
 * usable rather than an empty `[](url)`.
 */
export function labelFromUrl(rawUrl: string): string {
  try {
    return escapeLinkLabel(new URL(rawUrl).hostname.replace(/^www\./, ""));
  } catch {
    return escapeLinkLabel(rawUrl);
  }
}

/**
 * Make a string safe to use as the label inside `[label](url)`: escape the
 * characters that would break the link (`\`, `[`, `]`) and collapse any run of
 * whitespace (including newlines) into a single space.
 */
export function escapeLinkLabel(label: string): string {
  return label
    .replace(/[\\[\]]/g, "\\$&")
    .replace(/\s+/g, " ")
    .trim();
}
