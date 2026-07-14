import * as vscode from 'vscode';
import { generateModel, insertModel } from './commands/generateModel';
import { newRequest } from './commands/newRequest';
import { sendRequest } from './commands/sendRequest';

export function activate(context: vscode.ExtensionContext): void {
  const { extensionUri } = context;

  context.subscriptions.push(
    vscode.commands.registerCommand('apiToModel.newRequest', () => newRequest(extensionUri)),
    vscode.commands.registerCommand('apiToModel.sendRequest', () => sendRequest(extensionUri)),
    vscode.commands.registerCommand('apiToModel.generateModel', () => generateModel()),
    vscode.commands.registerCommand('apiToModel.insertModel', () => insertModel()),
  );
}

export function deactivate(): void {
  // Nothing to clean up; the panel disposes itself with the extension context.
}
