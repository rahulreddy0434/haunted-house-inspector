import { createHash } from 'node:crypto';
import { NextRequest } from 'next/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

const { incrementMock } = vi.hoisted(() => ({ incrementMock: vi.fn() }));
vi.mock('@/lib/aws/dynamodb', () => ({ incrementRateLimitCounter: incrementMock }));

type RateLimiter = typeof import('@/lib/rateLimiter');

const SECRET = 'test-secret-value';
const ORIGINAL_SECRET = process.env.SESSION_SECRET;
const WINDOW_START = 1_700_000_000_000;

async function load(): Promise<RateLimiter> {
  vi.resetModules();
  return import('@/lib/rateLimiter');
}

function makeRequest(opts: { ip?: string | null; cookie?: string } = {}): NextRequest {
  const headers: Record<string, string> = {};
  if (opts.ip !== null) headers['x-forwarded-for'] = opts.ip ?? '203.0.113.7';
  if (opts.cookie !== undefined) headers.cookie = `hhi_session=${opts.cookie}`;
  return new NextRequest('http://localhost/api/inspect', { method: 'POST', headers });
}

function ipId(ip: string): string {
  return `ip:${createHash('sha256').update(ip).digest('hex')}`;
}

/** Counter mock modelling the store: allowed while the prior count is below the limit. */
function mockPriorCount(prior: number): void {
  incrementMock.mockResolvedValue({
    allowed: prior < 15,
    count: prior < 15 ? prior + 1 : prior,
    windowStart: WINDOW_START,
  });
}

let warnSpy: ReturnType<typeof vi.spyOn>;
let errorSpy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  process.env.SESSION_SECRET = SECRET;
  incrementMock.mockReset();
  mockPriorCount(0);
  warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
  errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
});

afterEach(() => {
  if (ORIGINAL_SECRET === undefined) delete process.env.SESSION_SECRET;
  else process.env.SESSION_SECRET = ORIGINAL_SECRET;
  vi.restoreAllMocks();
});

describe('checkRateLimit limit boundary', () => {
  it.each([0, 14])('allows when prior count is %i', async (prior) => {
    const { checkRateLimit } = await load();
    mockPriorCount(prior);
    const result = await checkRateLimit(makeRequest());
    expect(result.allowed).toBe(true);
    expect(result.remaining).toBe(14 - prior);
    expect(result.setCookie).toBeDefined();
  });

  it.each([15, 16])('blocks when prior count is %i', async (prior) => {
    const { checkRateLimit } = await load();
    mockPriorCount(prior);
    const result = await checkRateLimit(makeRequest());
    expect(result.allowed).toBe(false);
    expect(result.remaining).toBe(0);
    expect(result.setCookie).toBeUndefined();
  });

  it('passes the limit and window to the counter', async () => {
    const { checkRateLimit } = await load();
    await checkRateLimit(makeRequest());
    expect(incrementMock).toHaveBeenCalledWith(
      expect.any(String),
      expect.any(Number),
      15,
      86_400_000,
    );
  });
});

describe('checkRateLimit cookie-first identification', () => {
  it('uses the visitorId from a validly signed cookie and issues a verifiable cookie', async () => {
    const { checkRateLimit, signSessionToken, verifySessionToken } = await load();
    const token = signSessionToken(
      { visitorId: 'visitor-abc', count: 3, windowStart: WINDOW_START },
      SECRET,
    );
    mockPriorCount(3);
    const result = await checkRateLimit(makeRequest({ cookie: token }));

    expect(incrementMock.mock.calls[0][0]).toBe('visitor-abc');
    expect(result.allowed).toBe(true);
    const cookie = result.setCookie;
    expect(cookie).toBeDefined();
    expect(cookie?.name).toBe('hhi_session');
    expect(cookie?.options).toMatchObject({
      httpOnly: true,
      sameSite: 'strict',
      secure: true,
      maxAge: 86400,
    });
    const payload = verifySessionToken(cookie?.value ?? '', SECRET);
    expect(payload).toEqual({ visitorId: 'visitor-abc', count: 4, windowStart: WINDOW_START });
  });

  it('falls back to the IP hash when the payload is tampered', async () => {
    const { checkRateLimit, signSessionToken } = await load();
    const good = signSessionToken({ visitorId: 'visitor-abc', count: 1, windowStart: 1 }, SECRET);
    const sig = good.split('.')[1];
    const forgedPayload = Buffer.from(
      JSON.stringify({ visitorId: 'victim', count: 0, windowStart: 1 }),
    ).toString('base64url');
    await checkRateLimit(makeRequest({ cookie: `${forgedPayload}.${sig}` }));

    const id = incrementMock.mock.calls[0][0] as string;
    expect(id).toBe(ipId('203.0.113.7'));
    expect(id.startsWith('ip:')).toBe(true);
    expect(id).not.toContain('203.0.113.7');
  });

  it('falls back to the IP hash when the signature is tampered', async () => {
    const { checkRateLimit, signSessionToken } = await load();
    const good = signSessionToken({ visitorId: 'visitor-abc', count: 1, windowStart: 1 }, SECRET);
    const [payloadPart] = good.split('.');
    const badSig = Buffer.from('not-the-real-signature-bytes-xxxx').toString('base64url');
    await checkRateLimit(makeRequest({ cookie: `${payloadPart}.${badSig}` }));

    const id = incrementMock.mock.calls[0][0] as string;
    expect(id.startsWith('ip:')).toBe(true);
    expect(id).not.toContain('203.0.113.7');
  });

  it('ignores a cookie signed with a different secret', async () => {
    const { checkRateLimit, signSessionToken } = await load();
    const token = signSessionToken({ visitorId: 'visitor-abc', count: 1, windowStart: 1 }, 'other');
    await checkRateLimit(makeRequest({ cookie: token }));
    expect(incrementMock.mock.calls[0][0]).toBe(ipId('203.0.113.7'));
  });
});

