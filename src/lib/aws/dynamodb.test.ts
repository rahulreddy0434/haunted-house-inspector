import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

const sendMock = vi.hoisted(() => vi.fn());

vi.mock('@aws-sdk/lib-dynamodb', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@aws-sdk/lib-dynamodb')>();
  return {
    ...actual,
    DynamoDBDocumentClient: { from: () => ({ send: sendMock }) },
  };
});

import { GetCommand } from '@aws-sdk/lib-dynamodb';
import { getInspection } from './dynamodb';

describe('getInspection', () => {
  beforeEach(() => {
    sendMock.mockReset();
    process.env.DYNAMODB_TABLE_NAME = 'test-table';
  });

  it('sends a consistent GetCommand with the job key and table name', async () => {
    sendMock.mockResolvedValue({});
    await getInspection('abc123');

    expect(sendMock).toHaveBeenCalledTimes(1);
    const command = sendMock.mock.calls[0][0] as GetCommand;
    expect(command).toBeInstanceOf(GetCommand);
    expect(command.input.ConsistentRead).toBe(true);
    expect(command.input.TableName).toBe('test-table');
    expect(command.input.Key).toEqual({ PK: 'JOB#abc123', SK: 'JOB#abc123' });
  });

  it('returns null when no item exists', async () => {
    sendMock.mockResolvedValue({});
    await expect(getInspection('missing')).resolves.toBeNull();
  });

  it('strips PK, SK and ttl from the stored item', async () => {
    sendMock.mockResolvedValue({
      Item: { PK: 'JOB#x', SK: 'JOB#x', ttl: 123, id: 'x', likelyIssue: 'Leak' },
    });
    await expect(getInspection('x')).resolves.toEqual({ id: 'x', likelyIssue: 'Leak' });
  });
});
