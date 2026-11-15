import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createFakeDynamoTable, type FakeDynamoTable, type FakeItem } from '@/test/fakeDynamoTable';
import { FIXTURE_NOW_MS, makeJobItem } from '@/test/jobFixtures';
import type { JobStatus } from '@/types/job';

vi.mock('server-only', () => ({}));

const holder = vi.hoisted(() => ({ fake: null as unknown as FakeDynamoTable }));
vi.mock('@aws-sdk/lib-dynamodb', async (importOriginal) => {
  const { fakeDynamoMockFactory } = await import('@/test/fakeDynamoTable');
  return fakeDynamoMockFactory(() => holder.fake)(
    importOriginal as () => Promise<typeof import('@aws-sdk/lib-dynamodb')>,
  );
});

import { applyBooking, applyReply, applySafetyOverride, applyTransition } from './jobs';

const NOW = new Date(FIXTURE_NOW_MS).toISOString();
const FORBIDDEN = ['ScanCommand', 'DeleteCommand', 'BatchWriteCommand'];
const SLOTS = [new Date(FIXTURE_NOW_MS + 86_400_000).toISOString(), new Date(FIXTURE_NOW_MS + 2 * 86_400_000).toISOString()];

function seed(item: object): void {
  holder.fake.seed({ ...item });
}

function stored(id: string): FakeItem {
  const item = holder.fake.get(`JOB#${id}`);
  if (!item) throw new Error('item missing');
  return item;
}

function updateCalls(): Array<Record<string, unknown>> {
  return holder.fake.calls.filter((c) => c.name === 'UpdateCommand').map((c) => c.input);
}

/** All strings that make up an update: expressions, name aliases and value keys. */
function expressionParts(input: Record<string, unknown>): string[] {
  const names = (input.ExpressionAttributeNames ?? {}) as Record<string, string>;
  const values = (input.ExpressionAttributeValues ?? {}) as Record<string, unknown>;
  return [
    String(input.UpdateExpression),
    String(input.ConditionExpression),
    ...Object.keys(names),
    ...Object.values(names),
    ...Object.keys(values),
  ];
}

function expectNoTtlAndNoForbidden(id: string, ttlBefore: unknown): void {
  for (const input of updateCalls()) {
    for (const part of expressionParts(input)) {
      expect(part.toLowerCase()).not.toContain('ttl');
    }
  }
  expect(stored(id).ttl).toBe(ttlBefore);
  for (const call of holder.fake.calls) {
    expect(FORBIDDEN).not.toContain(call.name);
  }
}

