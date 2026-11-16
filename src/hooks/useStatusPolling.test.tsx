import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { STATUS_POLL_INTERVAL_MS, useStatusPolling } from '@/hooks/useStatusPolling';
import type { HomeownerStatusView } from '@/types/job';

const ID = '3f2b8c1e-5a47-4d9e-9b1a-2c7d8e6f0a11';
const SLOT = '2030-01-01T10:00:00.000Z';

const NEW_VIEW: HomeownerStatusView = { status: 'new' };
const INFO_VIEW: HomeownerStatusView = { status: 'info_requested', question: 'Where is the leak?' };
const ACCEPTED_VIEW: HomeownerStatusView = { status: 'accepted', offeredSlots: [SLOT] };
const DECLINED_VIEW: HomeownerStatusView = { status: 'declined' };
const BOOKED_VIEW: HomeownerStatusView = { status: 'booked', bookedSlot: SLOT };
const EMERGENCY_VIEW: HomeownerStatusView = { status: 'emergency', message: 'Call 911.' };

interface Pending {
  signal: AbortSignal;
  respond: (status: number, body?: unknown) => void;
}

/** A fetch stub whose requests stay open until the test responds; aborting rejects like real fetch. */
function stubFetch() {
  const pending: Pending[] = [];
  const fetchMock = vi.fn((_url: string, init?: RequestInit) => {
    const signal = init?.signal as AbortSignal;
    return new Promise<Response>((resolve, reject) => {
      signal.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')));
      pending.push({
        signal,
        respond: (status, body) =>
          resolve(new Response(body === undefined ? null : JSON.stringify(body), { status })),
      });
    });
  });
  vi.stubGlobal('fetch', fetchMock);
  return { fetchMock, pending };
}

let visibility: DocumentVisibilityState = 'visible';
function setVisibility(state: DocumentVisibilityState) {
  visibility = state;
  document.dispatchEvent(new Event('visibilitychange'));
}

async function advance(ms: number) {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
}

/** Responds to a pending request and lets the hook process it. */
async function respond(p: Pending, status: number, body?: unknown) {
  await act(async () => {
    p.respond(status, body);
    await vi.advanceTimersByTimeAsync(0);
  });
}

