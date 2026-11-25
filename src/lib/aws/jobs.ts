import 'server-only';

import { GetCommand, QueryCommand, UpdateCommand, type UpdateCommandInput } from '@aws-sdk/lib-dynamodb';
import { getDocClient, jobKey, requireTableName } from '@/lib/aws/dynamodb';
import type { EmergencySource } from '@/lib/emergency/source';
import type { EmergencyConditionCode } from '@/lib/safety/safetyLayer';
import { effectiveStatus, type ProListStored } from '@/lib/jobs/views';
import { proListItemSchema, storedJobSchema } from '@/lib/validation/jobSchema';
import type { JobRecord, JobStatus, TimeSlot, TransitionPatch } from '@/types/job';

export type JobLookup =
  | { kind: 'missing' }
  | { kind: 'legacy' }
  | { kind: 'invalid' }
  | { kind: 'found'; job: JobRecord };

export type WriteResult = { ok: true } | { ok: false; reason: 'CONDITION_FAILED' };

const LIST_WINDOW_MS = 30 * 24 * 60 * 60 * 1000;
const LIST_LIMIT = 50;

/** Strongly consistent read of one Job. Throws on a DynamoDB error. */
export async function getJob(id: string): Promise<JobLookup> {
  const tableName = requireTableName();
  const response = await getDocClient().send(
    new GetCommand({
      TableName: tableName,
      Key: { PK: jobKey(id), SK: jobKey(id) },
      ConsistentRead: true,
    }),
  );
  const item = response.Item;
  if (!item) {
    return { kind: 'missing' };
  }
  // Pre-feature Jobs have no status; check before Zod, which rejects them.
  if (item.status === undefined) {
    return { kind: 'legacy' };
  }
  const parsed = storedJobSchema.safeParse(item);
  if (!parsed.success) {
    return { kind: 'invalid' };
  }
  const job: JobRecord = parsed.data;
  return { kind: 'found', job: { ...job, status: effectiveStatus(job) } };
}

/** One page (up to 50) of Jobs from the last 30 days, newest first. */
export async function queryRecentJobs(nowMs: number): Promise<ProListStored[]> {
  const tableName = requireTableName();
  const response = await getDocClient().send(
    new QueryCommand({
      TableName: tableName,
      IndexName: 'GSI1',
      KeyConditionExpression: 'GSI1PK = :pk AND GSI1SK > :since',
      ExpressionAttributeValues: {
        ':pk': 'JOBS',
        ':since': new Date(nowMs - LIST_WINDOW_MS).toISOString(),
      },
      ScanIndexForward: false,
      Limit: LIST_LIMIT,
    }),
  );
  const items: ProListStored[] = [];
  for (const raw of response.Items ?? []) {
    const parsed = proListItemSchema.safeParse(raw);
    if (parsed.success) {
      items.push(parsed.data);
    } else {
      console.error('Job list item failed validation');
    }
  }
  return items;
}

const REPLY_LIMIT = 5;

/** Runs one conditional update; a failed condition is a result, any other error is rethrown. */
async function sendConditionalUpdate(input: Omit<UpdateCommandInput, 'TableName' | 'Key'>, id: string): Promise<WriteResult> {
  const tableName = requireTableName();
  try {
    await getDocClient().send(
      new UpdateCommand({ TableName: tableName, Key: { PK: jobKey(id), SK: jobKey(id) }, ...input }),
    );
    return { ok: true };
  } catch (error) {
    const name = typeof error === 'object' && error !== null ? (error as { name?: unknown }).name : undefined;
    if (name === 'ConditionalCheckFailedException') {
      return { ok: false, reason: 'CONDITION_FAILED' };
    }
    throw error;
  }
}

/** Accept, decline or ask-info. `expected` is the status the caller read. */
export async function applyTransition(
  id: string,
  expected: JobStatus,
  next: JobStatus,
  patch: TransitionPatch,
  nowIso: string,
): Promise<WriteResult> {
  const values: Record<string, unknown> = { ':expected': expected, ':next': next, ':now': nowIso };
  let update = 'SET #status = :next, statusUpdatedAt = :now';
  if (patch.action === 'accept') {
    update += ', offeredSlots = :slots';
    values[':slots'] = patch.slots;
  } else if (patch.action === 'decline') {
    const reason = patch.reason?.trim() ?? '';
    if (reason !== '') {
      update += ', declineReason = :reason';
      values[':reason'] = reason;
    }
  } else {
    update += ', infoRequests = list_append(if_not_exists(infoRequests, :empty), :q)';
    values[':empty'] = [];
    values[':q'] = [{ question: patch.question, askedAt: nowIso }];
  }
  return sendConditionalUpdate(
    {
      UpdateExpression: update,
      ConditionExpression: 'attribute_exists(PK) AND #status = :expected',
      ExpressionAttributeNames: { '#status': 'status' },
      ExpressionAttributeValues: values,
    },
    id,
  );
}

