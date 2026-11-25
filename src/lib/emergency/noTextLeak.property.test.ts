// @vitest-environment node
import { NextRequest } from 'next/server';
import fc from 'fast-check';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createFakeDynamoTable, type FakeDynamoTable } from '@/test/fakeDynamoTable';
import { makeJobItem } from '@/test/jobFixtures';
import { withEnv } from '@/test/proRouteHarness';

vi.mock('server-only', () => ({}));
vi.mock('@/lib/aws/bedrock', () => ({ invokeInspectionModel: vi.fn() }));
vi.mock('@/lib/aws/dynamodb', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/aws/dynamodb')>();
  return { ...actual, persistInspection: vi.fn(), incrementRateLimitCounter: vi.fn() };
});

const holder = vi.hoisted(() => ({ fake: null as unknown as FakeDynamoTable }));

vi.mock('@aws-sdk/lib-dynamodb', async (importOriginal) => {
  const { fakeDynamoMockFactory } = await import('@/test/fakeDynamoTable');
  return fakeDynamoMockFactory(() => holder.fake)(
    importOriginal as () => Promise<typeof import('@aws-sdk/lib-dynamodb')>,
  );
});

import { POST } from '@/app/api/inspect/route';
import { persistInspection } from '@/lib/aws/dynamodb';
import { applySafetyOverride } from '@/lib/aws/jobs';
import { emergencyRuleFor } from '@/lib/emergency/ruleWrapper';
import { replyTriggersEmergency } from '@/lib/safety/replyCheck';
import type { InspectionResult } from '@/types/inspection';

const persistMock = vi.mocked(persistInspection);

const JOB_ID = '11111111-2222-4333-8444-555555555555';
const RULES = ['GAS_SMELL', 'ELECTRICAL_FIRE', 'WATER_ELECTRICAL', 'CO_ALARM'];
const SOURCES = ['precheck', 'postcheck', 'override'];

// Trigger-phrase corpus (as in replyCheck.test.ts and route.persist.property.test.ts).
const TRIGGERS = [
  'I can smell gas in the kitchen',
  'There were sparks coming from the outlet',
  'Water is flooding near the electrical panel',
  'The carbon monoxide alarm is going off',
  'smell of rotten egg',
  'CO alarm beeping',
] as const;

// Padding without letters, so it can never spell an enum value.
const paddingArb = fc.stringMatching(/^[0-9 .,!?]{0,40}$/);

const emergencyTextArb = fc
  .tuple(paddingArb, fc.constantFrom(...TRIGGERS), paddingArb)
  .map(([before, trigger, after]) => `${before}${trigger}${after}`)
  .filter((t) => t.trim().length > 0 && replyTriggersEmergency(t));

/** Every non-empty substring of length >= 6 (sampled by the caller) must be absent from the values. */
function expectNoTextIn(values: unknown[], text: string, start: number, len: number): void {
  const trimmed = text.trim();
  const json = JSON.stringify(values);
  expect(json).not.toContain(trimmed);
  const piece = text.slice(start % text.length).slice(0, Math.max(6, len)).trim();
  if (piece.length >= 6) expect(json).not.toContain(piece);
}

describe('Emergency attributes hold no homeowner text', () => {
  let restoreEnv: () => void;

  beforeEach(() => {
    restoreEnv = withEnv({ DYNAMODB_TABLE_NAME: 'test-table' });
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    persistMock.mockReset();
    persistMock.mockResolvedValue(true);
  });

  afterEach(() => {
    restoreEnv();
    vi.restoreAllMocks();
  });

  // Feature: screens-polish, Property 7: No homeowner text reaches the stored emergency attributes
  // **Validates: Requirements 18.3, 18.13**
  it('applySafetyOverride writes only enum values to the new attributes', async () => {
    await fc.assert(
      fc.asyncProperty(
        emergencyTextArb,
        fc.nat(200),
        fc.nat(40),
        fc.constantFrom('new', 'accepted', 'declined', 'info_requested' as const),
        async (text, start, len, status) => {
          holder.fake = createFakeDynamoTable();
          const seeded = makeJobItem(status as Parameters<typeof makeJobItem>[0], { id: JOB_ID });
          holder.fake.seed({ ...seeded });
          const before = holder.fake.get(seeded.PK as string, seeded.SK as string) ?? {};

          const rule = emergencyRuleFor(text).rule;
          expect(rule).toBeDefined();
          const result = await applySafetyOverride(JOB_ID, text, '2026-01-01T00:00:00.000Z', rule);
          expect(result).toBe('applied');

          const after = holder.fake.get(seeded.PK as string, seeded.SK as string) ?? {};
          expect(RULES).toContain(after.emergencyRule);
          expect(SOURCES).toContain(after.emergencySource);
          expect(after.emergencySource).toBe('override');
          expect(before.emergencyRule).toBeUndefined();
          expectNoTextIn([after.emergencyRule, after.emergencySource], text, start, len);

          // Attributes that did not exist before the feature and were written now: only the two new ones
          // may be new keys; the existing reply text field is exempt.
          const newKeys = Object.keys(after).filter((k) => !(k in before));
          for (const key of newKeys) {
            if (key === 'replies' || key === 'replyCount') continue;
            expect(['emergencyRule', 'emergencySource']).toContain(key);
          }
        },
      ),
      { numRuns: 60 },
    );
  });

  // Feature: screens-polish, Property 7: No homeowner text reaches the stored emergency attributes
  // **Validates: Requirements 18.3, 18.13**
  it('the inspect route tags emergencies with enum values only (pre-check path)', async () => {
    await fc.assert(
      fc.asyncProperty(
        emergencyTextArb,
        fc.constantFrom('location', 'duration', 'recentChanges'),
        fc.nat(200),
        fc.nat(40),
        async (text, field, start, len) => {
          persistMock.mockClear();
          const answers = { location: 'Kitchen', duration: '', recentChanges: '', [field]: text.slice(0, 500) };
          const request = new NextRequest('http://localhost/api/inspect', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ s3Keys: ['abcd/photo.jpg'], answers }),
          });
          const res = await POST(request);
          const body = (await res.json()) as InspectionResult;

          expect(res.status).toBe(200);
          expect(body.isEmergency).toBe(true);
          expect(persistMock).toHaveBeenCalledTimes(1);
          const stored = persistMock.mock.calls[0][0];
          expect(stored).toEqual(body);

          expect(RULES).toContain(stored.emergencyRule);
          expect(stored.emergencySource).toBe('precheck');
          const submitted = answers[field as keyof typeof answers];
          expectNoTextIn([stored.emergencyRule, stored.emergencySource], submitted, start, len);
        },
      ),
      { numRuns: 60 },
    );
  });

  it('example: a gas-smell reply stores GAS_SMELL and override, nothing else new', async () => {
    holder.fake = createFakeDynamoTable();
    const seeded = makeJobItem('new', { id: JOB_ID });
    holder.fake.seed({ ...seeded });
    const text = 'I can smell gas in the kitchen';
    await applySafetyOverride(JOB_ID, text, '2026-01-01T00:00:00.000Z', emergencyRuleFor(text).rule);
    const after = holder.fake.get(seeded.PK as string, seeded.SK as string);
    expect(after?.emergencyRule).toBe('GAS_SMELL');
    expect(after?.emergencySource).toBe('override');
  });
});
