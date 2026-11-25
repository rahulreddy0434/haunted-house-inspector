import 'server-only';

import type { NextRequest, NextResponse } from 'next/server';
import { sendChatMessage, queryChatMessages, type SendResult } from '@/lib/aws/chat';
import { applySafetyOverride, getJob, type JobLookup } from '@/lib/aws/jobs';
import { checkSendLimits } from '@/lib/chat/limits';
import { chatAccess, statusAfterSend } from '@/lib/chat/rules';
import { legacyToMessages, mergeThread } from '@/lib/chat/thread';
import { chatAfterSchema, chatSendBodySchema } from '@/lib/chat/validation';
import { emergencyResponseBody, reasonSentenceField } from '@/lib/emergency/emergencyView';
import { EMERGENCY_MESSAGE, PRO_EMERGENCY_NOTE } from '@/lib/emergency/messages';
import { emergencyRuleFor } from '@/lib/emergency/ruleWrapper';
import { MAX_ACTION_BODY_BYTES, readJsonBody } from '@/lib/http/readBodyWithLimit';
import { errorBody, noStoreJson } from '@/lib/http/responses';
import { conflictResponse } from '@/lib/jobs/conflict';
import { ERROR_MESSAGES } from '@/lib/jobs/copy';
import { effectiveStatus, toBookingData } from '@/lib/jobs/views';
import { requirePro } from '@/lib/pro/proAuth';
import { replyTriggersEmergency } from '@/lib/safety/replyCheck';
import { jobIdSchema } from '@/lib/validation/jobSchema';
import type { ChatMessage, ChatReadResponse, ChatSendResponse, ChatSide } from '@/types/chat';
import type { JobRecord, JobStatus } from '@/types/job';

const CHAT_BODY_LIMIT = MAX_ACTION_BODY_BYTES; // 4096

function errorName(error: unknown): string {
  return error instanceof Error ? error.name : 'UnknownError';
}

function notFound(): NextResponse {
  return noStoreJson(404, errorBody('NOT_FOUND', ERROR_MESSAGES.NOT_FOUND));
}

function actionFailed(label: string, error: unknown): NextResponse {
  // Error name only; never message text.
  console.error(label, errorName(error));
  return noStoreJson(500, errorBody('ACTION_FAILED', ERROR_MESSAGES.ACTION_FAILED));
}

function audienceOf(side: ChatSide): 'pro' | 'homeowner' {
  return side === 'tradesperson' ? 'pro' : 'homeowner';
}

function emergencyClosed(side: ChatSide, job: JobRecord): NextResponse {
  const message = side === 'tradesperson' ? PRO_EMERGENCY_NOTE : EMERGENCY_MESSAGE;
  return noStoreJson(409, errorBody('JOB_IS_EMERGENCY', message, {
      status: 'emergency',
      ...reasonSentenceField(job.emergencyRule),
    }),);
}

type Loaded = { ok: true; job: JobRecord } | { ok: false; response: NextResponse };

async function loadJob(id: string, label: string): Promise<Loaded> {
  let lookup: JobLookup;
  try {
    lookup = await getJob(id);
  } catch (error: unknown) {
    return { ok: false, response: actionFailed(label, error) };
  }
  switch (lookup.kind) {
    case 'missing':
    case 'legacy':
      return { ok: false, response: notFound() };
    case 'invalid':
      console.error('Stored job failed validation');
      return { ok: false, response: noStoreJson(500, errorBody('RESULT_INVALID', ERROR_MESSAGES.RESULT_INVALID)) };
    default:
      return { ok: true, job: lookup.job };
  }
}

/** Open-or-read-only job state for a response. Callers have already excluded emergency. */
function jobState(job: JobRecord, status: JobStatus) {
  return {
    status: status as Exclude<JobStatus, 'emergency'>,
    booking: toBookingData(job, status),
    chatState: (chatAccess(status) === 'read_only' ? 'read_only' : 'open') as 'open' | 'read_only',
  };
}

/** One attempt of steps: status rule, limits. Returns the send result or a refusal. */
async function attemptSend(
  id: string,
  side: ChatSide,
  text: string,
  job: JobRecord,
  nowMs: number,
): Promise<{ kind: 'sent'; result: SendResult; next: JobStatus } | { kind: 'refused'; response: NextResponse }> {
  const status = effectiveStatus(job);
  const rule = statusAfterSend(status, side);
  if (!rule.ok) {
    if (rule.reason === 'JOB_IS_EMERGENCY') {
      return { kind: 'refused', response: emergencyClosed(side, job) };
    }
    return {
      kind: 'refused',
      response: noStoreJson(
        409,
        errorBody('ILLEGAL_TRANSITION', ERROR_MESSAGES.ILLEGAL_TRANSITION, { status }),
      ),
    };
  }

  const sent = side === 'homeowner' ? job.chatSentHomeowner : job.chatSentTradesperson;
  const limits = checkSendLimits({ chatSeq: job.chatSeq, sent }, nowMs);
  if (!limits.ok) {
    if (limits.reason === 'THREAD_LIMIT_REACHED') {
      return {
        kind: 'refused',
        response: noStoreJson(429, errorBody('THREAD_LIMIT_REACHED', ERROR_MESSAGES.THREAD_LIMIT_REACHED)),
      };
    }
    return {
      kind: 'refused',
      response: noStoreJson(
        429,
        errorBody('MESSAGE_RATE_LIMITED', ERROR_MESSAGES.MESSAGE_RATE_LIMITED),
        { 'Retry-After': String(limits.retryAfterSeconds) },
      ),
    };
  }

  const nowIso = new Date(nowMs).toISOString();
  const sentAt = job.chatLastAt !== undefined && job.chatLastAt > nowIso ? job.chatLastAt : nowIso;
  const result = await sendChatMessage({
    jobId: id,
    side,
    text,
    expectedStatus: job.status,
    nextStatus: rule.next,
    readSeq: job.chatSeq,
    nextSent: limits.nextSent,
    createdAt: job.createdAt,
    sentAt,
    nowIso,
  });
  return { kind: 'sent', result, next: rule.next };
}

