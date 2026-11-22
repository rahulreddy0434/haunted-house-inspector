import fc from 'fast-check';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createFakeDynamoTable, type FakeDynamoTable } from '@/test/fakeDynamoTable';
import { FIXTURE_NOW_MS, makeChatItem, makeJobItem } from '@/test/jobFixtures';
import {
  TEST_ACCESS_CODE,
  TEST_SECRET,
  callWithId,
  consoleSpies,
  makeRequest,
  validProCookie,
  withEnv,
  type ConsoleSpies,
} from '@/test/proRouteHarness';
import {
  MESSAGE_RATE_MAX,
  MESSAGE_RATE_WINDOW_MS,
  THREAD_LIMIT,
  checkSendLimits,
} from '@/lib/chat/limits';
import type { ChatSide } from '@/types/chat';

vi.mock('server-only', () => ({}));

// The chat routes must never touch the inspection rate limiter.
vi.mock('@/lib/rateLimiter', () => {
  throw new Error('rateLimiter must not be imported by the chat routes');
});

const holder = vi.hoisted(() => ({ fake: null as unknown as FakeDynamoTable }));

vi.mock('@aws-sdk/lib-dynamodb', async (importOriginal) => {
  const { fakeDynamoMockFactory } = await import('@/test/fakeDynamoTable');
  return fakeDynamoMockFactory(() => holder.fake)(
    importOriginal as () => Promise<typeof import('@aws-sdk/lib-dynamodb')>,
  );
});

import { POST as homeownerPost } from './route';
import { POST as proPost } from '@/app/api/pro/jobs/[id]/chat/route';

const BASE_MS = FIXTURE_NOW_MS;

let spies: ConsoleSpies;
let restoreEnv: () => void;

beforeEach(() => {
  restoreEnv = withEnv({
    DYNAMODB_TABLE_NAME: 'test-table',
    SESSION_SECRET: TEST_SECRET,
    PRO_ACCESS_CODE: TEST_ACCESS_CODE,
  });
  spies = consoleSpies();
  // Injected clock: only Date is faked; the routes read Date.now().
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(BASE_MS);
});

afterEach(() => {
  vi.useRealTimers();
  restoreEnv();
  spies.restore();
});

interface Step {
  side: ChatSide;
  gapMs: number;
}

interface Scenario {
  startSeq: number;
  fullWindowHomeowner: boolean;
  fullWindowTradesperson: boolean;
  steps: Step[];
}

const arbitraryGap = fc.oneof(
  { weight: 4, arbitrary: fc.constant(0) },
  { weight: 4, arbitrary: fc.integer({ min: 1, max: 1500 }) },
  { weight: 2, arbitrary: fc.integer({ min: 5_000, max: 30_000 }) },
  { weight: 2, arbitrary: fc.integer({ min: 59_000, max: 61_000 }) },
);

const arbitraryScenario: fc.Arbitrary<Scenario> = fc.record({
  startSeq: fc.oneof(fc.constant(0), fc.integer({ min: 0, max: 99 }), fc.integer({ min: 94, max: 100 })),
  fullWindowHomeowner: fc.boolean(),
  fullWindowTradesperson: fc.boolean(),
  steps: fc.array(
    fc.record({
      side: fc.constantFrom<ChatSide>('homeowner', 'tradesperson'),
      gapMs: arbitraryGap,
    }),
    { minLength: 1, maxLength: 60 },
  ),
});

/** Ten send times inside the last minute, ascending. */
function fullWindow(): number[] {
  return Array.from({ length: MESSAGE_RATE_MAX }, (_, i) => BASE_MS - 59_000 + i * 100);
}

function chatItemCount(fake: FakeDynamoTable, jobId: string): number {
  let count = 0;
  for (const item of fake.items.values()) {
    if (item.PK === `JOB#${jobId}` && typeof item.SK === 'string' && item.SK.startsWith('CHAT#')) {
      count += 1;
    }
  }
  return count;
}

