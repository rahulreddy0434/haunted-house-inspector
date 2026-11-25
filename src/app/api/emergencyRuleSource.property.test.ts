import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import fc from 'fast-check';
import { createFakeDynamoTable, type FakeDynamoTable } from '@/test/fakeDynamoTable';
import { FIXTURE_NOW_MS, makeJobItem } from '@/test/jobFixtures';
import {
  callWithId,
  consoleSpies,
  makeRequest,
  withEnv,
  TEST_SECRET,
  type ConsoleSpies,
} from '@/test/proRouteHarness';
import type { EmergencyConditionCode } from '@/lib/safety/safetyLayer';
import type { EmergencySource } from '@/lib/emergency/source';
import type { JobStatus } from '@/types/job';

vi.mock('server-only', () => ({}));

const bedrockSpy = vi.hoisted(() => ({ invoke: vi.fn() }));
vi.mock('@/lib/aws/bedrock', () => ({ invokeInspectionModel: bedrockSpy.invoke }));

// The rate limiter writes RATELIMIT# items, which the fake table refuses. Not under test here.
vi.mock('@/lib/rateLimiter', () => ({
  checkRateLimit: vi.fn(async () => ({ allowed: true, resetAt: Date.now() + 60_000 })),
}));

const s3Spies = vi.hoisted(() => ({
  send: vi.fn(),
  getUploadPresignedUrl: vi.fn(),
  getDownloadPresignedUrl: vi.fn(),
}));
vi.mock('@/lib/aws/s3', () => ({
  s3Client: { send: s3Spies.send },
  getUploadPresignedUrl: s3Spies.getUploadPresignedUrl,
  getDownloadPresignedUrl: s3Spies.getDownloadPresignedUrl,
}));

const holder = vi.hoisted(() => ({ fake: null as unknown as FakeDynamoTable }));
vi.mock('@aws-sdk/lib-dynamodb', async (importOriginal) => {
  const { fakeDynamoMockFactory } = await import('@/test/fakeDynamoTable');
  return fakeDynamoMockFactory(() => holder.fake)(
    importOriginal as () => Promise<typeof import('@aws-sdk/lib-dynamodb')>,
  );
});

import { POST as inspectPOST } from './inspect/route';
import { POST as replyPOST } from './inspections/[id]/reply/route';
import { POST as chatPOST } from './inspections/[id]/chat/route';
import { POST as bookPOST } from './inspections/[id]/book/route';

const JOB_ID = '77777777-7777-4777-8777-777777777777';

/** One trigger text per rule; the expected rule is fixed by the table, not recomputed. */
const TRIGGERS: ReadonlyArray<{ rule: EmergencyConditionCode; text: string }> = [
  { rule: 'GAS_SMELL', text: 'I can smell gas in the kitchen' },
  { rule: 'ELECTRICAL_FIRE', text: 'There are sparks at the outlet' },
  { rule: 'WATER_ELECTRICAL', text: 'Water is flooding near the electrical panel' },
  { rule: 'CO_ALARM', text: 'The carbon monoxide alarm is going off' },
];
const RULES: EmergencyConditionCode[] = TRIGGERS.map((t) => t.rule);
const SOURCES: EmergencySource[] = ['precheck', 'postcheck', 'override'];

/** Letters without vowels a, e, i, o, u plus digits and spaces: never forms a trigger phrase. */
const SAFE_CHARS = 'bcdfhjklmnpqrtvwxyz0123456789 '.split('');
const safeText = (max: number): fc.Arbitrary<string> =>
  fc.string({ unit: fc.constantFrom(...SAFE_CHARS), maxLength: max - 1 }).map((s) => `k${s}`);

/** A trigger text with safe padding on both sides, separated by spaces so the phrase stays intact. */
const triggerArb = fc
  .record({ trigger: fc.constantFrom(...TRIGGERS), before: safeText(40), after: safeText(40) })
  .map(({ trigger, before, after }) => ({
    rule: trigger.rule,
    text: `${before} ${trigger.text} ${after}`,
  }));

