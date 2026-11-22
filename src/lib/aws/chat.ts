import 'server-only';

import { QueryCommand, TransactWriteCommand } from '@aws-sdk/lib-dynamodb';
import { getDocClient, jobKey, requireTableName } from '@/lib/aws/dynamodb';
import { ttlForJob } from '@/lib/aws/ttl';
import { CHAT_SK_MAX, chatSk } from '@/lib/chat/chatKeys';
import { CHAT_SIDES, type ChatMessage, type ChatSide } from '@/types/chat';
import type { JobStatus } from '@/types/job';

export type SendResult = { ok: true; message: ChatMessage } | { ok: false; reason: 'CONDITION_FAILED' };

export interface SendInput {
  jobId: string;
  side: ChatSide;
  /** Already trimmed and validated. */
  text: string;
  /** Status the caller read. */
  expectedStatus: JobStatus;
  nextStatus: JobStatus;
  /** chatSeq the caller read. */
  readSeq: number | undefined;
  /** From checkSendLimits. */
  nextSent: number[];
  /** Job createdAt, for the ttl. */
  createdAt: string;
  /** max(now, chatLastAt). */
  sentAt: string;
  nowIso: string;
}

const QUERY_LIMIT = 100;

function errorName(error: unknown): string | undefined {
  if (typeof error !== 'object' || error === null) {
    return undefined;
  }
  const name = (error as { name?: unknown }).name;
  return typeof name === 'string' ? name : undefined;
}

/** True when the failure is a lost race or a failed condition, not an infrastructure error. */
function isConditionFailure(error: unknown): boolean {
  const name = errorName(error);
  if (name === 'TransactionConflictException' || name === 'ConditionalCheckFailedException') {
    return true;
  }
  if (name !== 'TransactionCanceledException') {
    return false;
  }
  const reasons = (error as { CancellationReasons?: unknown }).CancellationReasons;
  if (!Array.isArray(reasons)) {
    return false;
  }
  return reasons.some((reason) => {
    const code = typeof reason === 'object' && reason !== null ? (reason as { Code?: unknown }).Code : undefined;
    return code === 'ConditionalCheckFailed' || code === 'TransactionConflict';
  });
}

/** Saves one chat message and updates the Job in one transaction. */
export async function sendChatMessage(input: SendInput): Promise<SendResult> {
  const tableName = requireTableName();
  const seq = (input.readSeq ?? 0) + 1;
  const sentField = input.side === 'homeowner' ? 'chatSentHomeowner' : 'chatSentTradesperson';
  const statusChanges = input.nextStatus !== input.expectedStatus;

  const names: Record<string, string> = { '#status': 'status', '#sent': sentField };
  const values: Record<string, unknown> = {
    ':seq': seq,
    ':sentAt': input.sentAt,
    ':nextSent': input.nextSent,
    ':expected': input.expectedStatus,
  };
  let update = 'SET chatSeq = :seq, chatLastAt = :sentAt, #sent = :nextSent';
  if (statusChanges) {
    update += ', #status = :next, statusUpdatedAt = :now';
    values[':next'] = input.nextStatus;
    values[':now'] = input.nowIso;
  }
  let condition = 'attribute_exists(PK) AND #status = :expected AND ';
  if (input.readSeq === undefined) {
    condition += 'attribute_not_exists(chatSeq)';
  } else {
    condition += 'chatSeq = :readSeq';
    values[':readSeq'] = input.readSeq;
  }

  try {
    await getDocClient().send(
      new TransactWriteCommand({
        TransactItems: [
          {
            Put: {
              TableName: tableName,
              Item: {
                PK: jobKey(input.jobId),
                SK: chatSk(seq),
                side: input.side,
                text: input.text,
                sentAt: input.sentAt,
                seq,
                ttl: ttlForJob(input.createdAt),
              },
              ConditionExpression: 'attribute_not_exists(PK)',
            },
          },
          {
            Update: {
              TableName: tableName,
              Key: { PK: jobKey(input.jobId), SK: jobKey(input.jobId) },
              UpdateExpression: update,
              ConditionExpression: condition,
              ExpressionAttributeNames: names,
              ExpressionAttributeValues: values,
            },
          },
        ],
      }),
    );
  } catch (error) {
    if (isConditionFailure(error)) {
      console.error('Chat send lost a race:', errorName(error));
      return { ok: false, reason: 'CONDITION_FAILED' };
    }
    throw error;
  }

  return {
    ok: true,
    message: { id: `c-${seq}`, side: input.side, text: input.text, sentAt: input.sentAt, legacy: false },
  };
}

function isChatSide(value: unknown): value is ChatSide {
  return typeof value === 'string' && (CHAT_SIDES as readonly string[]).includes(value);
}

/** Consistent read of the chat messages with seq greater than `after`, oldest first. */
export async function queryChatMessages(jobId: string, after: number): Promise<ChatMessage[]> {
  const tableName = requireTableName();
  const response = await getDocClient().send(
    new QueryCommand({
      TableName: tableName,
      KeyConditionExpression: 'PK = :pk AND SK BETWEEN :lo AND :hi',
      ExpressionAttributeValues: { ':pk': jobKey(jobId), ':lo': chatSk(after + 1), ':hi': CHAT_SK_MAX },
      ConsistentRead: true,
      ScanIndexForward: true,
      Limit: QUERY_LIMIT,
    }),
  );
  const messages: ChatMessage[] = [];
  for (const item of response.Items ?? []) {
    const { seq, side, text, sentAt } = item as Record<string, unknown>;
    if (typeof seq !== 'number' || !isChatSide(side) || typeof text !== 'string' || typeof sentAt !== 'string') {
      console.error('Chat item failed validation');
      continue;
    }
    messages.push({ id: `c-${seq}`, side, text, sentAt, legacy: false });
  }
  return messages;
}
