import { CurlParseError, parseCurl, tokenize } from '../src/core/curlParser';

const REFERENCE_CURL = `curl -X 'POST' \\
  'http://testapi' \\
  -H 'accept: text/plain' \\
  -H 'Content-Type: application/json-patch+json' \\
  -d '{
  "keyword": "string"
}'`;

describe('parseCurl', () => {
  it('parses the reference cURL command from CLAUDE.md', () => {
    expect(parseCurl(REFERENCE_CURL)).toMatchObject({
      method: 'POST',
      url: 'http://testapi',
      headers: {
        accept: 'text/plain',
        'Content-Type': 'application/json-patch+json',
      },
      body: { keyword: 'string' },
    });
  });

  it('keeps the body exactly as written in rawBody', () => {
    expect(parseCurl(REFERENCE_CURL).rawBody).toBe('{\n  "keyword": "string"\n}');
  });

  it('defaults to GET without a body and POST with one', () => {
    expect(parseCurl(`curl 'http://a/b'`).method).toBe('GET');
    expect(parseCurl(`curl 'http://a/b' -d 'x=1'`).method).toBe('POST');
  });

  it('accepts long flags, = values and attached short values', () => {
    const parsed = parseCurl(`curl --request PUT --header='X-Key: v' -XPATCH https://a/b`);
    expect(parsed.method).toBe('PATCH'); // -X comes last and wins
    expect(parsed.headers).toEqual({ 'X-Key': 'v' });
    expect(parsed.url).toBe('https://a/b');
  });

  it('ignores boolean flags without swallowing the URL', () => {
    const parsed = parseCurl(`curl -sSL --compressed -k 'https://a/b' -H 'a: 1'`);
    expect(parsed.url).toBe('https://a/b');
    expect(parsed.headers).toEqual({ a: '1' });
  });

  it('consumes recognised value flags so they are not read as the URL', () => {
    expect(parseCurl(`curl -u user:pass 'https://a/b'`).url).toBe('https://a/b');
    expect(parseCurl(`curl --connect-timeout 5 'https://a/b'`).url).toBe('https://a/b');
  });

  it('joins repeated -d with & like curl does', () => {
    expect(parseCurl(`curl 'http://a' -d 'x=1' -d 'y=2'`).rawBody).toBe('x=1&y=2');
  });

  it('keeps a non-JSON body as a raw string', () => {
    expect(parseCurl(`curl 'http://a' -d 'x=1'`).body).toBe('x=1');
  });

  it('reads the URL from --url', () => {
    expect(parseCurl(`curl --url 'https://a/b'`).url).toBe('https://a/b');
  });

  it('assumes http when the scheme is omitted, as curl does', () => {
    expect(parseCurl(`curl testapi/path`).url).toBe('http://testapi/path');
  });

  it('works without the leading "curl" word', () => {
    expect(parseCurl(`-X GET 'https://a/b'`).method).toBe('GET');
  });

  it('preserves double-quoted bodies and their escapes', () => {
    expect(parseCurl(`curl 'http://a' -d "{\\"k\\": \\"v\\"}"`).body).toEqual({ k: 'v' });
  });

  it('rejects input it cannot make sense of', () => {
    expect(() => parseCurl('')).toThrow(CurlParseError);
    expect(() => parseCurl('curl -X POST')).toThrow(/No URL/);
    expect(() => parseCurl(`curl 'http://a' -H 'broken'`)).toThrow(/Key: Value/);
    expect(() => parseCurl(`curl 'http://a`)).toThrow(/Unterminated single quote/);
    expect(() => parseCurl(`curl 'http://a' -H`)).toThrow(/missing its value/);
  });
});

describe('tokenize', () => {
  it('joins tokens across a backslash line continuation', () => {
    expect(tokenize("curl \\\n  'http://a'")).toEqual(['curl', 'http://a']);
  });

  it('keeps whitespace that lives inside quotes', () => {
    expect(tokenize(`-H 'accept: text/plain'`)).toEqual(['-H', 'accept: text/plain']);
  });

  it('treats an empty quoted string as a real token', () => {
    expect(tokenize(`curl -d ''`)).toEqual(['curl', '-d', '']);
  });
});
