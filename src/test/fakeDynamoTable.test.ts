// @vitest-environment node
import { describe, expect, it } from 'vitest';
import {
  BatchWriteCommand,
  DeleteCommand,
  GetCommand,
  PutCommand,
  QueryCommand,
  ScanCommand,
  UpdateCommand,
} from '@aws-sdk/lib-dynamodb';
import { ConditionalCheckFailedException } from '@aws-sdk/client-dynamodb';
import { createFakeDynamoTable, type FakeItem } from './fakeDynamoTable';

const TABLE = 'jobs';
const key = (id: string) => ({ PK: `JOB#${id}`, SK: `JOB#${id}` });

function setup(item?: FakeItem) {
  const fake = createFakeDynamoTable();
  if (item) fake.seed({ ...key('a'), ...item });
  const update = (input: Record<string, unknown>, id = 'a') =>
    fake.send(new UpdateCommand({ TableName: TABLE, Key: key(id), ...input } as ConstructorParameters<typeof UpdateCommand>[0]));
  return { fake, update };
}

describe('Get and Put', () => {
  it('puts, gets a deep copy, and returns nothing for a missing key', async () => {
    const { fake } = setup();
    await fake.send(new PutCommand({ TableName: TABLE, Item: { ...key('a'), list: [1] } }));
    const got = (await fake.send(new GetCommand({ TableName: TABLE, Key: key('a') }))) as { Item: FakeItem };
    expect(got.Item.list).toEqual([1]);
    (got.Item.list as number[]).push(2);
    expect(fake.get('JOB#a')?.list).toEqual([1]);
    expect(await fake.send(new GetCommand({ TableName: TABLE, Key: key('zzz') }))).toEqual({});
  });

  it('Put honours a condition', async () => {
    const { fake } = setup({ v: 1 });
    await expect(
      fake.send(
        new PutCommand({ TableName: TABLE, Item: { ...key('a'), v: 2 }, ConditionExpression: 'attribute_not_exists(PK)' }),
      ),
    ).rejects.toBeInstanceOf(ConditionalCheckFailedException);
    expect(fake.get('JOB#a')?.v).toBe(1);
  });
});

