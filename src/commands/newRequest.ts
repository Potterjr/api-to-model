import * as vscode from 'vscode';
import { RequestPanel } from '../webview/panel';

export function newRequest(extensionUri: vscode.Uri): void {
  RequestPanel.show(extensionUri);
}