const cleanAnswersArb = fc.record({
  location: safeText(60),
  duration: safeText(60),
  recentChanges: safeText(60),
});

const BEDROCK_OK = {
  likelyIssue: 'Slow drip from a pipe joint',
  trade: 'Plumber',
  urgency: 'soon',
  confidence: 0.7,
  costRangeLow: 100,
  costRangeHigh: 300,
  jobBrief: 'Slow drip under the sink.',
  followUpQuestions: ['Is it constant?', 'Is the cupboard damp?'],
  diySteps: ['Place a bucket under the drip'],
};

let spies: ConsoleSpies;
let restoreEnv: () => void;

beforeEach(() => {
  restoreEnv = withEnv({
    DYNAMODB_TABLE_NAME: 'test-table',
    S3_BUCKET_NAME: 'test-bucket',
    SESSION_SECRET: TEST_SECRET,
  });
  holder.fake = createFakeDynamoTable();
  spies = consoleSpies();
  bedrockSpy.invoke.mockReset();
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(FIXTURE_NOW_MS);
});

afterEach(() => {
  vi.useRealTimers();
  restoreEnv();
  spies.restore();
  vi.restoreAllMocks();
});

function stored(id: string): Record<string, unknown> {
  const item = holder.fake.get(`JOB#${id}`);
  if (!item) throw new Error('job missing');
  return item;
}

async function postInspect(answers: { location: string; duration: string; recentChanges: string }): Promise<string> {
  const req = makeRequest('/api/inspect', {
    body: { s3Keys: ['job-1/a.jpg'], answers },
    headers: { 'x-forwarded-for': '203.0.113.7' },
  });
  const res = await inspectPOST(req);
  expect(res.status).toBe(200);
  return ((await res.json()) as { id: string }).id;
}

