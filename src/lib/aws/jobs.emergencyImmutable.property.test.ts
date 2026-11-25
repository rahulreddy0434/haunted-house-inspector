import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import fc from 'fast-check';
import { applySafetyOverride } from '@/lib/aws/jobs';
import { createFakeDynamoTable, type FakeDynamoTable } from '@/test/fakeDynamoTable';
import { FIXTURE_NOW_MS, makeJobItem } from '@/test/jobFixtures';
import type { EmergencyConditionCode } from '@/lib/safety/safetyLayer';
import type { EmergencySource } from '@/lib/emergency/source';

vi.mock('server-only', () => ({}));

const holder = vi.hoisted(() => ({ fake: null as unknown as FakeDynamoTable }));
vi.mock('@aws-sdk/lib-dynamodb', async (importOriginal) => {
  const { fakeDynamoMockFactory } = await import('@/test/fakeDynamoTable');
  return fakeDynamoMockFactory(() => holder.fake)(
    importOriginal as () => Promise<typeof import('@aws-sdk/lib-dynamodb')>,
  );
});

const JOB_ID = '66666666-6666-4666-8666-666666666666';
const RULES: EmergencyConditionCode[] = ['GAS_SMELL', 'ELECTRICAL_FIRE', 'WATER_ELECTRICAL', 'CO_ALARM'];
const SOURCES: EmergencySource[] = ['precheck', 'postcheck', 'override'];

beforeEach(() => {
  process.env.DYNAMODB_TABLE_NAME = 'test-table';
  holder.fake = createFakeDynamoTable();
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(FIXTURE_NOW_MS);
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

function stored(): Record<string, unknown> {
  const item = holder.fake.get(`JOB#${JOB_ID}`);
  if (!item) throw new Error('job missing');
  return item;
}

const attemptArb = fc.record({
  text: fc.oneof(fc.constant(''), fc.string({ maxLength: 600 }), fc.constantFrom('I smell gas', 'sparks at the outlet')),
  rule: fc.option(fc.constantFrom(...RULES), { nil: undefined }),
});

describe('saved emergency rule is immutable', () => {
  // Feature: screens-polish, Property 8: Once emergency, the saved rule and source never change
  // **Validates: Requirements 18.4**
  it('never changes emergencyRule, emergencySource or any other field after further override attempts', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.option(fc.constantFrom(...RULES), { nil: undefined }),
        fc.constantFrom(...SOURCES),
        fc.array(attemptArb, { minLength: 1, maxLength: 10 }),
        async (rule, source, attempts) => {
          holder.fake = createFakeDynamoTable();
          holder.fake.seed({
            ...makeJobItem('emergency', { id: JOB_ID }),
            ...(rule !== undefined ? { emergencyRule: rule } : {}),
            emergencySource: source,
          });
          const baseline = structuredClone(stored());

          for (const { text, rule: attemptRule } of attempts) {
            const outcome = await applySafetyOverride(JOB_ID, text, new Date(FIXTURE_NOW_MS).toISOString(), attemptRule);
            expect(outcome).toBe('skipped');
            const after = stored();
            expect(after.emergencyRule).toBe(baseline.emergencyRule);
            expect(after.emergencySource).toBe(baseline.emergencySource);
            expect(after).toEqual(baseline);
          }
        },
      ),
      { numRuns: 100 },
    );
  }, 30_000);
});
