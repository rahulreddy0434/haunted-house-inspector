import fc from 'fast-check';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createFakeDynamoTable, type FakeDynamoTable } from '@/test/fakeDynamoTable';
import { arbitraryInspectionResult, FIXTURE_NOW_MS } from '@/test/jobFixtures';
import { emergencyResult, normalResult } from '@/test/inspectionFixtures';

vi.mock('server-only', () => ({}));

const holder = vi.hoisted(() => ({ fake: null as unknown as FakeDynamoTable }));
vi.mock('@aws-sdk/lib-dynamodb', async (importOriginal) => {
  const { fakeDynamoMockFactory } = await import('@/test/fakeDynamoTable');
  return fakeDynamoMockFactory(() => holder.fake)(
    importOriginal as () => Promise<typeof import('@aws-sdk/lib-dynamodb')>,
  );
});

import { getInspection, incrementRateLimitCounter, jobKey, persistInspection } from './dynamodb';

const THIRTY_DAYS_SECONDS = 30 * 24 * 60 * 60;

const NEW_ATTRIBUTES = [
  'status',
  'statusUpdatedAt',
  'GSI1PK',
  'GSI1SK',
  'offeredSlots',
  'bookedSlot',
  'bookedAt',
  'declineReason',
  'infoRequests',
  'replies',
  'replyCount',
] as const;

describe('persistInspection (job attributes)', () => {
  beforeEach(() => {
    holder.fake = createFakeDynamoTable();
    process.env.DYNAMODB_TABLE_NAME = 'test-table';
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('writes a non-emergency job as status "new" with index keys and empty lists', async () => {
    const result = { ...normalResult, createdAt: new Date(FIXTURE_NOW_MS).toISOString() };
    await expect(persistInspection(result)).resolves.toBe(true);

    const item = holder.fake.get(jobKey(result.id));
    expect(item).toMatchObject({
      status: 'new',
      statusUpdatedAt: result.createdAt,
      GSI1PK: 'JOBS',
      GSI1SK: result.createdAt,
      replyCount: 0,
      infoRequests: [],
      replies: [],
    });
    expect(item).not.toHaveProperty('offeredSlots');
    expect(item).not.toHaveProperty('bookedSlot');
    expect(item).not.toHaveProperty('bookedAt');
    expect(item).not.toHaveProperty('declineReason');
  });

  it('writes an emergency job as status "emergency"', async () => {
    const result = { ...emergencyResult, createdAt: new Date(FIXTURE_NOW_MS).toISOString() };
    await expect(persistInspection(result)).resolves.toBe(true);
    expect(holder.fake.get(jobKey(result.id))).toMatchObject({
      status: 'emergency',
      GSI1PK: 'JOBS',
      GSI1SK: result.createdAt,
      replyCount: 0,
    });
  });

  it('keeps ttl = createdAt (seconds) + 30 days', async () => {
    const result = { ...normalResult, createdAt: new Date(FIXTURE_NOW_MS).toISOString() };
    await persistInspection(result);
    expect(holder.fake.get(jobKey(result.id))?.ttl).toBe(
      Math.floor(FIXTURE_NOW_MS / 1000) + THIRTY_DAYS_SECONDS,
    );
  });

  it('holds for any inspection result: status, index keys, ttl and key attributes', async () => {
    await fc.assert(
      fc.asyncProperty(arbitraryInspectionResult, async (result) => {
        holder.fake = createFakeDynamoTable();
        await expect(persistInspection(result)).resolves.toBe(true);
        const item = holder.fake.get(jobKey(result.id));
        expect(item).toMatchObject({
          PK: jobKey(result.id),
          SK: jobKey(result.id),
          status: result.isEmergency || result.urgency === 'emergency' ? 'emergency' : 'new',
          statusUpdatedAt: result.createdAt,
          GSI1PK: 'JOBS',
          GSI1SK: result.createdAt,
          replyCount: 0,
          infoRequests: [],
          replies: [],
          ttl: Math.floor(Date.parse(result.createdAt) / 1000) + THIRTY_DAYS_SECONDS,
        });
      }),
      { numRuns: 50 },
    );
  });

  it('returns false without throwing and logs only the error name when the write fails', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const failure = new Error('secret table details');
    failure.name = 'ProvisionedThroughputExceededException';
    vi.spyOn(holder.fake, 'send').mockRejectedValue(failure);

    await expect(persistInspection(normalResult)).resolves.toBe(false);

    expect(errorSpy).toHaveBeenCalledTimes(1);
    expect(errorSpy).toHaveBeenCalledWith(
      'Failed to persist inspection',
      'ProvisionedThroughputExceededException',
    );
    expect(JSON.stringify(errorSpy.mock.calls)).not.toContain('secret table details');
  });

  it('returns false when the table name is not configured', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    delete process.env.DYNAMODB_TABLE_NAME;
    await expect(persistInspection(normalResult)).resolves.toBe(false);
    expect(holder.fake.calls).toHaveLength(0);
  });
});

describe('getInspection (stored-only attributes)', () => {
  beforeEach(() => {
    holder.fake = createFakeDynamoTable();
    process.env.DYNAMODB_TABLE_NAME = 'test-table';
  });

  it('strips PK, SK, ttl and all 11 new attributes', async () => {
    const result = { ...normalResult, createdAt: new Date(FIXTURE_NOW_MS).toISOString() };
    holder.fake.seed({
      PK: jobKey(result.id),
      SK: jobKey(result.id),
      ttl: 123,
      ...result,
      status: 'booked',
      statusUpdatedAt: result.createdAt,
      GSI1PK: 'JOBS',
      GSI1SK: result.createdAt,
      offeredSlots: ['2026-03-06T12:00:00.000Z'],
      bookedSlot: '2026-03-06T12:00:00.000Z',
      bookedAt: result.createdAt,
      declineReason: 'reason',
      infoRequests: [{ question: 'q', askedAt: result.createdAt }],
      replies: [{ text: 't', at: result.createdAt }],
      replyCount: 1,
    });

    const loaded = await getInspection(result.id);
    expect(loaded).toEqual(result);
    for (const attr of ['PK', 'SK', 'ttl', ...NEW_ATTRIBUTES]) {
      expect(loaded).not.toHaveProperty(attr);
    }
  });

  it('round-trips a persisted inspection back to the original result', async () => {
    await fc.assert(
      fc.asyncProperty(arbitraryInspectionResult, async (result) => {
        holder.fake = createFakeDynamoTable();
        await persistInspection(result);
        await expect(getInspection(result.id)).resolves.toEqual(result);
      }),
      { numRuns: 30 },
    );
  });
});

describe('RATELIMIT# items', () => {
  beforeEach(() => {
    holder.fake = createFakeDynamoTable({ allowRateLimitWrites: true });
    process.env.DYNAMODB_TABLE_NAME = 'test-table';
  });

  it('carry none of the new attributes', async () => {
    await incrementRateLimitCounter('visitor-1', FIXTURE_NOW_MS, 15, 24 * 60 * 60 * 1000);

    // Expired window path writes via PutCommand.
    const later = FIXTURE_NOW_MS + 2 * 24 * 60 * 60 * 1000;
    await incrementRateLimitCounter('visitor-1', later, 15, 24 * 60 * 60 * 1000);

    const item = holder.fake.get('RATELIMIT#visitor-1');
    expect(item).toBeDefined();
    for (const attr of NEW_ATTRIBUTES) {
      expect(item).not.toHaveProperty(attr);
    }
    expect(item).toHaveProperty('count');
    expect(item).toHaveProperty('windowStart');
    expect(item).toHaveProperty('ttl');
  });
});
