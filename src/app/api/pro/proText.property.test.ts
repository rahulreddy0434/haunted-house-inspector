import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import fc from 'fast-check';
import { createFakeDynamoTable, type FakeDynamoTable } from '@/test/fakeDynamoTable';
import { FIXTURE_NOW_MS, makeJobItem } from '@/test/jobFixtures';
import {
  TEST_ACCESS_CODE,
  TEST_SECRET,
  callWithId,
  consoleSpies,
  makeRequest,
  validProCookie,
  withEnv,
  type ConsoleSpies,
} from '@/test/proRouteHarness';
import { EMERGENCY_MESSAGE } from '@/lib/emergency/messages';

vi.mock('server-only', () => ({}));

vi.mock('@/lib/rateLimiter', () => {
  throw new Error('rateLimiter must not be imported by the Pro routes');
});

const safetySpies = vi.hoisted(() => ({
  checkEmergency: vi.fn(),
  replyTriggersEmergency: vi.fn(),
}));
vi.mock('@/lib/safety/safetyLayer', () => ({ checkEmergency: safetySpies.checkEmergency }));
vi.mock('@/lib/safety/replyCheck', () => ({ replyTriggersEmergency: safetySpies.replyTriggersEmergency }));

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

import { POST as accept } from './jobs/[id]/accept/route';
import { POST as decline } from './jobs/[id]/decline/route';
import { POST as askInfo } from './jobs/[id]/ask-info/route';
import { GET as getStatus } from '../inspections/[id]/status/route';

const JOB_ID = '22222222-2222-4222-8222-222222222222';
const HOUR_MS = 3600_000;

// The four trigger groups, phrased as in src/lib/safety/replyCheck.test.ts.
const TRIGGER_PHRASES = [
  'I can smell gas in the kitchen',
  'It smells like rotten eggs',
  'There were sparks coming from the outlet',
  'a burning smell near the panel and scorch marks',
  'Water is flooding near the electrical panel',
  'The carbon monoxide alarm is going off',
  'our CO alarm beeped',
] as const;

let spies: ConsoleSpies;
let restoreEnv: () => void;

beforeEach(() => {
  restoreEnv = withEnv({
    DYNAMODB_TABLE_NAME: 'test-table',
    S3_BUCKET_NAME: 'test-bucket',
    SESSION_SECRET: TEST_SECRET,
    PRO_ACCESS_CODE: TEST_ACCESS_CODE,
  });
  holder.fake = createFakeDynamoTable();
  spies = consoleSpies();
  safetySpies.checkEmergency.mockReset();
  safetySpies.replyTriggersEmergency.mockReset();
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(FIXTURE_NOW_MS);
});

afterEach(() => {
  vi.useRealTimers();
  restoreEnv();
  spies.restore();
  vi.restoreAllMocks();
});

type Handler = typeof accept;

function postTo(handler: Handler, action: string, body: unknown): Promise<Response> {
  const request = makeRequest(`/api/pro/jobs/${JOB_ID}/${action}`, {
    method: 'POST',
    body,
    cookie: validProCookie(FIXTURE_NOW_MS),
  });
  return callWithId(handler, request, JOB_ID);
}

function freshJob(): void {
  holder.fake = createFakeDynamoTable();
  holder.fake.seed({ ...makeJobItem('new', { id: JOB_ID }) });
}

function storedStatus(): unknown {
  return holder.fake.get(`JOB#${JOB_ID}`)?.status;
}

async function homeownerView(): Promise<Record<string, unknown>> {
  const res = await getStatus(new Request(`http://localhost/api/inspections/${JOB_ID}/status`), {
    params: Promise.resolve({ id: JOB_ID }),
  });
  expect(res.status).toBe(200);
  return (await res.json()) as Record<string, unknown>;
}

// The Emergency_Message only ever appears as the `message` of an emergency view.
// The tradesperson text may appear in `reason` or `question`, never in `message`.
function expectNoEmergency(view: Record<string, unknown>): void {
  expect(view.status).not.toBe('emergency');
  expect(view).not.toHaveProperty('message');
  expect(JSON.stringify(view)).not.toContain(EMERGENCY_MESSAGE);
}

