import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createFakeDynamoTable, type FakeDynamoTable } from '@/test/fakeDynamoTable';
import { makeJobItem, makeLegacyJobItem } from '@/test/jobFixtures';
import {
  callWithId,
  consoleSpies,
  expectNoStore,
  makeRequest,
  withEnv,
  type ConsoleSpies,
} from '@/test/proRouteHarness';
import { EMERGENCY_MESSAGE } from '@/lib/emergency/messages';
import { ERROR_MESSAGES } from '@/lib/jobs/copy';
import { homeownerStatusViewSchema } from '@/lib/validation/jobSchema';
import type { JobStatus } from '@/types/job';

vi.mock('server-only', () => ({}));

// The status route must never touch the rate limiter.
vi.mock('@/lib/rateLimiter', () => {
  throw new Error('rateLimiter must not be imported by the status route');
});

const holder = vi.hoisted(() => ({ fake: null as unknown as FakeDynamoTable }));
vi.mock('@aws-sdk/lib-dynamodb', async (importOriginal) => {
  const { fakeDynamoMockFactory } = await import('@/test/fakeDynamoTable');
  return fakeDynamoMockFactory(() => holder.fake)(
    importOriginal as () => Promise<typeof import('@aws-sdk/lib-dynamodb')>,
  );
});

import { GET } from './route';

let spies: ConsoleSpies;
let restoreEnv: () => void;

beforeEach(() => {
  restoreEnv = withEnv({ DYNAMODB_TABLE_NAME: 'test-table' });
  holder.fake = createFakeDynamoTable();
  spies = consoleSpies();
});

afterEach(() => {
  restoreEnv();
  spies.restore();
  vi.restoreAllMocks();
});

const UNKNOWN_ID = '11111111-2222-4333-8444-555555555555';

function seed(item: object): void {
  holder.fake.seed({ ...item });
}

function call(id: string): Promise<Response> {
  return callWithId(GET, makeRequest(`/api/inspections/${id}/status`), id);
}

function expectCleanHeaders(res: Response): void {
  expectNoStore(res);
  expect(res.headers.get('set-cookie')).toBeNull();
}

