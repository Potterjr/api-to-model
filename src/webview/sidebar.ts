import * as vscode from 'vscode';
import { WebviewController, WebviewMessage } from './controller';
import { renderHtml } from './html';

/** The activity-bar surface. Its sibling is RequestPanel in panel.ts. */
export class RequestViewProvider implements vscode.WebviewViewProvider {
  static readonly viewType = 'apiToModel.sidebar';

  private controller: WebviewController | undefined;

  constructor(private readonly extensionUri: vscode.Uri) {}

  resolveWebviewView(view: vscode.WebviewView): void {
    view.webview.options = {
      enableScripts: true,
      localResourceRoots: [vscode.Uri.joinPath(this.extensionUri, 'src', 'webview', 'ui')],
    };
    view.webview.html = renderHtml(view.webview, this.extensionUri);

    const controller = new WebviewController(view.webview);
    this.controller = controller;
    controller.markFocused();

    view.webview.onDidReceiveMessage((message: WebviewMessage) => controller.handle(message));
    view.onDidChangeVisibility(() => {
      if (view.visible) {
        controller.markFocused();
      }
    });
    view.onDidDispose(() => {
      controller.release();
      if (this.controller === controller) {
        this.controller = undefined;
      }
    });
  }
}