async function runScenario(scenario: Scenario): Promise<void> {
  holder.fake = createFakeDynamoTable();
  vi.setSystemTime(BASE_MS);

  const sentHomeowner = scenario.fullWindowHomeowner ? fullWindow() : undefined;
  const sentTradesperson = scenario.fullWindowTradesperson ? fullWindow() : undefined;
  const lastChat = scenario.startSeq > 0 ? makeChatItem('x', scenario.startSeq) : undefined;

  const item = makeJobItem('new', {
    ...(scenario.startSeq > 0 ? { chatSeq: scenario.startSeq, chatLastAt: lastChat?.sentAt } : {}),
    ...(sentHomeowner ? { chatSentHomeowner: sentHomeowner } : {}),
    ...(sentTradesperson ? { chatSentTradesperson: sentTradesperson } : {}),
  });
  const id = item.id;
  holder.fake.seed({ ...item });
  for (let seq = 1; seq <= scenario.startSeq; seq += 1) {
    holder.fake.seed({ ...makeChatItem(id, seq) });
  }

  const cookie = validProCookie(BASE_MS);

  // The model: accepted send times per Side (seeded ones included) and the thread size.
  const accepted: Record<ChatSide, number[]> = {
    homeowner: [...(sentHomeowner ?? [])],
    tradesperson: [...(sentTradesperson ?? [])],
  };
  let threadSize = scenario.startSeq;

  let nowMs = BASE_MS;
  for (const [index, step] of scenario.steps.entries()) {
    nowMs += step.gapMs;
    vi.setSystemTime(nowMs);

    const text = `limit test message ${index}`;
    const response =
      step.side === 'homeowner'
        ? await callWithId(
            homeownerPost,
            makeRequest(`/api/inspections/${id}/chat`, { body: { text } }),
            id,
          )
        : await callWithId(
            proPost,
            makeRequest(`/api/pro/jobs/${id}/chat`, { body: { text }, cookie }),
            id,
          );

    const recent = accepted[step.side].filter((t) => t > nowMs - MESSAGE_RATE_WINDOW_MS);
    const modelResult = checkSendLimits({ chatSeq: threadSize, sent: accepted[step.side] }, nowMs);

    if (threadSize >= THREAD_LIMIT) {
      // The thread limit wins, even when the rate limit also applies.
      expect(response.status).toBe(429);
      expect(((await response.json()) as { error: string }).error).toBe('THREAD_LIMIT_REACHED');
      expect(response.headers.get('retry-after')).toBeNull();
      expect(modelResult).toEqual({ ok: false, reason: 'THREAD_LIMIT_REACHED' });
    } else if (recent.length >= MESSAGE_RATE_MAX) {
      const expectedSeconds = Math.max(
        1,
        Math.ceil((Math.min(...recent) + MESSAGE_RATE_WINDOW_MS - nowMs) / 1000),
      );
      expect(response.status).toBe(429);
      expect(((await response.json()) as { error: string }).error).toBe('MESSAGE_RATE_LIMITED');
      expect(response.headers.get('retry-after')).toBe(String(expectedSeconds));
      expect(modelResult).toEqual({
        ok: false,
        reason: 'MESSAGE_RATE_LIMITED',
        retryAfterSeconds: expectedSeconds,
      });
    } else {
      expect(response.status).toBe(200);
      expect(modelResult.ok).toBe(true);
      accepted[step.side].push(nowMs);
      threadSize += 1;
    }

    // Invariants after every request.
    expect(chatItemCount(holder.fake, id)).toBe(threadSize);
    expect(threadSize).toBeLessThanOrEqual(THREAD_LIMIT);
    expect((holder.fake.get(`JOB#${id}`)?.chatSeq as number | undefined) ?? 0).toBe(threadSize);
    for (const side of ['homeowner', 'tradesperson'] as const) {
      const inWindow = accepted[side].filter((t) => t > nowMs - MESSAGE_RATE_WINDOW_MS);
      expect(inWindow.length).toBeLessThanOrEqual(MESSAGE_RATE_MAX);
    }
  }
}

describe('Property 7: Chat limits hold for every sequence (routes)', () => {
  // Feature: chat-and-help, Property 7: Chat limits hold for every sequence
  it(
    'never stores more than 100 messages or 10 per Side per 60 s, and Retry-After matches the model',
    async () => {
      await fc.assert(
        fc.asyncProperty(arbitraryScenario, async (scenario) => {
          await runScenario(scenario);
        }),
        { numRuns: 100 },
      );
    },
    30_000,
  );
});
