import { afterEach, describe, expect, it, vi } from 'vitest';
import type { InspectionResult } from '@/types/inspection';
import { runUploadFlow, type PutFile } from '@/lib/uploadFlow';

const answers = { location: 'Kitchen', duration: '2 days', recentChanges: 'Heavy rain' };

function makeFiles(n: number) {
  return {
    kind: 'images' as const,
    files: Array.from({ length: n }, (_, i) => new File(['x'], `p${i}.jpg`, { type: 'image/jpeg' })),
  };
}

function makeResult(overrides: Partial<InspectionResult> = {}): InspectionResult {
  return {
    id: 'job-1',
    createdAt: '2024-01-01T00:00:00.000Z',
    s3Keys: ['a'],
    likelyIssue: 'Leaky pipe',
    trade: 'plumber',
    urgency: 'soon',
    confidence: 0.6,
    costRangeLow: 100,
    costRangeHigh: 300,
    jobBrief: 'Brief',
    followUpQuestions: ['q1', 'q2'],
    diySteps: [],
    isEmergency: false,
    answers,
    ...overrides,
  } as InspectionResult;
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

function makeFetch(inspect: () => Response | Promise<Response>, uploadUrl?: (n: number) => Response) {
  let n = 0;
  return vi.fn(async (input: RequestInfo | URL, _init?: RequestInit) => {
    void _init;
    const url = String(input);
    if (url.startsWith('/api/upload-url')) {
      const i = n++;
      return uploadUrl ? uploadUrl(i) : json({ url: `https://s3.test/put/${i}`, key: `key-${i}` });
    }
    return inspect();
  });
}

const okPut: PutFile = async (_u, _f, _c, onProgress) => {
  onProgress(50);
  return true;
};

afterEach(() => vi.useRealTimers());

describe('runUploadFlow', () => {
  it('happy path: 3 files, 3 url calls, 3 PUTs, one POST with request body shape', async () => {
    const fetchImpl = makeFetch(() => json(makeResult()));
    const put = vi.fn(okPut);
    const res = await runUploadFlow({
      files: makeFiles(3),
      answers,
      fetchImpl: fetchImpl as unknown as typeof fetch,
      putFile: put,
      inspectionId: 'abc',
    });
    expect(res.ok).toBe(true);
    const calls = fetchImpl.mock.calls;
    expect(calls.filter(([u]) => String(u).startsWith('/api/upload-url'))).toHaveLength(3);
    expect(String(calls[0][0])).toContain('inspectionId=abc');
    expect(put).toHaveBeenCalledTimes(3);
    const posts = calls.filter(([u]) => u === '/api/inspect');
    expect(posts).toHaveLength(1);
    const body = JSON.parse(String((posts[0][1] as RequestInit).body));
    expect(body).toEqual({ s3Keys: ['key-0', 'key-1', 'key-2'], answers });
  });

  it('does not PUT when upload-url fails, and surfaces the server message', async () => {
    const fetchImpl = makeFetch(
      () => json(makeResult()),
      () => json({ message: 'Bad file' }, 400),
    );
    const put = vi.fn(okPut);
    const res = await runUploadFlow({
      files: makeFiles(1),
      answers,
      fetchImpl: fetchImpl as unknown as typeof fetch,
      putFile: put,
    });
    expect(put).not.toHaveBeenCalled();
    expect(res).toMatchObject({ ok: false, kind: 'upload', message: 'Bad file' });
  });

  it('falls back to a friendly message when upload-url has no message', async () => {
    const fetchImpl = makeFetch(
      () => json(makeResult()),
      () => json({}, 500),
    );
    const res = await runUploadFlow({
      files: makeFiles(1),
      answers,
      fetchImpl: fetchImpl as unknown as typeof fetch,
      putFile: okPut,
    });
    expect(res).toMatchObject({ ok: false, message: "We couldn't prepare your upload. Please try again." });
  });

  it('reports a PUT failure and skips analysis', async () => {
    const fetchImpl = makeFetch(() => json(makeResult()));
    const res = await runUploadFlow({
      files: makeFiles(2),
      answers,
      fetchImpl: fetchImpl as unknown as typeof fetch,
      putFile: async () => false,
    });
    expect(res).toMatchObject({ ok: false, kind: 'upload', message: 'The upload failed. Please try again.' });
    expect(fetchImpl.mock.calls.some(([u]) => u === '/api/inspect')).toBe(false);
  });

  it('maps 429 to rate_limit with resetAt', async () => {
    const fetchImpl = makeFetch(() =>
      json({ error: 'rate_limited', message: 'Limit reached', resetAt: '2024-01-02T00:00:00.000Z' }, 429),
    );
    const res = await runUploadFlow({
      files: makeFiles(1),
      answers,
      fetchImpl: fetchImpl as unknown as typeof fetch,
      putFile: okPut,
    });
    expect(res).toEqual({
      ok: false,
      kind: 'rate_limit',
      message: 'Limit reached',
      resetAt: '2024-01-02T00:00:00.000Z',
    });
  });

  it('maps 502 to analysis with the server message', async () => {
    const fetchImpl = makeFetch(() => json({ error: 'x', message: 'Model down' }, 502));
    const res = await runUploadFlow({
      files: makeFiles(1),
      answers,
      fetchImpl: fetchImpl as unknown as typeof fetch,
      putFile: okPut,
    });
    expect(res).toMatchObject({ ok: false, kind: 'analysis', message: 'Model down' });
  });

  it('rejects an invalid result body', async () => {
    const fetchImpl = makeFetch(() => json({ id: 'x' }));
    const res = await runUploadFlow({
      files: makeFiles(1),
      answers,
      fetchImpl: fetchImpl as unknown as typeof fetch,
      putFile: okPut,
    });
    expect(res).toMatchObject({
      ok: false,
      kind: 'analysis',
      message: "We couldn't read the result. Please try again.",
    });
  });

  it('aborts after 60 s and reports a timeout', async () => {
    vi.useFakeTimers();
    const fetchImpl = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      if (String(input).startsWith('/api/upload-url')) return json({ url: 'https://s3.test/p', key: 'k' });
      return new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')));
      });
    });
    const promise = runUploadFlow({
      files: makeFiles(1),
      answers,
      fetchImpl: fetchImpl as unknown as typeof fetch,
      putFile: okPut,
    });
    await vi.advanceTimersByTimeAsync(60_000);
    expect(await promise).toMatchObject({
      ok: false,
      kind: 'timeout',
      message: 'This is taking longer than expected. Please try again.',
    });
  });

  it('passes emergency results through', async () => {
    const emergency = makeResult({
      urgency: 'emergency',
      isEmergency: true,
      costRangeLow: 0,
      costRangeHigh: 0,
      jobBrief: '',
      diySteps: [],
    });
    const fetchImpl = makeFetch(() => json(emergency));
    const res = await runUploadFlow({
      files: makeFiles(1),
      answers,
      fetchImpl: fetchImpl as unknown as typeof fetch,
      putFile: okPut,
    });
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.result.isEmergency).toBe(true);
  });
});
