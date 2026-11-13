// @vitest-environment node
import { describe, expect, it } from 'vitest';
import {
  MAX_ACTION_BODY_BYTES,
  declaredLengthExceeds,
  readBodyWithLimit,
  readJsonBody,
} from './readBodyWithLimit';

function post(body: BodyInit | null, headers: Record<string, string> = {}): Request {
  return new Request('http://localhost/x', { method: 'POST', body, headers });
}

function streamRequest(stream: ReadableStream<Uint8Array>, headers: Record<string, string> = {}): Request {
  return new Request('http://localhost/x', {
    method: 'POST',
    body: stream,
    headers,
    // @ts-expect-error duplex is required by Node for stream bodies
    duplex: 'half',
  });
}

function reqWithLength(value: string | null): Request {
  const headers = new Headers();
  if (value !== null) headers.set('content-length', value);
  return new Request('http://localhost/x', { method: 'POST', headers });
}

describe('MAX_ACTION_BODY_BYTES', () => {
  it('is 4096', () => {
    expect(MAX_ACTION_BODY_BYTES).toBe(4096);
  });
});

describe('declaredLengthExceeds', () => {
  it('is true when the declared length is over the limit', () => {
    expect(declaredLengthExceeds(reqWithLength('4097'), 4096)).toBe(true);
    expect(declaredLengthExceeds(reqWithLength(' 999999999 '), 4096)).toBe(true);
  });

  it('is false at the limit, below it, missing or malformed', () => {
    expect(declaredLengthExceeds(reqWithLength('4096'), 4096)).toBe(false);
    expect(declaredLengthExceeds(reqWithLength('0'), 4096)).toBe(false);
    expect(declaredLengthExceeds(reqWithLength(null), 4096)).toBe(false);
    expect(declaredLengthExceeds(reqWithLength('abc'), 4096)).toBe(false);
    expect(declaredLengthExceeds(reqWithLength('-5'), 4096)).toBe(false);
    expect(declaredLengthExceeds(reqWithLength('1e9'), 4096)).toBe(false);
    expect(declaredLengthExceeds(reqWithLength('12.5'), 4096)).toBe(false);
    expect(declaredLengthExceeds(reqWithLength(''), 4096)).toBe(false);
  });
});

describe('readBodyWithLimit', () => {
  it('accepts exactly 4096 bytes and rejects 4097', async () => {
    expect(await readBodyWithLimit(post('a'.repeat(4096)), 4096)).toBe('a'.repeat(4096));
    expect(await readBodyWithLimit(post('a'.repeat(4097)), 4096)).toBeNull();
  });

  it('counts bytes, not characters (multi-byte characters)', async () => {
    // 2048 two-byte characters = 4096 bytes, but only 2048 characters
    const atLimit = 'é'.repeat(2048);
    expect(new TextEncoder().encode(atLimit).byteLength).toBe(4096);
    expect(await readBodyWithLimit(post(atLimit), 4096)).toBe(atLimit);
    // 1366 three-byte characters = 4098 bytes, only 1366 characters
    const over = '€'.repeat(1366);
    expect(over.length).toBeLessThan(4096);
    expect(new TextEncoder().encode(over).byteLength).toBe(4098);
    expect(await readBodyWithLimit(post(over), 4096)).toBeNull();
    // 1024 four-byte characters = 4096 bytes (2048 UTF-16 units) accepted; one more rejected
    const emoji = '😀'.repeat(1024);
    expect(await readBodyWithLimit(post(emoji), 4096)).toBe(emoji);
    expect(await readBodyWithLimit(post(emoji + 'a'), 4096)).toBeNull();
  });

  it('returns an empty string for an empty or absent body', async () => {
    expect(await readBodyWithLimit(post(''), 4096)).toBe('');
    expect(await readBodyWithLimit(new Request('http://localhost/x', { method: 'POST' }), 4096)).toBe('');
  });

  it('aborts once over the limit without reading the rest of the stream', async () => {
    let pulls = 0;
    let cancelled = false;
    const chunk = new Uint8Array(1000).fill(97);
    const stream = new ReadableStream<Uint8Array>(
      {
        pull(controller) {
          pulls += 1;
          controller.enqueue(chunk); // endless stream
        },
        cancel() {
          cancelled = true;
        },
      },
      { highWaterMark: 0 },
    );
    const result = await readBodyWithLimit(streamRequest(stream), 4096);
    expect(result).toBeNull();
    // 5 chunks of 1000 bytes pass 4096; reading stops there (no endless read)
    expect(pulls).toBe(5);
    expect(cancelled).toBe(true);
  });

  it('decodes invalid UTF-8 bytes to the replacement character (no error)', async () => {
    const bytes = new Uint8Array([0x61, 0xff, 0xfe, 0x62]);
    const result = await readBodyWithLimit(post(bytes), 4096);
    expect(result).toBe('a\uFFFD\uFFFDb');
  });

  it('rejects when the stream errors', async () => {
    const stream = new ReadableStream<Uint8Array>({
      pull() {
        throw new Error('boom');
      },
    });
    await expect(readBodyWithLimit(streamRequest(stream), 4096)).rejects.toThrow('boom');
  });
});

