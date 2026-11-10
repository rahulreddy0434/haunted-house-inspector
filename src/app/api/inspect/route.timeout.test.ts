/**
 * Integration test: Bedrock does not respond within 20 s (Requirement 8.7).
 *
 * The REAL route, rateLimiter, safety layer, Zod schemas and
 * `invokeInspectionModel` are used. Only the edges are replaced: S3 presigning,
 * DynamoDB, global `fetch` and the Bedrock SDK client.
 *
 * Timer approach: `AbortSignal.timeout` is backed by a native timer that
 * vitest fake timers do not control. So `AbortSignal.timeout` is stubbed with
 * an AbortController whose abort is scheduled via the (faked) `setTimeout`.
 * Advancing fake time by 20_000 ms then aborts the signal exactly as the real
 * one would, with no real waiting. The stubbed `send` never resolves and
 * rejects with an AbortError when the signal it receives aborts.
 */
import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('server-only', () => ({}));

const { persistInspectionMock, incrementMock, getDownloadMock, sendMock } = vi.hoisted(() => ({
  persistInspectionMock: vi.fn(),
  incrementMock: vi.fn(),
  getDownloadMock: vi.fn(),
  sendMock: vi.fn(),
}));

vi.mock('@/lib/aws/dynamodb', () => ({
  persistInspection: persistInspectionMock,
  incrementRateLimitCounter: incrementMock,
}));

vi.mock('@/lib/aws/s3', () => ({
  getDownloadPresignedUrl: getDownloadMock,
}));

vi.mock('@aws-sdk/client-bedrock-runtime', () => {
  class BedrockRuntimeClient {
    send(command: unknown, options?: unknown): Promise<unknown> {
      return sendMock(command, options);
    }
  }
  class InvokeModelCommand {
    constructor(public input: unknown) {}
  }
  return { BedrockRuntimeClient, InvokeModelCommand };
});

import { POST } from '@/app/api/inspect/route';
import { invokeInspectionModel } from '@/lib/aws/bedrock';

const TIMEOUT_MS = 20_000;
const answers = {
  location: 'Kitchen, under the sink',
  duration: 'About two days',
  recentChanges: 'None that I know of',
};

function makeRequest(): NextRequest {
  return new NextRequest('http://localhost/api/inspect', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-forwarded-for': '203.0.113.7' },
    body: JSON.stringify({ s3Keys: ['job-1/a.jpg'], answers }),
  });
}

/** Lets pending microtasks (rate limit, image fetch) run without moving the clock far. */
async function flush(): Promise<void> {
  for (let i = 0; i < 10; i++) await vi.advanceTimersByTimeAsync(0);
}

describe('POST /api/inspect: Bedrock timeout', () => {
  const originalSecret = process.env.SESSION_SECRET;
  const originalRegion = process.env.APP_AWS_REGION;
  let timeoutSpy: MockInstance<(ms: number) => AbortSignal>;

  beforeEach(() => {
    vi.useFakeTimers();
    process.env.SESSION_SECRET = 'test-secret-for-timeout-test';
    process.env.APP_AWS_REGION = 'us-east-2';

    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.spyOn(console, 'log').mockImplementation(() => {});

    persistInspectionMock.mockReset().mockResolvedValue(true);
    incrementMock
      .mockReset()
      .mockImplementation(async () => ({ allowed: true, count: 1, windowStart: Date.now() }));
    getDownloadMock.mockReset().mockResolvedValue('https://example.test/a.jpg');

    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        new Response(new Uint8Array([0xff, 0xd8, 0xff, 0xd9]), {
          status: 200,
          headers: { 'content-type': 'image/jpeg' },
        }),
      ),
    );

    // Controllable replacement for the native-timer-backed AbortSignal.timeout.
    timeoutSpy = vi.spyOn(AbortSignal, 'timeout').mockImplementation((ms: number) => {
      const controller = new AbortController();
      setTimeout(() => {
        const err = new Error('The operation was aborted due to timeout');
        err.name = 'TimeoutError';
        controller.abort(err);
      }, ms);
      return controller.signal;
    });

    // Never resolves; rejects with AbortError once the passed signal aborts.
    sendMock.mockReset().mockImplementation(
      (_command: unknown, options?: { abortSignal?: AbortSignal }) =>
        new Promise((_resolve, reject) => {
          const signal = options?.abortSignal;
          const fail = () => {
            const err = new Error('Request aborted');
            err.name = 'AbortError';
            reject(err);
          };
          if (signal?.aborted) return fail();
          signal?.addEventListener('abort', fail, { once: true });
        }),
    );
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    if (originalSecret === undefined) delete process.env.SESSION_SECRET;
    else process.env.SESSION_SECRET = originalSecret;
    if (originalRegion === undefined) delete process.env.APP_AWS_REGION;
    else process.env.APP_AWS_REGION = originalRegion;
  });

  it('returns 502 ANALYSIS_FAILED after 20 s and stays pending until then', async () => {
    let settled = false;
    const pending = POST(makeRequest()).finally(() => {
      settled = true;
    });

    await flush();
    expect(timeoutSpy).toHaveBeenCalledWith(TIMEOUT_MS);
    expect(sendMock).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(TIMEOUT_MS - 1);
    expect(settled).toBe(false);

    await vi.advanceTimersByTimeAsync(1);
    const response = await pending;

    expect(response.status).toBe(502);
    const body = await response.json();
    expect(body).toEqual({
      error: 'ANALYSIS_FAILED',
      message: "We couldn't analyse your photos. Please try again.",
    });
    expect(persistInspectionMock).not.toHaveBeenCalled();
  });

  it('invokeInspectionModel rejects with a message mentioning 20 seconds', async () => {
    const outcome = invokeInspectionModel(['job-1/a.jpg'], answers).then(
      () => null,
      (e: unknown) => e,
    );

    await flush();
    await vi.advanceTimersByTimeAsync(TIMEOUT_MS);
    const error = await outcome;

    expect(error).toBeInstanceOf(Error);
    expect((error as Error).message).toMatch(/20 seconds/);
  });
});
