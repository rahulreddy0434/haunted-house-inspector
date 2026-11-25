import 'server-only';

import type { NextResponse } from 'next/server';
import { applyReply, applySafetyOverride, getJob, type JobLookup, type WriteResult } from '@/lib/aws/jobs';
import { emergencyResponseBody, reasonSentenceField } from '@/lib/emergency/emergencyView';
import { EMERGENCY_MESSAGE } from '@/lib/emergency/messages';
import { emergencyRuleFor } from '@/lib/emergency/ruleWrapper';
import { MAX_ACTION_BODY_BYTES, readJsonBody } from '@/lib/http/readBodyWithLimit';
import { errorBody, noStoreJson } from '@/lib/http/responses';
import { conflictResponse } from '@/lib/jobs/conflict';
import { ERROR_MESSAGES, REPLY_EMPTY_MESSAGE, REPLY_TOO_LONG_MESSAGE } from '@/lib/jobs/copy';
import { replyTriggersEmergency } from '@/lib/safety/replyCheck';
import { jobIdSchema, replyBodySchema } from '@/lib/validation/jobSchema';

export const runtime = 'nodejs';

const MAX_REPLY_LENGTH = 500;
const REPLY_LIMIT = 5;

function notFound(): NextResponse {
  return noStoreJson(404, errorBody('NOT_FOUND', ERROR_MESSAGES.NOT_FOUND));
}

function actionFailed(label: string, error: unknown): NextResponse {
  // Log the error name only; never the reply text or any secret.
  console.error(label, error instanceof Error ? error.name : 'UnknownError');
  return noStoreJson(500, errorBody('ACTION_FAILED', ERROR_MESSAGES.ACTION_FAILED));
}

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const { id } = await context.params;

  // (1) and (2): size cap, JSON parse, text is a string.
  const body = await readJsonBody(request, MAX_ACTION_BODY_BYTES);
  if (!body.ok) {
    if (body.kind === 'too_large') {
      return noStoreJson(413, errorBody('PAYLOAD_TOO_LARGE', ERROR_MESSAGES.PAYLOAD_TOO_LARGE));
    }
    return noStoreJson(400, errorBody('INVALID_REQUEST', ERROR_MESSAGES.INVALID_REQUEST));
  }
  const parsed = replyBodySchema.safeParse(body.value);
  if (!parsed.success) {
    return noStoreJson(400, errorBody('INVALID_REQUEST', ERROR_MESSAGES.INVALID_REQUEST));
  }
  const text = parsed.data.text;
  const idIsUuid = jobIdSchema.safeParse(id).success;

  // (3) Safety_Layer on the full untrimmed text, before any read or write.
  if (replyTriggersEmergency(text)) {
    const triggeredRule = emergencyRuleFor(text).rule;
    if (idIsUuid) {
      try {
        await applySafetyOverride(id, text, new Date().toISOString(), triggeredRule);
      } catch (error: unknown) {
        console.error('Safety override failed', error instanceof Error ? error.name : 'UnknownError');
      }
    }
    return noStoreJson(200, emergencyResponseBody(triggeredRule));
  }

  // (4) id must be a UUID.
  if (!idIsUuid) {
    return notFound();
  }

  // (5) trimmed length 1..500.
  const trimmed = text.trim();
  if (trimmed.length === 0) {
    return noStoreJson(400, errorBody('INVALID_REQUEST', REPLY_EMPTY_MESSAGE));
  }
  if (trimmed.length > MAX_REPLY_LENGTH) {
    return noStoreJson(400, errorBody('INVALID_REQUEST', REPLY_TOO_LONG_MESSAGE));
  }

  // (6) load the Job.
  let lookup: JobLookup;
  try {
    lookup = await getJob(id);
  } catch (error: unknown) {
    return actionFailed('Failed to load job for reply', error);
  }
  if (lookup.kind === 'missing' || lookup.kind === 'legacy') {
    return notFound();
  }
  if (lookup.kind === 'invalid') {
    console.error('Stored job failed validation');
    return noStoreJson(500, errorBody('RESULT_INVALID', ERROR_MESSAGES.RESULT_INVALID));
  }
  const job = lookup.job;

  // (7) status check.
  if (job.status === 'emergency') {
    return noStoreJson(
      409,
      errorBody('JOB_IS_EMERGENCY', EMERGENCY_MESSAGE, {
        status: 'emergency',
        ...reasonSentenceField(job.emergencyRule),
      }),
    );
  }
  if (job.status !== 'info_requested') {
    return noStoreJson(
      409,
      errorBody('ILLEGAL_TRANSITION', ERROR_MESSAGES.ILLEGAL_TRANSITION, { status: job.status }),
    );
  }

  // (8) reply limit.
  if (job.replyCount >= REPLY_LIMIT) {
    return noStoreJson(429, errorBody('REPLY_LIMIT_REACHED', ERROR_MESSAGES.REPLY_LIMIT_REACHED));
  }

  // (9) conditional write; one re-read on a failed condition.
  let result: WriteResult;
  try {
    result = await applyReply(id, trimmed, new Date().toISOString());
  } catch (error: unknown) {
    return actionFailed('Failed to save reply', error);
  }
  if (!result.ok) {
    return conflictResponse(id, 'homeowner');
  }
  return noStoreJson(200, { status: 'new' });
}
