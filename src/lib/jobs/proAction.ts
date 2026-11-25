import 'server-only';
import type { NextRequest, NextResponse } from 'next/server';
import { applyTransition, getJob, type JobLookup } from '@/lib/aws/jobs';
import { reasonSentenceField } from '@/lib/emergency/emergencyView';
import { MAX_ACTION_BODY_BYTES, readJsonBody } from '@/lib/http/readBodyWithLimit';
import { errorBody, noStoreJson } from '@/lib/http/responses';
import { conflictResponse } from '@/lib/jobs/conflict';
import { ERROR_MESSAGES } from '@/lib/jobs/copy';
import { transition } from '@/lib/jobs/transition';
import { requirePro } from '@/lib/pro/proAuth';
import { jobIdSchema } from '@/lib/validation/jobSchema';
import type { JobRecord, JobStatus, TransitionPatch } from '@/types/job';

export type ProActionName = 'accept' | 'decline' | 'ask_info';

export type ParseBodyResult<B> = { ok: true; value: B } | { ok: false; message: string };

export interface RunProActionArgs<B> {
  request: NextRequest;
  params: Promise<{ id: string }>;
  action: ProActionName;
  parseBody: (raw: unknown, nowMs: number) => ParseBodyResult<B>;
  buildPatch: (body: B) => TransitionPatch;
  /** Ask-info: returns 409 REPLY_LIMIT_REACHED when the reply limit is reached. */
  precheck?: (job: JobRecord) => NextResponse | null;
}

function invalidRequest(message: string = ERROR_MESSAGES.INVALID_REQUEST): NextResponse {
  return noStoreJson(400, errorBody('INVALID_REQUEST', message));
}

function payloadTooLarge(): NextResponse {
  return noStoreJson(413, errorBody('PAYLOAD_TOO_LARGE', ERROR_MESSAGES.PAYLOAD_TOO_LARGE));
}

function notFound(): NextResponse {
  return noStoreJson(404, errorBody('NOT_FOUND', ERROR_MESSAGES.NOT_FOUND));
}

function resultInvalid(): NextResponse {
  return noStoreJson(500, errorBody('RESULT_INVALID', ERROR_MESSAGES.RESULT_INVALID));
}

function actionFailed(error: unknown): NextResponse {
  console.error('Pro action failed', error instanceof Error ? error.name : 'UnknownError');
  return noStoreJson(500, errorBody('ACTION_FAILED', ERROR_MESSAGES.ACTION_FAILED));
}

function conflictFor(
  reason: 'ILLEGAL_TRANSITION' | 'JOB_IS_EMERGENCY',
  status: JobStatus,
  emergencyRule?: string,
): NextResponse {
  if (reason === 'JOB_IS_EMERGENCY') {
    return noStoreJson(
      409,
      errorBody('JOB_IS_EMERGENCY', ERROR_MESSAGES.JOB_IS_EMERGENCY.pro, {
        status: 'emergency',
        ...reasonSentenceField(emergencyRule),
      }),
    );
  }
  return noStoreJson(
    409,
    errorBody('ILLEGAL_TRANSITION', ERROR_MESSAGES.ILLEGAL_TRANSITION, { status }),
  );
}

/**
 * Shared pipeline of the accept, decline and ask-info routes. Stops at the
 * first failure. Never touches the rate limiter, Bedrock or the Safety_Layer.
 */
export async function runProAction<B>(args: RunProActionArgs<B>): Promise<NextResponse> {
  const nowMs = Date.now();

  const auth = requirePro(args.request, nowMs);
  if (!auth.ok) return auth.response;

  const body = await readJsonBody(args.request, MAX_ACTION_BODY_BYTES);
  if (!body.ok) return body.kind === 'too_large' ? payloadTooLarge() : invalidRequest();
  if (typeof body.value !== 'object' || body.value === null || Array.isArray(body.value)) {
    return invalidRequest();
  }

  const parsed = args.parseBody(body.value, nowMs);
  if (!parsed.ok) return invalidRequest(parsed.message);

  const id = (await args.params).id;
  if (!jobIdSchema.safeParse(id).success) return notFound();

  let lookup: JobLookup;
  try {
    lookup = await getJob(id);
  } catch (error: unknown) {
    return actionFailed(error);
  }
  if (lookup.kind === 'missing' || lookup.kind === 'legacy') return notFound();
  if (lookup.kind === 'invalid') return resultInvalid();
  const job = lookup.job;

  const t = transition(job.status, args.action);
  if (!t.ok) return conflictFor(t.reason, job.status, job.emergencyRule);

  const early = args.precheck?.(job);
  if (early) return early;

  try {
    const write = await applyTransition(
      id,
      job.status,
      t.next,
      args.buildPatch(parsed.value),
      new Date(nowMs).toISOString(),
    );
    if (write.ok) return noStoreJson(200, { status: t.next });
    return await conflictResponse(id, 'pro');
  } catch (error: unknown) {
    return actionFailed(error);
  }
}
