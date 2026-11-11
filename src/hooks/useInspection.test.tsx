import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';
import { useInspection } from '@/hooks/useInspection';
import { cacheResult, readCachedResult } from '@/lib/sessionResultCache';
import { emergencyResult, normalResult } from '@/test/inspectionFixtures';

const reply = (status: number, body: unknown) =>
  Promise.resolve(new Response(JSON.stringify(body), { status }));

function stubFetch(impl: (url: string, init: RequestInit) => Promise<Response>) {
  const f = vi.fn(impl);
  vi.stubGlobal('fetch', f);
  return f;
}

describe('useInspection', () => {
  beforeEach(() => window.sessionStorage.clear());
  afterEach(() => vi.unstubAllGlobals());

  it('exposes a cached result immediately and refreshes it from a 200', async () => {
    cacheResult(normalResult);
    const fresh = { ...normalResult, likelyIssue: 'Updated' };
    stubFetch(() => reply(200, fresh));
    const { result } = renderHook(() => useInspection(normalResult.id));
    expect(result.current.loading).toBe(false);
    expect(result.current.result).toEqual(normalResult);
    await waitFor(() => expect(result.current.result?.likelyIssue).toBe('Updated'));
    expect(readCachedResult(normalResult.id)?.likelyIssue).toBe('Updated');
  });

  it('shows the cached result without waiting for fetch', () => {
    cacheResult(normalResult);
    stubFetch(() => new Promise<Response>(() => {}));
    const { result } = renderHook(() => useInspection(normalResult.id));
    expect(result.current).toMatchObject({ loading: false, result: normalResult });
  });

  const failures: [string, () => Promise<Response>][] = [
    ['404', () => reply(404, { error: 'Inspection not found' })],
    ['500', () => reply(500, { error: 'LOAD_FAILED' })],
    ['network error', () => Promise.reject(new TypeError('network'))],
    ['invalid body', () => reply(200, { id: 'x' })],
  ];

  it.each(failures)('keeps a cached emergency result on %s', async (_n, impl) => {
    cacheResult(emergencyResult);
    const f = stubFetch(impl);
    const { result } = renderHook(() => useInspection(emergencyResult.id));
    await waitFor(() => expect(f).toHaveBeenCalled());
    await act(async () => {
      await Promise.resolve();
    });
    expect(result.current).toEqual({
      result: emergencyResult,
      loading: false,
      error: null,
      notFound: false,
    });
  });

  it('shows the fetched result with no cache', async () => {
    stubFetch(() => reply(200, normalResult));
    const { result } = renderHook(() => useInspection(normalResult.id));
    expect(result.current.loading).toBe(true);
    await waitFor(() => expect(result.current.result).toEqual(normalResult));
    expect(result.current.loading).toBe(false);
    expect(readCachedResult(normalResult.id)).toEqual(normalResult);
  });

  it('reports notFound on 404 with no cache', async () => {
    stubFetch(() => reply(404, { error: 'Inspection not found' }));
    const { result } = renderHook(() => useInspection('missing'));
    await waitFor(() => expect(result.current.notFound).toBe(true));
    expect(result.current).toMatchObject({ result: null, loading: false, error: null });
  });

  it('reports an error for an invalid body with no cache', async () => {
    stubFetch(() => reply(200, { nope: true }));
    const { result } = renderHook(() => useInspection('x'));
    await waitFor(() => expect(result.current.error).toBe('This result could not be loaded.'));
    expect(result.current.result).toBeNull();
  });

  it('reports an error on network failure with no cache', async () => {
    stubFetch(() => Promise.reject(new TypeError('network')));
    const { result } = renderHook(() => useInspection('x'));
    await waitFor(() =>
      expect(result.current.error).toBe("We couldn't load this result. Please try again."),
    );
    expect(result.current.result).toBeNull();
  });

  it('aborts the old request on id change and ignores its late response', async () => {
    const signals: AbortSignal[] = [];
    const resolvers: Record<string, (r: Response) => void> = {};
    stubFetch((url, init) => {
      signals.push(init.signal as AbortSignal);
      return new Promise<Response>((resolve) => {
        resolvers[url] = resolve;
      });
    });
    const { result, rerender } = renderHook(({ id }) => useInspection(id), {
      initialProps: { id: 'old' },
    });
    rerender({ id: 'new' });
    expect(signals[0].aborted).toBe(true);
    expect(signals[1].aborted).toBe(false);

    await act(async () => {
      resolvers['/api/inspections/old'](
        new Response(JSON.stringify({ ...normalResult, id: 'old' }), { status: 200 }),
      );
    });
    expect(result.current.result).toBeNull();
    expect(result.current.loading).toBe(true);

    await act(async () => {
      resolvers['/api/inspections/new'](
        new Response(JSON.stringify({ ...normalResult, id: 'new' }), { status: 200 }),
      );
    });
    await waitFor(() => expect(result.current.result?.id).toBe('new'));
  });

  describe('cached entry whose id differs from the URL id', () => {
    const urlId = 'url-id-123';
    const plant = (entry: unknown) =>
      window.sessionStorage.setItem(`hhi_result_${urlId}`, JSON.stringify(entry));

    it('is not exposed while loading, then the fetched result is shown', async () => {
      plant(normalResult);
      const fetched = { ...normalResult, id: urlId, likelyIssue: 'Fetched' };
      let resolve!: (r: Response) => void;
      stubFetch(() => new Promise<Response>((r) => (resolve = r)));
      const { result } = renderHook(() => useInspection(urlId));
      expect(result.current.result).toBeNull();
      expect(result.current.loading).toBe(true);
      await act(async () => {
        resolve(new Response(JSON.stringify(fetched), { status: 200 }));
      });
      await waitFor(() => expect(result.current.result).toEqual(fetched));
    });

    it.each([
      ['normal', normalResult],
      ['emergency', emergencyResult],
    ])('never shows a mismatched %s entry on 404', async (_n, entry) => {
      plant(entry);
      stubFetch(() => reply(404, { error: 'Inspection not found' }));
      const { result } = renderHook(() => useInspection(urlId));
      expect(result.current.result).toBeNull();
      await waitFor(() => expect(result.current.notFound).toBe(true));
      expect(result.current.result).toBeNull();
    });

    it('positive control: a matching id is shown immediately', () => {
      plant({ ...normalResult, id: urlId });
      stubFetch(() => new Promise<Response>(() => {}));
      const { result } = renderHook(() => useInspection(urlId));
      expect(result.current.loading).toBe(false);
      expect(result.current.result?.id).toBe(urlId);
    });
  });

  it('aborts on unmount', () => {
    let sig: AbortSignal | undefined;
    stubFetch((_u, init) => {
      sig = init.signal as AbortSignal;
      return new Promise<Response>(() => {});
    });
    const { unmount } = renderHook(() => useInspection('x'));
    unmount();
    expect(sig?.aborted).toBe(true);
  });
});
