import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { useProJobs } from '@/hooks/useProJobs';
import { hadProSession, resetProSession } from '@/hooks/proSession';
import { ERROR_MESSAGES } from '@/lib/jobs/copy';

const JOB_A = {
  id: 'job-a',
  createdAt: '2026-03-05T10:00:00.000Z',
  urgency: 'urgent',
  trade: 'Plumber',
  location: 'Kitchen',
  status: 'new',
};
const JOB_B = { ...JOB_A, id: 'job-b', urgency: 'soon', location: 'Attic' };

interface Pending {
  signal: AbortSignal;
  respond: (status: number, body?: unknown) => void;
  fail: (error: Error) => void;
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
        fail: reject,
      });
    });
  });
  vi.stubGlobal('fetch', fetchMock);
  return { fetchMock, pending };
}

async function respond(p: Pending, status: number, body?: unknown) {
  await act(async () => {
    p.respond(status, body);
    await Promise.resolve();
  });
}

describe('useProJobs', () => {
  let errorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    resetProSession();
    errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    errorSpy.mockRestore();
  });

  it('loads the list and marks the session', async () => {
    const { fetchMock, pending } = stubFetch();
    const { result } = renderHook(() => useProJobs());
    expect(result.current.phase).toBe('loading');
    expect(result.current.refreshing).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][0]).toBe('/api/pro/jobs');

    await respond(pending[0], 200, { jobs: [JOB_A] });
    await waitFor(() => expect(result.current.phase).toBe('ready'));
    expect(result.current.jobs).toEqual([JOB_A]);
    expect(result.current.refreshing).toBe(false);
    expect(result.current.error).toBeNull();
    expect(hadProSession()).toBe(true);
  });

  it('401 on first load is unauthorized with sessionLost false', async () => {
    const { pending } = stubFetch();
    const { result } = renderHook(() => useProJobs());
    await respond(pending[0], 401, { error: 'UNAUTHORIZED', message: 'Nope' });
    await waitFor(() => expect(result.current.phase).toBe('unauthorized'));
    expect(result.current.sessionLost).toBe(false);
    expect(result.current.jobs).toEqual([]);
  });

  it('401 on refresh after a success sets sessionLost and clears the list', async () => {
    const { pending } = stubFetch();
    const { result } = renderHook(() => useProJobs());
    await respond(pending[0], 200, { jobs: [JOB_A] });
    await waitFor(() => expect(result.current.phase).toBe('ready'));

    act(() => result.current.refresh());
    await waitFor(() => expect(pending).toHaveLength(2));
    await respond(pending[1], 401, { error: 'UNAUTHORIZED', message: 'Nope' });
    await waitFor(() => expect(result.current.phase).toBe('unauthorized'));
    expect(result.current.sessionLost).toBe(true);
    expect(result.current.jobs).toEqual([]);
  });

  it('401 on a later hook mount after an earlier success sets sessionLost', async () => {
    const { pending } = stubFetch();
    const first = renderHook(() => useProJobs());
    await respond(pending[0], 200, { jobs: [] });
    await waitFor(() => expect(first.result.current.phase).toBe('ready'));
    first.unmount();

    const second = renderHook(() => useProJobs());
    await waitFor(() => expect(pending).toHaveLength(2));
    await respond(pending[1], 401, { error: 'UNAUTHORIZED', message: 'Nope' });
    await waitFor(() => expect(second.result.current.phase).toBe('unauthorized'));
    expect(second.result.current.sessionLost).toBe(true);
  });

  describe('failed refresh keeps the previous list', () => {
    async function loaded() {
      const stub = stubFetch();
      const hook = renderHook(() => useProJobs());
      await respond(stub.pending[0], 200, { jobs: [JOB_A] });
      await waitFor(() => expect(hook.result.current.phase).toBe('ready'));
      return { ...stub, ...hook };
    }

    it('500 with a server message', async () => {
      const { result, pending } = await loaded();
      act(() => result.current.refresh());
      await waitFor(() => expect(pending).toHaveLength(2));
      await respond(pending[1], 500, { error: 'SERVER_ERROR', message: 'Database is sleepy.' });
      await waitFor(() => expect(result.current.error).toBe('Database is sleepy.'));
      expect(result.current.jobs).toEqual([JOB_A]);
      expect(result.current.phase).toBe('ready');
      expect(result.current.errorStatus).toBe(500);
    });

    it('500 without a usable body uses the generic message', async () => {
      const { result, pending } = await loaded();
      act(() => result.current.refresh());
      await waitFor(() => expect(pending).toHaveLength(2));
      await respond(pending[1], 500);
      await waitFor(() => expect(result.current.error).toBe(ERROR_MESSAGES.LOAD_FAILED.list));
      expect(result.current.jobs).toEqual([JOB_A]);
    });

    it('network error', async () => {
      const { result, pending } = await loaded();
      act(() => result.current.refresh());
      await waitFor(() => expect(pending).toHaveLength(2));
      await act(async () => {
        pending[1].fail(new TypeError('Failed to fetch'));
        await Promise.resolve();
      });
      await waitFor(() => expect(result.current.error).toBe(ERROR_MESSAGES.LOAD_FAILED.list));
      expect(result.current.jobs).toEqual([JOB_A]);
      expect(result.current.errorStatus).toBeNull();
    });

    it('invalid body', async () => {
      const { result, pending } = await loaded();
      act(() => result.current.refresh());
      await waitFor(() => expect(pending).toHaveLength(2));
      await respond(pending[1], 200, { jobs: [{ id: 5 }] });
      await waitFor(() => expect(result.current.error).toBe(ERROR_MESSAGES.LOAD_FAILED.list));
      expect(result.current.jobs).toEqual([JOB_A]);
    });

    it('a later success clears the error and replaces the list', async () => {
      const { result, pending } = await loaded();
      act(() => result.current.refresh());
      await waitFor(() => expect(pending).toHaveLength(2));
      await respond(pending[1], 500, { error: 'SERVER_ERROR', message: 'Oops' });
      await waitFor(() => expect(result.current.error).toBe('Oops'));

      act(() => result.current.refresh());
      await waitFor(() => expect(pending).toHaveLength(3));
      await respond(pending[2], 200, { jobs: [JOB_B] });
      await waitFor(() => expect(result.current.error).toBeNull());
      expect(result.current.errorStatus).toBeNull();
      expect(result.current.jobs).toEqual([JOB_B]);
    });
  });

  it('first-load failure leaves ready with an empty list and the error', async () => {
    const { pending } = stubFetch();
    const { result } = renderHook(() => useProJobs());
    await respond(pending[0], 500, { error: 'SERVER_ERROR', message: 'Down' });
    await waitFor(() => expect(result.current.phase).toBe('ready'));
    expect(result.current.jobs).toEqual([]);
    expect(result.current.error).toBe('Down');
  });

  it('503 sets errorStatus 503', async () => {
    const { pending } = stubFetch();
    const { result } = renderHook(() => useProJobs());
    await respond(pending[0], 503, { error: 'PRO_DISABLED', message: 'Access is off.' });
    await waitFor(() => expect(result.current.errorStatus).toBe(503));
    expect(result.current.error).toBe('Access is off.');
  });

  it('ignores refresh() while a request runs', async () => {
    const { fetchMock, pending } = stubFetch();
    const { result } = renderHook(() => useProJobs());
    expect(result.current.refreshing).toBe(true);
    act(() => result.current.refresh());
    act(() => result.current.refresh());
    expect(fetchMock).toHaveBeenCalledTimes(1);

    await respond(pending[0], 200, { jobs: [] });
    await waitFor(() => expect(result.current.refreshing).toBe(false));
    act(() => result.current.refresh());
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(result.current.refreshing).toBe(true);
  });

  it('never refreshes on its own', async () => {
    vi.useFakeTimers();
    const { fetchMock, pending } = stubFetch();
    const { result } = renderHook(() => useProJobs());
    await respond(pending[0], 200, { jobs: [JOB_A] });
    expect(result.current.phase).toBe('ready');

    await act(async () => {
      await vi.advanceTimersByTimeAsync(10 * 60 * 1000);
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('aborts on unmount without a state update or console.error', async () => {
    const { pending } = stubFetch();
    const { unmount } = renderHook(() => useProJobs());
    expect(pending[0].signal.aborted).toBe(false);
    unmount();
    expect(pending[0].signal.aborted).toBe(true);
    await act(async () => {
      await Promise.resolve();
    });
    expect(errorSpy).not.toHaveBeenCalled();
  });
});
