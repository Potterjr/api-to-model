import axios, { AxiosError } from 'axios';
import { HttpResult, ParsedCurl } from '../types';

export class HttpRequestError extends Error {
  constructor(message: string, readonly durationMs: number) {
    super(message);
    this.name = 'HttpRequestError';
  }
}

const DEFAULT_TIMEOUT_MS = 30_000;

/** Replays a parsed cURL command. Any non-2xx status is a result, not an error. */
export async function sendRequest(
  request: ParsedCurl,
  timeoutMs: number = DEFAULT_TIMEOUT_MS,
): Promise<HttpResult> {
  const startedAt = Date.now();

  try {
    const response = await axios.request({
      method: request.method,
      url: request.url,
      headers: request.headers,
      data: request.rawBody,
      timeout: timeoutMs,
      // Keep the body verbatim and read it as text; parsing is our job below.
      transformRequest: [(data) => data],
      transformResponse: [(data) => data],
      responseType: 'text',
      validateStatus: () => true,
      maxRedirects: 5,
    });

    const raw = typeof response.data === 'string' ? response.data : String(response.data ?? '');
    return {
      status: response.status,
      statusText: response.statusText ?? '',
      headers: normalizeHeaders(response.headers as Record<string, unknown>),
      durationMs: Date.now() - startedAt,
      json: tryParseJson(raw),
      raw,
    };
  } catch (error) {
    throw new HttpRequestError(describe(error), Date.now() - startedAt);
  }
}

function describe(error: unknown): string {
  const axiosError = error as AxiosError;
  if (axiosError?.isAxiosError) {
    if (axiosError.code === 'ECONNABORTED') {
      return `Request timed out after ${DEFAULT_TIMEOUT_MS / 1000}s.`;
    }
    if (axiosError.code === 'ENOTFOUND') {
      return 'Host not found. Check the URL.';
    }
    if (axiosError.code === 'ECONNREFUSED') {
      return 'Connection refused. Is the server running?';
    }
    return axiosError.code ? `${axiosError.code}: ${axiosError.message}` : axiosError.message;
  }
  return error instanceof Error ? error.message : String(error);
}

function normalizeHeaders(headers: Record<string, unknown> | undefined): Record<string, string> {
  const result: Record<string, string> = {};
  for (const [key, value] of Object.entries(headers ?? {})) {
    if (value === undefined || value === null || typeof value === 'function') {
      continue;
    }
    result[key] = Array.isArray(value) ? value.join(', ') : String(value);
  }
  return result;
}

function tryParseJson(raw: string): unknown {
  if (raw.trim().length === 0) {
    return undefined;
  }
  try {
    return JSON.parse(raw);
  } catch {
    return undefined;
  }
}
