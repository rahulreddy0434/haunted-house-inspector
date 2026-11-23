import 'server-only';

import type { NextRequest, NextResponse } from 'next/server';
import { incrementRateLimitCounter } from '@/lib/aws/dynamodb';
import { saveHelpRecord } from '@/lib/aws/help';
import { sendHelpEmail } from '@/lib/aws/ses';
import { EMERGENCY_MESSAGE } from '@/lib/emergency/messages';
import { buildHelpEmail } from '@/lib/help/email';
import type { HelpRecordInput } from '@/lib/help/record';
import { HELP_FIELD_MESSAGES, helpBodySchema, helpLooseBodySchema } from '@/lib/help/schema';
import { readJsonBody } from '@/lib/http/readBodyWithLimit';
import { errorBody, noStoreJson } from '@/lib/http/responses';
import { ERROR_MESSAGES } from '@/lib/jobs/copy';
import { resolveVisitorId } from '@/lib/rateLimiter';
import { replyTriggersEmergency } from '@/lib/safety/replyCheck';

export const HELP_MAX_BODY_BYTES = 8192;
export const HELP_LIMIT = 5;
export const HELP_WINDOW_MS = 24 * 60 * 60 * 1000;

type FieldName = keyof typeof HELP_FIELD_MESSAGES;

function emergencyResponse(): NextResponse {
  return noStoreJson(200, { status: 'emergency', message: EMERGENCY_MESSAGE });
}

function successResponse(): NextResponse {
  return noStoreJson(200, { status: 'sent' });
}

function logName(label: string, error: unknown): void {
  // Error name only; never visitor text, addresses or secrets.
  console.error(label, error instanceof Error ? error.name : 'UnknownError');
}

function isFieldName(value: unknown): value is FieldName {
  return value === 'name' || value === 'email' || value === 'message';
}

/** Help_Message pipeline. Safety_Layer first; a Trigger always gets the Emergency_Message. */
export async function handleHelp(request: NextRequest): Promise<NextResponse> {
  // (1) size cap and JSON parse.
  const body = await readJsonBody(request, HELP_MAX_BODY_BYTES);
  if (!body.ok) {
    if (body.kind === 'too_large') {
      return noStoreJson(413, errorBody('PAYLOAD_TOO_LARGE', ERROR_MESSAGES.PAYLOAD_TOO_LARGE));
    }
    return noStoreJson(400, errorBody('INVALID_REQUEST', ERROR_MESSAGES.INVALID_REQUEST));
  }

  // (2) loose parse: only `message` must be a string.
  const loose = helpLooseBodySchema.safeParse(body.value);
  if (!loose.success) {
    return noStoreJson(400, errorBody('INVALID_REQUEST', ERROR_MESSAGES.INVALID_REQUEST));
  }

  // (3) Safety_Layer on Message and on Name, checked separately.
  const name = loose.data.name;
  const trigger =
    replyTriggersEmergency(loose.data.message) ||
    (typeof name === 'string' && replyTriggersEmergency(name));

  // (4) Honeypot: normal answer, nothing saved, sent or counted.
  const website = loose.data.website;
  if (typeof website === 'string' && website.length > 0) {
    return trigger ? emergencyResponse() : successResponse();
  }

  // (5) strict parse.
  const strict = helpBodySchema.safeParse(body.value);
  if (!strict.success) {
    if (trigger) return emergencyResponse();
    const fields: Partial<Record<FieldName, string>> = {};
    for (const issue of strict.error.issues) {
      const key = issue.path[0];
      if (isFieldName(key)) fields[key] = HELP_FIELD_MESSAGES[key];
    }
    return noStoreJson(
      400,
      errorBody('INVALID_REQUEST', ERROR_MESSAGES.INVALID_REQUEST, { fields }),
    );
  }

  // (6) Help_Limit, in its own key space.
  const now = Date.now();
  try {
    const counter = await incrementRateLimitCounter(
      `help:${resolveVisitorId(request)}`,
      now,
      HELP_LIMIT,
      HELP_WINDOW_MS,
    );
    if (!counter.allowed) {
      if (trigger) return emergencyResponse();
      const retryAfter = Math.max(1, Math.ceil((counter.windowStart + HELP_WINDOW_MS - now) / 1000));
      return noStoreJson(
        429,
        errorBody('HELP_LIMIT_REACHED', ERROR_MESSAGES.HELP_LIMIT_REACHED),
        { 'Retry-After': String(retryAfter) },
      );
    }
  } catch (error: unknown) {
    logName('Help counter failed', error);
    if (trigger) return emergencyResponse();
    return noStoreJson(500, errorBody('ACTION_FAILED', ERROR_MESSAGES.ACTION_FAILED));
  }

  // (7) save and send, each in its own try block.
  const input: HelpRecordInput = { ...strict.data, emergency: trigger };
  let saved = false;
  let sent = false;
  try {
    await saveHelpRecord(input, now);
    saved = true;
  } catch (error: unknown) {
    logName('Help record save failed', error);
  }
  try {
    await sendHelpEmail(buildHelpEmail(input));
    sent = true;
  } catch (error: unknown) {
    logName('Help email send failed', error);
  }

  // (8) respond.
  if (trigger) return emergencyResponse();
  if (saved || sent) return successResponse();
  return noStoreJson(500, errorBody('ACTION_FAILED', ERROR_MESSAGES.ACTION_FAILED));
}
