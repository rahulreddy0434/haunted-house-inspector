// @vitest-environment node
/**
 * Integration test: POST /api/inspect stores the new job attributes
 * (Pro dashboard and booking). The route, rate limiter, safety layer and
 * persistInspection are real; Bedrock is mocked and DynamoDB is the in-memory fake.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createFakeDynamoTable, type FakeDynamoTable } from '@/test/fakeDynamoTable';
import { forwardedFor, makeRequest, useEnv } from '@/test/proRouteHarness';
import type { BedrockInspectionResponse } from '@/types/bedrock';
import type { InspectionResult } from '@/types/inspection';

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
import { jobKey } from '@/lib/aws/dynamodb';

const invokeMock = vi.mocked(invokeInspectionModel);

const S3_KEYS = ['job-1/a.jpg'];

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

function inspectRequest(location: string) {
  return makeRequest('/api/inspect', {
    method: 'POST',
    body: {
      s3Keys: S3_KEYS,
      answers: { location, duration: 'two days', recentChanges: 'none' },
    },
    headers: { 'x-forwarded-for': forwardedFor('203.0.113.7') },
  });
}

describe('POST /api/inspect: stored job status attributes', () => {
  useEnv({ DYNAMODB_TABLE_NAME: 'test-table', SESSION_SECRET: 'test-secret' });

  beforeEach(() => {
    holder.fake = createFakeDynamoTable({ allowRateLimitWrites: true });
    invokeMock.mockReset();
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.spyOn(console, 'log').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('stores a non-emergency inspection as status "new" with index keys and empty lists', async () => {
    invokeMock.mockResolvedValue(BEDROCK_OK);

    const response = await POST(inspectRequest('Bathroom ceiling'));
    expect(response.status).toBe(200);
    const body = (await response.json()) as InspectionResult;
    expect(invokeMock).toHaveBeenCalledTimes(1);

    const item = holder.fake.get(jobKey(body.id));
    expect(item).toMatchObject({
      status: 'new',
      statusUpdatedAt: body.createdAt,
      GSI1PK: 'JOBS',
      GSI1SK: body.createdAt,
      replyCount: 0,
      infoRequests: [],
      replies: [],
    });
    expect(item).not.toHaveProperty('offeredSlots');
    expect(item).not.toHaveProperty('bookedSlot');
    expect(item).not.toHaveProperty('bookedAt');
    expect(item).not.toHaveProperty('declineReason');
  });

  it('stores a context-answer emergency as status "emergency" without calling Bedrock', async () => {
    const response = await POST(inspectRequest('I can smell gas in the kitchen'));
    expect(response.status).toBe(200);
    const body = (await response.json()) as InspectionResult;
    expect(invokeMock).not.toHaveBeenCalled();

    const item = holder.fake.get(jobKey(body.id));
    expect(item).toMatchObject({
      status: 'emergency',
      statusUpdatedAt: body.createdAt,
      GSI1PK: 'JOBS',
      GSI1SK: body.createdAt,
      replyCount: 0,
      urgency: 'emergency',
      isEmergency: true,
      costRangeLow: 0,
      costRangeHigh: 0,
      jobBrief: '',
      diySteps: [],
      infoRequests: [],
      replies: [],
    });
    expect(item).not.toHaveProperty('offeredSlots');
  });

  it('keeps the HTTP response a plain InspectionResult with no status field', async () => {
    invokeMock.mockResolvedValue(BEDROCK_OK);
    const normal = (await (await POST(inspectRequest('Bathroom ceiling'))).json()) as Record<
      string,
      unknown
    >;
    const emergency = (await (await POST(inspectRequest('gas smell'))).json()) as Record<
      string,
      unknown
    >;

    for (const body of [normal, emergency]) {
      for (const attr of [
        'status',
        'statusUpdatedAt',
        'GSI1PK',
        'GSI1SK',
        'replyCount',
        'infoRequests',
        'replies',
        'offeredSlots',
      ]) {
        expect(body).not.toHaveProperty(attr);
      }
    }
    expect(normal.urgency).toBe('soon');
    expect(emergency.urgency).toBe('emergency');
  });
});
