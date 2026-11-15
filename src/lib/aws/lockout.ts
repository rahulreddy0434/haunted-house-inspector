import 'server-only';

import { ConditionalCheckFailedException } from '@aws-sdk/client-dynamodb';
import { GetCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import { getDocClient, requireTableName } from '@/lib/aws/dynamodb';
import type { LockoutStore, ReserveResult } from '@/lib/pro/loginFlow';

export const LOCKOUT_MAX = 5;
export const LOCKOUT_WINDOW_MS = 900_000;

const MAX_LOOPS = 3;

/** Thrown when reserve cannot settle after three loops. The caller fails closed. */
export class LockoutContention extends Error {
  constructor() {
    super('LockoutContention');
    this.name = 'LockoutContention';
  }
}

function lockoutKey(ipHash: string): { PK: string; SK: string } {
  const key = `PROAUTH#${ipHash}`;
  return { PK: key, SK: key };
}

function ttlFor(windowStart: number): number {
  return Math.floor((windowStart + LOCKOUT_WINDOW_MS) / 1000);
}

function isConditionFailure(error: unknown): boolean {
  return error instanceof ConditionalCheckFailedException;
}

/** Step 1: join the current window, or create the item. Returns the new count, or null when refused. */
async function reserveInWindow(
  ipHash: string,
  nowMs: number,
): Promise<{ windowStart: number; count: number } | null> {
  try {
    const out = await getDocClient().send(
      new UpdateCommand({
        TableName: requireTableName(),
        Key: lockoutKey(ipHash),
        UpdateExpression:
          'ADD #count :one SET windowStart = if_not_exists(windowStart, :now), #ttl = if_not_exists(#ttl, :ttl)',
        ConditionExpression:
          'attribute_not_exists(windowStart) OR (windowStart > :cutoff AND #count < :max)',
        ExpressionAttributeNames: { '#count': 'count', '#ttl': 'ttl' },
        ExpressionAttributeValues: {
          ':one': 1,
          ':now': nowMs,
          ':ttl': ttlFor(nowMs),
          ':cutoff': nowMs - LOCKOUT_WINDOW_MS,
          ':max': LOCKOUT_MAX,
        },
        ReturnValues: 'ALL_NEW',
      }),
    );
    const attrs = out.Attributes;
    const windowStart = typeof attrs?.windowStart === 'number' ? attrs.windowStart : nowMs;
    const count = typeof attrs?.count === 'number' ? attrs.count : 1;
    return { windowStart, count };
  } catch (error: unknown) {
    if (isConditionFailure(error)) return null;
    throw error;
  }
}

/** Step 2: start a new window if the stored one has ended. Returns false when it lost the race. */
async function startNewWindow(ipHash: string, nowMs: number): Promise<boolean> {
  try {
    await getDocClient().send(
      new UpdateCommand({
        TableName: requireTableName(),
        Key: lockoutKey(ipHash),
        UpdateExpression: 'SET #count = :one, windowStart = :now, #ttl = :ttl',
        ConditionExpression: 'windowStart <= :cutoff',
        ExpressionAttributeNames: { '#count': 'count', '#ttl': 'ttl' },
        ExpressionAttributeValues: {
          ':one': 1,
          ':now': nowMs,
          ':ttl': ttlFor(nowMs),
          ':cutoff': nowMs - LOCKOUT_WINDOW_MS,
        },
      }),
    );
    return true;
  } catch (error: unknown) {
    if (isConditionFailure(error)) return false;
    throw error;
  }
}

async function readWindowStart(ipHash: string): Promise<number | undefined> {
  const out = await getDocClient().send(
    new GetCommand({
      TableName: requireTableName(),
      Key: lockoutKey(ipHash),
      ConsistentRead: true,
    }),
  );
  const value = out.Item?.windowStart;
  return typeof value === 'number' ? value : undefined;
}

export const dynamoLockoutStore: LockoutStore = {
  async reserve(ipHash: string, nowMs: number): Promise<ReserveResult> {
    for (let attempt = 0; attempt < MAX_LOOPS; attempt++) {
      const reserved = await reserveInWindow(ipHash, nowMs);
      if (reserved) {
        return { allowed: true, windowStart: reserved.windowStart, count: reserved.count };
      }

      const windowStart = await readWindowStart(ipHash);
      if (windowStart !== undefined && windowStart > nowMs - LOCKOUT_WINDOW_MS) {
        const seconds = Math.ceil((windowStart + LOCKOUT_WINDOW_MS - nowMs) / 1000);
        return {
          allowed: false,
          retryAfterSeconds: Math.min(900, Math.max(1, seconds)),
        };
      }

      if (await startNewWindow(ipHash, nowMs)) {
        return { allowed: true, windowStart: nowMs, count: 1 };
      }
    }
    throw new LockoutContention();
  },

  async release(ipHash: string, windowStart: number): Promise<void> {
    try {
      await getDocClient().send(
        new UpdateCommand({
          TableName: requireTableName(),
          Key: lockoutKey(ipHash),
          UpdateExpression: 'SET #count = #count - :one',
          ConditionExpression: 'attribute_exists(PK) AND #count > :zero AND windowStart = :ws',
          ExpressionAttributeNames: { '#count': 'count' },
          ExpressionAttributeValues: { ':one': 1, ':zero': 0, ':ws': windowStart },
        }),
      );
    } catch (error: unknown) {
      // Nothing to release: already 0, a newer window, or the item expired.
      if (isConditionFailure(error)) return;
      throw error;
    }
  },
};
