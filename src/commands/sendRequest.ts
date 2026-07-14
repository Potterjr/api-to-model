import * as vscode from 'vscode';
import { RequestPanel } from '../webview/panel';

export function sendRequest(extensionUri: vscode.Uri): void {
  const panel = RequestPanel.active;
  if (!panel) {
    RequestPanel.show(extensionUri);
    void vscode.window.showInformationMessage('Paste a cURL command, then press Send.');
    return;
  }
  panel.triggerSend();
}