describe('Emergency_Rule and Emergency_Source are a total, consistent pair', () => {
  // Feature: screens-polish, Property 6: Emergency_Rule and Emergency_Source are a total, consistent pair
  // **Validates: Requirements 18.1, 18.2**
  it('precheck: a trigger in the answers saves its rule and source "precheck"', async () => {
    await fc.assert(
      fc.asyncProperty(
        triggerArb,
        cleanAnswersArb,
        fc.constantFrom<'location' | 'duration' | 'recentChanges'>('location', 'duration', 'recentChanges'),
        async ({ rule, text }, answers, field) => {
          holder.fake = createFakeDynamoTable();
          bedrockSpy.invoke.mockReset();
          const id = await postInspect({ ...answers, [field]: text });
          const job = stored(id);
          expect(job.status).toBe('emergency');
          expect(job.emergencyRule).toBe(rule);
          expect(job.emergencySource).toBe('precheck');
          expect(bedrockSpy.invoke).not.toHaveBeenCalled();
        },
      ),
      { numRuns: 100 },
    );
  }, 30_000);

  // Feature: screens-polish, Property 6: Emergency_Rule and Emergency_Source are a total, consistent pair
  // **Validates: Requirements 18.1, 18.2**
  it('postcheck: a trigger in the AI answer saves its rule and source "postcheck"', async () => {
    await fc.assert(
      fc.asyncProperty(
        triggerArb,
        cleanAnswersArb,
        fc.constantFrom<'likelyIssue' | 'jobBrief'>('likelyIssue', 'jobBrief'),
        async ({ rule, text }, answers, field) => {
          holder.fake = createFakeDynamoTable();
          bedrockSpy.invoke.mockReset();
          bedrockSpy.invoke.mockResolvedValue({ ...BEDROCK_OK, [field]: text.slice(0, 450) });
          const id = await postInspect(answers);
          const job = stored(id);
          expect(bedrockSpy.invoke).toHaveBeenCalledTimes(1);
          expect(job.status).toBe('emergency');
          expect(job.emergencyRule).toBe(rule);
          expect(job.emergencySource).toBe('postcheck');
        },
      ),
      { numRuns: 100 },
    );
  }, 30_000);

  // Feature: screens-polish, Property 6: Emergency_Rule and Emergency_Source are a total, consistent pair
  // **Validates: Requirements 18.1, 18.2**
  it('override: a trigger in a reply or chat message saves its rule and source "override"', async () => {
    await fc.assert(
      fc.asyncProperty(
        triggerArb,
        fc.constantFrom<'new' | JobStatus>('new', 'info_requested', 'accepted', 'declined', 'booked'),
        fc.constantFrom<'reply' | 'chat'>('reply', 'chat'),
        async ({ rule, text }, start, via) => {
          holder.fake = createFakeDynamoTable();
          holder.fake.seed({ ...makeJobItem(start, { id: JOB_ID }) });
          const path = `/api/inspections/${JOB_ID}/${via}`;
          const req = makeRequest(path, { body: { text } });
          const res = await callWithId(via === 'reply' ? replyPOST : chatPOST, req, JOB_ID);
          expect(res.status).toBe(200);
          const job = stored(JOB_ID);
          expect(job.status).toBe('emergency');
          expect(job.emergencyRule).toBe(rule);
          expect(job.emergencySource).toBe('override');
        },
      ),
      { numRuns: 100 },
    );
  }, 30_000);

  // Feature: screens-polish, Property 6: Emergency_Rule and Emergency_Source are a total, consistent pair
  // **Validates: Requirements 18.1, 18.2**
  it('non-emergency results write neither field', async () => {
    await fc.assert(
      fc.asyncProperty(
        cleanAnswersArb,
        safeText(100),
        fc.boolean(),
        async (answers, replyText, viaInspect) => {
          holder.fake = createFakeDynamoTable();
          bedrockSpy.invoke.mockReset();
          bedrockSpy.invoke.mockResolvedValue(BEDROCK_OK);
          if (viaInspect) {
            const id = await postInspect(answers);
            const job = stored(id);
            expect(job.status).toBe('new');
            expect(job).not.toHaveProperty('emergencyRule');
            expect(job).not.toHaveProperty('emergencySource');
          } else {
            holder.fake.seed({ ...makeJobItem('info_requested', { id: JOB_ID }) });
            const req = makeRequest(`/api/inspections/${JOB_ID}/reply`, { body: { text: replyText } });
            const res = await callWithId(replyPOST, req, JOB_ID);
            expect(res.status).toBe(200);
            const job = stored(JOB_ID);
            expect(job.status).toBe('new');
            expect(job).not.toHaveProperty('emergencyRule');
            expect(job).not.toHaveProperty('emergencySource');
          }
        },
      ),
      { numRuns: 100 },
    );
  }, 30_000);

  // Feature: screens-polish, Property 6: Emergency_Rule and Emergency_Source are a total, consistent pair
  // **Validates: Requirements 18.1, 18.2**
  it('a booking request on an emergency job writes nothing and sets no source', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.option(fc.record({ rule: fc.constantFrom(...RULES), source: fc.constantFrom(...SOURCES) }), {
          nil: undefined,
        }),
        fc.integer({ min: 1, max: 30 * 24 }),
        async (saved, hours) => {
          holder.fake = createFakeDynamoTable();
          holder.fake.seed({
            ...makeJobItem('emergency', { id: JOB_ID }),
            ...(saved ? { emergencyRule: saved.rule, emergencySource: saved.source } : {}),
          });
          const before = structuredClone(stored(JOB_ID));
          const slot = new Date(FIXTURE_NOW_MS + hours * 3_600_000).toISOString();
          const req = makeRequest(`/api/inspections/${JOB_ID}/book`, { body: { slot } });
          const res = await callWithId(bookPOST, req, JOB_ID);
          expect(res.status).toBe(409);
          const after = stored(JOB_ID);
          expect(after).toEqual(before);
          if (!saved) expect(after).not.toHaveProperty('emergencySource');
          expect(holder.fake.calls.every((c) => c.name !== 'UpdateCommand' && c.name !== 'PutCommand')).toBe(true);
        },
      ),
      { numRuns: 100 },
    );
  }, 30_000);
});
