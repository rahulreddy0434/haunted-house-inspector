import 'server-only';

import type { NextRequest, NextResponse } from 'next/server';
import { errorBody, noStoreJson } from '@/lib/http/responses';
import { ERROR_MESSAGES } from '@/lib/jobs/copy';
import {
  PRO_COOKIE_MAX_AGE_SECONDS,
  PRO_COOKIE_NAME,
  PRO_COOKIE_PATH,
  verifyProCookie,
} from '@/lib/pro/proCookie';

export type ProConfig = { ok: true; accessCode: string; secret: string } | { ok: false };

export type ProGuard = { ok: true } | { ok: false; response: NextResponse };

/**
 * Reads both variables on every call (no caching). Logs one warning per missing
 * or empty variable, naming only the variable, never a value.
 */
export function readProConfig(): ProConfig {
  const accessCode = process.env.PRO_ACCESS_CODE ?? '';
  const secret = process.env.SESSION_SECRET ?? '';
  if (accessCode.length === 0) {
    console.warn('PRO_ACCESS_CODE is not set; tradesperson access is disabled.');
  }
  if (secret.length === 0) {
    console.warn('SESSION_SECRET is not set; tradesperson access is disabled.');
  }
  return accessCode.length > 0 && secret.length > 0
    ? { ok: true, accessCode, secret }
    : { ok: false };
}

function unauthorized(): NextResponse {
  return noStoreJson(401, errorBody('UNAUTHORIZED', ERROR_MESSAGES.UNAUTHORIZED));
}

/**
 * Synchronous route guard. Call it before any body read, id check, DynamoDB or
 * S3 call. Reads only the `hhi_pro` cookie. An empty secret never verifies.
 */
export function requirePro(request: NextRequest, nowMs: number): ProGuard {
  readProConfig();
  const token = request.cookies.get(PRO_COOKIE_NAME)?.value;
  const secret = process.env.SESSION_SECRET ?? '';
  return verifyProCookie(token, secret, nowMs)
    ? { ok: true }
    : { ok: false, response: unauthorized() };
}

/** Cookie object for `res.cookies.set(cookie)`. */
export interface ProCookieOptions {
  name: string;
  value: string;
  httpOnly: true;
  secure: true;
  sameSite: 'strict';
  path: string;
  maxAge: number;
}

function proCookie(value: string, maxAge: number): ProCookieOptions {
  return {
    name: PRO_COOKIE_NAME,
    value,
    httpOnly: true,
    secure: true,
    sameSite: 'strict' as const,
    path: PRO_COOKIE_PATH,
    maxAge,
  };
}

/** Login cookie: HttpOnly, Secure, SameSite=Strict, Path=/api/pro, maxAge 43200. */
export function buildLoginCookie(value: string): ProCookieOptions {
  return proCookie(value, PRO_COOKIE_MAX_AGE_SECONDS);
}

/** Logout cookie: same attributes, empty value, maxAge 0. */
export function buildLogoutCookie(): ProCookieOptions {
  return proCookie('', 0);
}