describe('UpdateExpression grammar', () => {
  it('SET with literals, #alias and ALL_NEW', async () => {
    const { update } = setup({ a: 1 });
    const res = (await update({
      UpdateExpression: 'SET #s = :s, b = :b, c = :c',
      ExpressionAttributeNames: { '#s': 'status' },
      ExpressionAttributeValues: { ':s': 'new', ':b': [1, 2], ':c': { x: 1 } },
      ReturnValues: 'ALL_NEW',
    })) as { Attributes: FakeItem };
    expect(res.Attributes).toMatchObject({ a: 1, status: 'new', b: [1, 2], c: { x: 1 } });
  });

  it('SET creates the item when absent', async () => {
    const { fake, update } = setup();
    await update({ UpdateExpression: 'SET x = :x', ExpressionAttributeValues: { ':x': 1 } });
    expect(fake.get('JOB#a')).toEqual({ ...key('a'), x: 1 });
  });

  it('if_not_exists keeps an existing value and uses the fallback otherwise', async () => {
    const { fake, update } = setup({ keep: 'old' });
    await update({
      UpdateExpression: 'SET keep = if_not_exists(keep, :n), fresh = if_not_exists(fresh, :n)',
      ExpressionAttributeValues: { ':n': 'new' },
    });
    expect(fake.get('JOB#a')).toMatchObject({ keep: 'old', fresh: 'new' });
  });

  it('list_append with if_not_exists, on an absent and a present list', async () => {
    const { fake, update } = setup();
    const input = {
      UpdateExpression: 'SET l = list_append(if_not_exists(l, :empty), :q)',
      ExpressionAttributeValues: { ':empty': [], ':q': ['x'] },
    };
    await update(input);
    await update(input);
    expect(fake.get('JOB#a')?.l).toEqual(['x', 'x']);
  });

  it('+ and - arithmetic, and a missing operand throws', async () => {
    const { fake, update } = setup({ n: 5 });
    await update({ UpdateExpression: 'SET n = n + :one, m = n - :one', ExpressionAttributeValues: { ':one': 1 } });
    // both read the pre-update item
    expect(fake.get('JOB#a')).toMatchObject({ n: 6, m: 4 });
    await expect(
      update({ UpdateExpression: 'SET q = nothing + :one', ExpressionAttributeValues: { ':one': 1 } }),
    ).rejects.toThrow(/needs two numbers/);
  });

  it('ADD creates and increments a number', async () => {
    const { fake, update } = setup();
    const input = { UpdateExpression: 'ADD cnt :one', ExpressionAttributeValues: { ':one': 1 } };
    await update(input);
    await update(input);
    expect(fake.get('JOB#a')?.cnt).toBe(2);
  });

  it('REMOVE deletes attributes, including absent ones', async () => {
    const { fake, update } = setup({ a: 1, b: 2, c: 3 });
    await update({ UpdateExpression: 'REMOVE a, b, never' });
    const item = fake.get('JOB#a')!;
    expect(item.a).toBeUndefined();
    expect(item.b).toBeUndefined();
    expect(item.c).toBe(3);
  });

  it('combines SET, ADD and REMOVE clauses in one expression', async () => {
    const { fake, update } = setup({ gone: 1 });
    await update({
      UpdateExpression: 'SET x = :x ADD cnt :one REMOVE gone',
      ExpressionAttributeValues: { ':x': 'v', ':one': 1 },
    });
    expect(fake.get('JOB#a')).toMatchObject({ x: 'v', cnt: 1 });
    expect(fake.get('JOB#a')?.gone).toBeUndefined();
  });

  it('stores copies of the input values', async () => {
    const { fake, update } = setup();
    const list = ['a'];
    await update({ UpdateExpression: 'SET l = :l', ExpressionAttributeValues: { ':l': list } });
    list.push('b');
    expect(fake.get('JOB#a')?.l).toEqual(['a']);
  });
});

describe('ConditionExpression', () => {
  const check = async (cond: string, item: FakeItem | undefined, values: Record<string, unknown> = {}) => {
    const { update } = setup(item);
    try {
      await update({
        UpdateExpression: 'SET touched = :t',
        ConditionExpression: cond,
        ExpressionAttributeNames: { '#s': 'status' },
        ExpressionAttributeValues: { ':t': true, ...values },
      });
      return true;
    } catch (e) {
      if (e instanceof ConditionalCheckFailedException) return false;
      throw e;
    }
  };

  it('attribute_exists / attribute_not_exists', async () => {
    expect(await check('attribute_exists(PK)', {})).toBe(true);
    expect(await check('attribute_exists(PK)', undefined)).toBe(false);
    expect(await check('attribute_not_exists(PK)', undefined)).toBe(true);
    expect(await check('attribute_not_exists(#s)', {})).toBe(true);
    expect(await check('attribute_not_exists(#s)', { status: 'x' })).toBe(false);
  });

  it.each([
    ['=', 3, true],
    ['=', 4, false],
    ['<>', 4, true],
    ['<>', 3, false],
    ['<', 4, true],
    ['<', 3, false],
    ['<=', 3, true],
    ['<=', 2, false],
    ['>', 2, true],
    ['>', 3, false],
    ['>=', 3, true],
    ['>=', 4, false],
  ])('n %s :v with :v=%i is %s', async (op, v, expected) => {
    expect(await check(`n ${op} :v`, { n: 3 }, { ':v': v })).toBe(expected);
  });

  it('compares strings, and a missing attribute never compares true', async () => {
    expect(await check('#s = :v', { status: 'new' }, { ':v': 'new' })).toBe(true);
    expect(await check('#s <> :v', { status: 'new' }, { ':v': 'x' })).toBe(true);
    expect(await check('#s <> :v', {}, { ':v': 'x' })).toBe(false);
    expect(await check('n < :v', {}, { ':v': 1 })).toBe(false);
  });

  it('AND, OR and parentheses', async () => {
    const item = { status: 'new', n: 1 };
    const v = { ':new': 'new', ':two': 2, ':five': 5 };
    expect(await check('#s = :new AND n > :two', item, v)).toBe(false);
    expect(await check('#s = :new OR n > :two', item, v)).toBe(true);
    expect(await check('n > :two OR n > :five AND #s = :new', item, v)).toBe(false);
    expect(await check('(n > :two OR #s = :new) AND n < :five', item, v)).toBe(true);
    expect(await check('(n > :two OR n > :five) AND #s = :new', item, v)).toBe(false);
  });

  it('a false condition throws ConditionalCheckFailedException and leaves the item unchanged', async () => {
    const { fake, update } = setup({ n: 1 });
    const before = fake.get('JOB#a');
    await expect(
      update({
        UpdateExpression: 'SET n = :two, other = :two REMOVE n',
        ConditionExpression: 'n > :two',
        ExpressionAttributeValues: { ':two': 2 },
      }),
    ).rejects.toBeInstanceOf(ConditionalCheckFailedException);
    expect(fake.get('JOB#a')).toEqual(before);
  });

  it('a false condition on a missing item does not create it', async () => {
    const { fake, update } = setup();
    await expect(
      update({ UpdateExpression: 'SET x = :x', ConditionExpression: 'attribute_exists(PK)', ExpressionAttributeValues: { ':x': 1 } }),
    ).rejects.toBeInstanceOf(ConditionalCheckFailedException);
    expect(fake.items.size).toBe(0);
  });
});

