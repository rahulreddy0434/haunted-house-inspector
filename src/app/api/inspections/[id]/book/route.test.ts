import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createFakeDynamoTable, type FakeDynamoTable } from '@/test/fakeDynamoTable';
import { FIXTURE_NOW_MS, makeJobItem, makeLegacyJobItem } from '@/test/jobFixtures';
import {
  callWithId,
  consoleSpies,
  expectNoStore,
  makeRequest,
  withEnv,
  type ConsoleSpies,
} from '@/test/proRouteHarness';
import { EMERGENCY_MESSAGE } from '@/lib/emergency/messages';
import type { JobStatus } from '@/types/job';

vi.mock('server-only', () => ({}));

// The book route must never touch the rate limiter.
vi.mock('@/lib/rateLimiter', () => {
  throw new Error('rateLimiter must not be imported by the book route');
});

const holder = vi.hoisted(() => ({ fake: null as unknown as FakeDynamoTable }));
vi.mock('@aws-sdk/lib-dynamodb', async (importOriginal) => {
  const { fakeDynamoMockFactory } = await import('@/test/fakeDynamoTable');
  return fakeDynamoMockFactory(() => holder.fake)(
    importOriginal as () => Promise<typeof import('@aws-sdk/lib-dynamodb')>,
  );
});

import { POST } from './route';

const UNKNOWN_ID = '11111111-2222-4333-8444-555555555555';
const NOW_ISO = new Date(FIXTURE_NOW_MS).toISOString();

let spies: ConsoleSpies;
let restoreEnv: () => void;

beforeEach(() => {
  restoreEnv = withEnv({ DYNAMODB_TABLE_NAME: 'test-table' });
  holder.fake = createFakeDynamoTable();
  spies = consoleSpies();
  // Only Date is faked so the fake table's promise-based hold/release keeps working.
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(FIXTURE_NOW_MS);
});

afterEach(() => {
  vi.useRealTimers();
  restoreEnv();
  spies.restore();
  vi.restoreAllMocks();
});

function seed(item: object): void {
  holder.fake.seed({ ...item });
}

function call(id: string, body: unknown): Promise<Response> {
  return callWithId(POST, makeRequest(`/api/inspections/${id}/book`, { body }), id);
}

function expectCleanHeaders(res: Response): void {
  expectNoStore(res);
  expect(res.headers.get('set-cookie')).toBeNull();
}

function storedJob(id: string): Record<string, unknown> {
  const item = holder.fake.get(`JOB#${id}`);
  if (!item) throw new Error('job missing');
  return item;
}

function writeCalls(): number {
  return holder.fake.calls.filter((c) => c.name === 'UpdateCommand' || c.name === 'PutCommand').length;
}

function offered(item: { offeredSlots?: string[] }): string[] {
  if (!item.offeredSlots) throw new Error('fixture has no offered slots');
  return item.offeredSlots;
}

