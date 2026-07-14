import * as vscode from 'vscode';
import { generateModel, insertModel } from './commands/generateModel';
import { newRequest } from './commands/newRequest';
import { sendRequest } from './commands/sendRequest';
import { RequestViewProvider } from './webview/sidebar';

export function activate(context: vscode.ExtensionContext): void {
  const { extensionUri } = context;

  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider(
      RequestViewProvider.viewType,
      new RequestViewProvider(extensionUri),
      // The sidebar is hidden whenever another view container is open; keeping the
      // context alive preserves the response and generated model across switches.
      { webviewOptions: { retainContextWhenHidden: true } },
    ),
    vscode.commands.registerCommand('apiToModel.newRequest', () => newRequest(extensionUri)),
    vscode.commands.registerCommand('apiToModel.sendRequest', () => sendRequest(extensionUri)),
    vscode.commands.registerCommand('apiToModel.generateModel', () => generateModel()),
    vscode.commands.registerCommand('apiToModel.insertModel', () => insertModel()),
  );
}

export function deactivate(): void {
  // Nothing to clean up; every surface is registered on the extension context.
}