/** Homeowner reply: appends to `replies`, bumps `replyCount`, status back to `new`. */
export async function applyReply(id: string, text: string, nowIso: string): Promise<WriteResult> {
  return sendConditionalUpdate(
    {
      UpdateExpression:
        'SET #status = :new, statusUpdatedAt = :now, replies = list_append(if_not_exists(replies, :empty), :r), replyCount = replyCount + :one',
      ConditionExpression: 'attribute_exists(PK) AND #status = :infoRequested AND replyCount < :five',
      ExpressionAttributeNames: { '#status': 'status' },
      ExpressionAttributeValues: {
        ':new': 'new',
        ':infoRequested': 'info_requested',
        ':now': nowIso,
        ':empty': [],
        ':r': [{ text: text.trim(), at: nowIso }],
        ':five': REPLY_LIMIT,
        ':one': 1,
      },
    },
    id,
  );
}

/** Homeowner books one of the offered slots. `offeredSlots` is left as is. */
export async function applyBooking(id: string, slot: TimeSlot, nowIso: string): Promise<WriteResult> {
  return sendConditionalUpdate(
    {
      UpdateExpression: 'SET #status = :booked, statusUpdatedAt = :now, bookedSlot = :slot, bookedAt = :now',
      ConditionExpression: 'attribute_exists(PK) AND #status = :accepted',
      ExpressionAttributeNames: { '#status': 'status' },
      ExpressionAttributeValues: { ':booked': 'booked', ':accepted': 'accepted', ':now': nowIso, ':slot': slot },
    },
    id,
  );
}

const OVERRIDE_REPLY_MAX = 500;

const OVERRIDE_SET =
  'SET #status = :emergency, statusUpdatedAt = :now, urgency = :emergency, isEmergency = :true, ' +
  'costRangeLow = :zero, costRangeHigh = :zero, jobBrief = :emptyStr, diySteps = :emptyList';
const OVERRIDE_REMOVE = 'REMOVE offeredSlots, bookedSlot, bookedAt';
const OVERRIDE_NOT_EMERGENCY = 'attribute_exists(PK) AND (attribute_not_exists(#status) OR #status <> :emergency)';

/**
 * Safety override: forces the Job to emergency. Attempt A also stores the triggering reply
 * while a reply slot is free; attempt B (A's condition failed) overrides without the reply.
 * An empty reply skips straight to B. Returns 'skipped' when the Job is missing or already emergency.
 */
export async function applySafetyOverride(
  id: string,
  replyText: string,
  nowIso: string,
  triggeredCondition?: EmergencyConditionCode,
): Promise<'applied' | 'skipped'> {
  const baseValues: Record<string, unknown> = {
    ':emergency': 'emergency',
    ':now': nowIso,
    ':true': true,
    ':zero': 0,
    ':emptyStr': '',
    ':emptyList': [],
    ':source': 'override' satisfies EmergencySource,
  };
  if (triggeredCondition !== undefined) baseValues[':rule'] = triggeredCondition;
  // Written in the same gated update as the status, so an existing emergency is never written to.
  const overrideSet =
    triggeredCondition !== undefined
      ? `${OVERRIDE_SET}, emergencyRule = :rule, emergencySource = :source`
      : `${OVERRIDE_SET}, emergencySource = :source`;
  const names = { '#status': 'status' };

  const text = replyText.trim().slice(0, OVERRIDE_REPLY_MAX);
  if (text !== '') {
    const a = await sendConditionalUpdate(
      {
        UpdateExpression: `${overrideSet}, replies = list_append(if_not_exists(replies, :emptyList), :r) ADD replyCount :one ${OVERRIDE_REMOVE}`,
        ConditionExpression: `${OVERRIDE_NOT_EMERGENCY} AND (attribute_not_exists(replyCount) OR replyCount < :five)`,
        ExpressionAttributeNames: names,
        ExpressionAttributeValues: { ...baseValues, ':r': [{ text, at: nowIso }], ':one': 1, ':five': REPLY_LIMIT },
      },
      id,
    );
    if (a.ok) {
      return 'applied';
    }
  }

  const b = await sendConditionalUpdate(
    {
      UpdateExpression: `${overrideSet} ${OVERRIDE_REMOVE}`,
      ConditionExpression: OVERRIDE_NOT_EMERGENCY,
      ExpressionAttributeNames: names,
      ExpressionAttributeValues: baseValues,
    },
    id,
  );
  return b.ok ? 'applied' : 'skipped';
}
