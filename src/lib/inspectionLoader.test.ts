import { describe, it, expect, vi } from 'vitest';
import { emergencyResult, normalResult } from '@/test/inspectionFixtures';
import {
  INVALID_RESULT_MESSAGE,
  LOAD_FAILED_MESSAGE,
  fetchInspection,
  loadInspection,
  resolveFetchOutcome,
} from '@/lib/inspectionLoader';

const signal = new AbortController().signal;
const json = (status: number, body: unknown) =>
  Promise.resolve(new Response(JSON.stringify(body), { status }));

describe('resolveFetchOutcome', () => {
  it('uses the fresh result on ok', () => {
    const fresh = { ...normalResult, likelyIssue: 'New' };
    expect(resolveFetchOutcome(normalResult, { kind: 'ok', result: fresh })).toEqual({
      result: fresh,
      error: null,
      notFound: false,
    });
  });

  it.each(['notFound', 'invalid', 'failed'] as const)(
    'keeps a cached emergency result on %s',
    (kind) => {
      expect(resolveFetchOutcome(emergencyResult, { kind })).toEqual({
        result: emergencyResult,
        error: null,
        notFound: false,
      });
    },
  );

  it('maps failures without a cache', () => {
    expect(resolveFetchOutcome(null, { kind: 'notFound' })).toEqual({
      result: null,
      error: null,
      notFound: true,
    });
    expect(resolveFetchOutcome(null, { kind: 'invalid' }).error).toBe(INVALID_RESULT_MESSAGE);
    expect(resolveFetchOutcome(null, { kind: 'failed' }).error).toBe(LOAD_FAILED_MESSAGE);
  });
});

describe('fetchInspection', () => {
  it('requests the encoded id and validates a 200', async () => {
    const f = vi.fn(() => json(200, normalResult));
    const out = await fetchInspection({ id: 'a/b', signal, fetchImpl: f as unknown as typeof fetch });
    expect(f).toHaveBeenCalledWith('/api/inspections/a%2Fb', { signal });
    expect(out).toEqual({ kind: 'ok', result: normalResult });
  });

  it('accepts an emergency-shaped result', async () => {
    const f = () => json(200, emergencyResult);
    const out = await fetchInspection({ id: 'x', signal, fetchImpl: f as unknown as typeof fetch });
    expect(out.kind).toBe('ok');
  });

  it('classifies 404, 500, network errors and bad bodies', async () => {
    const run = (f: () => Promise<Response>) =>
      fetchInspection({ id: 'x', signal, fetchImpl: f as unknown as typeof fetch });
    expect(await run(() => json(404, { error: 'Inspection not found' }))).toEqual({ kind: 'notFound' });
    expect(await run(() => json(500, { error: 'LOAD_FAILED' }))).toEqual({ kind: 'failed' });
    expect(await run(() => Promise.reject(new TypeError('network')))).toEqual({ kind: 'failed' });
    expect(await run(() => json(200, { id: 'x' }))).toEqual({ kind: 'invalid' });
    expect(await run(() => Promise.resolve(new Response('not json', { status: 200 })))).toEqual({
      kind: 'invalid',
    });
  });
});

describe('loadInspection', () => {
  it('returns fresh result on success and keeps cache on failure', async () => {
    const ok = await loadInspection({
      id: 'x',
      signal,
      cached: null,
      fetchImpl: (() => json(200, normalResult)) as unknown as typeof fetch,
    });
    expect(ok.fresh).toEqual(normalResult);
    const bad = await loadInspection({
      id: 'x',
      signal,
      cached: emergencyResult,
      fetchImpl: (() => json(500, {})) as unknown as typeof fetch,
    });
    expect(bad.fresh).toBeNull();
    expect(bad.result).toEqual(emergencyResult);
  });
});
