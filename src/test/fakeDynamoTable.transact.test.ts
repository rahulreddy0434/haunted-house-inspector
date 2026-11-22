import { describe, expect, it } from 'vitest';
import { QueryCommand, TransactWriteCommand } from '@aws-sdk/lib-dynamodb';
import { TransactionCanceledException } from '@aws-sdk/client-dynamodb';
import { createFakeDynamoTable } from '@/test/fakeDynamoTable';
import { makeChatItem, makeJobItem } from '@/test/jobFixtures';

const ID = '11111111-1111-4111-8111-111111111111';

function sendTx(fake: ReturnType<typeof createFakeDynamoTable>, seq: number, expectedSeq: number | undefined) {
  return fake.send(
    new TransactWriteCommand({
      TransactItems: [
        { Put: { TableName: 't', Item: makeChatItem(ID, seq), ConditionExpression: 'attribute_not_exists(PK)' } },
        {
          Update: {
            TableName: 't',
            Key: { PK: `JOB#${ID}`, SK: `JOB#${ID}` },
            UpdateExpression: 'SET chatSeq = :seq',
            ConditionExpression: expectedSeq === undefined ? 'attribute_not_exists(chatSeq)' : 'chatSeq = :read',
            ExpressionAttributeValues: expectedSeq === undefined ? { ':seq': seq } : { ':seq': seq, ':read': expectedSeq },
          },
        },
      ],
    }),
  );
}

describe('fakeDynamoTable transactions and main-table query', () => {
  it('commits both writes, and a failed condition writes nothing', async () => {
    const fake = createFakeDynamoTable();
    fake.seed({ ...makeJobItem('new', { id: ID }) });
    await sendTx(fake, 1, undefined);
    expect(fake.get(`JOB#${ID}`)?.chatSeq).toBe(1);
    expect(fake.get(`JOB#${ID}`, 'CHAT#000001')).toBeDefined();

    const error = await sendTx(fake, 2, 0).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(TransactionCanceledException);
    const reasons = (error as TransactionCanceledException).CancellationReasons;
    expect(reasons?.map((r) => r.Code)).toEqual(['None', 'ConditionalCheckFailed']);
    expect(fake.get(`JOB#${ID}`, 'CHAT#000002')).toBeUndefined();
    expect(fake.get(`JOB#${ID}`)?.chatSeq).toBe(1);
  });

  it('queries the main table by SK range, ascending, with Limit', async () => {
    const fake = createFakeDynamoTable();
    fake.seed({ ...makeJobItem('new', { id: ID }) });
    for (const seq of [3, 1, 2]) fake.seed(makeChatItem(ID, seq) as unknown as Record<string, unknown>);
    const out = await fake.send(
      new QueryCommand({
        TableName: 't',
        KeyConditionExpression: 'PK = :pk AND SK BETWEEN :lo AND :hi',
        ExpressionAttributeValues: { ':pk': `JOB#${ID}`, ':lo': 'CHAT#000002', ':hi': 'CHAT#999999' },
        ConsistentRead: true,
        Limit: 1,
      }),
    );
    expect((out.Items as Array<{ seq: number }>).map((i) => i.seq)).toEqual([2]);
  });

  it('still throws on other unsupported commands', async () => {
    const fake = createFakeDynamoTable();
    class ScanCommand {
      input = {};
    }
    await expect(fake.send(new ScanCommand())).rejects.toThrow(/guard/);
  });
});
