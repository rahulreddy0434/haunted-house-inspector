import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { useProJob } from '@/hooks/useProJob';
import { hadProSession, markProSession, resetProSession } from '@/hooks/proSession';
import { proJobDetailSchema } from '@/lib/validation/jobSchema';
import { ERROR_MESSAGES } from '@/lib/jobs/copy';

const ID = '3f2b8c1e-5a47-4d9e-9b1a-2c7d8e6f0a11';
const OTHER_ID = '9a1b8c1e-5a47-4d9e-9b1a-2c7d8e6f0a22';
const SLOT = '2030-01-01T10:00:00.000Z';
const CREATED = '2026-03-05T10:00:00.000Z';
const ANSWERS = { location: 'Kitchen', duration: '', recentChanges: '' };

const ACTIVE = {
  id: ID,
  createdAt: CREATED,
  status: 'accepted',
  urgency: 'soon',
  likelyIssue: 'Leaky tap',
  trade: 'Plumber',
  confidence: 0.6,
  costRangeLow: 50,
  costRangeHigh: 150,
  jobBrief: 'Brief',
  followUpQuestions: ['a?', 'b?'],
  answers: ANSWERS,
  infoRequests: [],
  replies: [],
  offeredSlots: [SLOT],
  photos: ['https://example.com/p.jpg'],
};
const EMERGENCY = {
  id: ID,
  createdAt: CREATED,
  status: 'emergency',
  urgency: 'emergency',
  likelyIssue: 'Gas smell',
  answers: ANSWERS,
  emergencyNote: 'Call 911.',
};

interface Pending {
  url: string;
  signal: AbortSignal;
  respond: (status: number, body?: unknown) => void;
  fail: (error: Error) => void;
}

function stubFetch() {
  const pending: Pending[] = [];
  const fetchMock = vi.fn((url: string, init?: RequestInit) => {
    const signal = init?.signal as AbortSignal;
    return new Promise<Response>((resolve, reject) => {
      signal.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')));
      pending.push({
        url,
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

describe('useProJob', () => {
  let errorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    resetProSession();
    errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    errorSpy.mockRestore();
  });

  it('fixtures are valid per proJobDetailSchema', () => {
    expect(proJobDetailSchema.safeParse(ACTIVE).success).toBe(true);
    expect(proJobDetailSchema.safeParse(EMERGENCY).success).toBe(true);
  });

  it.each([
    ['active', ACTIVE],
    ['emergency', EMERGENCY],
  ])('200 gives ready with the validated %s job', async (_name, body) => {
    const { pending } = stubFetch();
    const { result } = renderHook(() => useProJob(ID));
    expect(result.current.phase).toBe('loading');
    await respond(pending[0], 200, body);
    await waitFor(() => expect(result.current.phase).toBe('ready'));
    expect(result.current.job).toEqual(body);
    expect(result.current.error).toBeNull();
    expect(result.current.sessionLost).toBe(false);
    expect(hadProSession()).toBe(true);
  });

  it('404 gives notFound', async () => {
    const { pending } = stubFetch();
    const { result } = renderHook(() => useProJob(ID));
    await respond(pending[0], 404, { error: 'NOT_FOUND', message: 'No job.' });
    await waitFor(() => expect(result.current.phase).toBe('notFound'));
    expect(result.current.job).toBeNull();
  });

  it('500 gives error with the server message', async () => {
    const { pending } = stubFetch();
    const { result } = renderHook(() => useProJob(ID));
    await respond(pending[0], 500, { error: 'SERVER_ERROR', message: 'Database is sleepy.' });
    await waitFor(() => expect(result.current.phase).toBe('error'));
    expect(result.current.error).toBe('Database is sleepy.');
  });

  it('500 without a usable body uses the generic message', async () => {
    const { pending } = stubFetch();
    const { result } = renderHook(() => useProJob(ID));
    await respond(pending[0], 500);
    await waitFor(() => expect(result.current.phase).toBe('error'));
    expect(result.current.error).toBe(ERROR_MESSAGES.LOAD_FAILED.detail);
  });

  it('network error gives error', async () => {
    const { pending } = stubFetch();
    const { result } = renderHook(() => useProJob(ID));
    await act(async () => {
      pending[0].fail(new TypeError('Failed to fetch'));
      await Promise.resolve();
    });
    await waitFor(() => expect(result.current.phase).toBe('error'));
    expect(result.current.error).toBe(ERROR_MESSAGES.LOAD_FAILED.detail);
  });

  it('invalid body gives error', async () => {
    const { pending } = stubFetch();
    const { result } = renderHook(() => useProJob(ID));
    await respond(pending[0], 200, { id: ID, status: 'bogus' });
    await waitFor(() => expect(result.current.phase).toBe('error'));
    expect(result.current.job).toBeNull();
    expect(result.current.error).toBe(ERROR_MESSAGES.LOAD_FAILED.detail);
  });

  it('401 on first load gives unauthorized with sessionLost false', async () => {
    const { pending } = stubFetch();
    const { result } = renderHook(() => useProJob(ID));
    await respond(pending[0], 401, { error: 'UNAUTHORIZED', message: 'Nope' });
    await waitFor(() => expect(result.current.phase).toBe('unauthorized'));
    expect(result.current.sessionLost).toBe(false);
  });

  it('401 after an earlier success in the page lifetime sets sessionLost', async () => {
    markProSession();
    const { pending } = stubFetch();
    const { result } = renderHook(() => useProJob(ID));
    await respond(pending[0], 401, { error: 'UNAUTHORIZED', message: 'Nope' });
    await waitFor(() => expect(result.current.phase).toBe('unauthorized'));
    expect(result.current.sessionLost).toBe(true);
  });

  it('reload repeats the request', async () => {
    const { fetchMock, pending } = stubFetch();
    const { result } = renderHook(() => useProJob(ID));
    await respond(pending[0], 500, { error: 'SERVER_ERROR', message: 'Oops' });
    await waitFor(() => expect(result.current.phase).toBe('error'));

    act(() => result.current.reload());
    expect(result.current.phase).toBe('loading');
    expect(fetchMock).toHaveBeenCalledTimes(2);
    await respond(pending[1], 200, ACTIVE);
    await waitFor(() => expect(result.current.phase).toBe('ready'));
    expect(result.current.job).toEqual(ACTIVE);
    expect(result.current.error).toBeNull();
  });

  it('an id change refetches and aborts the old request', async () => {
    const { fetchMock, pending } = stubFetch();
    const { result, rerender } = renderHook(({ id }) => useProJob(id), { initialProps: { id: ID } });
    rerender({ id: OTHER_ID });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(pending[0].signal.aborted).toBe(true);
    expect(pending[1].url).toBe(`/api/pro/jobs/${OTHER_ID}`);

    await respond(pending[1], 200, { ...ACTIVE, id: OTHER_ID });
    await waitFor(() => expect(result.current.phase).toBe('ready'));
    expect(result.current.job?.id).toBe(OTHER_ID);
  });

  it('encodes the id in the URL', async () => {
    const { pending } = stubFetch();
    renderHook(() => useProJob('a b/c?d'));
    expect(pending[0].url).toBe('/api/pro/jobs/a%20b%2Fc%3Fd');
  });

  it('aborts on unmount without a state update or console.error', async () => {
    const { pending } = stubFetch();
    const { unmount } = renderHook(() => useProJob(ID));
    unmount();
    expect(pending[0].signal.aborted).toBe(true);
    await act(async () => {
      await Promise.resolve();
    });
    expect(errorSpy).not.toHaveBeenCalled();
  });
});
