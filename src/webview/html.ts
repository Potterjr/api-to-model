import * as vscode from 'vscode';
import { listGenerators } from '../core/generators/ModelGenerator';

/** The markup is identical for the editor panel and the sidebar view; only the CSS reflows. */
export function renderHtml(webview: vscode.Webview, extensionUri: vscode.Uri): string {
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
      <textarea id="curl" spellcheck="false" rows="8" placeholder="curl -X 'POST' \\
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
      <textarea id="json" spellcheck="false" rows="8" placeholder="{
  &quot;documents&quot;: [
    { &quot;document_type&quot;: null }
  ]
}"></textarea>
      <div class="row">
        <button id="use-json" class="primary">Use this JSON</button>
        <span class="status">No request is sent.</span>
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
    <input id="class-name" type="text" placeholder="Root class name, e.g. LoadDocument" spellcheck="false">
    <div class="row">
      <select id="language">${options}</select>
      <button id="generate" class="primary">Generate</button>
    </div>
  </section>

  <section class="block" id="model-block" hidden>
    <div class="row spread">
      <span class="label" id="model-label">Model</span>
      <div class="row actions">
        <button id="copy">Copy</button>
        <button id="insert">Insert</button>
        <button id="save">Save</button>
      </div>
    </div>
    <pre id="model" class="code"></pre>
  </section>

  <div id="error" class="error" hidden></div>

  <script nonce="${nonce}" src="${scriptUri}"></script>
</body>
</html>`;
}

function createNonce(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let nonce = '';
  for (let i = 0; i < 32; i++) {
    nonce += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return nonce;
}
