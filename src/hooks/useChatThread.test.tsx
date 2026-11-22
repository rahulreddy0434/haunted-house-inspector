import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useChatThread } from '@/hooks/useChatThread';
import type { UseChatThreadOptions } from '@/hooks/useChatThread';
import { FAST_INTERVAL_MS, SLOW_INTERVAL_MS, QUIET_PERIOD_MS } from '@/lib/chat/pollSchedule';
import type { JobStatus } from '@/types/job';

const ID = '3f2b8c1e-5a47-4d9e-9b1a-2c7d8e6f0a11';
const SENT_AT = '2030-01-01T10:00:00.000Z';

interface Call {
  url: string;
  method: string;
  signal: AbortSignal | undefined;
  respond: (status: number, body?: unknown) => void;
}

/** A fetch stub whose requests stay open until the test responds; aborting rejects like real fetch. */
function stubFetch() {
  const calls: Call[] = [];
  const fetchMock = vi.fn((url: string, init?: RequestInit) => {
    const signal = init?.signal ?? undefined;
    return new Promise<Response>((resolve, reject) => {
      signal?.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')));
      calls.push({
        url,
        method: init?.method ?? 'GET',
        signal,
        respond: (status, body) =>
          resolve(new Response(body === undefined ? null : JSON.stringify(body), { status })),
      });
    });
  });
  vi.stubGlobal('fetch', fetchMock);
  const gets = () => calls.filter((c) => c.method === 'GET');
  const posts = () => calls.filter((c) => c.method === 'POST');
  return { fetchMock, calls, gets, posts };
}

function message(seq: number, side: 'homeowner' | 'tradesperson' = 'tradesperson') {
  return { id: `c-${seq}`, side, text: `message ${seq}`, sentAt: SENT_AT, legacy: false };
}

