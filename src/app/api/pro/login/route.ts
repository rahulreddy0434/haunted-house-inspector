import 'server-only';

import type { NextRequest, NextResponse } from 'next/server';
import { dynamoLockoutStore } from '@/lib/aws/lockout';
import { MAX_ACTION_BODY_BYTES, readJsonBody } from '@/lib/http/readBodyWithLimit';
import { errorBody, noStoreJson } from '@/lib/http/responses';
import { ERROR_MESSAGES } from '@/lib/jobs/copy';
import { getTrustedClientIp } from '@/lib/net/getTrustedClientIp';
import { hashClientIp } from '@/lib/pro/ipHash';
import { attemptLogin } from '@/lib/pro/loginFlow';
import { buildLoginCookie, readProConfig } from '@/lib/pro/proAuth';
import { loginBodySchema } from '@/lib/validation/jobSchema';

export const runtime = 'nodejs';

function invalidRequest(): NextResponse {
  return noStoreJson(400, errorBody('INVALID_REQUEST', ERROR_MESSAGES.INVALID_REQUEST));
}

function loginFailed(): NextResponse {
  return noStoreJson(500, errorBody('LOGIN_FAILED', ERROR_MESSAGES.LOGIN_FAILED));
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const config = readProConfig();
    if (!config.ok) {
      return noStoreJson(503, errorBody('PRO_DISABLED', ERROR_MESSAGES.PRO_DISABLED));
    }

    const body = await readJsonBody(request, MAX_ACTION_BODY_BYTES);
    if (!body.ok) {
      return body.kind === 'too_large'
        ? noStoreJson(413, errorBody('PAYLOAD_TOO_LARGE', ERROR_MESSAGES.PAYLOAD_TOO_LARGE))
        : invalidRequest();
    }

    const parsed = loginBodySchema.safeParse(body.value);
    if (!parsed.success) return invalidRequest();

    const ipHash = hashClientIp(getTrustedClientIp(request.headers), config.secret);
    const outcome = await attemptLogin(parsed.data.code, ipHash, {
      accessCode: config.accessCode,
      secret: config.secret,
      nowMs: Date.now(),
      store: dynamoLockoutStore,
    });

    switch (outcome.kind) {
      case 'locked':
        return noStoreJson(
          429,
          errorBody('TOO_MANY_ATTEMPTS', ERROR_MESSAGES.TOO_MANY_ATTEMPTS),
          { 'Retry-After': String(outcome.retryAfterSeconds) },
        );
      case 'failed':
        return loginFailed();
      case 'invalid_code':
        return noStoreJson(401, errorBody('INVALID_CODE', ERROR_MESSAGES.INVALID_CODE));
      case 'ok': {
        const res = noStoreJson(200, { ok: true });
        res.cookies.set(buildLoginCookie(outcome.cookieValue));
        return res;
      }
    }
  } catch (e) {
    const name = e instanceof Error && e.name ? e.name : 'UnknownError';
    console.error('Pro login error', name);
    return loginFailed();
  }
}
