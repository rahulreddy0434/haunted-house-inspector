// @vitest-environment node
/**
 * Integration test: POST /api/inspect when Bedrock fails and no safety trigger is present.
 * Requirement 6.8.
 *
 * MSW is not needed: no HTTP leaves the process. Bedrock and DynamoDB are mocked
 * at the module boundary; the rateLimiter, safety layer and Zod schemas are real.
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

const ANALYSIS_FAILED = {
  error: 'ANALYSIS_FAILED',
  message: "We couldn't analyse your photos. Please try again.",
};

const cleanAnswers = {
  location: 'Kitchen under the sink',
  duration: 'A few days',
  recentChanges: 'None',
};

function makeRequest(): NextRequest {
  return new NextRequest('http://localhost/api/inspect', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-forwarded-for': '203.0.113.7' },
    body: JSON.stringify({ s3Keys: ['job-1/a.jpg'], answers: cleanAnswers }),
  });
}

function namedError(name: string, message: string): Error {
  const error = new Error(message);
  error.name = name;
  return error;
}

const failures: Array<[string, Error, string]> = [
  ['generic service error', new Error('Service unavailable: internal-detail-xyz'), 'Error'],
  [
    'ThrottlingException',
    namedError('ThrottlingException', 'Too many requests, slow down throttle-detail'),
    'ThrottlingException',
  ],
  ['timeout', new Error('Bedrock inspection timed out after 20 seconds'), 'Error'],
  ['invalid JSON', new Error('Bedrock returned invalid JSON'), 'Error'],
];

describe('POST /api/inspect: Bedrock failure without safety trigger', () => {
  const originalSecret = process.env.SESSION_SECRET;
  let errorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    process.env.SESSION_SECRET = 'test-secret';
    vi.mocked(invokeInspectionModel).mockReset();
    vi.mocked(persistInspection).mockReset().mockResolvedValue(true);
    vi.mocked(incrementRateLimitCounter)
      .mockReset()
      .mockResolvedValue({ allowed: true, count: 1, windowStart: Date.now() });
    errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.spyOn(console, 'log').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
    if (originalSecret === undefined) delete process.env.SESSION_SECRET;
    else process.env.SESSION_SECRET = originalSecret;
  });

  it.each(failures)('returns 502 ANALYSIS_FAILED for %s', async (_label, error, expectedName) => {
    vi.mocked(invokeInspectionModel).mockRejectedValue(error);

    const response = await POST(makeRequest());

    expect(response.status).toBe(502);
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(await response.json()).toEqual(ANALYSIS_FAILED);

    // Rate limit passed, so the session cookie is still issued.
    expect(response.cookies.get('hhi_session')?.value).toBeTruthy();

    expect(invokeInspectionModel).toHaveBeenCalledTimes(1);
    expect(persistInspection).not.toHaveBeenCalled();

    // Only the error name is logged, never its message text.
    expect(errorSpy).toHaveBeenCalled();
    const logged = JSON.stringify(errorSpy.mock.calls);
    expect(logged).toContain(expectedName);
    expect(logged).not.toContain(error.message);
    for (const word of ['internal-detail-xyz', 'throttle-detail', 'timed out', 'invalid JSON']) {
      expect(logged).not.toContain(word);
    }
  });
});
