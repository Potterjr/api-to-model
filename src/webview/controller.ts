import * as vscode from 'vscode';
import { CurlParseError, parseCurl } from '../core/curlParser';
import { HttpRequestError, sendRequest } from '../core/httpClient';
import { getGenerator } from '../core/generators/ModelGenerator';
import { ModelGenerationError } from '../core/generators/dartGenerator';

export interface WebviewMessage {
  type: 'send' | 'json' | 'generate' | 'copy' | 'insert' | 'save';
  curl?: string;
  rootClassName?: string;
  language?: string;
  text?: string;
}

/**
 * Everything the editor panel and the sidebar view do with a webview, minus the
 * hosting. Each surface owns one of these; the most recently focused one is what
 * the palette commands talk to.
 */
export class WebviewController {
  private static focused: WebviewController | undefined;

  private lastJson: unknown;
  private lastModel: { code: string; fileExtension: string } | undefined;

  constructor(private readonly webview: vscode.Webview) {}

  /** The surface a palette command should act on, or undefined when none is open. */
  static get active(): WebviewController | undefined {
    return WebviewController.focused;
  }

  markFocused(): void {
    WebviewController.focused = this;
  }

  /** Called when a surface goes away, so a stale controller is never the target. */
  release(): void {
    if (WebviewController.focused === this) {
      WebviewController.focused = undefined;
    }
  }

  triggerSend(): void {
    this.post({ type: 'requestSend' });
  }

  triggerGenerate(): void {
    this.post({ type: 'requestGenerate' });
  }

  async insertLastModel(): Promise<void> {
    if (!this.lastModel) {
      void vscode.window.showWarningMessage('Generate a model first.');
      return;
    }
    await insertIntoEditor(this.lastModel.code);
  }

  async handle(message: WebviewMessage): Promise<void> {
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
        message: 'Load some JSON first.',
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
    void this.webview.postMessage(message);
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