beforeEach(() => {
  holder.fake = createFakeDynamoTable();
  process.env.DYNAMODB_TABLE_NAME = 'test-table';
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('applyTransition', () => {
  it('accept sends the exact condition and stores slots, status and statusUpdatedAt', async () => {
    const item = makeJobItem('new');
    seed(item);
    const result = await applyTransition(item.id, 'new', 'accepted', { action: 'accept', slots: SLOTS }, NOW);
    expect(result).toEqual({ ok: true });
    const input = updateCalls()[0];
    expect(input).toMatchObject({
      TableName: 'test-table',
      Key: { PK: `JOB#${item.id}`, SK: `JOB#${item.id}` },
      ConditionExpression: 'attribute_exists(PK) AND #status = :expected',
      ExpressionAttributeNames: { '#status': 'status' },
    });
    expect((input.ExpressionAttributeValues as Record<string, unknown>)[':expected']).toBe('new');
    const after = stored(item.id);
    expect(after).toMatchObject({ status: 'accepted', statusUpdatedAt: NOW, offeredSlots: SLOTS });
    expect(after.infoRequests).toEqual(item.infoRequests);
    expect(after.replies).toEqual(item.replies);
    expect(after.replyCount).toBe(item.replyCount);
    expectNoTtlAndNoForbidden(item.id, item.ttl);
  });

  it('accept and decline of an info_requested Job use :expected info_requested and keep info and replies', async () => {
    for (const action of ['accept', 'decline'] as const) {
      holder.fake = createFakeDynamoTable();
      const item = makeJobItem('info_requested', {
        replies: [{ text: 'earlier', at: NOW }],
        replyCount: 1,
      });
      seed(item);
      const next: JobStatus = action === 'accept' ? 'accepted' : 'declined';
      const patch = action === 'accept' ? { action: 'accept' as const, slots: SLOTS } : { action: 'decline' as const };
      await expect(applyTransition(item.id, 'info_requested', next, patch, NOW)).resolves.toEqual({ ok: true });
      const input = updateCalls()[0];
      expect(input.ConditionExpression).toBe('attribute_exists(PK) AND #status = :expected');
      expect((input.ExpressionAttributeValues as Record<string, unknown>)[':expected']).toBe('info_requested');
      const after = stored(item.id);
      expect(after.status).toBe(next);
      expect(after.statusUpdatedAt).toBe(NOW);
      expect(after.infoRequests).toEqual(item.infoRequests);
      expect(after.replies).toEqual(item.replies);
      expect(after.replyCount).toBe(1);
      expectNoTtlAndNoForbidden(item.id, item.ttl);
    }
  });

  it('decline stores the trimmed reason only when it is non-empty', async () => {
    const a = makeJobItem('new');
    seed(a);
    await applyTransition(a.id, 'new', 'declined', { action: 'decline', reason: '  Too far away  ' }, NOW);
    expect(stored(a.id).declineReason).toBe('Too far away');

    for (const reason of [undefined, '', '   \n ']) {
      holder.fake = createFakeDynamoTable();
      const b = makeJobItem('new');
      seed(b);
      await applyTransition(b.id, 'new', 'declined', { action: 'decline', reason }, NOW);
      const after = stored(b.id);
      expect(after.status).toBe('declined');
      expect('declineReason' in after).toBe(false);
      const input = updateCalls()[0];
      expect(String(input.UpdateExpression)).not.toContain('declineReason');
      expect(input.ExpressionAttributeValues).not.toHaveProperty(':reason');
    }
  });

  it('ask-info appends the question and keeps replies and replyCount', async () => {
    const item = makeJobItem('new');
    seed(item);
    await applyTransition(item.id, 'new', 'info_requested', { action: 'ask_info', question: 'Where exactly?' }, NOW);
    const after = stored(item.id);
    expect(after).toMatchObject({ status: 'info_requested', statusUpdatedAt: NOW, replyCount: 0, replies: [] });
    expect(after.infoRequests).toEqual([{ question: 'Where exactly?', askedAt: NOW }]);
    expectNoTtlAndNoForbidden(item.id, item.ttl);
  });

  it('returns CONDITION_FAILED when the status changed, and when the Job is missing', async () => {
    const item = makeJobItem('accepted');
    seed(item);
    await expect(applyTransition(item.id, 'new', 'declined', { action: 'decline' }, NOW)).resolves.toEqual({
      ok: false,
      reason: 'CONDITION_FAILED',
    });
    expect(stored(item.id).status).toBe('accepted');
    await expect(applyTransition('missing', 'new', 'declined', { action: 'decline' }, NOW)).resolves.toEqual({
      ok: false,
      reason: 'CONDITION_FAILED',
    });
    expect(holder.fake.get('JOB#missing')).toBeUndefined();
  });

  it('rethrows other errors', async () => {
    const item = makeJobItem('new');
    seed(item);
    const boom = new Error('throttled');
    vi.spyOn(holder.fake, 'send').mockRejectedValueOnce(boom);
    await expect(applyTransition(item.id, 'new', 'declined', { action: 'decline' }, NOW)).rejects.toBe(boom);
  });
});

describe('applyReply', () => {
  it('sends the exact condition, appends the trimmed reply, keeps replyCount equal to replies.length', async () => {
    const item = makeJobItem('info_requested');
    seed(item);
    await expect(applyReply(item.id, '  It is constant  ', NOW)).resolves.toEqual({ ok: true });
    const input = updateCalls()[0];
    expect(input.ConditionExpression).toBe('attribute_exists(PK) AND #status = :infoRequested AND replyCount < :five');
    const after = stored(item.id);
    expect(after).toMatchObject({ status: 'new', statusUpdatedAt: NOW, replyCount: 1 });
    expect(after.replies).toEqual([{ text: 'It is constant', at: NOW }]);
    expect((after.replies as unknown[]).length).toBe(after.replyCount);
    expect(after.infoRequests).toEqual(item.infoRequests);
    expectNoTtlAndNoForbidden(item.id, item.ttl);
  });

  it('keeps the invariant over repeated rounds and fails at replyCount 5', async () => {
    const item = makeJobItem('info_requested');
    seed(item);
    for (let i = 1; i <= 5; i += 1) {
      await expect(applyReply(item.id, `reply ${i}`, NOW)).resolves.toEqual({ ok: true });
      const after = stored(item.id);
      expect((after.replies as unknown[]).length).toBe(i);
      expect(after.replyCount).toBe(i);
      await applyTransition(item.id, 'new', 'info_requested', { action: 'ask_info', question: `q${i}` }, NOW);
    }
    await expect(applyReply(item.id, 'sixth', NOW)).resolves.toEqual({ ok: false, reason: 'CONDITION_FAILED' });
    expect(stored(item.id).replyCount).toBe(5);
  });

  it('returns CONDITION_FAILED when the Job is not info_requested', async () => {
    const item = makeJobItem('new');
    seed(item);
    await expect(applyReply(item.id, 'hi', NOW)).resolves.toEqual({ ok: false, reason: 'CONDITION_FAILED' });
  });

  it('rethrows other errors', async () => {
    const item = makeJobItem('info_requested');
    seed(item);
    const boom = new Error('network');
    vi.spyOn(holder.fake, 'send').mockRejectedValueOnce(boom);
    await expect(applyReply(item.id, 'hi', NOW)).rejects.toBe(boom);
  });
});

describe('applyBooking', () => {
  it('sends the exact condition, books the slot and leaves offeredSlots untouched', async () => {
    const item = makeJobItem('accepted');
    seed(item);
    const slot = (item.offeredSlots as string[])[1];
    await expect(applyBooking(item.id, slot, NOW)).resolves.toEqual({ ok: true });
    const input = updateCalls()[0];
    expect(input.ConditionExpression).toBe('attribute_exists(PK) AND #status = :accepted');
    expect(String(input.UpdateExpression)).not.toContain('offeredSlots');
    const after = stored(item.id);
    expect(after).toMatchObject({ status: 'booked', statusUpdatedAt: NOW, bookedSlot: slot, bookedAt: NOW });
    expect(after.offeredSlots).toEqual(item.offeredSlots);
    expectNoTtlAndNoForbidden(item.id, item.ttl);
  });

  it('returns CONDITION_FAILED for a Job that is already booked', async () => {
    const item = makeJobItem('booked');
    seed(item);
    await expect(applyBooking(item.id, SLOTS[0], NOW)).resolves.toEqual({ ok: false, reason: 'CONDITION_FAILED' });
    expect(stored(item.id)).toEqual({ ...item });
  });

  it('rethrows other errors', async () => {
    const item = makeJobItem('accepted');
    seed(item);
    const boom = new Error('denied');
    vi.spyOn(holder.fake, 'send').mockRejectedValueOnce(boom);
    await expect(applyBooking(item.id, SLOTS[0], NOW)).rejects.toBe(boom);
  });
});

describe('applySafetyOverride', () => {
  const NOT_EMERGENCY = 'attribute_exists(PK) AND (attribute_not_exists(#status) OR #status <> :emergency)';

  function expectEmergencyState(id: string): FakeItem {
    const after = stored(id);
    expect(after).toMatchObject({
      status: 'emergency',
      statusUpdatedAt: NOW,
      urgency: 'emergency',
      isEmergency: true,
      costRangeLow: 0,
      costRangeHigh: 0,
      jobBrief: '',
      diySteps: [],
    });
    for (const attr of ['offeredSlots', 'bookedSlot', 'bookedAt']) {
      expect(attr in after).toBe(false);
    }
    return after;
  }

  it('attempt A stores the trimmed reply, bumps replyCount and removes booking attributes', async () => {
    const item = makeJobItem('booked');
    seed(item);
    await expect(applySafetyOverride(item.id, '  I smell gas  ', NOW)).resolves.toBe('applied');
    expect(updateCalls()).toHaveLength(1);
    const input = updateCalls()[0];
    expect(input.ConditionExpression).toBe(`${NOT_EMERGENCY} AND (attribute_not_exists(replyCount) OR replyCount < :five)`);
    expect(String(input.UpdateExpression)).toContain('REMOVE offeredSlots, bookedSlot, bookedAt');
    const after = expectEmergencyState(item.id);
    expect(after.replies).toEqual([{ text: 'I smell gas', at: NOW }]);
    expect(after.replyCount).toBe(1);
    expect(after.infoRequests).toEqual(item.infoRequests);
    expectNoTtlAndNoForbidden(item.id, item.ttl);
  });

  it('cuts the stored reply to 500 characters after trimming', async () => {
    const item = makeJobItem('new');
    seed(item);
    await applySafetyOverride(item.id, `  ${'a'.repeat(600)}  `, NOW);
    const replies = stored(item.id).replies as Array<{ text: string }>;
    expect(replies[0].text).toBe('a'.repeat(500));
  });

  it('runs attempt B when replyCount is 5: reply not stored, replyCount unchanged', async () => {
    const replies = Array.from({ length: 5 }, (_, i) => ({ text: `r${i}`, at: NOW }));
    const item = makeJobItem('info_requested', { replies, replyCount: 5 });
    seed(item);
    await expect(applySafetyOverride(item.id, 'gas smell', NOW)).resolves.toBe('applied');
    const calls = updateCalls();
    expect(calls).toHaveLength(2);
    expect(calls[1].ConditionExpression).toBe(NOT_EMERGENCY);
    expect(String(calls[1].UpdateExpression)).toContain('REMOVE offeredSlots, bookedSlot, bookedAt');
    const after = expectEmergencyState(item.id);
    expect(after.replies).toEqual(replies);
    expect(after.replyCount).toBe(5);
    expect(after.infoRequests).toEqual(item.infoRequests);
    expectNoTtlAndNoForbidden(item.id, item.ttl);
  });

  it('an empty or blank reply skips attempt A and goes straight to B', async () => {
    for (const reply of ['', '   \n\t ']) {
      holder.fake = createFakeDynamoTable();
      const item = makeJobItem('accepted');
      seed(item);
      await expect(applySafetyOverride(item.id, reply, NOW)).resolves.toBe('applied');
      const calls = updateCalls();
      expect(calls).toHaveLength(1);
      expect(calls[0].ConditionExpression).toBe(NOT_EMERGENCY);
      const after = expectEmergencyState(item.id);
      expect(after.replies).toEqual([]);
      expect(after.replyCount).toBe(0);
    }
  });

  it('returns skipped with no further write for an already-emergency Job', async () => {
    const item = makeJobItem('emergency');
    seed(item);
    await expect(applySafetyOverride(item.id, 'smoke', NOW)).resolves.toBe('skipped');
    expect(updateCalls()).toHaveLength(2); // A then B, both rejected by the condition
    expect(stored(item.id)).toEqual({ ...item });

    const callsBefore = holder.fake.calls.length;
    holder.fake = createFakeDynamoTable();
    seed(item);
    await expect(applySafetyOverride(item.id, '', NOW)).resolves.toBe('skipped');
    expect(holder.fake.calls.length).toBe(1);
    expect(callsBefore).toBeGreaterThan(0);
  });

  it('returns skipped for a missing Job', async () => {
    await expect(applySafetyOverride('missing', 'smoke', NOW)).resolves.toBe('skipped');
    expect(holder.fake.get('JOB#missing')).toBeUndefined();
  });

  it('moves a declined Job to emergency and keeps declineReason', async () => {
    const item = makeJobItem('declined');
    seed(item);
    await expect(applySafetyOverride(item.id, 'sparks', NOW)).resolves.toBe('applied');
    const after = expectEmergencyState(item.id);
    expect(after.declineReason).toBe(item.declineReason);
    expectNoTtlAndNoForbidden(item.id, item.ttl);
  });

  it('moves a booked Job to emergency', async () => {
    const item = makeJobItem('booked');
    seed(item);
    await expect(applySafetyOverride(item.id, '', NOW)).resolves.toBe('applied');
    expectEmergencyState(item.id);
  });

  it('rethrows non-condition errors', async () => {
    const item = makeJobItem('new');
    seed(item);
    const boom = new Error('service unavailable');
    vi.spyOn(holder.fake, 'send').mockRejectedValueOnce(boom);
    await expect(applySafetyOverride(item.id, 'smoke', NOW)).rejects.toBe(boom);
  });
});
