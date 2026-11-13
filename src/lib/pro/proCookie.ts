import { createHmac, timingSafeEqual } from 'node:crypto';
import { z } from 'zod';

export const PRO_COOKIE_NAME = 'hhi_pro';
export const PRO_COOKIE_PATH = '/api/pro';
export const PRO_COOKIE_MAX_AGE_SECONDS = 43200;

export interface ProCookiePayload {
  role: 'pro';
  /** Expiry, epoch milliseconds. */
  exp: number;
}

const payloadSchema = z.object({
  role: z.literal('pro'),
  exp: z.number().int(),
});

const MAC_BYTES = 32;

function toBase64Url(input: Buffer | string): string {
  return Buffer.from(input).toString('base64url');
}

function mac(payloadPart: string, secret: string): Buffer {
  return createHmac('sha256', secret).update(`pro:${payloadPart}`).digest();
}

/** Returns `base64url(payload).base64url(HMAC-SHA256(secret, "pro:" + base64url(payload)))`. */
export function signProCookie(payload: ProCookiePayload, secret: string): string {
  const payloadPart = toBase64Url(JSON.stringify({ role: payload.role, exp: payload.exp }));
  return `${payloadPart}.${toBase64Url(mac(payloadPart, secret))}`;
}

/** Signs a fresh cookie that expires 12 hours after `nowMs`. An empty secret yields an unverifiable value. */
export function issueProCookie(secret: string, nowMs: number): string {
  if (!secret) {
    return '';
  }
  return signProCookie(
    { role: 'pro', exp: nowMs + PRO_COOKIE_MAX_AGE_SECONDS * 1000 },
    secret,
  );
}

/** Returns the payload for a validly signed, unexpired cookie, or null for anything else. Never throws. */
export function verifyProCookie(
  token: string | undefined | null,
  secret: string,
  nowMs: number,
): ProCookiePayload | null {
  try {
    if (!token || !secret) {
      return null;
    }
    const parts = token.split('.');
    if (parts.length !== 2) {
      return null;
    }
    const [payloadPart, signaturePart] = parts;

    const provided = Buffer.from(signaturePart, 'base64url');
    if (provided.length !== MAC_BYTES || provided.toString('base64url') !== signaturePart) {
      return null;
    }
    const expected = mac(payloadPart, secret);
    if (provided.length !== expected.length || !timingSafeEqual(provided, expected)) {
      return null;
    }

    const payloadBytes = Buffer.from(payloadPart, 'base64url');
    if (payloadBytes.toString('base64url') !== payloadPart) {
      return null;
    }
    const parsed = payloadSchema.safeParse(JSON.parse(payloadBytes.toString('utf8')) as unknown);
    if (!parsed.success || !(parsed.data.exp > nowMs)) {
      return null;
    }
    return parsed.data;
  } catch {
    return null;
  }
}