describe('checkRateLimit IP fallback', () => {
  it.each([
    ['absent cookie', undefined],
    ['garbage', 'garbage'],
    ['three segments', 'a.b.c'],
    ['empty', ''],
  ])('uses the IP id for %s', async (_label, cookie) => {
    const { checkRateLimit } = await load();
    await checkRateLimit(makeRequest({ cookie }));
    const id = incrementMock.mock.calls[0][0] as string;
    expect(id).toBe(ipId('203.0.113.7'));
    expect(id).not.toContain('203.0.113.7');
  });

  it('uses the first x-forwarded-for entry', async () => {
    const { checkRateLimit } = await load();
    await checkRateLimit(makeRequest({ ip: '198.51.100.1, 10.0.0.1, 10.0.0.2' }));
    expect(incrementMock.mock.calls[0][0]).toBe(ipId('198.51.100.1'));
  });

  it("uses 'unknown' when the header is missing", async () => {
    const { checkRateLimit } = await load();
    await checkRateLimit(makeRequest({ ip: null }));
    expect(incrementMock.mock.calls[0][0]).toBe(ipId('unknown'));
  });
});

describe('checkRateLimit without SESSION_SECRET', () => {
  it.each([
    ['unset', undefined],
    ['empty', ''],
  ])('degrades to IP-only when the secret is %s', async (_label, value) => {
    const { checkRateLimit, signSessionToken } = await load();
    if (value === undefined) delete process.env.SESSION_SECRET;
    else process.env.SESSION_SECRET = value;

    const token = signSessionToken({ visitorId: 'visitor-abc', count: 1, windowStart: 1 }, SECRET);
    const first = await checkRateLimit(makeRequest({ cookie: token }));
    const second = await checkRateLimit(makeRequest({ cookie: token }));
    await checkRateLimit(makeRequest());

    expect(first.allowed).toBe(true);
    expect(first.setCookie).toBeUndefined();
    expect(second.setCookie).toBeUndefined();
    for (const call of incrementMock.mock.calls) {
      expect(call[0]).toBe(ipId('203.0.113.7'));
    }
    expect(warnSpy).toHaveBeenCalledTimes(1);
  });
});

describe('checkRateLimit fail-open', () => {
  it('allows the request and logs when the counter rejects', async () => {
    const { checkRateLimit } = await load();
    incrementMock.mockRejectedValue(new Error('dynamo down'));
    const result = await checkRateLimit(makeRequest());
    expect(result.allowed).toBe(true);
    expect(errorSpy).toHaveBeenCalled();
  });
});

describe('session token helpers', () => {
  const payload = { visitorId: 'v1', count: 2, windowStart: WINDOW_START };

  it('round-trips a payload', async () => {
    const { signSessionToken, verifySessionToken } = await load();
    expect(verifySessionToken(signSessionToken(payload, SECRET), SECRET)).toEqual(payload);
  });

  it('rejects a token verified with the wrong secret', async () => {
    const { signSessionToken, verifySessionToken } = await load();
    expect(verifySessionToken(signSessionToken(payload, SECRET), 'wrong')).toBeNull();
  });

  it('returns null for an empty secret', async () => {
    const { signSessionToken, verifySessionToken } = await load();
    expect(verifySessionToken(signSessionToken(payload, SECRET), '')).toBeNull();
  });
});
