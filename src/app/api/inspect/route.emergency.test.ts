/**
 * Integration test: emergency trigger in context answers (Requirements 6.1-6.7).
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

describe('POST /api/inspect: emergency trigger in context answers', () => {
  const originalSecret = process.env.SESSION_SECRET;

  beforeEach(() => {
    process.env.SESSION_SECRET = 'test-secret';
    vi.mocked(invokeInspectionModel).mockReset();
    vi.mocked(persistInspection).mockReset().mockResolvedValue(true);
    vi.mocked(incrementRateLimitCounter).mockReset();
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.spyOn(console, 'log').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
    if (originalSecret === undefined) delete process.env.SESSION_SECRET;
    else process.env.SESSION_SECRET = originalSecret;
  });

  async function expectEmergency(answers: Answers): Promise<void> {
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
    expect(new Date(body.createdAt).toISOString()).toBe(body.createdAt);
    expect(body.answers).toEqual(answers);
    expect(body.s3Keys).toEqual(S3_KEYS);

    expect(invokeInspectionModel).not.toHaveBeenCalled();
    expect(persistInspection).toHaveBeenCalledTimes(1);
    expect(vi.mocked(persistInspection).mock.calls[0][0]).toEqual(body);
  }

  it.each([
    'I can smell gas in the kitchen',
    'gas smell',
    'rotten egg smell',
  ])('location %j returns an emergency without calling Bedrock', async (location) => {
    await expectEmergency({ location, duration: '', recentChanges: '' });
  });

  it('detects a trigger in the duration field', async () => {
    await expectEmergency({
      location: 'Basement',
      duration: 'there is a strong gas smell since this morning',
      recentChanges: '',
    });
  });

  it('detects a trigger in the recentChanges field', async () => {
    await expectEmergency({
      location: 'Hallway',
      duration: 'two days',
      recentChanges: 'the CO alarm keeps going off',
    });
  });
});
