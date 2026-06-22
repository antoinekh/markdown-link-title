// Pure helpers for reference-style links (`[label][N]` + `[N]: url`). No
// `vscode` import, so this module is directly unit-testable.

// Matches a Markdown reference definition line: `[label]: url`.
const REFERENCE_DEFINITION_RE = /^\s*\[([^\]]+)\]:\s+(\S.*?)\s*$/;

export interface ReferenceResult {
  /** The reference label to use, e.g. `"3"`. */
  label: string;
  /** True when `url` already has a definition in the document and should be reused. */
  alreadyDefined: boolean;
}

interface ScannedReferences {
  /** Highest numeric label already defined in the document (0 if none). */
  maxNumeric: number;
  /** First label seen for each already-defined URL. */
  byUrl: Map<string, string>;
}

/** Scan a document once for its existing reference definitions. */
function scanReferenceDefinitions(documentText: string): ScannedReferences {
  let maxNumeric = 0;
  const byUrl = new Map<string, string>();
  for (const line of documentText.split(/\r?\n/)) {
    const match = REFERENCE_DEFINITION_RE.exec(line);
    if (!match) {
      continue;
    }
    if (!byUrl.has(match[2])) {
      byUrl.set(match[2], match[1]);
    }
    if (/^\d+$/.test(match[1])) {
      maxNumeric = Math.max(maxNumeric, Number(match[1]));
    }
  }
  return { maxNumeric, byUrl };
}

/**
 * Decide which reference label to use for `url` in a document. Reuses the
 * existing label if the URL is already defined; otherwise returns the next free
 * numeric label (one greater than the highest existing numeric definition).
 */
export function resolveReferenceLabel(documentText: string, url: string): ReferenceResult {
  const { maxNumeric, byUrl } = scanReferenceDefinitions(documentText);
  const existing = byUrl.get(url);
  if (existing !== undefined) {
    return { label: existing, alreadyDefined: true };
  }
  return { label: String(maxNumeric + 1), alreadyDefined: false };
}

/**
 * Assign reference labels to a batch of URLs in one pass, as needed when several
 * URLs are converted at once. Reuses existing definitions, allocates sequential
 * numbers for new URLs (continuing past the highest existing one), and gives the
 * same label to repeated URLs. Returns a map keyed by URL, in which a URL with
 * `alreadyDefined: false` still needs a `[label]: url` definition appended.
 */
export function assignReferenceLabels(
  documentText: string,
  urls: readonly string[],
): Map<string, ReferenceResult> {
  const { maxNumeric, byUrl } = scanReferenceDefinitions(documentText);
  let next = maxNumeric;
  const result = new Map<string, ReferenceResult>();
  for (const url of urls) {
    if (result.has(url)) {
      continue;
    }
    const existing = byUrl.get(url);
    if (existing !== undefined) {
      result.set(url, { label: existing, alreadyDefined: true });
    } else {
      next += 1;
      result.set(url, { label: String(next), alreadyDefined: false });
    }
  }
  return result;
}
