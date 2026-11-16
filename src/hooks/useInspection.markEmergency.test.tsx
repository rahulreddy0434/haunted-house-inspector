import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';
import { useInspection } from '@/hooks/useInspection';
import { readCachedResult } from '@/lib/sessionResultCache';
import { toEmergencyResult } from '@/lib/emergency/emergencyView';
import { normalResult } from '@/test/inspectionFixtures';

const key = `hhi_result_${normalResult.id}`;

function stubFetch(impl: () => Promise<Response>) {
  const f = vi.fn(impl);
  vi.stubGlobal('fetch', f);
  return f;
}

const pending = () => new Promise<Response>(() => {});

describe('useInspection.markEmergency', () => {
  beforeEach(() => window.sessionStorage.clear());
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('turns a cached result into an emergency and stores it in the same act', () => {
    window.sessionStorage.setItem(key, JSON.stringify(normalResult));
    stubFetch(pending);
    const { result } = renderHook(() => useInspection(normalResult.id));
    expect(result.current.result?.urgency).not.toBe('emergency');

    act(() => result.current.markEmergency());

    const expected = toEmergencyResult(normalResult);
    expect(result.current.result).toEqual(expected);
    expect(result.current.result).toMatchObject({
      urgency: 'emergency',
      isEmergency: true,
      costRangeLow: 0,
      costRangeHigh: 0,
      jobBrief: '',
      diySteps: [],
    });
    expect(JSON.parse(window.sessionStorage.getItem(key) ?? 'null')).toEqual(expected);
  });

  it('works on a fetched result with no cache', async () => {
    stubFetch(() => Promise.resolve(new Response(JSON.stringify(normalResult), { status: 200 })));
    const { result } = renderHook(() => useInspection(normalResult.id));
    await waitFor(() => expect(result.current.result).not.toBeNull());

    act(() => result.current.markEmergency());

    expect(result.current.result).toEqual(toEmergencyResult(normalResult));
    expect(readCachedResult(normalResult.id)).toEqual(toEmergencyResult(normalResult));
  });

  it('still becomes an emergency when sessionStorage.setItem throws', () => {
    window.sessionStorage.setItem(key, JSON.stringify(normalResult));
    stubFetch(pending);
    const { result } = renderHook(() => useInspection(normalResult.id));
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('quota');
    });

    expect(() => act(() => result.current.markEmergency())).not.toThrow();

    expect(result.current.result).toEqual(toEmergencyResult(normalResult));
  });

  it('keeps a stable markEmergency identity across rerenders', () => {
    stubFetch(pending);
    const { result, rerender } = renderHook(() => useInspection(normalResult.id));
    const first = result.current.markEmergency;
    rerender();
    rerender();
    expect(result.current.markEmergency).toBe(first);
  });

  it('is a no-op when there is no result', () => {
    stubFetch(pending);
    const { result } = renderHook(() => useInspection(normalResult.id));
    expect(result.current.result).toBeNull();

    act(() => result.current.markEmergency());

    expect(result.current.result).toBeNull();
    expect(result.current.loading).toBe(true);
    expect(window.sessionStorage.getItem(key)).toBeNull();
  });

  it('is not downgraded by a later background GET returning a non-emergency copy', async () => {
    window.sessionStorage.setItem(key, JSON.stringify(normalResult));
    let resolve!: (r: Response) => void;
    stubFetch(() => new Promise<Response>((r) => (resolve = r)));
    const { result } = renderHook(() => useInspection(normalResult.id));

    act(() => result.current.markEmergency());
    await act(async () => {
      resolve(new Response(JSON.stringify(normalResult), { status: 200 }));
    });

    expect(result.current.result).toEqual(toEmergencyResult(normalResult));
    expect(readCachedResult(normalResult.id)).toEqual(toEmergencyResult(normalResult));
  });
});
