import 'server-only';

import { randomUUID } from 'node:crypto';
import { PutCommand } from '@aws-sdk/lib-dynamodb';
import { getDocClient, requireTableName } from '@/lib/aws/dynamodb';
import { toHelpRecord, type HelpRecordInput } from '@/lib/help/record';

/**
 * Saves one Help_Record under HELP#<uuid>. No GSI1 attributes, so it never enters the
 * Job_Index; the ttl comes from toHelpRecord (ttlFromNow). Errors propagate; callers
 * log the error name only. Returns the new record id.
 */
export async function saveHelpRecord(input: HelpRecordInput, nowMs: number = Date.now()): Promise<string> {
  const tableName = requireTableName();
  const id = randomUUID();
  await getDocClient().send(
    new PutCommand({
      TableName: tableName,
      Item: toHelpRecord(input, { id, nowMs }),
    }),
  );
  return id;
}
