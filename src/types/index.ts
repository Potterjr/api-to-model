/** A cURL command after parsing, ready to be handed to the HTTP client. */
export interface ParsedCurl {
  method: string;
  url: string;
  headers: Record<string, string>;
  /** Parsed JSON when the body is valid JSON, otherwise the raw string. `undefined` when there is no body. */
  body?: unknown;
  /** The body exactly as it appeared in the cURL command. */
  rawBody?: string;
}

export interface HttpResult {
  status: number;
  statusText: string;
  headers: Record<string, string>;
  /** Milliseconds from request start to response received. */
  durationMs: number;
  /** Parsed JSON when the response is valid JSON, otherwise undefined. */
  json?: unknown;
  /** The response body as text. */
  raw: string;
}

export interface HttpFailure {
  error: string;
  durationMs: number;
}

/**
 * Central interface for every language generator. Add a language by implementing
 * this and registering it — no existing generator needs to change.
 */
export interface ModelGenerator {
  /** Identifier used by the webview dropdown, e.g. `dart`. */
  readonly id: string;
  /** Human-readable name, e.g. `Dart`. */
  readonly label: string;
  /** File extension for "Save as", without the dot, e.g. `dart`. */
  readonly fileExtension: string;
  generate(rootClassName: string, json: unknown): string;
}
