/**
 * Unit tests for the emergency reason at the real call sites (screens-polish Requirement 18):
 * the inspect, reply, chat and book routes, with the in-memory DynamoDB table.
 * Only the Bedrock call is replaced.
 */
import { NextRequest } from 'next/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createFakeDynamoTable, type FakeDynamoTable } from '@/test/fakeDynamoTable';
import { makeJobItem } from '@/test/jobFixtures';
import { callWithId, consoleSpies, makeRequest, withEnv, type ConsoleSpies } from '@/test/proRouteHarness';
import { EMERGENCY_MESSAGE } from '@/lib/emergency/messages';
import { EMERGENCY_REASON_SENTENCES } from '@/lib/emergency/reasons';
import type { EmergencySource } from '@/lib/emergency/source';
import type { EmergencyConditionCode } from '@/lib/safety/safetyLayer';

vi.mock('server-only', () => ({}));
vi.mock('@/lib/aws/bedrock', () => ({ invokeInspectionModel: vi.fn() }));

const holder = vi.hoisted(() => ({ fake: null as unknown as FakeDynamoTable }));
vi.mock('@aws-sdk/lib-dynamodb', async (importOriginal) => {
  const { fakeDynamoMockFactory } = await import('@/test/fakeDynamoTable');
  return fakeDynamoMockFactory(() => holder.fake)(
    importOriginal as () => Promise<typeof import('@aws-sdk/lib-dynamodb')>,
  );
});

import { POST as inspectPost } from '@/app/api/inspect/route';
import { POST as replyPost } from '@/app/api/inspections/[id]/reply/route';
import { GET as chatGet, POST as chatPost } from '@/app/api/inspections/[id]/chat/route';
import { POST as bookPost } from '@/app/api/inspections/[id]/book/route';
import { invokeInspectionModel } from '@/lib/aws/bedrock';

/** One text per Emergency_Rule, taken from the existing safety corpus. */
const TEXT_FOR_RULE: Record<EmergencyConditionCode, string> = {
  GAS_SMELL: 'I can smell gas in the kitchen',
  ELECTRICAL_FIRE: 'There were sparks coming from the outlet',
  WATER_ELECTRICAL: 'Water is flooding near the electrical panel',
  CO_ALARM: 'The carbon monoxide alarm is going off',
};
const RULES = Object.keys(TEXT_FOR_RULE) as EmergencyConditionCode[];
const PLAIN_ANSWERS = { location: 'Kitchen, under the sink', duration: 'Two days', recentChanges: 'Nothing' };

let spies: ConsoleSpies;
let restoreEnv: () => void;

beforeEach(() => {
  restoreEnv = withEnv({ DYNAMODB_TABLE_NAME: 'test-table', SESSION_SECRET: 'test-secret' });
  holder.fake = createFakeDynamoTable({ allowRateLimitWrites: true });
  vi.mocked(invokeInspectionModel).mockReset();
  spies = consoleSpies();
  vi.spyOn(console, 'log').mockImplementation(() => {});
});

afterEach(() => {
  restoreEnv();
  spies.restore();
  vi.restoreAllMocks();
});

function inspectRequest(answers: Record<string, string>): NextRequest {
  return new NextRequest('http://localhost/api/inspect', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-forwarded-for': '203.0.113.7' },
    body: JSON.stringify({ s3Keys: ['job-1/a.jpg'], answers }),
  });
}

function storedJob(id: string): Record<string, unknown> {
  const item = holder.fake.get(`JOB#${id}`);
  if (!item) throw new Error('job missing');
  return item;
}

function writeCalls(): number {
  return holder.fake.calls.filter((c) => c.name === 'UpdateCommand' || c.name === 'PutCommand').length;
}

function seedJob(status: 'info_requested' | 'emergency', overrides: Record<string, unknown> = {}) {
  const item = makeJobItem(status, overrides);
  holder.fake.seed({ ...item });
  return item;
}

async function replyTo(id: string, text: string): Promise<Response> {
  return callWithId(replyPost, makeRequest(`/api/inspections/${id}/reply`, { body: { text } }), id);
}

async function chatSend(id: string, text: string): Promise<Response> {
  return callWithId(chatPost, makeRequest(`/api/inspections/${id}/chat`, { body: { text } }), id);
}

describe('inspect route saves the rule, the source and shows the sentence', () => {
  it.each(RULES)('precheck for %s: saved rule, saved source precheck, sentence from the rule', async (rule) => {
    const res = await inspectPost(inspectRequest({ ...PLAIN_ANSWERS, location: TEXT_FOR_RULE[rule] }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.emergencyRule).toBe(rule);
    expect(body.emergencySource).toBe('precheck');
    expect(EMERGENCY_REASON_SENTENCES[body.emergencyRule as EmergencyConditionCode]).toBe(
      EMERGENCY_REASON_SENTENCES[rule],
    );

    const stored = storedJob(body.id);
    expect(stored.status).toBe('emergency');
    expect(stored.emergencyRule).toBe(rule);
    expect(stored.emergencySource).toBe('precheck');
    expect(invokeInspectionModel).not.toHaveBeenCalled();
  });

  it('postcheck: the rule and source come from the check on the AI answer', async () => {
    vi.mocked(invokeInspectionModel).mockResolvedValue({
      likelyIssue: 'A strong gas smell near the boiler',
      trade: 'Plumber',
      urgency: 'soon',
      confidence: 0.6,
      costRangeLow: 100,
      costRangeHigh: 300,
      jobBrief: 'Please check the boiler.',
      followUpQuestions: ['Is it constant?', 'Any damp?'],
      diySteps: [],
    });
    const res = await inspectPost(inspectRequest(PLAIN_ANSWERS));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.isEmergency).toBe(true);
    expect(body.emergencyRule).toBe('GAS_SMELL');
    expect(body.emergencySource).toBe('postcheck');

    const stored = storedJob(body.id);
    expect(stored.emergencyRule).toBe('GAS_SMELL');
    expect(stored.emergencySource).toBe('postcheck');
  });

  it('a normal result carries neither field', async () => {
    vi.mocked(invokeInspectionModel).mockResolvedValue({
      likelyIssue: 'A worn tap washer',
      trade: 'Plumber',
      urgency: 'soon',
      confidence: 0.6,
      costRangeLow: 100,
      costRangeHigh: 300,
      jobBrief: 'Please replace the washer.',
      followUpQuestions: ['Is it constant?', 'Any damp?'],
      diySteps: [],
    });
    const body = await (await inspectPost(inspectRequest(PLAIN_ANSWERS))).json();
    expect(body).not.toHaveProperty('emergencyRule');
    expect(body).not.toHaveProperty('emergencySource');
    expect(storedJob(body.id)).not.toHaveProperty('emergencyRule');
    expect(storedJob(body.id)).not.toHaveProperty('emergencySource');
  });
});

