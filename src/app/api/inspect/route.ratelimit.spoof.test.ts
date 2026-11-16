// @vitest-environment node
/**
 * Integration test: the daily rate limit keys on the trusted x-forwarded-for entry,
 * so rotating spoofed leading entries cannot dodge it. Route, rate limiter and
 * ipVisitorId are real; Bedrock is mocked and DynamoDB is the in-memory fake.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createFakeDynamoTable, type FakeDynamoTable } from '@/test/fakeDynamoTable';
import { forwardedFor, makeRequest, withEnv } from '@/test/proRouteHarness';
import type { BedrockInspectionResponse } from '@/types/bedrock';

vi.mock('server-only', () => ({}));
vi.mock('@/lib/aws/bedrock', () => ({ invokeInspectionModel: vi.fn() }));

const holder = vi.hoisted(() => ({ fake: null as unknown as FakeDynamoTable }));
vi.mock('@aws-sdk/lib-dynamodb', async (importOriginal) => {
  const { fakeDynamoMockFactory } = await import('@/test/fakeDynamoTable');
  return fakeDynamoMockFactory(() => holder.fake)(
    importOriginal as () => Promise<typeof import('@aws-sdk/lib-dynamodb')>,
  );
});

import { POST } from '@/app/api/inspect/route';
import { invokeInspectionModel } from '@/lib/aws/bedrock';

const invokeMock = vi.mocked(invokeInspectionModel);

const BEDROCK_OK: BedrockInspectionResponse = {
  likelyIssue: 'Slow drip from a worn seal',
  trade: 'Plumber',
  urgency: 'soon',
  confidence: 0.7,
  costRangeLow: 100,
  costRangeHigh: 300,
  jobBrief: 'Slow drip observed and a worn seal is suspected.',
  followUpQuestions: ['Is the area damp?', 'Has it got worse?'],
  diySteps: ['Place a bucket underneath'],
};

/** Cookie-less request with the given x-forwarded-for value. */
function inspectRequest(xForwardedFor: string) {
  return makeRequest('/api/inspect', {
    method: 'POST',
    body: {
      s3Keys: ['job-1/a.jpg'],
      answers: { location: 'Bathroom ceiling', duration: 'two days', recentChanges: 'none' },
    },
    headers: { 'x-forwarded-for': xForwardedFor },
  });
}

describe('POST /api/inspect: rate limit ignores spoofed x-forwarded-for entries', () => {
  let restoreEnv: () => void;

  beforeEach(() => {
    restoreEnv = withEnv({ DYNAMODB_TABLE_NAME: 'test-table', SESSION_SECRET: 'test-secret' });
    holder.fake = createFakeDynamoTable({ allowRateLimitWrites: true });
    invokeMock.mockReset();
    invokeMock.mockResolvedValue(BEDROCK_OK);
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.spyOn(console, 'log').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
    restoreEnv();
  });

  it('limits the 16th cookie-less request despite a new spoofed entry each time', async () => {
    for (let i = 1; i <= 15; i++) {
      const response = await POST(
        inspectRequest(forwardedFor('203.0.113.7', { spoofed: [`198.51.100.${i}`] })),
      );
      expect(response.status).toBe(200);
    }
    expect(invokeMock).toHaveBeenCalledTimes(15);

    const limited = await POST(
      inspectRequest(forwardedFor('203.0.113.7', { spoofed: ['198.51.100.200'] })),
    );
    const body = (await limited.json()) as { error: string; message: string };
    expect(limited.status).toBe(429);
    expect(body.error).toBe('RATE_LIMIT_EXCEEDED');
    expect(body.message).toContain('15-inspection daily limit');
    expect(invokeMock).toHaveBeenCalledTimes(15);

    // A different trusted client is unaffected.
    const other = await POST(inspectRequest(forwardedFor('203.0.113.99')));
    expect(other.status).toBe(200);
    expect(invokeMock).toHaveBeenCalledTimes(16);
  });
});
