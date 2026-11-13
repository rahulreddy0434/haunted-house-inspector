// @vitest-environment node
import { describe, it, expect, vi, afterEach } from 'vitest';
import fc from 'fast-check';
import { attemptLogin, type LockoutStore } from '@/lib/pro/loginFlow';
import { verifyProCookie } from '@/lib/pro/proCookie';
import { createInMemoryLockoutStore } from '@/test/inMemoryLockoutStore';

// Feature: pro-dashboard-and-booking, Property 4: Lockout counter
// **Validates: Requirements 2.1, 2.3, 2.4, 2.5, 2.6, 2.7, 2.8, 2.9, 2.11, 2.12, 16.5**

const ACCESS_CODE = 'correct-demo-code';
const SECRET = 'test-session-secret-for-property-4';
const WINDOW_MS = 900_000;
const MAX_WRONG = 5;
const BASE_MS = 1_800_000_000_000;

interface Step {
  ip: number;
  correct: boolean;
  gap: number;
}

/** Independent reference model: per IP a fixed window and a count of wrong attempts. */
interface ModelEntry {
  start: number;
  wrong: number;
}

type Expected =
  | { kind: 'ok' }
  | { kind: 'invalid_code' }
  | { kind: 'locked'; retryAfterSeconds: number };

function modelStep(
  model: Map<string, ModelEntry>,
  ip: string,
  correct: boolean,
  now: number,
): Expected {
  let entry = model.get(ip);
  if (!entry || now >= entry.start + WINDOW_MS) {
    entry = { start: now, wrong: 0 };
    model.set(ip, entry);
  }
  if (entry.wrong >= MAX_WRONG) {
    const remainingMs = entry.start + WINDOW_MS - now;
    return { kind: 'locked', retryAfterSeconds: Math.ceil(remainingMs / 1000) };
  }
  if (correct) {
    return { kind: 'ok' };
  }
  entry.wrong += 1;
  return { kind: 'invalid_code' };
}

const ipNames = ['ip-a', 'ip-b', 'ip-c'];

function sequences(maxTotalSpanMs: number, maxGap: number) {
  return fc
    .integer({ min: 1, max: 3 })
    .chain((ipCount) =>
      fc.array(
        fc.record({
          ip: fc.integer({ min: 0, max: ipCount - 1 }),
          // Biased towards wrong codes so that locks are reached often.
          correct: fc.integer({ min: 0, max: 9 }).map((n) => n === 0),
          gap: fc.integer({ min: 0, max: maxGap }),
        }),
        { minLength: 1, maxLength: 30 },
      ),
    )
    .map((steps): Step[] => {
      let total = 0;
      return steps.map((s) => {
        const gap = Math.min(s.gap, Math.max(0, maxTotalSpanMs - total));
        total += gap;
        return { ...s, gap };
      });
    });
}

