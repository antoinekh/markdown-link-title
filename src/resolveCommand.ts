import * as vscode from "vscode";
import type { ExtensionConfig, LinkStyle, ProxyConfig } from "./config";
import { readExtensionConfig, readProxyConfig } from "./config";
import { assignReferenceLabels, type ReferenceResult } from "./references";
import { findUrlMatches, type UrlMatch } from "./selectionLinks";
import { resolveTitle } from "./titleResolver";
import { labelFromUrl } from "./url";

export const RESOLVE_COMMAND_ID = "markdownLinkTitle.resolveTitles";

/** A match located at an absolute offset within the whole document. */
interface DocumentMatch extends UrlMatch {
  range: vscode.Range;
}

/** Render the link text for a label, inline (`[label](url)`) or reference (`[label][N]`). */
function makeLink(style: LinkStyle, label: string, url: string, refLabel: string): string {
  return style === "reference" ? `[${label}][${refLabel}]` : `[${label}](${url})`;
}

/**
 * The ranges the command operates on: each non-empty selection as-is, and the
 * whole current line for each empty selection (so it works with no selection).
 * Line ranges are de-duplicated when several cursors sit on the same line.
 */
function targetRanges(editor: vscode.TextEditor): vscode.Range[] {
  const ranges: vscode.Range[] = [];
  const seenLines = new Set<number>();
  for (const selection of editor.selections) {
    if (!selection.isEmpty) {
      ranges.push(new vscode.Range(selection.start, selection.end));
      continue;
    }
    const line = selection.active.line;
    if (!seenLines.has(line)) {
      seenLines.add(line);
      ranges.push(editor.document.lineAt(line).range);
    }
  }
  return ranges;
}

/** Collect every URL match across the target ranges, with absolute document ranges. */
function collectMatches(document: vscode.TextDocument, ranges: readonly vscode.Range[]): DocumentMatch[] {
  const matches: DocumentMatch[] = [];
  for (const range of ranges) {
    const base = document.offsetAt(range.start);
    for (const match of findUrlMatches(document.getText(range))) {
      matches.push({
        ...match,
        range: new vscode.Range(
          document.positionAt(base + match.start),
          document.positionAt(base + match.end),
        ),
      });
    }
  }
  return matches;
}

/** Fetch a title (falling back to the hostname) for each unique URL, with cancellable progress. */
async function fetchLabels(
  urls: readonly string[],
  config: ExtensionConfig,
  proxy: ProxyConfig,
  log: vscode.LogOutputChannel,
): Promise<Map<string, string>> {
  const labels = new Map<string, string>();
  await vscode.window.withProgress(
    {
      location: vscode.ProgressLocation.Notification,
      title: "Resolving link titles…",
      cancellable: true,
    },
    async (progress, token) => {
      for (const [done, url] of urls.entries()) {
        if (token.isCancellationRequested) {
          return;
        }
        progress.report({ message: `${done + 1}/${urls.length}`, increment: 100 / urls.length });
        try {
          labels.set(url, (await resolveTitle(url, config, proxy, abortFrom(token))) ?? labelFromUrl(url));
        } catch (error) {
          log.warn(`Could not fetch title for ${url}: ${String(error)}`);
          labels.set(url, labelFromUrl(url));
        }
      }
    },
  );
  return labels;
}

/** Bridge a VS Code CancellationToken to the AbortSignal the fetch understands. */
function abortFrom(token: vscode.CancellationToken): AbortSignal {
  const controller = new AbortController();
  token.onCancellationRequested(() => controller.abort());
  return controller.signal;
}

/**
 * Build the edit that rewrites each matched URL as a link, plus, for reference
 * style, any new `[label]: url` definitions appended at the end of the document.
 */
function buildEdit(
  document: vscode.TextDocument,
  matches: readonly DocumentMatch[],
  labels: ReadonlyMap<string, string>,
  style: LinkStyle,
): vscode.WorkspaceEdit {
  const edit = new vscode.WorkspaceEdit();
  const refByUrl: Map<string, ReferenceResult> =
    style === "reference"
      ? assignReferenceLabels(document.getText(), matches.map((m) => m.url))
      : new Map();

  for (const match of matches) {
    const label = labels.get(match.url) ?? labelFromUrl(match.url);
    const refLabel = refByUrl.get(match.url)?.label ?? "";
    edit.replace(document.uri, match.range, makeLink(style, label, match.url, refLabel));
  }

  if (style === "reference") {
    const definitions = newDefinitions(refByUrl);
    if (definitions.length > 0) {
      const text = document.getText();
      const prefix = text.length > 0 && !text.endsWith("\n") ? "\n" : "";
      const body = definitions.map(({ label, url }) => `[${label}]: ${url}`).join("\n");
      edit.insert(document.uri, document.positionAt(text.length), `${prefix}${body}\n`);
    }
  }
  return edit;
}

/** The reference definitions that still need appending, deduplicated and in label order. */
function newDefinitions(refByUrl: ReadonlyMap<string, ReferenceResult>): { label: string; url: string }[] {
  const definitions: { label: string; url: string }[] = [];
  for (const [url, ref] of refByUrl) {
    if (!ref.alreadyDefined) {
      definitions.push({ label: ref.label, url });
    }
  }
  return definitions.sort((a, b) => Number(a.label) - Number(b.label));
}

async function runResolve(log: vscode.LogOutputChannel): Promise<void> {
  const editor = vscode.window.activeTextEditor;
  if (!editor) {
    return;
  }
  const document = editor.document;
  const matches = collectMatches(document, targetRanges(editor));
  if (matches.length === 0) {
    void vscode.window.showInformationMessage("Markdown Link Title: no URLs to resolve.");
    return;
  }

  const config = readExtensionConfig();
  const uniqueUrls = [...new Set(matches.map((m) => m.url))];
  const versionBefore = document.version;
  const labels = await fetchLabels(uniqueUrls, config, readProxyConfig(), log);
  if (labels.size === 0) {
    return; // Cancelled before the first title resolved.
  }
  if (document.isClosed || document.version !== versionBefore) {
    void vscode.window.showWarningMessage(
      "Markdown Link Title: the document changed while resolving titles, so no links were inserted.",
    );
    return;
  }

  // Honour a cancellation that stopped partway: only rewrite the URLs resolved.
  const resolved = matches.filter((m) => labels.has(m.url));
  const edit = buildEdit(document, resolved, labels, config.linkStyle);
  await vscode.workspace.applyEdit(edit);
  void vscode.window.showInformationMessage(
    `Markdown Link Title: resolved ${resolved.length} link${resolved.length === 1 ? "" : "s"}.`,
  );
}

export function registerResolveCommand(log: vscode.LogOutputChannel): vscode.Disposable {
  return vscode.commands.registerCommand(RESOLVE_COMMAND_ID, () => runResolve(log));
}
