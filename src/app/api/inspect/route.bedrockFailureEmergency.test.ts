// @vitest-environment node
/**
 * Integration test: Bedrock fails but a safety trigger is present in the
 * context answers (Requirements 6.8, 6.9).
 *
 * The safety check on context answers (step 2) runs before the rate limiter
 * and before Bedrock, and short-circuits with an emergency result. So the
 * Bedrock failure never matters for these requests: the model is never
 * invoked and a 502 can never be produced.
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
import type { BedrockInspectionResponse } from '@/types/bedrock';

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

describe('POST /api/inspect: Bedrock failure with emergency trigger in answers', () => {
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

  const failures: Array<[string, Error]> = [
    ['a service error', Object.assign(new Error('Service unavailable'), { name: 'ServiceUnavailableException' })],
    ['a timeout', new Error('Bedrock inspection timed out after 20 seconds')],
  ];

  describe.each(failures)('when Bedrock would reject with %s', (_label, failure) => {
    it.each(['carbon monoxide alarm', 'CO detector is beeping'])(
      'location %j still yields a 200 emergency',
      async (location) => {
        vi.mocked(invokeInspectionModel).mockRejectedValue(failure);
        const answers: Answers = { location, duration: '', recentChanges: '' };

        const response = await POST(makeRequest(answers));

        expect(response.status).toBe(200);
        expect(response.status).not.toBe(502);

        const body = await response.json();
        expect(body.error).not.toBe('ANALYSIS_FAILED');
        expect(body.urgency).toBe('emergency');
        expect(body.isEmergency).toBe(true);
        expect(body.costRangeLow).toBe(0);
        expect(body.costRangeHigh).toBe(0);
        expect(body.jobBrief).toBe('');
        expect(body.diySteps).toEqual([]);
        expect(body.id).toMatch(UUID_RE);
        expect(body.answers).toEqual(answers);
        expect(body.s3Keys).toEqual(S3_KEYS);

        // Step 2 short-circuits, so the failing model is never reached.
        expect(invokeInspectionModel).not.toHaveBeenCalled();
        expect(persistInspection).toHaveBeenCalledTimes(1);
        expect(vi.mocked(persistInspection).mock.calls[0][0]).toEqual(body);
      },
    );
  });

  it('also returns an emergency when Bedrock would return invalid output', async () => {
    vi.mocked(invokeInspectionModel).mockResolvedValue({ nonsense: true } as unknown as BedrockInspectionResponse);

    const response = await POST(
      makeRequest({ location: 'carbon monoxide alarm', duration: '', recentChanges: '' }),
    );

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.urgency).toBe('emergency');
    expect(body.isEmergency).toBe(true);
    expect(invokeInspectionModel).not.toHaveBeenCalled();
  });

  it('control: the same Bedrock failure without a trigger returns 502 ANALYSIS_FAILED', async () => {
    vi.mocked(invokeInspectionModel).mockRejectedValue(new Error('Service unavailable'));

    const response = await POST(
      makeRequest({ location: 'Kitchen ceiling', duration: '', recentChanges: '' }),
    );

    expect(response.status).toBe(502);
    const body = await response.json();
    expect(body.error).toBe('ANALYSIS_FAILED');
    expect(invokeInspectionModel).toHaveBeenCalledTimes(1);
    expect(persistInspection).not.toHaveBeenCalled();
  });
});
