import 'server-only';

import { ConditionalCheckFailedException, DynamoDBClient } from '@aws-sdk/client-dynamodb';
import {
  DynamoDBDocumentClient,
  GetCommand,
  PutCommand,
  UpdateCommand,
} from '@aws-sdk/lib-dynamodb';
import type { InspectionResult } from '@/types/inspection';

const TTL_SECONDS = 30 * 24 * 60 * 60;

let docClient: DynamoDBDocumentClient | undefined;

function getDocClient(): DynamoDBDocumentClient {
  if (!docClient) {
    // Credentials come from the default provider chain (IAM role / CLI profile).
    const client = new DynamoDBClient({ region: process.env.APP_AWS_REGION });
    docClient = DynamoDBDocumentClient.from(client, {
      marshallOptions: { removeUndefinedValues: true },
    });
  }
  return docClient;
}

function jobKey(id: string): string {
  return `JOB#${id}`;
}

/**
 * Persist an inspection. Failures are logged and never thrown.
 * Returns true on success, false on failure.
 */
export async function persistInspection(result: InspectionResult): Promise<boolean> {
  try {
    const tableName = process.env.DYNAMODB_TABLE_NAME;
    if (!tableName) {
      throw new Error('DYNAMODB_TABLE_NAME is not set');
    }
    const createdMs = Date.parse(result.createdAt);
    const baseSeconds = Number.isNaN(createdMs)
      ? Math.floor(Date.now() / 1000)
      : Math.floor(createdMs / 1000);

    await getDocClient().send(
      new PutCommand({
        TableName: tableName,
        Item: {
          PK: jobKey(result.id),
          SK: jobKey(result.id),
          ttl: baseSeconds + TTL_SECONDS,
          ...result,
        },
      }),
    );
    return true;
  } catch (error: unknown) {
    console.error('Failed to persist inspection', error);
    return false;
  }
}

/** Fetch an inspection by id; returns null when not found. */
export async function getInspection(id: string): Promise<InspectionResult | null> {
  const tableName = process.env.DYNAMODB_TABLE_NAME;
  if (!tableName) {
    throw new Error('DYNAMODB_TABLE_NAME is not set');
  }
  const response = await getDocClient().send(
    new GetCommand({
      TableName: tableName,
      Key: { PK: jobKey(id), SK: jobKey(id) },
      // The results page reads a job immediately after it is saved.
      ConsistentRead: true,
    }),
  );
  if (!response.Item) {
    return null;
  }
  const { PK: _pk, SK: _sk, ttl: _ttl, ...rest } = response.Item;
  void _pk;
  void _sk;
  void _ttl;
  return rest as InspectionResult;
}

export interface RateLimitCounterResult {
  /** False when the visitor is already at the limit (counter not incremented). */
  allowed: boolean;
  /** Counter value after this call. */
  count: number;
  /** Window start, epoch milliseconds. */
  windowStart: number;
}

function rateLimitKey(visitorId: string): string {
  return `RATELIMIT#${visitorId}`;
}

function requireTableName(): string {
  const tableName = process.env.DYNAMODB_TABLE_NAME;
  if (!tableName) {
    throw new Error('DYNAMODB_TABLE_NAME is not set');
  }
  return tableName;
}

/**
 * Atomically count one request for a visitor within a fixed window.
 * Item: PK = SK = RATELIMIT#{visitorId}, with `count`, `windowStart` (ms) and `ttl` (s).
 * Throws on storage errors; the caller decides how to fail.
 */
export async function incrementRateLimitCounter(
  visitorId: string,
  nowMs: number,
  limit: number,
  windowMs: number,
): Promise<RateLimitCounterResult> {
  const tableName = requireTableName();
  const key = { PK: rateLimitKey(visitorId), SK: rateLimitKey(visitorId) };
  const client = getDocClient();
  const cutoff = nowMs - windowMs;

  try {
    const response = await client.send(
      new UpdateCommand({
        TableName: tableName,
        Key: key,
        UpdateExpression:
          'ADD #count :one SET windowStart = if_not_exists(windowStart, :now), #ttl = if_not_exists(#ttl, :ttl)',
        ConditionExpression:
          'attribute_not_exists(windowStart) OR (windowStart > :cutoff AND #count < :limit)',
        ExpressionAttributeNames: { '#count': 'count', '#ttl': 'ttl' },
        ExpressionAttributeValues: {
          ':one': 1,
          ':now': nowMs,
          ':ttl': Math.floor((nowMs + windowMs) / 1000),
          ':cutoff': cutoff,
          ':limit': limit,
        },
        ReturnValues: 'ALL_NEW',
      }),
    );
    return {
      allowed: true,
      count: Number(response.Attributes?.count ?? 1),
      windowStart: Number(response.Attributes?.windowStart ?? nowMs),
    };
  } catch (error: unknown) {
    if (!(error instanceof ConditionalCheckFailedException)) {
      throw error;
    }
  }

  // Condition failed: either the window expired or the limit is reached.
  // Consistent read: must see the latest count after the failed conditional update.
  const existing = await client.send(
    new GetCommand({ TableName: tableName, Key: key, ConsistentRead: true }),
  );
  const windowStart = Number(existing.Item?.windowStart ?? 0);
  if (existing.Item && windowStart > cutoff) {
    return { allowed: false, count: Number(existing.Item.count ?? limit), windowStart };
  }

  // Expired (TTL deletion is lazy): start a fresh window.
  await client.send(
    new PutCommand({
      TableName: tableName,
      Item: {
        ...key,
        count: 1,
        windowStart: nowMs,
        ttl: Math.floor((nowMs + windowMs) / 1000),
      },
    }),
  );
  return { allowed: true, count: 1, windowStart: nowMs };
}
