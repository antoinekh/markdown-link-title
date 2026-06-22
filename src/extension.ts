import * as vscode from "vscode";
import { registerPasteProvider } from "./pasteProvider";
import { registerResolveCommand } from "./resolveCommand";

export function activate(context: vscode.ExtensionContext): void {
  const log = vscode.window.createOutputChannel("Markdown Link Title", { log: true });
  context.subscriptions.push(log, registerPasteProvider(log), registerResolveCommand(log));
}

export function deactivate(): void {
  // Nothing to clean up beyond the disposables registered in activate().
}
