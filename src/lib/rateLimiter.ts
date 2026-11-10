import 'server-only';

import { createHash, createHmac, timingSafeEqual } from 'node:crypto';
import type { NextRequest } from 'next/server';
import { z } from 'zod';
import { incrementRateLimitCounter } from '@/lib/aws/dynamodb';

export const RATE_LIMIT_MAX = 15;
export const RATE_LIMIT_WINDOW_MS = 24 * 60 * 60 * 1000;
export const SESSION_COOKIE_NAME = 'hhi_session';

export interface SessionPayload {
  visitorId: string;
  count: number;
  /** Window start, epoch milliseconds. */
  windowStart: number;
}

export interface SessionCookie {
  name: string;
  value: string;
  options: {
    httpOnly: true;
    sameSite: 'strict';
    secure: true;
    maxAge: number;
    path: string;
  };
}

export interface RateLimitResult {
  allowed: boolean;
  /** Inspections left in the window after this request (0 when blocked). */
  remaining: number;
  /** When the window resets, Unix epoch in milliseconds. */
  resetAt: number;
  /** Present on allowed requests when SESSION_SECRET is configured; the route handler sets it. */
  setCookie?: SessionCookie;
}

const payloadSchema = z.object({
  visitorId: z.string().min(1),
  count: z.number().int().nonnegative(),
  windowStart: z.number().int().nonnegative(),
});

function toBase64Url(input: Buffer | string): string {
  return Buffer.from(input).toString('base64url');
}

function hmac(payloadPart: string, secret: string): Buffer {
  return createHmac('sha256', secret).update(payloadPart).digest();
}

/** Returns `base64url(payload).base64url(HMAC-SHA256(secret, payload))`. */
export function signSessionToken(payload: SessionPayload, secret: string): string {
  const payloadPart = toBase64Url(JSON.stringify(payload));
  return `${payloadPart}.${toBase64Url(hmac(payloadPart, secret))}`;
}

/** Returns the payload for a validly signed token, or null for anything else. */
export function verifySessionToken(token: string, secret: string): SessionPayload | null {
  if (!secret) {
    return null;
  }
  const parts = token.split('.');
  if (parts.length !== 2) {
    return null;
  }
  const [payloadPart, signaturePart] = parts;
  const provided = Buffer.from(signaturePart, 'base64url');
  const expected = hmac(payloadPart, secret);
  if (provided.length !== expected.length || !timingSafeEqual(provided, expected)) {
    return null;
  }
  try {
    const parsed = payloadSchema.safeParse(
      JSON.parse(Buffer.from(payloadPart, 'base64url').toString('utf8')) as unknown,
    );
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

let warnedMissingSecret = false;

function getSecret(): string | null {
  const secret = process.env.SESSION_SECRET;
  if (!secret) {
    if (!warnedMissingSecret) {
      warnedMissingSecret = true;
      console.warn('SESSION_SECRET is not set; rate limiting by IP address only.');
    }
    return null;
  }
  return secret;
}

function ipVisitorId(request: NextRequest): string {
  const forwarded = request.headers.get('x-forwarded-for');
  const ip = forwarded?.split(',')[0]?.trim() || 'unknown';
  return `ip:${createHash('sha256').update(ip).digest('hex')}`;
}

/**
 * Check and count one inspection for the requesting visitor.
 * Fails open (allows the request) if the counter store is unavailable.
 */
export async function checkRateLimit(request: NextRequest): Promise<RateLimitResult> {
  const secret = getSecret();
  const now = Date.now();

  let visitorId: string | undefined;
  if (secret) {
    const token = request.cookies.get(SESSION_COOKIE_NAME)?.value;
    visitorId = token ? verifySessionToken(token, secret)?.visitorId : undefined;
  }
  visitorId ??= ipVisitorId(request);

  try {
    const counter = await incrementRateLimitCounter(
      visitorId,
      now,
      RATE_LIMIT_MAX,
      RATE_LIMIT_WINDOW_MS,
    );
    const resetAt = counter.windowStart + RATE_LIMIT_WINDOW_MS;

    if (!counter.allowed) {
      return { allowed: false, remaining: 0, resetAt };
    }

    const result: RateLimitResult = {
      allowed: true,
      remaining: Math.max(0, RATE_LIMIT_MAX - counter.count),
      resetAt,
    };
    if (secret) {
      result.setCookie = {
        name: SESSION_COOKIE_NAME,
        value: signSessionToken(
          { visitorId, count: counter.count, windowStart: counter.windowStart },
          secret,
        ),
        options: { httpOnly: true, sameSite: 'strict', secure: true, maxAge: 86400, path: '/' },
      };
    }
    return result;
  } catch (error: unknown) {
    console.error('Rate limit counter unavailable; allowing request', error);
    return {
      allowed: true,
      remaining: RATE_LIMIT_MAX,
      resetAt: now + RATE_LIMIT_WINDOW_MS,
    };
  }
}