describe("the design's real expressions", () => {
  const names = { '#status': 'status' };

  it('transition (ask-info) succeeds on the expected status and fails on a stale one', async () => {
    const { fake, update } = setup({ status: 'new', ttl: 99 });
    const input = (expected: string) => ({
      UpdateExpression:
        'SET #status = :next, statusUpdatedAt = :now, infoRequests = list_append(if_not_exists(infoRequests, :empty), :q)',
      ConditionExpression: 'attribute_exists(PK) AND #status = :expected',
      ExpressionAttributeNames: names,
      ExpressionAttributeValues: {
        ':next': 'info_requested',
        ':now': 'T1',
        ':expected': expected,
        ':empty': [],
        ':q': [{ question: 'Where?', askedAt: 'T1' }],
      },
    });
    await expect(update(input('accepted'))).rejects.toBeInstanceOf(ConditionalCheckFailedException);
    expect(fake.get('JOB#a')?.status).toBe('new');
    await update(input('new'));
    expect(fake.get('JOB#a')).toMatchObject({
      status: 'info_requested',
      statusUpdatedAt: 'T1',
      infoRequests: [{ question: 'Where?', askedAt: 'T1' }],
      ttl: 99,
    });
  });

  it('transition (accept) on a missing job fails the attribute_exists check', async () => {
    const { fake, update } = setup();
    await expect(
      update({
        UpdateExpression: 'SET #status = :next, statusUpdatedAt = :now, offeredSlots = :slots',
        ConditionExpression: 'attribute_exists(PK) AND #status = :expected',
        ExpressionAttributeNames: names,
        ExpressionAttributeValues: { ':next': 'accepted', ':now': 'T', ':expected': 'new', ':slots': ['s'] },
      }),
    ).rejects.toBeInstanceOf(ConditionalCheckFailedException);
    expect(fake.items.size).toBe(0);
  });

  const reply = {
    UpdateExpression:
      'SET #status = :new, statusUpdatedAt = :now, replies = list_append(if_not_exists(replies, :empty), :r), replyCount = replyCount + :one',
    ConditionExpression: 'attribute_exists(PK) AND #status = :infoRequested AND replyCount < :five',
    ExpressionAttributeNames: names,
    ExpressionAttributeValues: {
      ':new': 'new',
      ':now': 'T2',
      ':empty': [],
      ':r': [{ text: 'hi', at: 'T2' }],
      ':one': 1,
      ':five': 5,
      ':infoRequested': 'info_requested',
    },
  };

  it('reply appends, increments replyCount and flips the status', async () => {
    const { fake, update } = setup({ status: 'info_requested', replyCount: 0 });
    await update(reply);
    expect(fake.get('JOB#a')).toMatchObject({ status: 'new', replyCount: 1, replies: [{ text: 'hi', at: 'T2' }] });
  });

  it('reply is refused at replyCount 5 and in the wrong status', async () => {
    const full = setup({ status: 'info_requested', replyCount: 5 });
    await expect(full.update(reply)).rejects.toBeInstanceOf(ConditionalCheckFailedException);
    expect(full.fake.get('JOB#a')?.replyCount).toBe(5);
    const wrong = setup({ status: 'new', replyCount: 0 });
    await expect(wrong.update(reply)).rejects.toBeInstanceOf(ConditionalCheckFailedException);
  });

  const booking = (slot: string) => ({
    UpdateExpression: 'SET #status = :booked, statusUpdatedAt = :now, bookedSlot = :slot, bookedAt = :now',
    ConditionExpression: 'attribute_exists(PK) AND #status = :accepted',
    ExpressionAttributeNames: names,
    ExpressionAttributeValues: { ':booked': 'booked', ':now': 'T3', ':slot': slot, ':accepted': 'accepted' },
  });

  it('booking sets the slot, leaves offeredSlots and ttl, and cannot happen twice', async () => {
    const { fake, update } = setup({ status: 'accepted', offeredSlots: ['s1', 's2'], ttl: 7 });
    await update(booking('s1'));
    expect(fake.get('JOB#a')).toMatchObject({
      status: 'booked',
      bookedSlot: 's1',
      bookedAt: 'T3',
      offeredSlots: ['s1', 's2'],
      ttl: 7,
    });
    await expect(update(booking('s2'))).rejects.toBeInstanceOf(ConditionalCheckFailedException);
    expect(fake.get('JOB#a')?.bookedSlot).toBe('s1');
  });

  const override = (withReply: boolean) => ({
    UpdateExpression: withReply
      ? 'SET #status = :emergency, statusUpdatedAt = :now, urgency = :emergency, isEmergency = :true, ' +
        'costRangeLow = :zero, costRangeHigh = :zero, jobBrief = :emptyStr, diySteps = :emptyList, ' +
        'replies = list_append(if_not_exists(replies, :emptyList), :r) ' +
        'ADD replyCount :one ' +
        'REMOVE offeredSlots, bookedSlot, bookedAt'
      : 'SET #status = :emergency, statusUpdatedAt = :now, urgency = :emergency, isEmergency = :true, ' +
        'costRangeLow = :zero, costRangeHigh = :zero, jobBrief = :emptyStr, diySteps = :emptyList ' +
        'REMOVE offeredSlots, bookedSlot, bookedAt',
    ConditionExpression: withReply
      ? 'attribute_exists(PK) AND (attribute_not_exists(#status) OR #status <> :emergency) ' +
        'AND (attribute_not_exists(replyCount) OR replyCount < :five)'
      : 'attribute_exists(PK) AND (attribute_not_exists(#status) OR #status <> :emergency)',
    ExpressionAttributeNames: names,
    ExpressionAttributeValues: {
      ':emergency': 'emergency',
      ':now': 'T4',
      ':true': true,
      ':zero': 0,
      ':emptyStr': '',
      ':emptyList': [],
      ':one': 1,
      ':five': 5,
      ...(withReply ? { ':r': [{ text: 'smell gas', at: 'T4' }] } : {}),
    },
  });

  it('safety override attempt A rewrites the job, appends the reply and removes booking fields', async () => {
    const { fake, update } = setup({
      status: 'booked',
      urgency: 'soon',
      jobBrief: 'brief',
      diySteps: ['x'],
      offeredSlots: ['s'],
      bookedSlot: 's',
      bookedAt: 'T',
      replyCount: 2,
      replies: [{ text: 'a', at: 'T0' }],
      declineReason: 'keep',
      ttl: 5,
    });
    await update(override(true));
    const item = fake.get('JOB#a')!;
    expect(item).toMatchObject({
      status: 'emergency',
      urgency: 'emergency',
      isEmergency: true,
      costRangeLow: 0,
      costRangeHigh: 0,
      jobBrief: '',
      diySteps: [],
      replyCount: 3,
      declineReason: 'keep',
      ttl: 5,
    });
    expect(item.replies).toHaveLength(2);
    for (const gone of ['offeredSlots', 'bookedSlot', 'bookedAt']) expect(item[gone]).toBeUndefined();
  });

  it('safety override works on a legacy item with no status or replyCount', async () => {
    const { fake, update } = setup({ urgency: 'soon' });
    await update(override(true));
    expect(fake.get('JOB#a')).toMatchObject({ status: 'emergency', replyCount: 1, replies: [{ text: 'smell gas', at: 'T4' }] });
  });

  it('attempt A fails at replyCount 5, attempt B still overrides without the reply; then both skip', async () => {
    const { fake, update } = setup({ status: 'new', replyCount: 5, replies: [1, 2, 3, 4, 5], offeredSlots: ['s'] });
    await expect(update(override(true))).rejects.toBeInstanceOf(ConditionalCheckFailedException);
    expect(fake.get('JOB#a')?.status).toBe('new');
    await update(override(false));
    const item = fake.get('JOB#a')!;
    expect(item).toMatchObject({ status: 'emergency', replyCount: 5 });
    expect(item.replies).toHaveLength(5);
    expect(item.offeredSlots).toBeUndefined();
    await expect(update(override(false))).rejects.toBeInstanceOf(ConditionalCheckFailedException);
  });

  it('safety override on a missing job is refused and creates nothing', async () => {
    const { fake, update } = setup();
    await expect(update(override(false))).rejects.toBeInstanceOf(ConditionalCheckFailedException);
    expect(fake.items.size).toBe(0);
  });

  describe('lockout counter', () => {
    const lockKey = { PK: 'PROAUTH#h', SK: 'PROAUTH#h' };
    const NOW = 1_000_000_000;
    const step1 = (now: number) => ({
      UpdateExpression: 'ADD #count :one SET windowStart = if_not_exists(windowStart, :now), #ttl = if_not_exists(#ttl, :ttl)',
      ConditionExpression: 'attribute_not_exists(windowStart) OR (windowStart > :cutoff AND #count < :max)',
      ExpressionAttributeNames: { '#count': 'count', '#ttl': 'ttl' },
      ExpressionAttributeValues: {
        ':one': 1,
        ':now': now,
        ':ttl': Math.floor((now + 900000) / 1000),
        ':cutoff': now - 900000,
        ':max': 5,
      },
      ReturnValues: 'ALL_NEW',
    });
    const send = (fake: ReturnType<typeof createFakeDynamoTable>, input: Record<string, unknown>) =>
      fake.send(new UpdateCommand({ TableName: TABLE, Key: lockKey, ...input } as ConstructorParameters<typeof UpdateCommand>[0]));

    it('step 1 creates the item, then admits until count reaches 5, then refuses', async () => {
      const fake = createFakeDynamoTable();
      const first = (await send(fake, step1(NOW))) as { Attributes: FakeItem };
      expect(first.Attributes).toMatchObject({ count: 1, windowStart: NOW, ttl: Math.floor((NOW + 900000) / 1000) });
      for (let i = 2; i <= 5; i++) {
        const r = (await send(fake, step1(NOW + i))) as { Attributes: FakeItem };
        expect(r.Attributes.count).toBe(i);
        expect(r.Attributes.windowStart).toBe(NOW);
      }
      await expect(send(fake, step1(NOW + 10))).rejects.toBeInstanceOf(ConditionalCheckFailedException);
      expect(fake.get('PROAUTH#h')?.count).toBe(5);
    });

    it('step 1 refuses an expired window; step 2 starts a new one only if it really ended', async () => {
      const fake = createFakeDynamoTable();
      fake.seed({ ...lockKey, count: 5, windowStart: NOW, ttl: 1 });
      const later = NOW + 900001;
      await expect(send(fake, step1(later))).rejects.toBeInstanceOf(ConditionalCheckFailedException);
      const step2 = (now: number) => ({
        UpdateExpression: 'SET #count = :one, windowStart = :now, #ttl = :ttl',
        ConditionExpression: 'windowStart <= :cutoff',
        ExpressionAttributeNames: { '#count': 'count', '#ttl': 'ttl' },
        ExpressionAttributeValues: { ':one': 1, ':now': now, ':ttl': 42, ':cutoff': now - 900000 },
      });
      await expect(send(fake, step2(NOW + 10))).rejects.toBeInstanceOf(ConditionalCheckFailedException);
      await send(fake, step2(later));
      expect(fake.get('PROAUTH#h')).toMatchObject({ count: 1, windowStart: later, ttl: 42 });
      // a second compare-and-set in the same new window loses the race
      await expect(send(fake, step2(later + 1))).rejects.toBeInstanceOf(ConditionalCheckFailedException);
    });

    it('release decrements, never below 0 and never into a newer window', async () => {
      const fake = createFakeDynamoTable();
      fake.seed({ ...lockKey, count: 1, windowStart: NOW });
      const release = (ws: number) => ({
        UpdateExpression: 'SET #count = #count - :one',
        ConditionExpression: 'attribute_exists(PK) AND #count > :zero AND windowStart = :ws',
        ExpressionAttributeNames: { '#count': 'count' },
        ExpressionAttributeValues: { ':one': 1, ':zero': 0, ':ws': ws },
      });
      await expect(send(fake, release(NOW + 1))).rejects.toBeInstanceOf(ConditionalCheckFailedException);
      await send(fake, release(NOW));
      expect(fake.get('PROAUTH#h')?.count).toBe(0);
      await expect(send(fake, release(NOW))).rejects.toBeInstanceOf(ConditionalCheckFailedException);
      expect(fake.get('PROAUTH#h')?.count).toBe(0);
    });
  });
});