describe('GET /api/inspections/[id]/status', () => {
  it('returns { status: "new" } for a new job', async () => {
    const item = makeJobItem('new');
    seed(item);
    const res = await call(item.id);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ status: 'new' });
    expectCleanHeaders(res);
  });

  it('returns the latest question for info_requested', async () => {
    const item = makeJobItem('info_requested', {
      infoRequests: [
        { question: 'First question?', askedAt: '2026-03-05T11:00:00.000Z' },
        { question: 'Latest question?', askedAt: '2026-03-05T11:30:00.000Z' },
      ],
    });
    seed(item);
    const res = await call(item.id);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ status: 'info_requested', question: 'Latest question?' });
    expectCleanHeaders(res);
  });

  it('returns the offered slots for accepted', async () => {
    const item = makeJobItem('accepted');
    seed(item);
    const res = await call(item.id);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ status: 'accepted', offeredSlots: item.offeredSlots });
    expectCleanHeaders(res);
  });

  it('returns the reason for declined', async () => {
    const item = makeJobItem('declined');
    seed(item);
    const res = await call(item.id);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ status: 'declined', reason: 'Outside my service area.' });
    expectCleanHeaders(res);
  });

  it('returns the booked slot for booked', async () => {
    const item = makeJobItem('booked');
    seed(item);
    const res = await call(item.id);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ status: 'booked', bookedSlot: item.bookedSlot });
    expectCleanHeaders(res);
  });

  it('returns exactly { status, message } for emergency', async () => {
    const item = makeJobItem('emergency');
    seed(item);
    const res = await call(item.id);
    expect(res.status).toBe(200);
    const body: unknown = await res.json();
    expect(body).toEqual({ status: 'emergency', message: EMERGENCY_MESSAGE });
    expect(Object.keys(body as object).sort()).toEqual(['message', 'status']);
    expectCleanHeaders(res);
  });

  it('every view passes homeownerStatusViewSchema and exposes no internal fields', async () => {
    const statuses: JobStatus[] = ['new', 'info_requested', 'accepted', 'declined', 'booked', 'emergency'];
    for (const status of statuses) {
      holder.fake = createFakeDynamoTable();
      const item = makeJobItem(status);
      seed(item);
      const res = await call(item.id);
      const body: unknown = await res.json();
      expect(homeownerStatusViewSchema.safeParse(body).success).toBe(true);
      const text = JSON.stringify(body);
      for (const forbidden of ['diySteps', 's3Keys', 'isEmergency', 'ttl', 'GSI1PK', 'replyCount', 'jobBrief']) {
        expect(text).not.toContain(forbidden);
      }
    }
  });

  it('returns the emergency body when only urgency says emergency', async () => {
    const item = makeJobItem('accepted', { urgency: 'emergency' });
    seed(item);
    const res = await call(item.id);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ status: 'emergency', message: EMERGENCY_MESSAGE });
    expectCleanHeaders(res);
  });

  it('returns the emergency body when only isEmergency is true', async () => {
    const item = makeJobItem('accepted', { isEmergency: true });
    seed(item);
    const res = await call(item.id);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ status: 'emergency', message: EMERGENCY_MESSAGE });
    expectCleanHeaders(res);
  });

  it('returns the same 404 body for a non-UUID and an unknown UUID', async () => {
    const bad = await call('not-a-uuid');
    const unknown = await call(UNKNOWN_ID);
    expect(bad.status).toBe(404);
    expect(unknown.status).toBe(404);
    const badBody: unknown = await bad.json();
    expect(badBody).toEqual(await unknown.json());
    expect(badBody).toMatchObject({ error: 'NOT_FOUND', message: ERROR_MESSAGES.NOT_FOUND });
    expectCleanHeaders(bad);
    expectCleanHeaders(unknown);
    // A malformed id never reaches the table.
    expect(holder.fake.calls).toHaveLength(1);
  });

  it('returns 404 for a legacy job without status', async () => {
    const legacy = makeLegacyJobItem();
    seed(legacy);
    const res = await call(legacy.id as string);
    expect(res.status).toBe(404);
    expect(await res.json()).toMatchObject({ error: 'NOT_FOUND', message: ERROR_MESSAGES.NOT_FOUND });
    expectCleanHeaders(res);
  });

  it('returns 500 RESULT_INVALID for a stored job that fails validation', async () => {
    const item = makeJobItem('new', { likelyIssue: 42 as unknown as string });
    seed(item);
    const res = await call(item.id);
    expect(res.status).toBe(500);
    expect(await res.json()).toMatchObject({ error: 'RESULT_INVALID', message: ERROR_MESSAGES.RESULT_INVALID });
    expectCleanHeaders(res);
  });

  it('returns 500 LOAD_FAILED on a DynamoDB failure and logs only the error name', async () => {
    const item = makeJobItem('new');
    seed(item);
    const secret = 'super-secret-value-123';
    const err = new Error(`boom ${secret} hhi_session=abc ${item.answers.location}`);
    err.name = 'ThrottlingException';
    holder.fake.send = () => Promise.reject(err);

    const res = await call(item.id);
    expect(res.status).toBe(500);
    expect(await res.json()).toMatchObject({ error: 'LOAD_FAILED', message: ERROR_MESSAGES.LOAD_FAILED.status });
    expectCleanHeaders(res);

    const logged = spies.loggedText();
    expect(logged).toContain('ThrottlingException');
    expect(logged).not.toContain(secret);
    expect(logged).not.toContain('hhi_session');
    expect(logged).not.toContain(item.answers.location);
    expect(logged).not.toContain(item.id);
  });

  it('does not import the rate limiter', async () => {
    // The throwing mock factory above would make the import of this route fail.
    const item = makeJobItem('new');
    seed(item);
    const res = await call(item.id);
    expect(res.status).toBe(200);
  });
});