describe('reply route (override)', () => {
  it.each(RULES)('%s: saved rule, saved source override, sentence in the response', async (rule) => {
    const job = seedJob('info_requested');
    const res = await replyTo(job.id, TEXT_FOR_RULE[rule]);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      status: 'emergency',
      message: EMERGENCY_MESSAGE,
      reasonSentence: EMERGENCY_REASON_SENTENCES[rule],
    });
    const stored = storedJob(job.id);
    expect(stored.status).toBe('emergency');
    expect(stored.emergencyRule).toBe(rule);
    expect(stored.emergencySource).toBe('override' satisfies EmergencySource);
  });

  it('409 on a saved emergency carries the sentence of the saved rule', async () => {
    const job = seedJob('emergency', { emergencyRule: 'CO_ALARM', emergencySource: 'precheck' });
    const res = await replyTo(job.id, 'Under the sink');
    expect(res.status).toBe(409);
    expect(await res.json()).toMatchObject({
      error: 'JOB_IS_EMERGENCY',
      reasonSentence: EMERGENCY_REASON_SENTENCES.CO_ALARM,
    });
  });
});

describe('chat route (override)', () => {
  it.each(RULES)('%s: saved rule, saved source override, sentence in the response', async (rule) => {
    const job = seedJob('info_requested');
    const res = await chatSend(job.id, TEXT_FOR_RULE[rule]);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      status: 'emergency',
      message: EMERGENCY_MESSAGE,
      reasonSentence: EMERGENCY_REASON_SENTENCES[rule],
    });
    const stored = storedJob(job.id);
    expect(stored.emergencyRule).toBe(rule);
    expect(stored.emergencySource).toBe('override');
  });

  it('a read on a saved emergency returns 409 with the sentence of the saved rule', async () => {
    const job = seedJob('emergency', { emergencyRule: 'WATER_ELECTRICAL', emergencySource: 'postcheck' });
    const res = await callWithId(chatGet, makeRequest(`/api/inspections/${job.id}/chat`), job.id);
    expect(res.status).toBe(409);
    expect(await res.json()).toMatchObject({
      error: 'JOB_IS_EMERGENCY',
      reasonSentence: EMERGENCY_REASON_SENTENCES.WATER_ELECTRICAL,
    });
  });
});

describe('a job with no saved rule (saved before this feature)', () => {
  it('gives no reasonSentence key from the reply, chat read, chat send and book routes', async () => {
    const job = seedJob('emergency');
    const slot = new Date().toISOString();
    const responses = [
      await replyTo(job.id, 'Under the sink'),
      await callWithId(chatGet, makeRequest(`/api/inspections/${job.id}/chat`), job.id),
      await chatSend(job.id, 'Under the sink'),
      await callWithId(bookPost, makeRequest(`/api/inspections/${job.id}/book`, { body: { slot } }), job.id),
    ];
    for (const res of responses) {
      expect(res.status).toBe(409);
      const text = await res.text();
      expect(JSON.parse(text)).toMatchObject({ error: 'JOB_IS_EMERGENCY', status: 'emergency' });
      expect(text).not.toContain('reasonSentence');
    }
  });
});

describe('booking request on an emergency job', () => {
  it.each(RULES)('returns 409 JOB_IS_EMERGENCY with the sentence for %s, sets no source and writes nothing', async (rule) => {
    const job = seedJob('emergency', { emergencyRule: rule, emergencySource: 'precheck' });
    const before = storedJob(job.id);
    const res = await callWithId(
      bookPost,
      makeRequest(`/api/inspections/${job.id}/book`, { body: { slot: new Date().toISOString() } }),
      job.id,
    );
    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({
      error: 'JOB_IS_EMERGENCY',
      message: EMERGENCY_MESSAGE,
      status: 'emergency',
      reasonSentence: EMERGENCY_REASON_SENTENCES[rule],
    });
    expect(writeCalls()).toBe(0);
    expect(storedJob(job.id)).toEqual(before);
    expect(storedJob(job.id).emergencySource).toBe('precheck');
  });

  it('sets no source on an emergency job that has none', async () => {
    const job = seedJob('emergency');
    const res = await callWithId(
      bookPost,
      makeRequest(`/api/inspections/${job.id}/book`, { body: { slot: new Date().toISOString() } }),
      job.id,
    );
    expect(res.status).toBe(409);
    expect(writeCalls()).toBe(0);
    expect(storedJob(job.id)).not.toHaveProperty('emergencySource');
    expect(storedJob(job.id)).not.toHaveProperty('emergencyRule');
  });
});
