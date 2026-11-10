import { createHash } from 'node:crypto';
import { NextRequest } from 'next/server';
import * as fc from 'fast-check';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

interface FakeEntry {
  count: number;
  windowStart: number;
}

// Stateful in-memory fake mirroring the real DynamoDB semantics:
// allowed iff no entry, or (window still open AND count < limit); blocked calls do not
// increment; an expired window starts afresh with count 1.
const store = new Map<string, FakeEntry>();

vi.mock('@/lib/aws/dynamodb', () => ({
  incrementRateLimitCounter: vi.fn(
    async (visitorId: string, nowMs: number, limit: number, windowMs: number) => {
      const existing = store.get(visitorId);
      if (!existing || existing.windowStart <= nowMs - windowMs) {
        const fresh = { count: 1, windowStart: nowMs };
        store.set(visitorId, fresh);
        return { allowed: true, ...fresh };
      }
      if (existing.count >= limit) {
        return { allowed: false, count: existing.count, windowStart: existing.windowStart };
      }
      existing.count += 1;
      return { allowed: true, count: existing.count, windowStart: existing.windowStart };
    },
  ),
}));

import { RATE_LIMIT_MAX, checkRateLimit } from '@/lib/rateLimiter';

// Feature: intake-and-triage, Property 20: Rate limiter blocks at the threshold
// Validates: Requirements 11.1, 11.2
//
// The "POST /api/inspect responds with HTTP 429 before invoking the Bedrock_Client" half of
// Property 20 belongs to integration task 12.2 (the route handler does not exist yet) and is
// intentionally not tested here.

let runCounter = 0;

function uniqueIp(): string {
  runCounter += 1;
  return `10.${(runCounter >> 16) & 255}.${(runCounter >> 8) & 255}.${runCounter & 255}`;
}

function visitorIdFor(ip: string): string {
  return `ip:${createHash('sha256').update(ip).digest('hex')}`;
}

function requestFrom(ip: string): NextRequest {
  return new NextRequest('http://localhost/api/inspect', {
    method: 'POST',
    headers: { 'x-forwarded-for': ip },
  });
}

describe('Property 20: Rate limiter blocks at the threshold', () => {
  const originalSecret = process.env.SESSION_SECRET;

  beforeEach(() => {
    store.clear();
    process.env.SESSION_SECRET = 'test-secret-for-property-tests';
  });

  afterEach(() => {
    if (originalSecret === undefined) {
      delete process.env.SESSION_SECRET;
    } else {
      process.env.SESSION_SECRET = originalSecret;
    }
  });

  it('allows iff the prior count is below 15, with correct remaining and resetAt', async () => {
    await fc.assert(
      fc.asyncProperty(fc.integer({ min: 0, max: 30 }), async (priorCount) => {
        const ip = uniqueIp();
        if (priorCount > 0) {
          store.set(visitorIdFor(ip), { count: priorCount, windowStart: Date.now() - 1000 });
        }

        const before = Date.now();
        const result = await checkRateLimit(requestFrom(ip));

        expect(result.allowed).toBe(priorCount < RATE_LIMIT_MAX);
        expect(result.resetAt).toBeGreaterThan(before);
        if (result.allowed) {
          expect(result.remaining).toBe(RATE_LIMIT_MAX - (priorCount + 1));
        } else {
          expect(result.remaining).toBe(0);
          // Blocked calls do not increment.
          expect(store.get(visitorIdFor(ip))?.count).toBe(priorCount);
        }
      }),
      { numRuns: 100 },
    );
  });

  it('allows exactly min(N, 15) of N sequential calls from one visitor', async () => {
    await fc.assert(
      fc.asyncProperty(fc.integer({ min: 0, max: 40 }), async (n) => {
        const ip = uniqueIp();
        let allowedCount = 0;
        for (let i = 0; i < n; i += 1) {
          const result = await checkRateLimit(requestFrom(ip));
          if (result.allowed) {
            allowedCount += 1;
          }
        }
        expect(allowedCount).toBe(Math.min(n, RATE_LIMIT_MAX));
      }),
      { numRuns: 50 },
    );
  });
});
