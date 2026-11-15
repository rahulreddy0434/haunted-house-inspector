import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createFakeDynamoTable, type FakeDynamoTable } from '@/test/fakeDynamoTable';
import { FIXTURE_NOW_MS, makeJobItem, makeLegacyJobItem } from '@/test/jobFixtures';

vi.mock('server-only', () => ({}));

const holder = vi.hoisted(() => ({ fake: null as unknown as FakeDynamoTable }));
vi.mock('@aws-sdk/lib-dynamodb', async (importOriginal) => {
  const { fakeDynamoMockFactory } = await import('@/test/fakeDynamoTable');
  return fakeDynamoMockFactory(() => holder.fake)(
    importOriginal as () => Promise<typeof import('@aws-sdk/lib-dynamodb')>,
  );
});

import { getJob, queryRecentJobs } from './jobs';

const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;
const FORBIDDEN = ['ScanCommand', 'DeleteCommand', 'BatchWriteCommand'];

/** Seeds the fake table (spread gives interface-typed fixtures an index signature). */
function seed(item: object): void {
  holder.fake.seed({ ...item });
}

function expectNoForbiddenCommands(): void {
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

describe('getJob', () => {
  it('sends one consistent GetCommand for the job key', async () => {
    const item = makeJobItem('new');
    seed(item);
    await getJob(item.id);
    expect(holder.fake.calls).toHaveLength(1);
    expect(holder.fake.calls[0].name).toBe('GetCommand');
    expect(holder.fake.calls[0].input).toMatchObject({
      TableName: 'test-table',
      Key: { PK: `JOB#${item.id}`, SK: `JOB#${item.id}` },
      ConsistentRead: true,
    });
    expectNoForbiddenCommands();
  });

  it('returns missing when there is no item', async () => {
    await expect(getJob('nope')).resolves.toEqual({ kind: 'missing' });
  });

  it('returns legacy for an item without a status', async () => {
    const legacy = makeLegacyJobItem();
    seed(legacy);
    await expect(getJob(String(legacy.id))).resolves.toEqual({ kind: 'legacy' });
  });

  it('returns invalid for an item that fails validation', async () => {
    const item = makeJobItem('new', { likelyIssue: 123 as unknown as string });
    seed(item);
    await expect(getJob(item.id)).resolves.toEqual({ kind: 'invalid' });
  });

  it('returns invalid for an unknown status', async () => {
    const item = makeJobItem('new', { status: 'bogus' as unknown as 'new' });
    seed(item);
    await expect(getJob(item.id)).resolves.toEqual({ kind: 'invalid' });
  });

  it('returns found with the job and strips key attributes', async () => {
    const item = makeJobItem('accepted');
    seed(item);
    const lookup = await getJob(item.id);
    expect(lookup.kind).toBe('found');
    if (lookup.kind !== 'found') return;
    expect(lookup.job.id).toBe(item.id);
    expect(lookup.job.status).toBe('accepted');
    expect(lookup.job.offeredSlots).toEqual(item.offeredSlots);
    expect(lookup.job).not.toHaveProperty('PK');
    expect(lookup.job).not.toHaveProperty('GSI1PK');
  });

  it('applies effectiveStatus: a stored "new" emergency job comes back as emergency', async () => {
    const item = makeJobItem('emergency');
    seed({ ...item, status: 'new' });
    const lookup = await getJob(item.id);
    expect(lookup.kind).toBe('found');
    if (lookup.kind === 'found') expect(lookup.job.status).toBe('emergency');
  });

  it('propagates a thrown DynamoDB error', async () => {
    const boom = new Error('dynamo down');
    holder.fake.send = () => Promise.reject(boom);
    await expect(getJob('x')).rejects.toBe(boom);
  });
});

describe('queryRecentJobs', () => {
  it('sends exactly one GSI1 QueryCommand with the expected input', async () => {
    await queryRecentJobs(FIXTURE_NOW_MS);
    expect(holder.fake.calls).toHaveLength(1);
    const [call] = holder.fake.calls;
    expect(call.name).toBe('QueryCommand');
    expect(call.input).toEqual({
      TableName: 'test-table',
      IndexName: 'GSI1',
      KeyConditionExpression: 'GSI1PK = :pk AND GSI1SK > :since',
      ExpressionAttributeValues: {
        ':pk': 'JOBS',
        ':since': new Date(FIXTURE_NOW_MS - THIRTY_DAYS_MS).toISOString(),
      },
      ScanIndexForward: false,
      Limit: 50,
    });
    expect(call.input).not.toHaveProperty('ExclusiveStartKey');
    expectNoForbiddenCommands();
  });

  it('returns an empty list when there are no items', async () => {
    await expect(queryRecentJobs(FIXTURE_NOW_MS)).resolves.toEqual([]);
  });

  it('returns fewer than 50 items newest first', async () => {
    const older = makeJobItem('new', { id: 'job-older', createdAt: new Date(FIXTURE_NOW_MS - 3 * 3600_000).toISOString() });
    const newer = makeJobItem('accepted', { id: 'job-newer', createdAt: new Date(FIXTURE_NOW_MS - 1000).toISOString() });
    seed(older);
    seed(newer);
    const list = await queryRecentJobs(FIXTURE_NOW_MS);
    expect(list.map((j) => j.id)).toEqual(['job-newer', 'job-older']);
  });

  it('returns at most 50 items when more exist, and never pages', async () => {
    for (let i = 0; i < 60; i++) {
      seed(
        makeJobItem('new', { id: `job-${i}`, createdAt: new Date(FIXTURE_NOW_MS - (i + 1) * 60_000).toISOString() }),
      );
    }
    const list = await queryRecentJobs(FIXTURE_NOW_MS);
    expect(list).toHaveLength(50);
    expect(list[0].id).toBe('job-0');
    expect(holder.fake.calls).toHaveLength(1);
  });

  it('excludes jobs older than the 30-day window', async () => {
    seed(
      makeJobItem('new', { id: 'old', createdAt: new Date(FIXTURE_NOW_MS - THIRTY_DAYS_MS - 1000).toISOString() }),
    );
    await expect(queryRecentJobs(FIXTURE_NOW_MS)).resolves.toEqual([]);
  });

  it('omits invalid items and logs a static line with no item data', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const bad = makeJobItem('new', { id: 'bad-job-secret', status: 'bogus' as unknown as 'new' });
    const good = makeJobItem('new', { id: 'good-job' });
    seed(bad);
    seed(good);
    const list = await queryRecentJobs(FIXTURE_NOW_MS);
    expect(list.map((j) => j.id)).toEqual(['good-job']);
    expect(spy).toHaveBeenCalledTimes(1);
    expect(spy).toHaveBeenCalledWith('Job list item failed validation');
  });

  it('never lists a legacy item or an item without GSI1PK', async () => {
    const legacy = makeLegacyJobItem();
    const { GSI1PK: _omit, ...preIndex } = makeJobItem('new', { id: 'pre-index' });
    void _omit;
    seed(legacy);
    seed(preIndex);
    const list = await queryRecentJobs(FIXTURE_NOW_MS);
    expect(list).toEqual([]);
    expectNoForbiddenCommands();
  });

  it('propagates a thrown DynamoDB error', async () => {
    const boom = new Error('dynamo down');
    holder.fake.send = () => Promise.reject(boom);
    await expect(queryRecentJobs(FIXTURE_NOW_MS)).rejects.toBe(boom);
  });
});

describe('fake table guard', () => {
  it('rejects Scan, Delete and BatchWrite commands', async () => {
    class ScanCommand {}
    class DeleteCommand {}
    class BatchWriteCommand {}
    for (const C of [ScanCommand, DeleteCommand, BatchWriteCommand]) {
      await expect(holder.fake.send(new C())).rejects.toThrow(/guard/);
    }
  });
});