describe('readJsonBody', () => {
  it('returns ok with the parsed value', async () => {
    const result = await readJsonBody(post(JSON.stringify({ a: 1 })), 4096);
    expect(result).toEqual({ ok: true, value: { a: 1 } });
  });

  it('returns too_large for 4097 bytes and accepts 4096 bytes of valid JSON', async () => {
    const pad = (n: number) => JSON.stringify({ t: 'a'.repeat(n - 8) }); // {"t":""} is 8 bytes
    expect(new TextEncoder().encode(pad(4096)).byteLength).toBe(4096);
    expect(await readJsonBody(post(pad(4096)), 4096)).toMatchObject({ ok: true });
    expect(await readJsonBody(post(pad(4097)), 4096)).toEqual({ ok: false, kind: 'too_large' });
  });

  it('returns invalid_json for malformed JSON and for an empty body', async () => {
    expect(await readJsonBody(post('{nope'), 4096)).toEqual({ ok: false, kind: 'invalid_json' });
    expect(await readJsonBody(post(''), 4096)).toEqual({ ok: false, kind: 'invalid_json' });
  });

  it('returns invalid_json when the stream errors', async () => {
    const stream = new ReadableStream<Uint8Array>({
      pull() {
        throw new Error('boom');
      },
    });
    expect(await readJsonBody(streamRequest(stream), 4096)).toEqual({ ok: false, kind: 'invalid_json' });
  });

  it('invalid UTF-8 bytes become replacement characters and parse as a JSON string', async () => {
    const bytes = new Uint8Array([0x22, 0xff, 0x22]); // "\xff"
    expect(await readJsonBody(post(bytes), 4096)).toEqual({ ok: true, value: '\uFFFD' });
  });

  it('rejects a large declared Content-Length without reading the body', async () => {
    let pulls = 0;
    const stream = new ReadableStream<Uint8Array>(
      {
        pull() {
          pulls += 1;
          throw new Error('body must not be read');
        },
      },
      { highWaterMark: 0 },
    );
    const request = streamRequest(stream, { 'content-length': '999999' });
    const result = await readJsonBody(request, 4096);
    expect(result).toEqual({ ok: false, kind: 'too_large' });
    expect(request.bodyUsed).toBe(false);
    expect(pulls).toBe(0);
  });

  it('streams and still rejects when Content-Length is missing or understated', async () => {
    const chunk = new Uint8Array(3000).fill(97);
    let sent = 0;
    const stream = new ReadableStream<Uint8Array>({
      pull(controller) {
        if (sent++ < 3) controller.enqueue(chunk);
        else controller.close();
      },
    });
    const result = await readJsonBody(streamRequest(stream, { 'content-length': '10' }), 4096);
    expect(result).toEqual({ ok: false, kind: 'too_large' });
  });
});
