import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createFakeDynamoTable, type FakeDynamoTable } from '@/test/fakeDynamoTable';
import { makeJobItem, makeLegacyJobItem } from '@/test/jobFixtures';
import { consoleSpies, expectNoStore, type ConsoleSpies } from '@/test/proRouteHarness';
import { EMERGENCY_MESSAGE, PRO_EMERGENCY_NOTE } from '@/lib/emergency/messages';
import { ERROR_MESSAGES } from '@/lib/jobs/copy';

vi.mock('server-only', () => ({}));

const holder = vi.hoisted(() => ({ fake: null as unknown as FakeDynamoTable }));
vi.mock('@aws-sdk/lib-dynamodb', async (importOriginal) => {
  const { fakeDynamoMockFactory } = await import('@/test/fakeDynamoTable');
  return fakeDynamoMockFactory(() => holder.fake)(
    importOriginal as () => Promise<typeof import('@aws-sdk/lib-dynamodb')>,
  );
});

import { conflictResponse } from './conflict';

let spies: ConsoleSpies;

beforeEach(() => {
  holder.fake = createFakeDynamoTable();
  process.env.DYNAMODB_TABLE_NAME = 'test-table';
  spies = consoleSpies();
});

afterEach(() => {
  spies.restore();
  vi.restoreAllMocks();
});

function seed(item: object): void {
  holder.fake.seed({ ...item });
}

function expectOneConsistentRead(): void {
  expect(holder.fake.calls).toHaveLength(1);
  expect(holder.fake.calls[0].name).toBe('GetCommand');
  expect(holder.fake.calls[0].input).toMatchObject({ ConsistentRead: true });
}

describe('conflictResponse', () => {
  it('returns the exact homeowner emergency body', async () => {
    const item = makeJobItem('emergency');
    seed(item);
    const res = await conflictResponse(item.id, 'homeowner');
    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({
      error: 'JOB_IS_EMERGENCY',
      message: EMERGENCY_MESSAGE,
      status: 'emergency',
    });
    expectNoStore(res);
    expectOneConsistentRead();
  });

  it('returns the Pro emergency note for the pro audience', async () => {
    const item = makeJobItem('emergency');
    seed(item);
    const res = await conflictResponse(item.id, 'pro');
    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({
      error: 'JOB_IS_EMERGENCY',
      message: PRO_EMERGENCY_NOTE,
      status: 'emergency',
    });
    expectNoStore(res);
  });

  it('returns ILLEGAL_TRANSITION with the current status', async () => {
    const item = makeJobItem('declined');
    seed(item);
    const res = await conflictResponse(item.id, 'pro');
    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({
      error: 'ILLEGAL_TRANSITION',
      message: ERROR_MESSAGES.ILLEGAL_TRANSITION,
      status: 'declined',
    });
    expectNoStore(res);
    expectOneConsistentRead();
  });

  it('returns 404 for a missing job', async () => {
    const res = await conflictResponse('missing-id', 'homeowner');
    expect(res.status).toBe(404);
    expect(await res.json()).toMatchObject({ error: 'NOT_FOUND' });
    expectNoStore(res);
    expectOneConsistentRead();
  });

  it('returns 404 for a legacy job', async () => {
    const legacy = makeLegacyJobItem();
    seed(legacy);
    const res = await conflictResponse(String(legacy.id), 'pro');
    expect(res.status).toBe(404);
    expect(await res.json()).toMatchObject({ error: 'NOT_FOUND' });
    expectNoStore(res);
  });

  it('returns 500 RESULT_INVALID for an invalid job', async () => {
    const item = makeJobItem('new', { likelyIssue: 123 as unknown as string });
    seed(item);
    const res = await conflictResponse(item.id, 'pro');
    expect(res.status).toBe(500);
    expect(await res.json()).toMatchObject({ error: 'RESULT_INVALID' });
    expectNoStore(res);
  });

  it('returns 500 ACTION_FAILED on re-read failure and logs only error.name', async () => {
    const secret = 'secret-detail-do-not-log';
    holder.fake.send = async () => {
      throw new TypeError(secret);
    };
    const res = await conflictResponse('some-id', 'homeowner');
    expect(res.status).toBe(500);
    expect(await res.json()).toMatchObject({ error: 'ACTION_FAILED' });
    expectNoStore(res);
    const logged = spies.loggedText();
    expect(logged).toContain('TypeError');
    expect(logged).not.toContain(secret);
  });

  it('never sends a write command', async () => {
    const item = makeJobItem('booked');
    seed(item);
    await conflictResponse(item.id, 'pro');
    const names = holder.fake.calls.map((c) => c.name);
    expect(names).not.toContain('UpdateCommand');
    expect(names).not.toContain('PutCommand');
  });

  it('never leaks slots or free text in the body', async () => {
    const item = makeJobItem('booked', {
      declineReason: 'DECLINE-REASON-TEXT',
      infoRequests: [{ question: 'QUESTION-TEXT-ONE', askedAt: '2026-03-05T11:00:00.000Z' }],
      replies: [{ text: 'REPLY-TEXT-ONE', at: '2026-03-05T11:10:00.000Z' }],
      replyCount: 1,
    });
    seed(item);
    const res = await conflictResponse(item.id, 'pro');
    const raw = JSON.stringify(await res.json());
    const forbidden = [
      'offeredSlots',
      'bookedSlot',
      'bookedAt',
      'DECLINE-REASON-TEXT',
      'QUESTION-TEXT-ONE',
      'REPLY-TEXT-ONE',
      ...(item.offeredSlots ?? []),
      item.bookedSlot ?? '',
    ];
    for (const s of forbidden) expect(raw).not.toContain(s);
  });
});
