import 'server-only';

import type { NextResponse } from 'next/server';
import { applyBooking, getJob, type JobLookup, type WriteResult } from '@/lib/aws/jobs';
import { reasonSentenceField } from '@/lib/emergency/emergencyView';
import { EMERGENCY_MESSAGE } from '@/lib/emergency/messages';
import { MAX_ACTION_BODY_BYTES, readJsonBody } from '@/lib/http/readBodyWithLimit';
import { errorBody, noStoreJson } from '@/lib/http/responses';
import { conflictResponse } from '@/lib/jobs/conflict';
import { ERROR_MESSAGES } from '@/lib/jobs/copy';
import { isSlotExpired, isSlotOffered } from '@/lib/jobs/timeSlots';
import { bookBodySchema, jobIdSchema } from '@/lib/validation/jobSchema';

export const runtime = 'nodejs';

function notFound(): NextResponse {
  return noStoreJson(404, errorBody('NOT_FOUND', ERROR_MESSAGES.NOT_FOUND));
}

function actionFailed(label: string, error: unknown): NextResponse {
  // Log the error name only; never request data or any secret.
  console.error(label, error instanceof Error ? error.name : 'UnknownError');
  return noStoreJson(500, errorBody('ACTION_FAILED', ERROR_MESSAGES.ACTION_FAILED));
}

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const { id } = await context.params;

  // (1) size cap and JSON parse.
  const body = await readJsonBody(request, MAX_ACTION_BODY_BYTES);
  if (!body.ok) {
    if (body.kind === 'too_large') {
      return noStoreJson(413, errorBody('PAYLOAD_TOO_LARGE', ERROR_MESSAGES.PAYLOAD_TOO_LARGE));
    }
    return noStoreJson(400, errorBody('INVALID_REQUEST', ERROR_MESSAGES.INVALID_REQUEST));
  }
  const parsed = bookBodySchema.safeParse(body.value);
  if (!parsed.success) {
    return noStoreJson(400, errorBody('INVALID_REQUEST', ERROR_MESSAGES.INVALID_REQUEST));
  }
  const slot = parsed.data.slot;

  // (2) id must be a UUID.
  if (!jobIdSchema.safeParse(id).success) {
    return notFound();
  }

  // (3) load the Job.
  let lookup: JobLookup;
  try {
    lookup = await getJob(id);
  } catch (error: unknown) {
    return actionFailed('Failed to load job for booking', error);
  }
  if (lookup.kind === 'missing' || lookup.kind === 'legacy') {
    return notFound();
  }
  if (lookup.kind === 'invalid') {
    console.error('Stored job failed validation');
    return noStoreJson(500, errorBody('RESULT_INVALID', ERROR_MESSAGES.RESULT_INVALID));
  }
  const job = lookup.job;

  // (4) status gate.
  if (job.status === 'emergency') {
    return noStoreJson(
      409,
      errorBody('JOB_IS_EMERGENCY', EMERGENCY_MESSAGE, {
        status: 'emergency',
        // Read-only: the stored rule fills the sentence; nothing is written here.
        ...reasonSentenceField(job.emergencyRule),
      }),
    );
  }
  if (job.status !== 'accepted') {
    return noStoreJson(
      409,
      errorBody('ILLEGAL_TRANSITION', ERROR_MESSAGES.ILLEGAL_TRANSITION, { status: job.status }),
    );
  }

  // (5) the slot must be one of the stored canonical slots (exact match), then not expired.
  if (!isSlotOffered(job.offeredSlots ?? [], slot)) {
    return noStoreJson(400, errorBody('SLOT_NOT_OFFERED', ERROR_MESSAGES.SLOT_NOT_OFFERED));
  }
  const nowMs = Date.now();
  if (isSlotExpired(slot, nowMs)) {
    return noStoreJson(409, errorBody('SLOT_EXPIRED', ERROR_MESSAGES.SLOT_EXPIRED));
  }

  // (6) conditional write.
  let result: WriteResult;
  try {
    result = await applyBooking(id, slot, new Date(nowMs).toISOString());
  } catch (error: unknown) {
    return actionFailed('Failed to save booking', error);
  }
  if (!result.ok) {
    return conflictResponse(id, 'homeowner');
  }
  return noStoreJson(200, { status: 'booked', bookedSlot: slot });
}
