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

import { sendChatMessage } from './chat';
import { jobKey, persistInspection } from './dynamodb';
import { ttlForJob } from './ttl';

describe('chat storage property tests', () => {
  beforeEach(() => {
    holder.fake = createFakeDynamoTable();
    process.env.DYNAMODB_TABLE_NAME = 'test-table';
  });

  // Feature: chat-and-help, Property 9: Stored messages stay out of the Job_Index and expire with the Job
  // **Validates: Requirements 7.5, 7.11, 21.18**
  it(
    'keeps chat items out of GSI1 and gives them the same ttl as the Job',
    async () => {
      await fc.assert(
        fc.asyncProperty(
          arbitraryInspectionResult,
          fc.integer({ min: Date.UTC(2020, 0, 1), max: Date.UTC(2035, 0, 1) }),
          fc.array(fc.constantFrom('homeowner' as const, 'tradesperson' as const), { minLength: 1, maxLength: 8 }),
          fc.array(fc.string({ minLength: 1, maxLength: 40 }), { minLength: 8, maxLength: 8 }),
          async (base, createdMs, sides, texts) => {
            holder.fake = createFakeDynamoTable();
            const result = { ...base, createdAt: new Date(createdMs).toISOString() };
            await expect(persistInspection(result)).resolves.toBe(true);

            const status = holder.fake.get(jobKey(result.id))?.status as 'new' | 'emergency';
            let readSeq: number | undefined;
            for (let i = 0; i < sides.length; i++) {
              const sent = await sendChatMessage({
                jobId: result.id,
                side: sides[i],
                text: texts[i],
                expectedStatus: status,
                nextStatus: status,
                readSeq,
                nextSent: [createdMs + i],
                createdAt: result.createdAt,
                sentAt: new Date(createdMs + i).toISOString(),
                nowIso: new Date(createdMs + i).toISOString(),
              });
              expect(sent.ok).toBe(true);
              readSeq = i + 1;
            }

            const job = holder.fake.get(jobKey(result.id));
            expect(job).toBeDefined();
            const jobTtl = job?.ttl;
            expect(jobTtl).toBe(ttlForJob(result.createdAt));

            const chatItems = [...holder.fake.items.values()].filter(
              (it) => typeof it.SK === 'string' && it.SK.startsWith('CHAT#'),
            );
            expect(chatItems).toHaveLength(sides.length);
            for (const item of chatItems) {
              expect(item.PK).toBe(jobKey(result.id));
              expect(item.SK).toMatch(/^CHAT#\d{6}$/);
              expect(item).not.toHaveProperty('GSI1PK');
              expect(item).not.toHaveProperty('GSI1SK');
              expect(item.ttl).toBe(ttlForJob(result.createdAt));
              expect(item.ttl).toBe(jobTtl);
            }

            const { QueryCommand } = await import('@aws-sdk/lib-dynamodb');
            const response = await holder.fake.send(
              new QueryCommand({
                TableName: 'test-table',
                IndexName: 'GSI1',
                KeyConditionExpression: 'GSI1PK = :pk AND GSI1SK > :since',
                ExpressionAttributeValues: { ':pk': 'JOBS', ':since': '0' },
              }),
            );
            const items = (response.Items ?? []) as Record<string, unknown>[];
            expect(items).toHaveLength(1);
            for (const item of items) {
              expect(item.PK).toBe(jobKey(result.id));
              expect(item.SK).toBe(item.PK);
              expect(String(item.SK)).not.toMatch(/CHAT#/);
            }
          },
        ),
        { numRuns: 100 },
      );
    },
    30_000,
  );
});
