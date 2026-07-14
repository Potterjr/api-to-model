import * as vscode from 'vscode';
import { RequestPanel } from '../webview/panel';

export function generateModel(): void {
  const panel = RequestPanel.active;
  if (!panel) {
    void vscode.window.showWarningMessage('Run "API to Model: New Request" first.');
    return;
  }
  panel.triggerGenerate();
}

export async function insertModel(): Promise<void> {
  const panel = RequestPanel.active;
  if (!panel) {
    void vscode.window.showWarningMessage('Run "API to Model: New Request" first.');
    return;
  }
  await panel.insertLastModel();
}
