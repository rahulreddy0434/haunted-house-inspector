// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

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
import { GET } from './route';

const ID = '123e4567-e89b-42d3-a456-426614174000';

const baseResult = {
  id: ID,
  createdAt: '2025-01-01T00:00:00.000Z',
  s3Keys: ['uploads/a.jpg'],
  likelyIssue: 'Dripping pipe under the sink',
  trade: 'plumber',
  urgency: 'soon',
  confidence: 0.7,
  costRangeLow: 100,
  costRangeHigh: 300,
  jobBrief: 'Slow drip under the kitchen sink.',
  followUpQuestions: ['Is the drip constant?', 'Is the cupboard wet?'] as [string, string],
  diySteps: ['Place a bucket under the drip.'],
  isEmergency: false,
  answers: { location: 'Kitchen', duration: '2 days', recentChanges: '' },
};

const emergencyResult = {
  ...baseResult,
  urgency: 'emergency',
  costRangeLow: 0,
  costRangeHigh: 0,
  jobBrief: '',
  diySteps: [] as string[],
  isEmergency: true,
};

const stored = (result: object) => ({
  Item: { PK: `JOB#${ID}`, SK: `JOB#${ID}`, ttl: 1900000000, ...result },
});

const call = (id: string) =>
  GET(new Request(`http://localhost/api/inspections/${id}`), { params: Promise.resolve({ id }) });

describe('GET /api/inspections/[id]', () => {
  const originalTable = process.env.DYNAMODB_TABLE_NAME;
  let errorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    sendMock.mockReset();
    process.env.DYNAMODB_TABLE_NAME = 'test-table';
    errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    errorSpy.mockRestore();
    if (originalTable === undefined) delete process.env.DYNAMODB_TABLE_NAME;
    else process.env.DYNAMODB_TABLE_NAME = originalTable;
  });

  it('returns 200 with the stored result and no-store caching', async () => {
    sendMock.mockResolvedValue(stored(baseResult));
    const res = await call(ID);
    expect(res.status).toBe(200);
    expect(res.headers.get('Cache-Control')).toBe('no-store');
    expect(await res.json()).toEqual(baseResult);
  });

  it('returns 200 with the same result for a stored emergency result', async () => {
    sendMock.mockResolvedValue(stored(emergencyResult));
    const res = await call(ID);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual(emergencyResult);
  });

  it('returns 404 when the item does not exist', async () => {
    sendMock.mockResolvedValue({});
    const res = await call(ID);
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: 'Inspection not found' });
  });

  it('returns 404 for a non-UUID id without calling storage', async () => {
    const res = await call('not-a-uuid');
    expect(res.status).toBe(404);
    expect(sendMock).not.toHaveBeenCalled();
  });

  it('reads with a consistent GetCommand for the job key', async () => {
    sendMock.mockResolvedValue({});
    await call(ID);
    expect(sendMock).toHaveBeenCalledTimes(1);
    const command = sendMock.mock.calls[0][0] as GetCommand;
    expect(command).toBeInstanceOf(GetCommand);
    expect(command.input.ConsistentRead).toBe(true);
    expect(command.input.TableName).toBe('test-table');
    expect(command.input.Key).toEqual({ PK: `JOB#${ID}`, SK: `JOB#${ID}` });
  });

  it('returns 500 LOAD_FAILED on storage error without logging message or contents', async () => {
    sendMock.mockRejectedValue(new Error('secret-table-detail Dripping pipe'));
    const res = await call(ID);
    expect(res.status).toBe(500);
    expect((await res.json()).error).toBe('LOAD_FAILED');
    const logged = JSON.stringify(errorSpy.mock.calls);
    expect(logged).not.toContain('secret-table-detail');
    expect(logged).not.toContain('Dripping pipe');
  });

  it.each([
    ['missing urgency', { ...baseResult, urgency: undefined }],
    ['costRangeHigh below costRangeLow', { ...baseResult, costRangeLow: 500, costRangeHigh: 100 }],
  ])('returns 500 RESULT_INVALID for a stored item with %s', async (_name, bad) => {
    sendMock.mockResolvedValue(stored(bad));
    const res = await call(ID);
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error).toBe('RESULT_INVALID');
    expect(body).not.toHaveProperty('likelyIssue');
    expect(body).not.toHaveProperty('id');
    expect(JSON.stringify(body)).not.toContain('Dripping pipe');
    expect(JSON.stringify(errorSpy.mock.calls)).not.toContain('Dripping pipe');
  });
});
