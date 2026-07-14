import * as vscode from 'vscode';
import { CurlParseError, parseCurl } from '../core/curlParser';
import { HttpRequestError, sendRequest } from '../core/httpClient';
import { getGenerator, listGenerators } from '../core/generators/ModelGenerator';
import { ModelGenerationError } from '../core/generators/dartGenerator';

interface WebviewMessage {
  type: 'send' | 'json' | 'generate' | 'copy' | 'insert' | 'save';
  curl?: string;
  rootClassName?: string;
  language?: string;
  text?: string;
}

export class RequestPanel {
  private static current: RequestPanel | undefined;
  private static readonly viewType = 'apiToModel.request';

  private readonly disposables: vscode.Disposable[] = [];
  private lastJson: unknown;
  private lastModel: { code: string; fileExtension: string } | undefined;

  static show(extensionUri: vscode.Uri): RequestPanel {
    const column = vscode.window.activeTextEditor?.viewColumn ?? vscode.ViewColumn.One;

    if (RequestPanel.current) {
      RequestPanel.current.panel.reveal(column);
      return RequestPanel.current;
    }

    const panel = vscode.window.createWebviewPanel(
      RequestPanel.viewType,
      'API to Model',
      column,
      {
        enableScripts: true,
        retainContextWhenHidden: true,
        localResourceRoots: [vscode.Uri.joinPath(extensionUri, 'src', 'webview', 'ui')],
      },
    );

    RequestPanel.current = new RequestPanel(panel, extensionUri);
    return RequestPanel.current;
  }

  /** The visible panel, or undefined when the user has not opened one yet. */
  static get active(): RequestPanel | undefined {
    return RequestPanel.current;
  }

  private constructor(
    private readonly panel: vscode.WebviewPanel,
    extensionUri: vscode.Uri,
  ) {
    this.panel.webview.html = this.render(extensionUri);
    this.panel.onDidDispose(() => this.dispose(), null, this.disposables);
    this.panel.webview.onDidReceiveMessage(
      (message: WebviewMessage) => this.handle(message),
      null,
      this.disposables,
    );
  }

  /** Asks the webview to run whatever is in its cURL box. */
  triggerSend(): void {
    this.panel.reveal();
    void this.panel.webview.postMessage({ type: 'requestSend' });
  }

  /** Asks the webview to open the generate form. */
  triggerGenerate(): void {
    this.panel.reveal();
    void this.panel.webview.postMessage({ type: 'requestGenerate' });
  }

  async insertLastModel(): Promise<void> {
    if (!this.lastModel) {
      void vscode.window.showWarningMessage('Generate a model first.');
      return;
    }
    await insertIntoEditor(this.lastModel.code);
  }

  private async handle(message: WebviewMessage): Promise<void> {
    switch (message.type) {
      case 'send':
        await this.send(message.curl ?? '');
        break;
      case 'json':
        this.loadJson(message.text ?? '');
        break;
      case 'generate':
        this.generate(message.rootClassName ?? '', message.language ?? 'dart');
        break;
      case 'copy':
        await vscode.env.clipboard.writeText(message.text ?? '');
        void vscode.window.showInformationMessage('Copied to clipboard.');
        break;
      case 'insert':
        await insertIntoEditor(message.text ?? '');
        break;
      case 'save':
        await this.save(message.text ?? '');
        break;
    }
  }

  private async send(curl: string): Promise<void> {
    let request;
    try {
      request = parseCurl(curl);
    } catch (error) {
      this.post({
        type: 'error',
        stage: 'parse',
        message: error instanceof CurlParseError ? error.message : String(error),
      });
      return;
    }

    this.post({ type: 'sending', method: request.method, url: request.url });

    try {
      const result = await sendRequest(request);
      this.lastJson = result.json;
      this.post({
        type: 'response',
        status: result.status,
        statusText: result.statusText,
        durationMs: result.durationMs,
        headers: result.headers,
        body: result.json !== undefined ? JSON.stringify(result.json, null, 2) : result.raw,
        isJson: result.json !== undefined,
        canGenerate: isPlainObject(result.json),
      });
    } catch (error) {
      this.lastJson = undefined;
      this.post({
        type: 'error',
        stage: 'request',
        message: error instanceof HttpRequestError ? error.message : String(error),
      });
    }
  }

  /** Skips the request entirely: the user already has the JSON in hand. */
  private loadJson(text: string): void {
    let parsed: unknown;
    try {
      parsed = JSON.parse(text);
    } catch (error) {
      this.lastJson = undefined;
      this.post({
        type: 'error',
        stage: 'parse',
        message: `Not valid JSON — ${error instanceof Error ? error.message : String(error)}`,
      });
      return;
    }

    this.lastJson = parsed;
    this.post({
      type: 'jsonLoaded',
      body: JSON.stringify(parsed, null, 2),
      canGenerate: isPlainObject(parsed),
    });
  }

