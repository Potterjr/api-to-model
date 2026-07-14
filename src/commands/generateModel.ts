import * as vscode from 'vscode';
import { WebviewController } from '../webview/controller';

const NO_SURFACE = 'Open the API to Model sidebar, or run "API to Model: New Request".';

export function generateModel(): void {
  const controller = WebviewController.active;
  if (!controller) {
    void vscode.window.showWarningMessage(NO_SURFACE);
    return;
  }
  controller.triggerGenerate();
}

export async function insertModel(): Promise<void> {
  const controller = WebviewController.active;
  if (!controller) {
    void vscode.window.showWarningMessage(NO_SURFACE);
    return;
  }
  await controller.insertLastModel();
}
