import * as vscode from 'vscode';
import { WebviewController, WebviewMessage } from './controller';
import { renderHtml } from './html';

/** The editor-tab surface. Its sibling is RequestViewProvider in sidebar.ts. */
export class RequestPanel {
  private static current: RequestPanel | undefined;
  private static readonly viewType = 'apiToModel.request';

  private readonly disposables: vscode.Disposable[] = [];
  private readonly controller: WebviewController;

  static show(extensionUri: vscode.Uri): void {
    const column = vscode.window.activeTextEditor?.viewColumn ?? vscode.ViewColumn.One;

    if (RequestPanel.current) {
      RequestPanel.current.panel.reveal(column);
      RequestPanel.current.controller.markFocused();
      return;
    }

    const panel = vscode.window.createWebviewPanel(RequestPanel.viewType, 'API to Model', column, {
      enableScripts: true,
      retainContextWhenHidden: true,
      localResourceRoots: [vscode.Uri.joinPath(extensionUri, 'src', 'webview', 'ui')],
    });

    RequestPanel.current = new RequestPanel(panel, extensionUri);
  }

  private constructor(
    private readonly panel: vscode.WebviewPanel,
    extensionUri: vscode.Uri,
  ) {
    this.panel.webview.html = renderHtml(this.panel.webview, extensionUri);
    this.controller = new WebviewController(this.panel.webview);
    this.controller.markFocused();

    this.panel.onDidDispose(() => this.dispose(), null, this.disposables);
    this.panel.onDidChangeViewState(
      () => {
        if (this.panel.active) {
          this.controller.markFocused();
        }
      },
      null,
      this.disposables,
    );
    this.panel.webview.onDidReceiveMessage(
      (message: WebviewMessage) => this.controller.handle(message),
      null,
      this.disposables,
    );
  }

  private dispose(): void {
    RequestPanel.current = undefined;
    this.controller.release();
    this.panel.dispose();
    while (this.disposables.length) {
      this.disposables.pop()?.dispose();
    }
  }
}
