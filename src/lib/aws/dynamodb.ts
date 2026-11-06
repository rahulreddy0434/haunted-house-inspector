import 'server-only';

import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, GetCommand, PutCommand } from '@aws-sdk/lib-dynamodb';
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
