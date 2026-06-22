// Pure HTML title extraction. No `vscode` import, no I/O, so this module is
// directly unit-testable.

function readCharset(text: string): string | undefined {
  const charset = /charset=\s*["']?([^"'\s;]+)/i.exec(text)?.[1];
  return charset ? charset.trim().toLowerCase() : undefined;
}

/**
 * Decode an HTML response body to a string, honouring its character encoding so
 * non-UTF-8 pages (e.g. Shift_JIS, EUC-KR, GBK, Big5, ISO-8859-1) yield correct
 * titles. The charset is taken from the `Content-Type` header, else a `<meta>`
 * charset declaration in the markup, else UTF-8. `TextDecoder` (a Node global
 * with full ICU) supports the legacy encodings, so this needs no dependencies.
 */
export function decodeHtml(body: Buffer, contentType: string): string {
  // Meta charset values are ASCII, so a latin1 view of the head is enough to
  // find one without first knowing the real encoding.
  const charset =
    readCharset(contentType) ?? readCharset(body.subarray(0, 2048).toString("latin1")) ?? "utf-8";
  try {
    return new TextDecoder(charset).decode(body);
  } catch {
    // Unknown/unsupported charset label: fall back to UTF-8.
    return new TextDecoder("utf-8").decode(body);
  }
}

const NAMED_ENTITIES: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
};

/** Decode the small set of HTML entities that commonly appear in titles. */
export function decodeEntities(text: string): string {
  return text.replace(/&(#x?[0-9a-f]+|[a-z]+);/gi, (match, body: string) => {
    if (body[0] === "#") {
      const codePoint =
        body[1] === "x" || body[1] === "X"
          ? parseInt(body.slice(2), 16)
          : parseInt(body.slice(1), 10);
      if (Number.isFinite(codePoint) && codePoint > 0) {
        try {
          return String.fromCodePoint(codePoint);
        } catch {
          return match;
        }
      }
      return match;
    }
    const named = NAMED_ENTITIES[body.toLowerCase()];
    return named ?? match;
  });
}

/**
 * Truncate a title to at most `maxLength` characters, cutting at a word boundary
 * and appending an ellipsis. `maxLength <= 0` disables truncation.
 */
export function truncateTitle(title: string, maxLength: number): string {
  if (maxLength <= 0 || title.length <= maxLength) {
    return title;
  }
  let cut = title.slice(0, maxLength);
  const lastSpace = cut.lastIndexOf(" ");
  if (lastSpace > 0) {
    cut = cut.slice(0, lastSpace);
  }
  return `${cut.trimEnd()}…`;
}

function readAttribute(tag: string, name: string): string | undefined {
  const re = new RegExp(`\\b${name}\\s*=\\s*("([^"]*)"|'([^']*)'|([^\\s>]+))`, "i");
  const match = re.exec(tag);
  if (!match) {
    return undefined;
  }
  return match[2] ?? match[3] ?? match[4];
}

function extractOpenGraphTitle(html: string): string | undefined {
  for (const match of html.matchAll(/<meta\b[^>]*>/gi)) {
    const tag = match[0];
    const key = (readAttribute(tag, "property") ?? readAttribute(tag, "name"))?.toLowerCase();
    if (key === "og:title") {
      const content = readAttribute(tag, "content");
      if (content && content.trim()) {
        return content;
      }
    }
  }
  return undefined;
}

function extractDocumentTitle(html: string): string | undefined {
  const match = /<title\b[^>]*>([\s\S]*?)<\/title>/i.exec(html);
  if (match && match[1].trim()) {
    return match[1];
  }
  return undefined;
}

/**
 * Extract a page title from raw HTML. Prefers `og:title` when `preferOpenGraph`
 * is set and present, otherwise falls back to the `<title>` element. Returns the
 * decoded, whitespace-collapsed title, or `undefined` when neither is found.
 */
export function extractTitle(html: string, preferOpenGraph: boolean): string | undefined {
  const raw = preferOpenGraph
    ? extractOpenGraphTitle(html) ?? extractDocumentTitle(html)
    : extractDocumentTitle(html) ?? extractOpenGraphTitle(html);
  if (!raw) {
    return undefined;
  }
  const title = decodeEntities(raw).replace(/\s+/g, " ").trim();
  return title.length > 0 ? title : undefined;
}
