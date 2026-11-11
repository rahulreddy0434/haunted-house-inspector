import 'server-only';

import { NextResponse, type NextRequest } from 'next/server';
import { invokeInspectionModel } from '@/lib/aws/bedrock';
import { persistInspection } from '@/lib/aws/dynamodb';
import { checkRateLimit, type SessionCookie } from '@/lib/rateLimiter';
import { applyOverrides, checkEmergency } from '@/lib/safety/safetyLayer';
import { bedrockResponseSchema, inspectRequestSchema } from '@/lib/validation/inspectionSchema';
import type { BedrockInspectionResponse } from '@/types/bedrock';
import type { ContextAnswers, InspectionResult } from '@/types/inspection';

export const runtime = 'nodejs';

const NO_STORE = { 'Cache-Control': 'no-store' };

const ANALYSIS_FAILED_MESSAGE = "We couldn't analyse your photos. Please try again.";
const RATE_LIMIT_MESSAGE =
  "You've reached the 15-inspection daily limit. Come back tomorrow to run more inspections.";

/** Neutral placeholder; applyOverrides clears costs, brief and DIY steps for emergencies. */
const EMERGENCY_PLACEHOLDER: BedrockInspectionResponse = {
  likelyIssue: 'Possible emergency',
  trade: 'Emergency services',
  urgency: 'urgent',
  confidence: 0,
  costRangeLow: 0,
  costRangeHigh: 0,
  jobBrief: '',
  followUpQuestions: [
    'Is everyone out of the affected area?',
    'Have you contacted emergency services or your utility?',
  ],
  diySteps: [],
};

function jsonError(
  status: number,
  body: Record<string, unknown>,
  extraHeaders: Record<string, string> = {},
  cookie?: SessionCookie,
): NextResponse {
  const response = NextResponse.json(body, {
    status,
    headers: { ...NO_STORE, ...extraHeaders },
  });
  if (cookie) response.cookies.set(cookie.name, cookie.value, cookie.options);
  return response;
}

function hasUnsafeKey(keys: string[]): boolean {
  return keys.some((k) => k.includes('..') || k.startsWith('/'));
}

async function finish(
  result: InspectionResult,
  cookie?: SessionCookie,
): Promise<NextResponse> {
  const persisted = await persistInspection(result);
  if (!persisted) {
    console.error('Inspection could not be persisted; returning result anyway');
  }
  const response = NextResponse.json(result, { status: 200, headers: NO_STORE });
  if (cookie) response.cookies.set(cookie.name, cookie.value, cookie.options);
  return response;
}

const MAX_BODY_BYTES = 16 * 1024;
const PAYLOAD_TOO_LARGE_BODY = {
  error: 'PAYLOAD_TOO_LARGE',
  message: 'That request is too large. Please try again with fewer or shorter answers.',
};

/**
 * Reads the body as a stream with a running byte count, aborting once the limit
 * is exceeded. Returns null when the body is too large.
 */
async function readBodyWithLimit(request: NextRequest): Promise<string | null> {
  if (!request.body) return '';
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > MAX_BODY_BYTES) {
      await reader.cancel().catch(() => {});
      return null;
    }
    chunks.push(value);
  }
  const merged = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    merged.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new TextDecoder().decode(merged);
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  // Step 0: body size limit, before any parsing
  const declared = request.headers.get('content-length');
  if (declared !== null && /^\d+$/.test(declared.trim())) {
    const length = Number(declared.trim());
    if (Number.isFinite(length) && length > MAX_BODY_BYTES) {
      return jsonError(413, PAYLOAD_TOO_LARGE_BODY);
    }
  }

  // Step 1: parse and validate
  let body: unknown;
  try {
    const text = await readBodyWithLimit(request).catch(() => '');
    if (text === null) return jsonError(413, PAYLOAD_TOO_LARGE_BODY);
    body = JSON.parse(text);
  } catch {
    return jsonError(400, { error: 'INVALID_REQUEST', message: 'Request body must be valid JSON.' });
  }

  const parsed = inspectRequestSchema.safeParse(body);
  if (!parsed.success) {
    return jsonError(400, {
      error: 'INVALID_REQUEST',
      message: parsed.error.issues.map((i) => i.message).join('; '),
    });
  }
  const { s3Keys, answers } = parsed.data;
  const contextAnswers: ContextAnswers = answers;

  if (hasUnsafeKey(s3Keys)) {
    return jsonError(400, { error: 'INVALID_REQUEST', message: 'Invalid upload key.' });
  }

  // Step 2: safety check on context answers, before the rate limiter and Bedrock
  const preCheck = checkEmergency({ contextAnswers, bedrockOutput: undefined });
  if (preCheck.isEmergency) {
    const result = applyOverrides(EMERGENCY_PLACEHOLDER, preCheck, EMERGENCY_PLACEHOLDER.trade, {
      id: crypto.randomUUID(),
      createdAt: new Date().toISOString(),
      s3Keys,
      answers: contextAnswers,
    });
    return finish(result);
  }

  // Step 3: rate limit (non-emergency only)
  const limit = await checkRateLimit(request);
  if (!limit.allowed) {
    const retryAfter = Math.max(1, Math.ceil((limit.resetAt - Date.now()) / 1000));
    return jsonError(
      429,
      {
        error: 'RATE_LIMIT_EXCEEDED',
        message: RATE_LIMIT_MESSAGE,
        resetAt: new Date(limit.resetAt).toISOString(),
      },
      { 'Retry-After': String(retryAfter) },
    );
  }
  const cookie = limit.setCookie;

  // Step 4: Bedrock (20 s timeout is enforced inside the client)
  let raw: unknown;
  try {
    raw = await invokeInspectionModel(s3Keys, contextAnswers);
  } catch (error: unknown) {
    console.error('Bedrock invocation failed', error instanceof Error ? error.name : 'unknown');
    return jsonError(502, { error: 'ANALYSIS_FAILED', message: ANALYSIS_FAILED_MESSAGE }, {}, cookie);
  }

  // Step 5: validate model output
  const validated = bedrockResponseSchema.safeParse(raw);
  if (!validated.success) {
    console.error(
      'Bedrock response failed validation at:',
      validated.error.issues.map((i) => i.path.join('.')).join(', '),
    );
    return jsonError(502, { error: 'ANALYSIS_FAILED', message: ANALYSIS_FAILED_MESSAGE }, {}, cookie);
  }
  const bedrock: BedrockInspectionResponse = validated.data;

  // Step 6: post-Bedrock safety merge
  const postCheck = checkEmergency({
    contextAnswers,
    bedrockOutput: `${bedrock.likelyIssue}\n${bedrock.jobBrief}`,
  });

  // Step 7: overrides and assembly
  const result = applyOverrides(bedrock, postCheck, bedrock.trade, {
    id: crypto.randomUUID(),
    createdAt: new Date().toISOString(),
    s3Keys,
    answers: contextAnswers,
  });

  // Steps 8-9
  return finish(result, cookie);
}
