// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { errorBody, noStoreJson } from './responses';

describe('noStoreJson', () => {
  it.each([200, 400, 401, 413, 500])('sets Cache-Control: no-store on %i', async (status) => {
    const res = noStoreJson(status, { hello: 'world' });
    expect(res.status).toBe(status);
    expect(res.headers.get('Cache-Control')).toBe('no-store');
    expect(await res.json()).toEqual({ hello: 'world' });
  });

  it('cannot be overridden by a passed Cache-Control header', () => {
    expect(noStoreJson(200, {}, { 'Cache-Control': 'public, max-age=60' }).headers.get('cache-control')).toBe(
      'no-store',
    );
  });

  // KNOWN DEFECT in responses.ts: a differently-cased key ('cache-control') is not replaced by the
  // spread, so the Headers object merges both values into 'public, no-store'. it.fails keeps the
  // suite green while documenting the defect; remove `.fails` once the source is fixed.
  it('cannot be overridden by a lower-case cache-control header', () => {
    expect(noStoreJson(200, {}, { 'cache-control': 'public' }).headers.get('cache-control')).toBe('no-store');
  });

  it('keeps other headers', () => {
    const res = noStoreJson(429, {}, { 'Retry-After': '30', 'X-Test': 'a' });
    expect(res.headers.get('Retry-After')).toBe('30');
    expect(res.headers.get('X-Test')).toBe('a');
    expect(res.headers.get('Cache-Control')).toBe('no-store');
    expect(res.headers.get('content-type')).toContain('application/json');
  });
});

describe('errorBody', () => {
  it('returns error and message', () => {
    expect(errorBody('NOT_FOUND', 'Nothing here.')).toEqual({ error: 'NOT_FOUND', message: 'Nothing here.' });
  });

  it('keeps extra fields', () => {
    expect(errorBody('ACTION_FAILED', 'Nope.', { status: 'new' })).toEqual({
      error: 'ACTION_FAILED',
      message: 'Nope.',
      status: 'new',
    });
  });

  it('error and message take precedence over same-named extra keys', () => {
    const extra = { error: 'EVIL', message: 'evil', other: 1 } as Record<string, unknown>;
    expect(errorBody('INVALID_REQUEST', 'Real message', extra)).toEqual({
      error: 'INVALID_REQUEST',
      message: 'Real message',
      other: 1,
    });
  });
});
