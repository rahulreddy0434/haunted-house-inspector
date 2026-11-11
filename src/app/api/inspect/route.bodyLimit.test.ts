// @vitest-environment node
/**
 * POST /api/inspect request body size limit (16384 bytes) -> 413 PAYLOAD_TOO_LARGE.
 * Bedrock and DynamoDB are mocked at the module boundary; rate limiter, safety layer and Zod are real.
 */
import { NextRequest } from 'next/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));
vi.mock('@/lib/aws/bedrock', () => ({ invokeInspectionModel: vi.fn() }));
vi.mock('@/lib/aws/dynamodb', () => ({
  persistInspection: vi.fn(),
  incrementRateLimitCounter: vi.fn(),
}));

import { POST } from '@/app/api/inspect/route';
import { invokeInspectionModel } from '@/lib/aws/bedrock';
import { incrementRateLimitCounter, persistInspection } from '@/lib/aws/dynamodb';

const TOO_LARGE = {
  error: 'PAYLOAD_TOO_LARGE',
  message: 'That request is too large. Please try again with fewer or shorter answers.',
};

const validBedrock = {
  likelyIssue: 'Small leak under the kitchen sink',
  trade: 'Plumber',
  urgency: 'soon',
  confidence: 0.7,
  costRangeLow: 100,
  costRangeHigh: 300,
  jobBrief: 'Water is dripping under the sink.',
  followUpQuestions: ['Is the leak constant?', 'Is the cupboard floor damp?'],
  diySteps: [],
};

const cleanAnswers = {
  location: 'Kitchen under the sink',
  duration: 'A few days',
  recentChanges: 'None',
};

function bodyJson(recentChanges: string): string {
  return JSON.stringify({
    s3Keys: ['job-1/a.jpg'],
    answers: { ...cleanAnswers, recentChanges },
  });
}

/** Valid JSON whose UTF-8 byte length is exactly `bytes` (ASCII padding). */
function jsonOfExactBytes(bytes: number): string {
  const base = Buffer.byteLength(bodyJson(''));
  return bodyJson('a'.repeat(bytes - base));
}

function makeRequest(raw: string, headers: Record<string, string> = {}): NextRequest {
  return new NextRequest('http://localhost/api/inspect', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-forwarded-for': '203.0.113.7', ...headers },
    body: raw,
  });
}

describe('POST /api/inspect: body size limit', () => {
  const originalSecret = process.env.SESSION_SECRET;

  beforeEach(() => {
    process.env.SESSION_SECRET = 'test-secret';
    vi.mocked(invokeInspectionModel).mockReset().mockResolvedValue(validBedrock as never);
    vi.mocked(persistInspection).mockReset().mockResolvedValue(true);
    vi.mocked(incrementRateLimitCounter)
      .mockReset()
      .mockResolvedValue({ allowed: true, count: 1, windowStart: Date.now() });
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.spyOn(console, 'log').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
    if (originalSecret === undefined) delete process.env.SESSION_SECRET;
    else process.env.SESSION_SECRET = originalSecret;
  });

  function expectNothingDownstream() {
    expect(incrementRateLimitCounter).not.toHaveBeenCalled();
    expect(invokeInspectionModel).not.toHaveBeenCalled();
    expect(persistInspection).not.toHaveBeenCalled();
  }

  describe('Content-Length header', () => {
    it.each(['16385', '10000000'])(
      'returns 413 for Content-Length %s without reading the body',
      async (length) => {
        const pull = vi.fn(() => {
          throw new Error('body must not be read');
        });
        const stream = new ReadableStream<Uint8Array>({ pull });
        const request = new NextRequest('http://localhost/api/inspect', {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            'content-length': length,
            'x-forwarded-for': '203.0.113.7',
          },
          body: stream,
          duplex: 'half',
        } as ConstructorParameters<typeof NextRequest>[1]);

        const response = await POST(request);

        expect(response.status).toBe(413);
        expect(await response.json()).toEqual(TOO_LARGE);
        expect(response.headers.get('cache-control')).toBe('no-store');
        // The stream primes pull() once on construction; the route must never read it.
        expect(request.bodyUsed).toBe(false);
        expectNothingDownstream();
      },
    );

    it('accepts Content-Length exactly 16384 (not rejected for size)', async () => {
      const response = await POST(
        makeRequest(bodyJson('None'), { 'content-length': '16384' }),
      );
      expect(response.status).not.toBe(413);
    });
  });

  describe('actual body size', () => {
    it('returns 413 for an oversize body with no Content-Length', async () => {
      const response = await POST(makeRequest(bodyJson('a'.repeat(20000))));
      expect(response.status).toBe(413);
      expect(await response.json()).toEqual(TOO_LARGE);
      expectNothingDownstream();
    });

    it('returns 413 for an oversize body with a lying small Content-Length', async () => {
      const response = await POST(
        makeRequest(bodyJson('a'.repeat(20000)), { 'content-length': '100' }),
      );
      expect(response.status).toBe(413);
      expect(await response.json()).toEqual(TOO_LARGE);
      expectNothingDownstream();
    });

    it('measures bytes, not characters (9000 euro signs = 27000 bytes)', async () => {
      const raw = bodyJson('€'.repeat(9000));
      expect(raw.length).toBeLessThanOrEqual(16384);
      expect(Buffer.byteLength(raw)).toBeGreaterThan(16384);
      const response = await POST(makeRequest(raw));
      expect(response.status).toBe(413);
      expectNothingDownstream();
    });

    it('does not reject a body of exactly 16384 bytes for size', async () => {
      const raw = jsonOfExactBytes(16384);
      expect(Buffer.byteLength(raw)).toBe(16384);
      const response = await POST(makeRequest(raw));
      expect(response.status).not.toBe(413);
    });

    it('rejects a body of 16385 bytes', async () => {
      const raw = jsonOfExactBytes(16385);
      expect(Buffer.byteLength(raw)).toBe(16385);
      const response = await POST(makeRequest(raw));
      expect(response.status).toBe(413);
    });
  });

  describe('normal behaviour is unchanged', () => {
    it('still returns 200 for a small valid body', async () => {
      const response = await POST(makeRequest(bodyJson('None')));
      expect(response.status).toBe(200);
      const json = (await response.json()) as { likelyIssue: string };
      expect(json.likelyIssue).toBe(validBedrock.likelyIssue);
    });

    it('still returns 400 for invalid JSON under the limit', async () => {
      const response = await POST(makeRequest('{not valid json'));
      expect(response.status).toBe(400);
      expect(await response.json()).toEqual({
        error: 'INVALID_REQUEST',
        message: 'Request body must be valid JSON.',
      });
    });

    it('still returns the emergency result for a small emergency body', async () => {
      const response = await POST(makeRequest(bodyJson('I can smell gas')));
      expect(response.status).toBe(200);
      const json = (await response.json()) as { urgency: string; isEmergency?: boolean };
      expect(json.urgency).toBe('emergency');
      expect(invokeInspectionModel).not.toHaveBeenCalled();
    });
  });

  it('returns 413 before the safety check, even when the body mentions gas', async () => {
    const response = await POST(makeRequest(bodyJson('I can smell gas ' + 'a'.repeat(20000))));
    expect(response.status).toBe(413);
    expect(((await response.json()) as { error: string }).error).toBe('PAYLOAD_TOO_LARGE');
    expect(persistInspection).not.toHaveBeenCalled();
  });
});