describe('sparse GSI1 query', () => {
  const job = (id: string, createdAt: string, extra: FakeItem = {}): FakeItem => ({
    ...key(id),
    GSI1PK: 'JOBS',
    GSI1SK: createdAt,
    id,
    createdAt,
    urgency: 'soon',
    isEmergency: false,
    trade: 'plumber',
    status: 'new',
    answers: { room: 'kitchen' },
    jobBrief: 'secret brief',
    diySteps: ['step'],
    s3Keys: ['k'],
    ...extra,
  });
  const query = (fake: ReturnType<typeof createFakeDynamoTable>, extra: Record<string, unknown> = {}) =>
    fake.send(
      new QueryCommand({
        TableName: TABLE,
        IndexName: 'GSI1',
        KeyConditionExpression: 'GSI1PK = :pk AND GSI1SK > :since',
        ExpressionAttributeValues: { ':pk': 'JOBS', ':since': '2026-01-01T00:00:00.000Z' },
        ...extra,
      }),
    ) as Promise<{ Items: FakeItem[]; Count: number }>;

  it('excludes items without GSI1PK, orders newest first, honours Limit and the lower bound', async () => {
    const fake = createFakeDynamoTable({ allowRateLimitWrites: true });
    fake.seed(job('1', '2026-03-01T00:00:00.000Z'));
    fake.seed(job('2', '2026-05-01T00:00:00.000Z'));
    fake.seed(job('3', '2026-04-01T00:00:00.000Z'));
    fake.seed(job('old', '2025-12-31T23:59:59.999Z'));
    fake.seed({ PK: 'RATELIMIT#x', SK: 'RATELIMIT#x', count: 1 });
    fake.seed({ PK: 'PROAUTH#x', SK: 'PROAUTH#x', count: 1 });
    fake.seed({ ...key('legacy'), createdAt: '2026-06-01T00:00:00.000Z', urgency: 'soon' });

    const desc = await query(fake, { ScanIndexForward: false });
    expect(desc.Items.map((i) => i.id)).toEqual(['2', '3', '1']);
    expect(desc.Count).toBe(3);

    const asc = await query(fake, { ScanIndexForward: true });
    expect(asc.Items.map((i) => i.id)).toEqual(['1', '3', '2']);

    const limited = await query(fake, { ScanIndexForward: false, Limit: 2 });
    expect(limited.Items.map((i) => i.id)).toEqual(['2', '3']);
  });

  it('the lower bound is exclusive', async () => {
    const fake = createFakeDynamoTable();
    fake.seed(job('edge', '2026-01-01T00:00:00.000Z'));
    fake.seed(job('after', '2026-01-01T00:00:00.001Z'));
    expect((await query(fake)).Items.map((i) => i.id)).toEqual(['after']);
  });

  it('projects keys and INCLUDE attributes only', async () => {
    const fake = createFakeDynamoTable();
    fake.seed(job('1', '2026-03-01T00:00:00.000Z'));
    const [item] = (await query(fake)).Items;
    expect(Object.keys(item).sort()).toEqual(
      ['GSI1PK', 'GSI1SK', 'PK', 'SK', 'answers', 'createdAt', 'id', 'isEmergency', 'status', 'trade', 'urgency'].sort(),
    );
    for (const hidden of ['jobBrief', 'diySteps', 's3Keys']) expect(item).not.toHaveProperty(hidden);
  });

  it('rejects a query on another index or an unsupported key condition', async () => {
    const fake = createFakeDynamoTable();
    await expect(
      fake.send(new QueryCommand({ TableName: TABLE, KeyConditionExpression: 'PK = :pk', ExpressionAttributeValues: { ':pk': 'x' } })),
    ).rejects.toThrow(/GSI1/);
    await expect(query(fake, { KeyConditionExpression: 'GSI1PK = :pk' })).rejects.toThrow(/unsupported key condition/);
  });
});