function readBody(
  over: { status?: string; messages?: ReturnType<typeof message>[]; lastSeq?: number } = {},
) {
  return {
    status: over.status ?? 'new',
    booking: {},
    chatState: over.status === 'declined' ? 'read_only' : 'open',
    messages: over.messages ?? [],
    lastSeq: over.lastSeq ?? 0,
  };
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

async function respond(call: Call, status: number, body?: unknown) {
  await act(async () => {
    call.respond(status, body);
    await vi.advanceTimersByTimeAsync(0);
  });
}

describe('useChatThread polling', () => {
  const onJobChange = vi.fn();
  const onEmergency = vi.fn();

  function mount(status: JobStatus | null = 'new') {
    return renderHook(
      (props: Partial<UseChatThreadOptions>) =>
        useChatThread({
          side: 'homeowner',
          jobId: ID,
          status: 'new',
          onJobChange,
          onEmergency,
          ...props,
        }),
      { initialProps: { status } as Partial<UseChatThreadOptions> },
    );
  }

  /** Answers the open GET with an empty read, then waits the given time. */
  async function emptyPollThen(gets: () => Call[], waitMs: number) {
    const call = gets()[gets().length - 1];
    await respond(call, 200, readBody());
    await advance(waitMs);
  }

  beforeEach(() => {
    vi.useFakeTimers();
    visibility = 'visible';
    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => visibility });
    onJobChange.mockReset();
    onEmergency.mockReset();
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('checks at once without a cursor, then every 5 s after completion with the cursor', async () => {
    const { gets } = stubFetch();
    const { result } = mount();
    await advance(0);
    expect(gets()).toHaveLength(1);
    expect(gets()[0].url).toBe(`/api/inspections/${ID}/chat`);
    await respond(gets()[0], 200, readBody({ messages: [message(1)], lastSeq: 1 }));
    expect(result.current.messages).toHaveLength(1);
    await advance(FAST_INTERVAL_MS - 1);
    expect(gets()).toHaveLength(1);
    await advance(1);
    expect(gets()).toHaveLength(2);
    expect(gets()[1].url).toBe(`/api/inspections/${ID}/chat?after=1`);
  });

  it('slows to 30 s after 2 minutes without a message', async () => {
    const { gets } = stubFetch();
    mount();
    await advance(0);
    for (let elapsed = 0; elapsed < QUIET_PERIOD_MS; elapsed += FAST_INTERVAL_MS) {
      await emptyPollThen(gets, FAST_INTERVAL_MS);
    }
    const count = gets().length;
    await respond(gets()[count - 1], 200, readBody());
    await advance(SLOW_INTERVAL_MS - 1);
    expect(gets()).toHaveLength(count);
    await advance(1);
    expect(gets()).toHaveLength(count + 1);
  });

  async function reachSlowState(gets: () => Call[]) {
    await advance(0);
    for (let elapsed = 0; elapsed < QUIET_PERIOD_MS; elapsed += FAST_INTERVAL_MS) {
      await emptyPollThen(gets, FAST_INTERVAL_MS);
    }
  }

  it('returns to 5 s when a new message arrives', async () => {
    const { gets } = stubFetch();
    mount();
    await reachSlowState(gets);
    await respond(gets()[gets().length - 1], 200, readBody({ messages: [message(1)], lastSeq: 1 }));
    const count = gets().length;
    await advance(FAST_INTERVAL_MS);
    expect(gets()).toHaveLength(count + 1);
  });

  it('returns to 5 s after a send, which also checks at once', async () => {
    const { gets, posts } = stubFetch();
    const { result } = mount();
    await reachSlowState(gets);
    await respond(gets()[gets().length - 1], 200, readBody());
    const count = gets().length;

    let sent: Promise<string> | undefined;
    act(() => {
      sent = result.current.send('hello');
    });
    await advance(0);
    await respond(posts()[0], 200, { ...readBody(), message: message(1, 'homeowner'), messages: undefined, lastSeq: undefined });
    await expect(sent).resolves.toBe('sent');
    expect(gets()).toHaveLength(count + 1);
    await respond(gets()[count], 200, readBody({ lastSeq: 1 }));
    await advance(FAST_INTERVAL_MS - 1);
    expect(gets()).toHaveLength(count + 1);
    await advance(1);
    expect(gets()).toHaveLength(count + 2);
  });

  it('stops while the tab is hidden and checks once at once when visible again', async () => {
    const { gets } = stubFetch();
    mount();
    await advance(0);
    await respond(gets()[0], 200, readBody());
    act(() => setVisibility('hidden'));
    await advance(FAST_INTERVAL_MS * 6);
    expect(gets()).toHaveLength(1);
    act(() => setVisibility('visible'));
    await advance(0);
    expect(gets()).toHaveLength(2);
  });

  it('stops when the Job becomes read only', async () => {
    const { gets } = stubFetch();
    mount();
    await advance(0);
    await respond(gets()[0], 200, readBody({ status: 'declined' }));
    await advance(SLOW_INTERVAL_MS * 2);
    expect(gets()).toHaveLength(1);
  });

  it('stops when the page status changes to read only', async () => {
    const { gets } = stubFetch();
    const view = mount();
    await advance(0);
    await respond(gets()[0], 200, readBody());
    view.rerender({ status: 'declined' });
    await advance(SLOW_INTERVAL_MS * 2);
    expect(gets()).toHaveLength(1);
  });

  it('makes no request for an emergency Job', async () => {
    const { fetchMock } = stubFetch();
    mount('emergency');
    await advance(SLOW_INTERVAL_MS * 2);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('stops, clears the messages and calls onEmergency once on a 409 JOB_IS_EMERGENCY', async () => {
    const { gets } = stubFetch();
    const { result } = mount();
    await advance(0);
    await respond(gets()[0], 200, readBody({ messages: [message(1)], lastSeq: 1 }));
    expect(result.current.messages).toHaveLength(1);
    await advance(FAST_INTERVAL_MS);
    await respond(gets()[1], 409, { error: 'JOB_IS_EMERGENCY' });
    expect(result.current.messages).toEqual([]);
    expect(onEmergency).toHaveBeenCalledTimes(1);
    await advance(SLOW_INTERVAL_MS * 2);
    expect(gets()).toHaveLength(2);
  });

  it('does not start a second check while one is in flight', async () => {
    const { gets } = stubFetch();
    mount();
    await advance(0);
    expect(gets()).toHaveLength(1);
    await advance(SLOW_INTERVAL_MS * 2);
    act(() => setVisibility('hidden'));
    act(() => setVisibility('visible'));
    await advance(0);
    expect(gets()).toHaveLength(1);
  });

  it('runs one follow-up check after the in-flight one when a send succeeds meanwhile', async () => {
    const { gets, posts } = stubFetch();
    const { result } = mount();
    await advance(0);
    await respond(gets()[0], 200, readBody());
    await advance(FAST_INTERVAL_MS);
    expect(gets()).toHaveLength(2); // in flight

    let sent: Promise<string> | undefined;
    act(() => {
      sent = result.current.send('hello');
    });
    await advance(0);
    await respond(posts()[0], 200, { ...readBody(), message: message(1, 'homeowner') });
    await expect(sent).resolves.toBe('sent');
    expect(gets()).toHaveLength(2);

    await respond(gets()[1], 200, readBody({ lastSeq: 1 }));
    expect(gets()).toHaveLength(3);
    await respond(gets()[2], 200, readBody({ lastSeq: 1 }));
    expect(gets()).toHaveLength(3);
  });

  it('keeps the messages when a check fails and tries again', async () => {
    const { gets } = stubFetch();
    const { result } = mount();
    await advance(0);
    await respond(gets()[0], 200, readBody({ messages: [message(1)], lastSeq: 1 }));
    await advance(FAST_INTERVAL_MS);
    await respond(gets()[1], 500);
    expect(result.current.checkFailed).toBe(true);
    expect(result.current.messages).toHaveLength(1);
    await advance(FAST_INTERVAL_MS);
    expect(gets()).toHaveLength(3);
    await respond(gets()[2], 200, readBody({ lastSeq: 1 }));
    expect(result.current.checkFailed).toBe(false);
    expect(result.current.messages).toHaveLength(1);
  });

  it('cancels the timer on unmount', async () => {
    const { gets } = stubFetch();
    const { unmount } = mount();
    await advance(0);
    await respond(gets()[0], 200, readBody());
    expect(vi.getTimerCount()).toBeGreaterThan(0);
    unmount();
    expect(vi.getTimerCount()).toBe(0);
    await advance(SLOW_INTERVAL_MS * 2);
    expect(gets()).toHaveLength(1);
  });

  it('aborts the request in flight on unmount and ignores its answer', async () => {
    const { gets } = stubFetch();
    const { unmount } = mount();
    await advance(0);
    const first = gets()[0];
    unmount();
    expect(first.signal?.aborted).toBe(true);
    await advance(SLOW_INTERVAL_MS * 2);
    expect(gets()).toHaveLength(1);
  });

  it('keeps the pending timer when only the page status changes', async () => {
    const { gets } = stubFetch();
    const view = mount();
    await advance(0);
    await respond(gets()[0], 200, readBody());
    await advance(FAST_INTERVAL_MS - 1000);
    view.rerender({ status: 'accepted' });
    await advance(999);
    expect(gets()).toHaveLength(1);
    await advance(1);
    expect(gets()).toHaveLength(2);
  });

  it('keeps the 30 s interval when only the page status changes in the quiet state', async () => {
    const { gets } = stubFetch();
    const view = mount();
    await reachSlowState(gets);
    await respond(gets()[gets().length - 1], 200, readBody());
    const count = gets().length;
    await advance(10_000);
    view.rerender({ status: 'accepted' });
    await advance(SLOW_INTERVAL_MS - 10_000 - 1);
    expect(gets()).toHaveLength(count);
    await advance(1);
    expect(gets()).toHaveLength(count + 1);
  });
});