async function sendPipeline(id: string, side: ChatSide, text: string): Promise<NextResponse> {
  if (!jobIdSchema.safeParse(id).success) {
    return notFound();
  }
  const parsed = chatSendBodySchema.safeParse({ text });
  if (!parsed.success) {
    const message = parsed.error.issues[0]?.message ?? ERROR_MESSAGES.INVALID_REQUEST;
    return noStoreJson(400, errorBody('INVALID_REQUEST', message));
  }
  const trimmed = parsed.data.text;

  let loaded = await loadJob(id, 'Failed to load job for chat');
  if (!loaded.ok) return loaded.response;

  // At most two attempts; the second runs on one fresh read after a lost race.
  for (let attempt = 0; attempt < 2; attempt += 1) {
    let outcome: Awaited<ReturnType<typeof attemptSend>>;
    try {
      outcome = await attemptSend(id, side, trimmed, loaded.job, Date.now());
    } catch (error: unknown) {
      return actionFailed('Failed to save chat message', error);
    }
    if (outcome.kind === 'refused') return outcome.response;
    if (outcome.result.ok) {
      const body: ChatSendResponse = {
        message: outcome.result.message,
        ...jobState(loaded.job, outcome.next),
      };
      // Booking data is read from the Job read before the write; a status change
      // here is only new -> info_requested or info_requested -> new, which carry none.
      return noStoreJson(200, body);
    }
    if (attempt === 0) {
      loaded = await loadJob(id, 'Failed to reload job for chat');
      if (!loaded.ok) return loaded.response;
    }
  }
  return conflictResponse(id, audienceOf(side));
}

/** POST pipeline shared by both Sides. For `tradesperson`, `request` must be a NextRequest. */
export async function runChatSend(request: Request, id: string, side: ChatSide): Promise<NextResponse> {
  if (side === 'tradesperson') {
    const guard = requirePro(request as NextRequest, Date.now());
    if (!guard.ok) return guard.response;
  }

  const body = await readJsonBody(request, CHAT_BODY_LIMIT);
  if (!body.ok) {
    if (body.kind === 'too_large') {
      return noStoreJson(413, errorBody('PAYLOAD_TOO_LARGE', ERROR_MESSAGES.PAYLOAD_TOO_LARGE));
    }
    return noStoreJson(400, errorBody('INVALID_REQUEST', ERROR_MESSAGES.INVALID_REQUEST));
  }
  const raw = body.value;
  const text =
    typeof raw === 'object' && raw !== null && typeof (raw as { text?: unknown }).text === 'string'
      ? (raw as { text: string }).text
      : null;
  if (text === null) {
    return noStoreJson(400, errorBody('INVALID_REQUEST', ERROR_MESSAGES.INVALID_REQUEST));
  }

  if (side === 'homeowner' && replyTriggersEmergency(text)) {
    const triggeredRule = emergencyRuleFor(text).rule;
    if (jobIdSchema.safeParse(id).success) {
      try {
        // Empty reply text: the override is applied and the Trigger text is stored nowhere.
        await applySafetyOverride(id, '', new Date().toISOString(), triggeredRule);
      } catch (error: unknown) {
        console.error('Safety override failed', errorName(error));
      }
    }
    return noStoreJson(200, emergencyResponseBody(triggeredRule));
  }

  return sendPipeline(id, side, text);
}

/** GET pipeline shared by both Sides. For `tradesperson`, `request` must be a NextRequest. */
export async function runChatRead(request: Request, id: string, side: ChatSide): Promise<NextResponse> {
  if (side === 'tradesperson') {
    const guard = requirePro(request as NextRequest, Date.now());
    if (!guard.ok) return guard.response;
  }

  const afterParam = new URL(request.url).searchParams.get('after');
  let after = 0;
  if (afterParam !== null) {
    const parsed = chatAfterSchema.safeParse(afterParam.trim() === '' ? Number.NaN : afterParam);
    if (!parsed.success) {
      return noStoreJson(400, errorBody('INVALID_REQUEST', ERROR_MESSAGES.INVALID_REQUEST));
    }
    after = parsed.data;
  }
  const firstLoad = afterParam === null;

  if (!jobIdSchema.safeParse(id).success) {
    return notFound();
  }
  const loaded = await loadJob(id, 'Failed to load job for chat read');
  if (!loaded.ok) return loaded.response;
  const job = loaded.job;

  const status = effectiveStatus(job);
  if (chatAccess(status) === 'closed') {
    return emergencyClosed(side, job);
  }

  let stored: ChatMessage[] = [];
  if (firstLoad || (job.chatSeq ?? 0) > after) {
    try {
      stored = await queryChatMessages(id, after);
    } catch (error: unknown) {
      return actionFailed('Failed to read chat messages', error);
    }
  }
  const messages = firstLoad ? mergeThread(legacyToMessages(job), stored) : stored;

  let lastSeq = after;
  for (const m of stored) {
    const seq = Number.parseInt(m.id.slice(2), 10);
    if (Number.isFinite(seq) && seq > lastSeq) lastSeq = seq;
  }

  const body: ChatReadResponse = { ...jobState(job, status), messages, lastSeq };
  return noStoreJson(200, body);
}