function expectSafetyUntouched(): void {
  expect(safetySpies.checkEmergency).not.toHaveBeenCalled();
  expect(safetySpies.replyTriggersEmergency).not.toHaveBeenCalled();
}

// Free text that is sometimes plain, sometimes built around a trigger phrase.
function mixedText(maxLength: number): fc.Arbitrary<string> {
  const plain = fc.string({ maxLength: Math.min(maxLength, 80) });
  const withPhrase = fc
    .tuple(fc.string({ maxLength: 30 }), fc.constantFrom(...TRIGGER_PHRASES), fc.string({ maxLength: 30 }))
    .map((parts) => parts.join(' '));
  return fc.oneof(plain, withPhrase, fc.constantFrom(...TRIGGER_PHRASES));
}

describe('Property 5: tradesperson text and slots never trigger an emergency', () => {
  // Feature: pro-dashboard-and-booking, Property 5: Tradesperson text and slots never trigger an emergency
  // **Validates: Requirements 7.14, 11.11, 16.16**
  it('decline reason never moves the job to emergency', async () => {
    await fc.assert(
      fc.asyncProperty(mixedText(200), async (reason) => {
        freshJob();
        const res = await postTo(decline, 'decline', { reason });
        expect(res.status).toBe(200);
        expect(storedStatus()).toBe('declined');
        expectNoEmergency(await homeownerView());
        expectSafetyUntouched();
      }),
      { numRuns: 100 },
    );
  });

  // Feature: pro-dashboard-and-booking, Property 5: Tradesperson text and slots never trigger an emergency
  // **Validates: Requirements 7.14, 11.11, 16.16**
  it('ask-info question never moves the job to emergency', async () => {
    const question = mixedText(300).filter((s) => s.trim().length > 0);
    await fc.assert(
      fc.asyncProperty(question, async (q) => {
        freshJob();
        const res = await postTo(askInfo, 'ask-info', { question: q });
        expect(res.status).toBe(200);
        expect(storedStatus()).toBe('info_requested');
        expectNoEmergency(await homeownerView());
        expectSafetyUntouched();
      }),
      { numRuns: 100 },
    );
  });

  // Feature: pro-dashboard-and-booking, Property 5: Tradesperson text and slots never trigger an emergency
  // **Validates: Requirements 7.14, 11.11, 16.16**
  it('valid slots give accepted, never emergency', async () => {
    const slots = fc.uniqueArray(fc.integer({ min: 1, max: 24 * 29 }), { minLength: 1, maxLength: 3 });
    await fc.assert(
      fc.asyncProperty(slots, async (hours) => {
        freshJob();
        const body = { slots: hours.map((h) => new Date(FIXTURE_NOW_MS + h * HOUR_MS).toISOString()) };
        const res = await postTo(accept, 'accept', body);
        expect(res.status).toBe(200);
        expect(storedStatus()).toBe('accepted');
        expectNoEmergency(await homeownerView());
        expectSafetyUntouched();
      }),
      { numRuns: 100 },
    );
  });

  // Feature: pro-dashboard-and-booking, Property 5: Tradesperson text and slots never trigger an emergency
  // **Validates: Requirements 7.14, 11.11, 16.16**
  it('invalid slots carrying trigger phrases give 400 and no emergency', async () => {
    const badSlots = fc.oneof(
      fc.array(mixedText(80), { minLength: 1, maxLength: 3 }),
      fc.array(mixedText(80), { minLength: 4, maxLength: 5 }),
      mixedText(80),
    );
    await fc.assert(
      fc.asyncProperty(badSlots, async (slots) => {
        freshJob();
        const res = await postTo(accept, 'accept', { slots });
        expect(res.status).toBe(400);
        expect(storedStatus()).toBe('new');
        expectNoEmergency(await homeownerView());
        expectSafetyUntouched();
      }),
      { numRuns: 100 },
    );
  });
});
