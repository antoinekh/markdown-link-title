import * as vscode from "vscode";
import type { ExtensionConfig, LinkStyle, ProxyConfig } from "./config";
import { readExtensionConfig, readProxyConfig } from "./config";
import { resolveReferenceLabel } from "./references";
import { resolveTitle } from "./titleResolver";
import { escapeLinkLabel, labelFromUrl, parseSingleUrl } from "./url";

// The paste edit kind shown in the paste-options UI and used for `yieldTo`.
const PASTE_KIND = vscode.DocumentDropOrPasteEditKind.Empty.append("text", "markdown", "link");
const PASTE_MIME = "text/plain";

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Render the link text for a label, inline (`[label](url)`) or reference (`[label][N]`). */
function makeLink(style: LinkStyle, label: string, url: string, refLabel: string): string {
  return style === "reference" ? `[${label}][${refLabel}]` : `[${label}](${url})`;
}

export class MarkdownLinkPasteProvider implements vscode.DocumentPasteEditProvider {
  constructor(private readonly log: vscode.LogOutputChannel) {}

  async provideDocumentPasteEdits(
    document: vscode.TextDocument,
    ranges: readonly vscode.Range[],
    dataTransfer: vscode.DataTransfer,
    _context: vscode.DocumentPasteEditContext,
    token: vscode.CancellationToken,
  ): Promise<vscode.DocumentPasteEdit[] | undefined> {
    const config = readExtensionConfig();
    if (!config.enabled) {
      return undefined;
    }

    const item = dataTransfer.get(PASTE_MIME);
    if (!item) {
      return undefined;
    }
    const url = parseSingleUrl(await item.asString());
    if (!url || token.isCancellationRequested) {
      return undefined;
    }

    // For reference style, pick the reference label and, unless the URL is
    // already defined, an edit that appends `[label]: url` at the end of the file.
    const style = config.linkStyle;
    let refLabel = "";
    let additionalEdit: vscode.WorkspaceEdit | undefined;
    if (style === "reference") {
      const ref = resolveReferenceLabel(document.getText(), url);
      refLabel = ref.label;
      if (!ref.alreadyDefined) {
        // When pasting at the very end of the document, the inline link and the
        // appended definition target the same offset, so force a line break
        // between them to stop them gluing together.
        const pasteAtEof = document.offsetAt(ranges[0].end) >= document.getText().length;
        additionalEdit = this.referenceDefinitionEdit(document, refLabel, url, pasteAtEof);
      }
    }
    const finish = (edit: vscode.DocumentPasteEdit): vscode.DocumentPasteEdit[] => {
      if (additionalEdit) {
        edit.additionalEdit = additionalEdit;
      }
      return [edit];
    };

    // Paste over a selection: use the user's text as the label, no network call.
    const selection = document.getText(ranges[0]);
    if (selection.length > 0) {
      const insert = makeLink(style, escapeLinkLabel(selection), url, refLabel);
      return finish(new vscode.DocumentPasteEdit(insert, "Insert Markdown link", PASTE_KIND));
    }

    // No selection, fetching disabled: insert an empty label with the cursor
    // between the brackets so the user can type one (native fallback behaviour).
    if (!config.fetchTitle) {
      const empty = this.emptyLinkSnippet(style, url, refLabel);
      return finish(new vscode.DocumentPasteEdit(empty, "Insert Markdown link", PASTE_KIND));
    }

    // No selection, fetching enabled: insert a placeholder link immediately with
    // the cursor after it (so typing is never blocked), and swap in the real
    // title once the background fetch returns.
    const snippet = this.placeholderSnippet(style, config.placeholder, url, refLabel);
    void this.fillTitleInBackground(document, url, config, readProxyConfig(), style, refLabel);
    return finish(new vscode.DocumentPasteEdit(snippet, "Insert Markdown link with title", PASTE_KIND));
  }

  /** Snippet for an empty label with the cursor placed between the brackets. */
  private emptyLinkSnippet(style: LinkStyle, url: string, refLabel: string): vscode.SnippetString {
    const snippet = new vscode.SnippetString();
    snippet.appendText("[");
    snippet.appendTabstop(0);
    snippet.appendText(style === "reference" ? `][${refLabel}]` : `](${url})`);
    return snippet;
  }

  /**
   * Snippet for the placeholder link with the cursor after it. Built via the
   * snippet API so a URL containing `$`/`}` is escaped correctly.
   */
  private placeholderSnippet(
    style: LinkStyle,
    placeholder: string,
    url: string,
    refLabel: string,
  ): vscode.SnippetString {
    const snippet = new vscode.SnippetString();
    snippet.appendText(makeLink(style, placeholder, url, refLabel));
    snippet.appendTabstop(0);
    return snippet;
  }

  /** Edit that appends a `[label]: url` reference definition at the end of the document. */
  private referenceDefinitionEdit(
    document: vscode.TextDocument,
    refLabel: string,
    url: string,
    pasteAtEof: boolean,
  ): vscode.WorkspaceEdit {
    const text = document.getText();
    const needsNewline = (text.length > 0 && !text.endsWith("\n")) || pasteAtEof;
    const prefix = needsNewline ? "\n" : "";
    const edit = new vscode.WorkspaceEdit();
    edit.insert(document.uri, document.positionAt(text.length), `${prefix}[${refLabel}]: ${url}\n`);
    return edit;
  }

  private async fillTitleInBackground(
    document: vscode.TextDocument,
    url: string,
    config: ExtensionConfig,
    proxy: ProxyConfig,
    style: LinkStyle,
    refLabel: string,
  ): Promise<void> {
    let label: string;
    try {
      // No CancellationToken here: the background fetch must outlive the paste.
      label = (await resolveTitle(url, config, proxy)) ?? labelFromUrl(url);
    } catch (error) {
      this.log.warn(`Could not fetch title for ${url}: ${String(error)}`);
      label = labelFromUrl(url);
    }
    const needle = makeLink(style, config.placeholder, url, refLabel);
    const replacement = makeLink(style, label, url, refLabel);
    await this.replacePlaceholder(document, needle, replacement);
  }

  private async replacePlaceholder(
    document: vscode.TextDocument,
    needle: string,
    replacement: string,
  ): Promise<void> {
    if (needle === replacement) {
      return;
    }
    // The paste edit is applied only after provideDocumentPasteEdits returns, so
    // the placeholder may not be in the document yet when a fast fetch resolves.
    // Retry briefly until it appears; give up quietly if the user removed it.
    for (let attempt = 0; attempt < 5; attempt++) {
      if (document.isClosed) {
        return;
      }
      const index = document.getText().lastIndexOf(needle);
      if (index >= 0) {
        const range = new vscode.Range(
          document.positionAt(index),
          document.positionAt(index + needle.length),
        );
        const edit = new vscode.WorkspaceEdit();
        edit.replace(document.uri, range, replacement);
        await vscode.workspace.applyEdit(edit);
        return;
      }
      await delay(60);
    }
  }
}

export function registerPasteProvider(log: vscode.LogOutputChannel): vscode.Disposable {
  return vscode.languages.registerDocumentPasteEditProvider(
    { language: "markdown" },
    new MarkdownLinkPasteProvider(log),
    {
      providedPasteEditKinds: [PASTE_KIND],
      pasteMimeTypes: [PASTE_MIME],
    },
  );
}
