import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import {
  checkSendLimits,
  THREAD_LIMIT,
  MESSAGE_RATE_MAX,
  MESSAGE_RATE_WINDOW_MS,
} from './limits';

// Feature: chat-and-help, Property 7: Chat limits hold for every sequence
// **Validates: Requirements 7.1, 7.2, 7.3, 7.9, 7.10, 21.5**

type Side = 'homeowner' | 'pro';

const stepArb = fc.record({
  side: fc.constantFrom<Side>('homeowner', 'pro'),
  delta: fc.integer({ min: 0, max: 15_000 }),
});

describe('Property 7: Chat limits hold for every sequence', () => {
  it('never exceeds thread or per-Side window limits and reports exact Retry-After', () => {
    fc.assert(
      fc.property(fc.array(stepArb, { minLength: 1, maxLength: 300 }), (steps) => {
        let now = 1_700_000_000_000;
        let chatSeq = 0;
        const sent: Record<Side, number[]> = { homeowner: [], pro: [] };
        const accepted: Record<Side, number[]> = { homeowner: [], pro: [] };

        for (const { side, delta } of steps) {
          now += delta;
          const counted = sent[side].filter((t) => t > now - MESSAGE_RATE_WINDOW_MS);
          const res = checkSendLimits({ chatSeq, sent: sent[side] }, now);

          if (chatSeq >= THREAD_LIMIT) {
            // thread limit wins, even when the rate limit also applies
            expect(res).toEqual({ ok: false, reason: 'THREAD_LIMIT_REACHED' });
          } else if (counted.length >= MESSAGE_RATE_MAX) {
            expect(res.ok).toBe(false);
            if (res.ok || res.reason !== 'MESSAGE_RATE_LIMITED') throw new Error('expected rate limit');
            const expected = Math.ceil((Math.min(...counted) + MESSAGE_RATE_WINDOW_MS - now) / 1000);
            expect(res.retryAfterSeconds).toBeGreaterThanOrEqual(1);
            expect(res.retryAfterSeconds).toBe(Math.max(1, expected));
            expect(Number.isInteger(res.retryAfterSeconds)).toBe(true);
          } else {
            expect(res.ok).toBe(true);
            if (!res.ok) throw new Error('expected ok');
            sent[side] = res.nextSent;
            accepted[side].push(now);
            chatSeq += 1;
          }

          expect(chatSeq).toBeLessThanOrEqual(THREAD_LIMIT);
          for (const s of ['homeowner', 'pro'] as const) {
            const inWindow = accepted[s].filter((t) => t > now - MESSAGE_RATE_WINDOW_MS);
            expect(inWindow.length).toBeLessThanOrEqual(MESSAGE_RATE_MAX);
          }
        }
        expect(accepted.homeowner.length + accepted.pro.length).toBeLessThanOrEqual(THREAD_LIMIT);
      }),
      { numRuns: 200 },
    );
  });

  it('keeps the Sides independent', () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 1_000_000 }), (now) => {
        let a: number[] = [];
        for (let i = 0; i < MESSAGE_RATE_MAX; i++) {
          const r = checkSendLimits({ chatSeq: i, sent: a }, now);
          if (!r.ok) throw new Error('expected ok');
          a = r.nextSent;
        }
        expect(checkSendLimits({ chatSeq: 10, sent: a }, now).ok).toBe(false);
        expect(checkSendLimits({ chatSeq: 10, sent: [] }, now).ok).toBe(true);
      }),
      { numRuns: 100 },
    );
  });

  it('thread limit wins over rate limit for any full window', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 1_000_000 }),
        fc.integer({ min: THREAD_LIMIT, max: THREAD_LIMIT + 50 }),
        (now, chatSeq) => {
          const sent = Array.from({ length: MESSAGE_RATE_MAX }, () => now);
          expect(checkSendLimits({ chatSeq, sent }, now)).toEqual({
            ok: false,
            reason: 'THREAD_LIMIT_REACHED',
          });
        },
      ),
      { numRuns: 100 },
    );
  });
});