describe('useStatusPolling', () => {
  let errorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.useFakeTimers();
    visibility = 'visible';
    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => visibility });
    errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('makes the first request on mount', async () => {
    const { fetchMock, pending } = stubFetch();
    const { result } = renderHook(() => useStatusPolling(ID));
    await advance(0);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][0]).toBe(`/api/inspections/${ID}/status`);
    expect(result.current.refreshing).toBe(true);
    expect(result.current.loaded).toBe(false);
    await respond(pending[0], 200, NEW_VIEW);
    expect(result.current.view).toEqual(NEW_VIEW);
    expect(result.current.loaded).toBe(true);
    expect(result.current.refreshing).toBe(false);
  });

  it('schedules the next request 30 s after completion, not after the start', async () => {
    const { fetchMock, pending } = stubFetch();
    renderHook(() => useStatusPolling(ID));
    await advance(10_000);
    await respond(pending[0], 200, NEW_VIEW);
    await advance(STATUS_POLL_INTERVAL_MS - 1);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    await advance(1);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('makes no request while hidden and requests within 1 s when visible again', async () => {
    const { fetchMock, pending } = stubFetch();
    renderHook(() => useStatusPolling(ID));
    await advance(0);
    await respond(pending[0], 200, NEW_VIEW);
    act(() => setVisibility('hidden'));
    await advance(STATUS_POLL_INTERVAL_MS * 3);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    act(() => setVisibility('visible'));
    await advance(1000);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it.each([
    ['emergency', 200, EMERGENCY_VIEW],
    ['declined', 200, DECLINED_VIEW],
    ['booked', 200, BOOKED_VIEW],
  ])('stops polling after %s', async (_name, status, body) => {
    const { fetchMock, pending } = stubFetch();
    const { result } = renderHook(() => useStatusPolling(ID));
    await advance(0);
    await respond(pending[0], status, body);
    expect(result.current.stopped).toBe(true);
    expect(result.current.gone).toBe(false);
    await advance(STATUS_POLL_INTERVAL_MS * 3);
    act(() => setVisibility('hidden'));
    act(() => setVisibility('visible'));
    await advance(1000);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('stops and reports gone on 404', async () => {
    const { fetchMock, pending } = stubFetch();
    const { result } = renderHook(() => useStatusPolling(ID));
    await advance(0);
    await respond(pending[0], 404, { error: 'not_found', message: 'x' });
    expect(result.current.gone).toBe(true);
    expect(result.current.stopped).toBe(true);
    expect(result.current.loaded).toBe(true);
    await advance(STATUS_POLL_INTERVAL_MS * 3);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('keeps a single request in flight and ignores refresh() while it runs', async () => {
    const { fetchMock, pending } = stubFetch();
    const { result } = renderHook(() => useStatusPolling(ID));
    await advance(0);
    act(() => result.current.refresh());
    act(() => setVisibility('visible'));
    await advance(STATUS_POLL_INTERVAL_MS * 2);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(pending[0].signal.aborted).toBe(false);
    await respond(pending[0], 200, NEW_VIEW);
    act(() => result.current.refresh());
    await advance(0);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('aborts on unmount without a state update or act warning', async () => {
    const { pending } = stubFetch();
    const { unmount } = renderHook(() => useStatusPolling(ID));
    await advance(0);
    unmount();
    expect(pending[0].signal.aborted).toBe(true);
    await advance(0);
    pending[0].respond(200, NEW_VIEW);
    await advance(STATUS_POLL_INTERVAL_MS * 2);
    expect(errorSpy).not.toHaveBeenCalled();
  });

  it('keeps the last view after a failed response and clears updateFailed on success', async () => {
    const { fetchMock, pending } = stubFetch();
    const { result } = renderHook(() => useStatusPolling(ID));
    await advance(0);
    await respond(pending[0], 200, INFO_VIEW);
    await advance(STATUS_POLL_INTERVAL_MS);
    await respond(pending[1], 500, { error: 'x', message: 'y' });
    expect(result.current.updateFailed).toBe(true);
    expect(result.current.view).toEqual(INFO_VIEW);
    await advance(STATUS_POLL_INTERVAL_MS);
    expect(fetchMock).toHaveBeenCalledTimes(3);
    await respond(pending[2], 200, ACCEPTED_VIEW);
    expect(result.current.updateFailed).toBe(false);
    expect(result.current.view).toEqual(ACCEPTED_VIEW);
  });

  it('keeps the last view after an invalid response body', async () => {
    const { pending } = stubFetch();
    const { result } = renderHook(() => useStatusPolling(ID));
    await advance(0);
    await respond(pending[0], 200, INFO_VIEW);
    await advance(STATUS_POLL_INTERVAL_MS);
    await respond(pending[1], 200, { status: 'booked' });
    expect(result.current.updateFailed).toBe(true);
    expect(result.current.view).toEqual(INFO_VIEW);
    expect(result.current.stopped).toBe(false);
  });

  it('calls onEmergency exactly once for a polled emergency', async () => {
    const { pending } = stubFetch();
    const onEmergency = vi.fn();
    renderHook(() => useStatusPolling(ID, { onEmergency }));
    await advance(0);
    await respond(pending[0], 200, EMERGENCY_VIEW);
    await advance(STATUS_POLL_INTERVAL_MS * 2);
    expect(onEmergency).toHaveBeenCalledTimes(1);
  });

  it('calls onEmergency exactly once when the emergency arrives through applyView', async () => {
    const { pending } = stubFetch();
    const onEmergency = vi.fn();
    const { result } = renderHook(() => useStatusPolling(ID, { onEmergency }));
    await advance(0);
    await respond(pending[0], 200, NEW_VIEW);
    act(() => result.current.applyView(EMERGENCY_VIEW));
    act(() => result.current.applyView(EMERGENCY_VIEW));
    await advance(0);
    expect(onEmergency).toHaveBeenCalledTimes(1);
    expect(result.current.view).toEqual(EMERGENCY_VIEW);
    expect(result.current.stopped).toBe(true);
  });

  it('applyView stops on booked and declined but keeps polling for other views', async () => {
    const { fetchMock, pending } = stubFetch();
    const { result } = renderHook(() => useStatusPolling(ID));
    await advance(0);
    await respond(pending[0], 200, NEW_VIEW);

    act(() => result.current.applyView(INFO_VIEW));
    expect(result.current.stopped).toBe(false);
    expect(result.current.view).toEqual(INFO_VIEW);
    await advance(STATUS_POLL_INTERVAL_MS);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    await respond(pending[1], 200, INFO_VIEW);

    act(() => result.current.applyView(BOOKED_VIEW));
    expect(result.current.stopped).toBe(true);
    expect(result.current.view).toEqual(BOOKED_VIEW);
    await advance(STATUS_POLL_INTERVAL_MS * 3);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('applyView with declined stops polling', async () => {
    const { fetchMock, pending } = stubFetch();
    const { result } = renderHook(() => useStatusPolling(ID));
    await advance(0);
    await respond(pending[0], 200, NEW_VIEW);
    act(() => result.current.applyView(DECLINED_VIEW));
    expect(result.current.stopped).toBe(true);
    await advance(STATUS_POLL_INTERVAL_MS * 3);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('refreshNow aborts the in-flight request, ignores its late result and shows the new result', async () => {
    const { fetchMock, pending } = stubFetch();
    const { result } = renderHook(() => useStatusPolling(ID));
    await advance(0);
    expect(fetchMock).toHaveBeenCalledTimes(1);

    act(() => result.current.refreshNow());
    await advance(0);
    expect(pending[0].signal.aborted).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(2);

    // The aborted request's late (stale) result must not be applied.
    await respond(pending[0], 200, DECLINED_VIEW);
    expect(result.current.view).toBeNull();
    expect(result.current.stopped).toBe(false);

    await respond(pending[1], 200, ACCEPTED_VIEW);
    expect(result.current.view).toEqual(ACCEPTED_VIEW);
    expect(result.current.refreshing).toBe(false);
    expect(errorSpy).not.toHaveBeenCalled();
  });
});