describe('POST /api/inspections/[id]/book', () => {
  describe('success', () => {
    it('books an offered slot and returns { status: "booked", bookedSlot }', async () => {
      const item = makeJobItem('accepted');
      seed(item);
      const slot = offered(item)[1];
      const res = await call(item.id, { slot });
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ status: 'booked', bookedSlot: slot });
      expectCleanHeaders(res);
      expect(storedJob(item.id).status).toBe('booked');
    });

    it('sets bookedSlot, bookedAt and statusUpdatedAt and leaves offeredSlots and ttl unchanged', async () => {
      const item = makeJobItem('accepted');
      seed(item);
      const slot = offered(item)[2];
      await call(item.id, { slot });

      const stored = storedJob(item.id);
      expect(stored.bookedSlot).toBe(slot);
      expect(stored.bookedAt).toBe(NOW_ISO);
      expect(stored.statusUpdatedAt).toBe(NOW_ISO);
      expect(stored.offeredSlots).toEqual(item.offeredSlots);
      expect(stored.ttl).toBe(item.ttl);
    });

    it('logs nothing on success', async () => {
      const item = makeJobItem('accepted');
      seed(item);
      await call(item.id, { slot: offered(item)[0] });
      expect(spies.loggedText()).toBe('');
    });
  });

  describe('validation', () => {
    it.each([[{}], [{ slot: 5 }], [{ slot: null }], [{ slot: ['a'] }], [[]], ['"text"']])(
      'returns 400 INVALID_REQUEST for body %j',
      async (body) => {
        const item = makeJobItem('accepted');
        seed(item);
        const res = await call(item.id, body);
        expect(res.status).toBe(400);
        expect(await res.json()).toMatchObject({ error: 'INVALID_REQUEST' });
        expectCleanHeaders(res);
        expect(holder.fake.calls).toHaveLength(0);
      },
    );

    it('returns 400 INVALID_REQUEST for invalid JSON', async () => {
      const item = makeJobItem('accepted');
      seed(item);
      const res = await call(item.id, '{not json');
      expect(res.status).toBe(400);
      expect(await res.json()).toMatchObject({ error: 'INVALID_REQUEST' });
      expectCleanHeaders(res);
      expect(holder.fake.calls).toHaveLength(0);
    });
  });

  describe('slot checks', () => {
    it('returns 400 SLOT_NOT_OFFERED for a future slot that was not offered and writes nothing', async () => {
      const item = makeJobItem('accepted');
      seed(item);
      const res = await call(item.id, { slot: new Date(FIXTURE_NOW_MS + 5 * 24 * 3600 * 1000).toISOString() });
      expect(res.status).toBe(400);
      expect(await res.json()).toMatchObject({ error: 'SLOT_NOT_OFFERED' });
      expectCleanHeaders(res);
      expect(writeCalls()).toBe(0);
      expect(storedJob(item.id).status).toBe('accepted');
    });

    it('returns SLOT_NOT_OFFERED (not SLOT_EXPIRED) for a slot that is both not offered and in the past', async () => {
      const item = makeJobItem('accepted');
      seed(item);
      const res = await call(item.id, { slot: new Date(FIXTURE_NOW_MS - 24 * 3600 * 1000).toISOString() });
      expect(res.status).toBe(400);
      expect(await res.json()).toMatchObject({ error: 'SLOT_NOT_OFFERED' });
      expect(writeCalls()).toBe(0);
    });

    it('returns SLOT_NOT_OFFERED for a non-canonical form of an offered instant', async () => {
      const item = makeJobItem('accepted');
      seed(item);
      const res = await call(item.id, { slot: offered(item)[0].replace('.000Z', 'Z') });
      expect(res.status).toBe(400);
      expect(await res.json()).toMatchObject({ error: 'SLOT_NOT_OFFERED' });
    });

    it.each([0, 1])(
      'returns 409 SLOT_EXPIRED when the time is the slot start plus %i ms, and the Job stays accepted',
      async (offset) => {
        const item = makeJobItem('accepted');
        seed(item);
        const slot = offered(item)[0];
        vi.setSystemTime(Date.parse(slot) + offset);
        const res = await call(item.id, { slot });
        expect(res.status).toBe(409);
        expect(await res.json()).toMatchObject({ error: 'SLOT_EXPIRED' });
        expectCleanHeaders(res);
        expect(writeCalls()).toBe(0);
        const stored = storedJob(item.id);
        expect(stored.status).toBe('accepted');
        expect(stored.bookedSlot).toBeUndefined();
      },
    );

    it('still books a slot one millisecond before it starts', async () => {
      const item = makeJobItem('accepted');
      seed(item);
      const slot = offered(item)[0];
      vi.setSystemTime(Date.parse(slot) - 1);
      const res = await call(item.id, { slot });
      expect(res.status).toBe(200);
    });
  });

  describe('status conflicts', () => {
    it.each<JobStatus>(['new', 'info_requested', 'declined', 'booked'])(
      'returns 409 ILLEGAL_TRANSITION with the status for %s',
      async (status) => {
        const item = makeJobItem(status);
        seed(item);
        const res = await call(item.id, { slot: new Date(FIXTURE_NOW_MS + 24 * 3600 * 1000).toISOString() });
        expect(res.status).toBe(409);
        expect(await res.json()).toMatchObject({ error: 'ILLEGAL_TRANSITION', status });
        expectCleanHeaders(res);
        expect(writeCalls()).toBe(0);
      },
    );

    it('returns 409 JOB_IS_EMERGENCY with exactly the emergency body and no slot strings', async () => {
      const item = makeJobItem('emergency', { offeredSlots: makeJobItem('accepted').offeredSlots });
      seed(item);
      const slot = offered(item)[0];
      const res = await call(item.id, { slot });
      expect(res.status).toBe(409);
      const text = await res.text();
      expect(JSON.parse(text)).toEqual({
        error: 'JOB_IS_EMERGENCY',
        message: EMERGENCY_MESSAGE,
        status: 'emergency',
      });
      expect(text).not.toContain(slot);
      expect(text).not.toMatch(/\d{4}-\d{2}-\d{2}T/);
      expectCleanHeaders(res);
      expect(writeCalls()).toBe(0);
    });

    it('lets exactly one of two concurrent bookings win', async () => {
      const item = makeJobItem('accepted');
      seed(item);
      const slots = offered(item);
      holder.fake.hold('UpdateCommand');

      const first = call(item.id, { slot: slots[0] });
      const second = call(item.id, { slot: slots[1] });
      // Wait until both handlers have read the Job and reached their write.
      for (let i = 0; i < 200 && holder.fake.heldCount() < 2; i++) {
        await new Promise<void>((resolve) => setImmediate(resolve));
      }
      expect(holder.fake.heldCount()).toBe(2);
      holder.fake.release();

      const results = await Promise.all([first, second]);
      const statuses = results.map((r) => r.status).sort();
      expect(statuses).toEqual([200, 409]);

      const loser = results.find((r) => r.status === 409);
      expect(await loser?.json()).toMatchObject({ error: 'ILLEGAL_TRANSITION', status: 'booked' });
      const winner = results.find((r) => r.status === 200);
      const winnerBody = (await winner?.json()) as { bookedSlot: string };
      expect(storedJob(item.id).bookedSlot).toBe(winnerBody.bookedSlot);
      for (const r of results) expectCleanHeaders(r);
    });
  });

  describe('not found', () => {
    it('returns 404 for a non-UUID without touching the table', async () => {
      const res = await call('not-a-uuid', { slot: NOW_ISO });
      expect(res.status).toBe(404);
      expect(await res.json()).toMatchObject({ error: 'NOT_FOUND' });
      expectCleanHeaders(res);
      expect(holder.fake.calls).toHaveLength(0);
    });

    it('returns the same 404 body for non-UUID, unknown and legacy Jobs', async () => {
      const legacy = makeLegacyJobItem();
      seed(legacy);
      const bodies: string[] = [];
      for (const id of ['not-a-uuid', UNKNOWN_ID, legacy.id as string]) {
        const res = await call(id, { slot: NOW_ISO });
        expect(res.status).toBe(404);
        expectCleanHeaders(res);
        bodies.push(await res.text());
      }
      expect(new Set(bodies).size).toBe(1);
      expect(writeCalls()).toBe(0);
    });
  });

  describe('body size', () => {
    it('returns 413 over 4 KB', async () => {
      const item = makeJobItem('accepted');
      seed(item);
      const res = await call(item.id, { slot: 'x'.repeat(5000) });
      expect(res.status).toBe(413);
      expect(await res.json()).toMatchObject({ error: 'PAYLOAD_TOO_LARGE' });
      expectCleanHeaders(res);
      expect(holder.fake.calls).toHaveLength(0);
    });
  });

  describe('failures, logging and isolation', () => {
    it('returns 500 ACTION_FAILED on a DynamoDB failure and logs only the error name', async () => {
      const item = makeJobItem('accepted');
      seed(item);
      const slot = offered(item)[0];
      const secret = 'super-secret-value-123';
      const err = new Error(`boom ${secret} hhi_pro=abc ${slot}`);
      err.name = 'ThrottlingException';
      holder.fake.send = () => Promise.reject(err);

      const res = await call(item.id, { slot });
      expect(res.status).toBe(500);
      expect(await res.json()).toMatchObject({ error: 'ACTION_FAILED' });
      expectCleanHeaders(res);

      const logged = spies.loggedText();
      expect(logged).toContain('ThrottlingException');
      expect(logged).not.toContain(secret);
      expect(logged).not.toContain('hhi_pro');
      expect(logged).not.toContain(slot);
    });

    it('returns 500 ACTION_FAILED when the booking write fails and logs no slot', async () => {
      const item = makeJobItem('accepted');
      seed(item);
      const slot = offered(item)[0];
      const realSend = holder.fake.send;
      holder.fake.send = (command) => {
        const name = (command as { constructor: { name: string } }).constructor.name;
        if (name === 'UpdateCommand') {
          const err = new Error(`write failed for ${slot}`);
          err.name = 'ProvisionedThroughputExceededException';
          return Promise.reject(err);
        }
        return realSend(command);
      };
      const res = await call(item.id, { slot });
      expect(res.status).toBe(500);
      expect(await res.json()).toMatchObject({ error: 'ACTION_FAILED' });
      expect(spies.loggedText()).toContain('ProvisionedThroughputExceededException');
      expect(spies.loggedText()).not.toContain(slot);
      expect(storedJob(item.id).status).toBe('accepted');
    });

    it('never writes a RATELIMIT# item', async () => {
      const item = makeJobItem('accepted');
      seed(item);
      await call(item.id, { slot: offered(item)[0] });
      expect(JSON.stringify(holder.fake.calls)).not.toContain('RATELIMIT#');
    });
  });
});
