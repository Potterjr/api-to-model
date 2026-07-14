import { ParsedCurl } from '../types';

export class CurlParseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CurlParseError';
  }
}

/** Flags that consume the following token (or an attached/`=` value). */
const VALUE_FLAGS = new Set([
  '-X', '--request',
  '-H', '--header',
  '-d', '--data', '--data-raw', '--data-binary', '--data-ascii', '--data-urlencode',
  '-u', '--user',
  '-A', '--user-agent',
  '-e', '--referer',
  '-b', '--cookie',
  '-m', '--max-time',
  '--connect-timeout',
  '-o', '--output',
  '--url',
  '--retry',
]);

const DATA_FLAGS = new Set([
  '-d', '--data', '--data-raw', '--data-binary', '--data-ascii', '--data-urlencode',
]);

/**
 * Splits a shell command into tokens, honouring single quotes, double quotes,
 * backslash escapes and `\`-newline line continuations.
 */
export function tokenize(input: string): string[] {
  const tokens: string[] = [];
  let current = '';
  let started = false;
  let i = 0;

  while (i < input.length) {
    const ch = input[i];

    if (ch === '\\') {
      const next = input[i + 1];
      if (next === '\n') {
        i += 2;
        continue;
      }
      if (next === '\r' && input[i + 2] === '\n') {
        i += 3;
        continue;
      }
      if (next === undefined) {
        current += '\\';
        started = true;
        i += 1;
        continue;
      }
      current += next;
      started = true;
      i += 2;
      continue;
    }

    if (ch === "'") {
      started = true;
      i += 1;
      while (i < input.length && input[i] !== "'") {
        current += input[i];
        i += 1;
      }
      if (i >= input.length) {
        throw new CurlParseError("Unterminated single quote (') in the cURL command.");
      }
      i += 1;
      continue;
    }

    if (ch === '"') {
      started = true;
      i += 1;
      while (i < input.length && input[i] !== '"') {
        if (input[i] === '\\') {
          const next = input[i + 1];
          if (next === '"' || next === '\\' || next === '$' || next === '`') {
            current += next;
            i += 2;
            continue;
          }
          if (next === '\n') {
            i += 2;
            continue;
          }
          current += '\\';
          i += 1;
          continue;
        }
        current += input[i];
        i += 1;
      }
      if (i >= input.length) {
        throw new CurlParseError('Unterminated double quote (") in the cURL command.');
      }
      i += 1;
      continue;
    }

    if (/\s/.test(ch)) {
      if (started) {
        tokens.push(current);
        current = '';
        started = false;
      }
      i += 1;
      continue;
    }

    current += ch;
    started = true;
    i += 1;
  }

  if (started) {
    tokens.push(current);
  }
  return tokens;
}

/** Turns a raw cURL command into the pieces needed to replay the request. */
export function parseCurl(input: string): ParsedCurl {
  const tokens = tokenize(input.trim());
  if (tokens.length === 0) {
    throw new CurlParseError('The cURL command is empty.');
  }

  let i = tokens[0].toLowerCase() === 'curl' ? 1 : 0;

  let method: string | undefined;
  let url: string | undefined;
  const headers: Record<string, string> = {};
  const dataParts: string[] = [];

  for (; i < tokens.length; i++) {
    const token = tokens[i];

    if (token === '-' || !token.startsWith('-')) {
      if (url === undefined) {
        url = token;
      }
      continue;
    }

    let flag = token;
    let inlineValue: string | undefined;

    if (token.startsWith('--')) {
      const eq = token.indexOf('=');
      if (eq !== -1) {
        flag = token.slice(0, eq);
        inlineValue = token.slice(eq + 1);
      }
    } else {
      const short = token.slice(0, 2);
      if (VALUE_FLAGS.has(short) && token.length > 2) {
        flag = short;
        inlineValue = token.slice(2);
      } else if (token.length > 2) {
        // Bundled boolean shorts such as `-sSL`; nothing to capture.
        continue;
      }
    }

    const readValue = (): string => {
      if (inlineValue !== undefined) {
        return inlineValue;
      }
      i += 1;
      if (i >= tokens.length) {
        throw new CurlParseError(`Flag ${flag} is missing its value.`);
      }
      return tokens[i];
    };

    if (flag === '-X' || flag === '--request') {
      method = readValue().toUpperCase();
      continue;
    }

    if (flag === '-H' || flag === '--header') {
      const header = readValue();
      const colon = header.indexOf(':');
      if (colon === -1) {
        throw new CurlParseError(`Header "${header}" is not in "Key: Value" form.`);
      }
      const name = header.slice(0, colon).trim();
      if (name.length === 0) {
        throw new CurlParseError(`Header "${header}" has an empty name.`);
      }
      headers[name] = header.slice(colon + 1).trim();
      continue;
    }

    if (DATA_FLAGS.has(flag)) {
      dataParts.push(readValue());
      continue;
    }

    if (flag === '--url') {
      url = readValue();
      continue;
    }

    if (VALUE_FLAGS.has(flag)) {
      readValue(); // Recognised but unused — consume so it is not read as the URL.
      continue;
    }
    // Anything else is a boolean flag we do not need (-k, -L, --compressed, ...).
  }

  if (url === undefined) {
    throw new CurlParseError('No URL found in the cURL command.');
  }
  if (!/^[a-zA-Z][a-zA-Z0-9+.-]*:\/\//.test(url)) {
    url = `http://${url}`; // Matches curl, which assumes http when the scheme is omitted.
  }

  const rawBody = dataParts.length > 0 ? dataParts.join('&') : undefined;

  return {
    method: method ?? (rawBody !== undefined ? 'POST' : 'GET'),
    url,
    headers,
    body: rawBody === undefined ? undefined : tryParseJson(rawBody),
    rawBody,
  };
}

function tryParseJson(raw: string): unknown {
  try {
    return JSON.parse(raw);
  } catch {
    return raw;
  }
}
