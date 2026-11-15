import fc from 'fast-check';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createFakeDynamoTable, type FakeDynamoTable } from '@/test/fakeDynamoTable';
import { arbitraryInspectionResult } from '@/test/jobFixtures';

vi.mock('server-only', () => ({}));

const holder = vi.hoisted(() => ({ fake: null as unknown as FakeDynamoTable }));
vi.mock('@aws-sdk/lib-dynamodb', async (importOriginal) => {
  const { fakeDynamoMockFactory } = await import('@/test/fakeDynamoTable');
  return fakeDynamoMockFactory(() => holder.fake)(
    importOriginal as () => Promise<typeof import('@aws-sdk/lib-dynamodb')>,
  );
});

import { jobKey, persistInspection } from './dynamodb';

const THIRTY_DAYS_SECONDS = 30 * 24 * 60 * 60;

describe('persistInspection property tests', () => {
  beforeEach(() => {
    holder.fake = createFakeDynamoTable();
    process.env.DYNAMODB_TABLE_NAME = 'test-table';
  });

  // Feature: pro-dashboard-and-booking, Property 13: A created Job carries the right status and index attributes
  /** **Validates: Requirements 6.7, 6.8, 11.16, 12.4, 12.11** */
  it('Property 13: a created Job carries the right status and index attributes', async () => {
    await fc.assert(
      fc.asyncProperty(arbitraryInspectionResult, async (result) => {
        holder.fake = createFakeDynamoTable();
        await expect(persistInspection(result)).resolves.toBe(true);

        const puts = holder.fake.calls.filter((c) => c.name === 'PutCommand');
        expect(puts).toHaveLength(1);
        const item = puts[0].input.Item as Record<string, unknown>;

        expect(item).toMatchObject({
          ...result,
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
        for (const absent of ['offeredSlots', 'bookedSlot', 'bookedAt', 'declineReason']) {
          expect(item).not.toHaveProperty(absent);
        }
      }),
      { numRuns: 100 },
    );
  });
});
