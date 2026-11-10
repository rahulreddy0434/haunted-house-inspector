// Integration test: POST /api/inspect, daily rate limit (Requirements 11.1, 11.2).
// MSW is not needed: no HTTP leaves the process because the AWS boundary modules
// (bedrock, dynamodb) are mocked at module level. The route, rate limiter, safety
// layer and Zod schemas are all real.
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

import type { BedrockInspectionResponse } from '@/types/bedrock';

const invokeMock = vi.mocked(invokeInspectionModel);
const persistMock = vi.mocked(persistInspection);
const counterMock = vi.mocked(incrementRateLimitCounter);

const validBedrock: BedrockInspectionResponse = {
  likelyIssue: 'Slow leak under the sink trap',
  trade: 'Plumber',
  urgency: 'soon',
  confidence: 0.7,
  costRangeLow: 100,
  costRangeHigh: 250,
  jobBrief: 'Water is dripping from the pipe under the kitchen sink.',
  followUpQuestions: ['Is the cabinet floor wet?', 'Does it drip when the tap is off?'],
  diySteps: [],
};

function makeRequest(): NextRequest {
  return new NextRequest('http://localhost/api/inspect', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-forwarded-for': '203.0.113.7' },
    body: JSON.stringify({
      s3Keys: ['job-1/a.jpg'],
      answers: { location: 'Kitchen sink', duration: '2 days', recentChanges: 'none' },
    }),
  });
}

describe('POST /api/inspect rate limit', () => {
  const originalSecret = process.env.SESSION_SECRET;

  beforeEach(() => {
    process.env.SESSION_SECRET = 'test-secret-for-ratelimit';
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    invokeMock.mockReset();
    persistMock.mockReset();
    counterMock.mockReset();
    persistMock.mockResolvedValue(true);
  });

  afterEach(() => {
    if (originalSecret === undefined) delete process.env.SESSION_SECRET;
    else process.env.SESSION_SECRET = originalSecret;
    vi.restoreAllMocks();
  });

  it('returns 429 with friendly message when the visitor is over the limit', async () => {
    counterMock.mockResolvedValue({ allowed: false, count: 15, windowStart: Date.now() - 1000 });

    const response = await POST(makeRequest());
    const body = (await response.json()) as { error: string; message: string; resetAt: string };

    expect(response.status).toBe(429);
    expect(body.error).toBe('RATE_LIMIT_EXCEEDED');
    expect(body.message).toContain('15-inspection daily limit');
    expect(new Date(body.resetAt).toISOString()).toBe(body.resetAt);
    const retryAfter = response.headers.get('Retry-After');
    expect(retryAfter).toMatch(/^\d+$/);
    expect(Number(retryAfter)).toBeGreaterThan(0);
    expect(response.headers.get('set-cookie')).toBeNull();
    expect(invokeMock).not.toHaveBeenCalled();
    expect(persistMock).not.toHaveBeenCalled();
  });

  it('allows the 15th inspection (14 prior) and proceeds to Bedrock', async () => {
    counterMock.mockResolvedValue({ allowed: true, count: 15, windowStart: Date.now() - 1000 });
    invokeMock.mockResolvedValue(validBedrock);

    const response = await POST(makeRequest());

    expect(response.status).toBe(200);
    expect(invokeMock).toHaveBeenCalledTimes(1);
    expect(persistMock).toHaveBeenCalledTimes(1);
    expect(response.headers.get('set-cookie')).toContain('hhi_session');
  });
});
