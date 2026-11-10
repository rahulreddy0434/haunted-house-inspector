// @vitest-environment node
/**
 * Integration test: emergency in context answers while the visitor is over the
 * daily limit (Requirements 6.1-6.7, 6.10, 11.8).
 *
 * MSW is not needed: no HTTP leaves the process because the AWS boundary
 * modules (bedrock, dynamodb) are mocked at module level. The real route,
 * rate limiter, safety layer and Zod schemas run unmodified.
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

const invokeMock = vi.mocked(invokeInspectionModel);
const persistMock = vi.mocked(persistInspection);
const counterMock = vi.mocked(incrementRateLimitCounter);

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const S3_KEYS = ['job-1/a.jpg'];

interface Answers {
  location: string;
  duration: string;
  recentChanges: string;
}

function makeRequest(answers: Answers): NextRequest {
  return new NextRequest('http://localhost/api/inspect', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-forwarded-for': '203.0.113.7' },
    body: JSON.stringify({ s3Keys: S3_KEYS, answers }),
  });
}

describe('POST /api/inspect: emergency while over the daily limit', () => {
  const originalSecret = process.env.SESSION_SECRET;

  beforeEach(() => {
    process.env.SESSION_SECRET = 'test-secret-for-over-limit';
    invokeMock.mockReset();
    persistMock.mockReset().mockResolvedValue(true);
    counterMock.mockReset().mockResolvedValue({
      allowed: false,
      count: 15,
      windowStart: Date.now() - 1000,
    });
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.spyOn(console, 'log').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
    if (originalSecret === undefined) delete process.env.SESSION_SECRET;
    else process.env.SESSION_SECRET = originalSecret;
  });

  async function expectEmergencyBypass(answers: Answers): Promise<void> {
    const response = await POST(makeRequest(answers));
    expect(response.status).toBe(200);

    const body = await response.json();
    expect(body.urgency).toBe('emergency');
    expect(body.isEmergency).toBe(true);
    expect(body.costRangeLow).toBe(0);
    expect(body.costRangeHigh).toBe(0);
    expect(body.jobBrief).toBe('');
    expect(body.diySteps).toEqual([]);
    expect(body.id).toMatch(UUID_RE);
    expect(body.answers).toEqual(answers);
    expect(body.s3Keys).toEqual(S3_KEYS);

    expect(response.headers.get('Retry-After')).toBeNull();
    expect(response.headers.get('set-cookie')).toBeNull();
    expect(counterMock).not.toHaveBeenCalled();
    expect(invokeMock).not.toHaveBeenCalled();
    expect(persistMock).toHaveBeenCalledTimes(1);
    expect(persistMock.mock.calls[0][0]).toEqual(body);
  }

  it('returns an emergency (not 429) for a gas smell in location', async () => {
    await expectEmergencyBypass({
      location: 'I can smell gas',
      duration: '',
      recentChanges: '',
    });
  });

  it('returns an emergency (not 429) for a trigger in recentChanges', async () => {
    await expectEmergencyBypass({
      location: 'Hallway',
      duration: 'two days',
      recentChanges: 'the CO alarm keeps going off',
    });
  });

  it('does not depend on the counter: still an emergency when the counter rejects', async () => {
    counterMock.mockReset().mockRejectedValue(new Error('DynamoDB down'));
    await expectEmergencyBypass({
      location: 'I can smell gas',
      duration: '',
      recentChanges: '',
    });
  });

  it('control: clean answers over the limit return 429 and skip persist and Bedrock', async () => {
    const response = await POST(
      makeRequest({ location: 'Kitchen sink', duration: '2 days', recentChanges: 'none' }),
    );
    const body = await response.json();

    expect(response.status).toBe(429);
    expect(body.error).toBe('RATE_LIMIT_EXCEEDED');
    expect(response.headers.get('Retry-After')).toMatch(/^\d+$/);
    expect(counterMock).toHaveBeenCalledTimes(1);
    expect(invokeMock).not.toHaveBeenCalled();
    expect(persistMock).not.toHaveBeenCalled();
  });
});
