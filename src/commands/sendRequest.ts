import * as vscode from 'vscode';
import { WebviewController } from '../webview/controller';
import { RequestPanel } from '../webview/panel';

export function sendRequest(extensionUri: vscode.Uri): void {
  const controller = WebviewController.active;
  if (!controller) {
    RequestPanel.show(extensionUri);
    void vscode.window.showInformationMessage('Paste a cURL command, then press Send.');
    return;
  }
  controller.triggerSend();
}