  private generate(rootClassName: string, language: string): void {
    if (this.lastJson === undefined) {
      this.post({
        type: 'error',
        stage: 'generate',
        message: 'Send a request that returns JSON first.',
      });
      return;
    }

    try {
      const generator = getGenerator(language);
      const code = generator.generate(rootClassName, this.lastJson);
      this.lastModel = { code, fileExtension: generator.fileExtension };
      this.post({ type: 'model', code, language: generator.label });
    } catch (error) {
      this.post({
        type: 'error',
        stage: 'generate',
        message: error instanceof ModelGenerationError ? error.message : String(error),
      });
    }
  }

  private async save(code: string): Promise<void> {
    const extension = this.lastModel?.fileExtension ?? 'txt';
    const target = await vscode.window.showSaveDialog({
      filters: { [extension.toUpperCase()]: [extension] },
      saveLabel: 'Save model',
    });
    if (!target) {
      return;
    }
    await vscode.workspace.fs.writeFile(target, Buffer.from(code, 'utf8'));
    void vscode.window.showInformationMessage(`Saved ${target.path.split('/').pop()}.`);
  }

  private post(message: unknown): void {
    void this.panel.webview.postMessage(message);
  }

  private render(extensionUri: vscode.Uri): string {
    const webview = this.panel.webview;
    const uiRoot = vscode.Uri.joinPath(extensionUri, 'src', 'webview', 'ui');
    const scriptUri = webview.asWebviewUri(vscode.Uri.joinPath(uiRoot, 'main.js'));
    const styleUri = webview.asWebviewUri(vscode.Uri.joinPath(uiRoot, 'style.css'));
    const nonce = createNonce();

    const options = listGenerators()
      .map(({ id, label }) => `<option value="${id}">${label}</option>`)
      .join('');

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource}; script-src 'nonce-${nonce}';">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <link href="${styleUri}" rel="stylesheet">
  <title>API to Model</title>
</head>
<body>
  <section class="block">
    <div class="tabs" role="tablist">
      <button id="tab-curl" class="tab active" role="tab" aria-selected="true">cURL</button>
      <button id="tab-json" class="tab" role="tab" aria-selected="false">JSON</button>
    </div>

    <div id="pane-curl" role="tabpanel">
      <label class="label" for="curl">cURL command</label>
      <textarea id="curl" spellcheck="false" rows="10" placeholder="curl -X 'POST' \\
  'http://testapi' \\
  -H 'accept: text/plain' \\
  -d '{ &quot;keyword&quot;: &quot;string&quot; }'"></textarea>
      <div class="row">
        <button id="send" class="primary">Send</button>
        <span id="status" class="status"></span>
      </div>
    </div>

    <div id="pane-json" role="tabpanel" hidden>
      <label class="label" for="json">JSON</label>
      <textarea id="json" spellcheck="false" rows="10" placeholder="{
  &quot;documents&quot;: [
    { &quot;document_type&quot;: null, &quot;truck_load_no&quot;: &quot;SHIP20260213-N2&quot; }
  ]
}"></textarea>
      <div class="row">
        <button id="use-json" class="primary">Use this JSON</button>
        <span class="status">Paste a response you already have — no request is sent.</span>
      </div>
    </div>
  </section>

  <section class="block" id="response-block" hidden>
    <div class="row spread">
      <span class="label" id="response-label">Response</span>
      <span id="meta" class="meta"></span>
    </div>
    <pre id="response" class="code"></pre>
    <details id="headers-details">
      <summary>Response headers</summary>
      <pre id="headers" class="code muted"></pre>
    </details>
  </section>

  <section class="block" id="generate-block" hidden>
    <span class="label">Generate model</span>
    <div class="row">
      <input id="class-name" type="text" placeholder="Root class name, e.g. LoadDocument" spellcheck="false">
      <select id="language">${options}</select>
      <button id="generate" class="primary">Generate</button>
    </div>
  </section>

  <section class="block" id="model-block" hidden>
    <div class="row spread">
      <span class="label" id="model-label">Model</span>
      <div class="row">
        <button id="copy">Copy</button>
        <button id="insert">Insert into editor</button>
        <button id="save">Save as file</button>
      </div>
    </div>
    <pre id="model" class="code"></pre>
  </section>

  <div id="error" class="error" hidden></div>

  <script nonce="${nonce}" src="${scriptUri}"></script>
</body>
</html>`;
  }

  private dispose(): void {
    RequestPanel.current = undefined;
    this.panel.dispose();
    while (this.disposables.length) {
      this.disposables.pop()?.dispose();
    }
  }
}

async function insertIntoEditor(code: string): Promise<void> {
  const editor = vscode.window.visibleTextEditors.find(
    (candidate) => candidate.document.uri.scheme === 'file',
  );
  if (!editor) {
    const document = await vscode.workspace.openTextDocument({ content: code, language: 'dart' });
    await vscode.window.showTextDocument(document, vscode.ViewColumn.Beside);
    return;
  }
  await editor.edit((builder) => builder.insert(editor.selection.active, code));
  await vscode.window.showTextDocument(editor.document, editor.viewColumn);
}

function isPlainObject(value: unknown): boolean {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function createNonce(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let nonce = '';
  for (let i = 0; i < 32; i++) {
    nonce += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return nonce;
}