async function runSequence(steps: Step[]): Promise<void> {
  const store = createInMemoryLockoutStore();
  const model = new Map<string, ModelEntry>();
  let now = BASE_MS;

  for (const step of steps) {
    now += step.gap;
    const ip = ipNames[step.ip];
    const expected = modelStep(model, ip, step.correct, now);
    const outcome = await attemptLogin(step.correct ? ACCESS_CODE : 'wrong-code', ip, {
      store,
      accessCode: ACCESS_CODE,
      secret: SECRET,
      nowMs: now,
      log: () => {},
    });

    expect(outcome.kind).toBe(expected.kind);
    if (expected.kind === 'ok' && outcome.kind === 'ok') {
      expect(verifyProCookie(outcome.cookieValue, SECRET, now)).not.toBeNull();
    }
    if (expected.kind === 'locked' && outcome.kind === 'locked') {
      expect(outcome.retryAfterSeconds).toBeGreaterThanOrEqual(1);
      expect(outcome.retryAfterSeconds).toBeLessThanOrEqual(900);
      expect(outcome.retryAfterSeconds).toBe(expected.retryAfterSeconds);
    }

    // Counter never exceeds 5 and matches the model; other IPs are unaffected.
    for (const name of ipNames) {
      const peeked = store.peek(name);
      const modelled = model.get(name);
      if (peeked) {
        expect(peeked.count).toBeLessThanOrEqual(MAX_WRONG);
        expect(peeked.count).toBeGreaterThanOrEqual(0);
      }
      if (modelled) {
        expect(peeked).toBeDefined();
        expect(peeked?.windowStart).toBe(modelled.start);
        expect(peeked?.count).toBe(modelled.wrong);
      } else {
        expect(peeked).toBeUndefined();
      }
    }
  }
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('Property 4: Lockout counter (model store)', () => {
  it('follows the reference model inside one 15-minute window', async () => {
    const dateNow = vi.spyOn(Date, 'now');
    await fc.assert(
      fc.asyncProperty(sequences(WINDOW_MS - 1, 60_000), runSequence),
      { numRuns: 200 },
    );
    expect(dateNow).not.toHaveBeenCalled();
  });

  it('resets the counter when the clock jumps to windowStart + 900000 or later', async () => {
    const dateNow = vi.spyOn(Date, 'now');
    await fc.assert(
      fc.asyncProperty(sequences(5 * WINDOW_MS, 2 * WINDOW_MS), runSequence),
      { numRuns: 200 },
    );
    expect(dateNow).not.toHaveBeenCalled();
  });

  it('locks after 5 wrong attempts, then a jump of exactly 900000 ms starts a new window at 1', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.integer({ min: 0, max: WINDOW_MS - 1 }),
        fc.integer({ min: 0, max: 3_600_000 }),
        fc.boolean(),
        async (lastOffset, extra, correctAfter) => {
          const store = createInMemoryLockoutStore();
          const deps = (nowMs: number) => ({
            store,
            accessCode: ACCESS_CODE,
            secret: SECRET,
            nowMs,
            log: () => {},
          });
          for (let i = 0; i < MAX_WRONG; i++) {
            const o = await attemptLogin('nope', 'ip-a', deps(BASE_MS + (i === 0 ? 0 : lastOffset)));
            expect(o.kind).toBe('invalid_code');
          }
          expect(store.peek('ip-a')?.count).toBe(5);
          const locked = await attemptLogin(ACCESS_CODE, 'ip-a', deps(BASE_MS + lastOffset));
          expect(locked.kind).toBe('locked');
          // Another IP is unaffected.
          const other = await attemptLogin(ACCESS_CODE, 'ip-b', deps(BASE_MS + lastOffset));
          expect(other.kind).toBe('ok');

          const later = BASE_MS + WINDOW_MS + extra;
          const after = await attemptLogin(correctAfter ? ACCESS_CODE : 'nope', 'ip-a', deps(later));
          if (correctAfter) {
            expect(after.kind).toBe('ok');
            expect(store.peek('ip-a')?.count).toBe(0);
          } else {
            expect(after.kind).toBe('invalid_code');
            expect(store.peek('ip-a')?.count).toBe(1);
            expect(store.peek('ip-a')?.windowStart).toBe(later);
          }
        },
      ),
      { numRuns: 100 },
    );
  });

  it('returns failed and no cookie when the store throws on reserve', async () => {
    const dateNow = vi.spyOn(Date, 'now');
    await fc.assert(
      fc.asyncProperty(
        fc.boolean(),
        fc.constantFrom('ip-a', 'ip-b', 'ip-c'),
        fc.integer({ min: 0, max: WINDOW_MS - 1 }),
        async (correct, ip, offset) => {
          const release = vi.fn(async () => {});
          const store: LockoutStore = {
            reserve: async () => {
              throw new Error('store down');
            },
            release,
          };
          const outcome = await attemptLogin(correct ? ACCESS_CODE : 'wrong', ip, {
            store,
            accessCode: ACCESS_CODE,
            secret: SECRET,
            nowMs: BASE_MS + offset,
            log: () => {},
          });
          expect(outcome).toEqual({ kind: 'failed' });
          expect(outcome).not.toHaveProperty('cookieValue');
          expect(release).not.toHaveBeenCalled();
        },
      ),
      { numRuns: 100 },
    );
    expect(dateNow).not.toHaveBeenCalled();
  });
});