describe('guard', () => {
  it('fails on ScanCommand, DeleteCommand and BatchWriteCommand, and records them', async () => {
    const fake = createFakeDynamoTable();
    await expect(fake.send(new ScanCommand({ TableName: TABLE }))).rejects.toThrow(/ScanCommand/);
    await expect(fake.send(new DeleteCommand({ TableName: TABLE, Key: key('a') }))).rejects.toThrow(/DeleteCommand/);
    await expect(
      fake.send(new BatchWriteCommand({ RequestItems: { [TABLE]: [{ PutRequest: { Item: key('a') } }] } })),
    ).rejects.toThrow(/BatchWriteCommand/);
    expect(fake.calls.map((c) => c.name)).toEqual(['ScanCommand', 'DeleteCommand', 'BatchWriteCommand']);
  });

  it('throws on a RATELIMIT# write unless allowRateLimitWrites, but reads are fine', async () => {
    const strict = createFakeDynamoTable();
    const rl = { PK: 'RATELIMIT#ip', SK: 'RATELIMIT#ip' };
    await expect(strict.send(new PutCommand({ TableName: TABLE, Item: { ...rl, count: 1 } }))).rejects.toThrow(/RATELIMIT#/);
    await expect(
      strict.send(
        new UpdateCommand({ TableName: TABLE, Key: rl, UpdateExpression: 'ADD c :one', ExpressionAttributeValues: { ':one': 1 } }),
      ),
    ).rejects.toThrow(/RATELIMIT#/);
    expect(strict.items.size).toBe(0);
    await expect(strict.send(new GetCommand({ TableName: TABLE, Key: rl }))).resolves.toEqual({});

    const lenient = createFakeDynamoTable({ allowRateLimitWrites: true });
    await lenient.send(new PutCommand({ TableName: TABLE, Item: { ...rl, count: 1 } }));
    expect(lenient.get('RATELIMIT#ip')?.count).toBe(1);
  });
});

describe('reserved words and unsupported syntax', () => {
  it.each(['status', 'count', 'ttl'])('%s without a # alias throws; with an alias it works', async (word) => {
    const { fake, update } = setup({});
    await expect(update({ UpdateExpression: `SET ${word} = :v`, ExpressionAttributeValues: { ':v': 1 } })).rejects.toThrow(
      /reserved word/,
    );
    await expect(
      update({
        UpdateExpression: 'SET x = :v',
        ConditionExpression: `${word} = :v`,
        ExpressionAttributeValues: { ':v': 1 },
      }),
    ).rejects.toThrow(/reserved word/);
    await update({
      UpdateExpression: 'SET #w = :v',
      ExpressionAttributeNames: { '#w': word },
      ExpressionAttributeValues: { ':v': 1 },
    });
    expect(fake.get('JOB#a')?.[word]).toBe(1);
  });

  it('throws a clear error on an unsupported token, clause or function', async () => {
    const { update } = setup({ a: 1 });
    await expect(update({ UpdateExpression: 'SET a = :v * 2', ExpressionAttributeValues: { ':v': 1 } })).rejects.toThrow(
      /unsupported token/,
    );
    await expect(update({ UpdateExpression: 'DELETE a :v', ExpressionAttributeValues: { ':v': 1 } })).rejects.toThrow(
      /unsupported update clause/,
    );
    await expect(
      update({ UpdateExpression: 'SET a = :v', ConditionExpression: 'size(a) > :v', ExpressionAttributeValues: { ':v': 1 } }),
    ).rejects.toThrow(/unsupported function/);
    await expect(
      update({ UpdateExpression: 'SET a = :missing', ExpressionAttributeValues: { ':v': 1 } }),
    ).rejects.toThrow(/unresolved value placeholder/);
    await expect(update({ UpdateExpression: 'SET #n = :v', ExpressionAttributeValues: { ':v': 1 } })).rejects.toThrow(
      /unresolved name placeholder/,
    );
  });
});

describe('hold / release gating and call recording', () => {
  const tick = () => new Promise<void>((r) => setTimeout(r, 0));

  it('two held updates both wait, then exactly one wins the conditional race', async () => {
    const { fake, update } = setup({ status: 'accepted' });
    const book = (slot: string) =>
      update({
        UpdateExpression: 'SET #status = :booked, bookedSlot = :slot',
        ConditionExpression: 'attribute_exists(PK) AND #status = :accepted',
        ExpressionAttributeNames: { '#status': 'status' },
        ExpressionAttributeValues: { ':booked': 'booked', ':slot': slot, ':accepted': 'accepted' },
      });
    fake.hold('UpdateCommand');
    const a = book('s1').then(
      () => 'ok',
      (e: unknown) => (e instanceof ConditionalCheckFailedException ? 'lost' : 'error'),
    );
    const b = book('s2').then(
      () => 'ok',
      (e: unknown) => (e instanceof ConditionalCheckFailedException ? 'lost' : 'error'),
    );
    await tick();
    expect(fake.heldCount()).toBe(2);
    expect(fake.get('JOB#a')?.status).toBe('accepted');

    fake.release();
    const results = (await Promise.all([a, b])).sort();
    expect(results).toEqual(['lost', 'ok']);
    expect(fake.heldCount()).toBe(0);
    expect(fake.get('JOB#a')?.status).toBe('booked');
  });

  it('only holds the named command class', async () => {
    const { fake } = setup({ v: 1 });
    fake.hold('UpdateCommand');
    await expect(fake.send(new GetCommand({ TableName: TABLE, Key: key('a') }))).resolves.toHaveProperty('Item');
    expect(fake.heldCount()).toBe(0);
    fake.release();
  });

  it('records every command in order with its input', async () => {
    const { fake } = setup();
    await fake.send(new PutCommand({ TableName: TABLE, Item: key('a') }));
    await fake.send(new GetCommand({ TableName: TABLE, Key: key('a') }));
    expect(fake.calls.map((c) => c.name)).toEqual(['PutCommand', 'GetCommand']);
    expect(fake.calls[1].input).toMatchObject({ TableName: TABLE, Key: key('a') });
  });
});
