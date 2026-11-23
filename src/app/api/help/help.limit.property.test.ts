// Feature: chat-and-help, Property 14: The Help_Limit counts every saved message and ignores bots
// Validates: Requirements 14.1, 14.2, 14.4, 14.8, 14.9, 15.3
//
// Route level: the real route, Help pipeline, rate limit counter, Help_Record writer and
// Safety_Layer run against the in-memory table. Only the SES client is mocked.
import fc from 'fast-check';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createFakeDynamoTable, type FakeDynamoTable } from '@/test/fakeDynamoTable';
import { consoleSpies, forwardedFor, makeRequest, withEnv, TEST_SECRET, type ConsoleSpies } from '@/test/proRouteHarness';
import { EMERGENCY_MESSAGE } from '@/lib/emergency/messages';
import { resolveVisitorId } from '@/lib/rateLimiter';

vi.mock('server-only', () => ({}));

const holder = vi.hoisted(() => ({ fake: null as unknown as FakeDynamoTable }));
vi.mock('@aws-sdk/lib-dynamodb', async (importOriginal) => {
  const { fakeDynamoMockFactory } = await import('@/test/fakeDynamoTable');
  return fakeDynamoMockFactory(() => holder.fake)(
    importOriginal as () => Promise<typeof import('@aws-sdk/lib-dynamodb')>,
  );
});

const ses = vi.hoisted(() => ({ send: vi.fn() }));
vi.mock('@aws-sdk/client-sesv2', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@aws-sdk/client-sesv2')>();
  class FakeSesClient {
    send(command: unknown): Promise<unknown> {
      return ses.send(command) as Promise<unknown>;
    }
  }
  return { ...actual, SESv2Client: FakeSesClient };
});

import { POST } from './route';

const NOW_MS = Date.parse('2026-06-01T12:00:00.000Z');
const HELP_LIMIT = 5;
const DAY_MS = 24 * 60 * 60 * 1000;
const TRIGGER_TEXT = 'I can smell gas in the kitchen';

/** Letters without vowels plus digits and spaces: never forms a trigger phrase. */
const SAFE_CHARS = 'bcdfhjklmnpqrtvwxyz0123456789 '.split('');
const safeText = fc
  .string({ unit: fc.constantFrom(...SAFE_CHARS), maxLength: 200 })
  .map((s) => `k${s}`);

function helpRequest(body: Record<string, unknown>) {
  return makeRequest('/api/help', {
    method: 'POST',
    body: { email: 'visitor@example.com', page: '/', side: 'homeowner', ...body },
    headers: { 'x-forwarded-for': forwardedFor('203.0.113.9') },
  });
}

/** The Visitor's id as the route sees it, and both counter items (inspection and help). */
function visitorKeys() {
  const id = resolveVisitorId(helpRequest({ message: 'x' }));
  return { inspection: `RATELIMIT#${id}`, help: `RATELIMIT#help:${id}` };
}

function seedCounter(pk: string, count: number): void {
  holder.fake.seed({ PK: pk, SK: pk, count, windowStart: NOW_MS - 1000, ttl: Math.floor((NOW_MS + DAY_MS) / 1000) });
}

function helpRecords(): unknown[] {
  return [...holder.fake.items.values()].filter((item) => String(item.PK).startsWith('HELP#'));
}

let spies: ConsoleSpies;
let restoreEnv: () => void;

beforeEach(() => {
  restoreEnv = withEnv({
    DYNAMODB_TABLE_NAME: 'test-table',
    SESSION_SECRET: TEST_SECRET,
    CONTACT_FROM_EMAIL: 'from@example.com',
    CONTACT_TO_EMAIL: 'to@example.com',
  });
  holder.fake = createFakeDynamoTable({ allowRateLimitWrites: true });
  ses.send.mockReset();
  ses.send.mockResolvedValue({});
  spies = consoleSpies();
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(NOW_MS);
});

afterEach(() => {
  vi.useRealTimers();
  restoreEnv();
  spies.restore();
});

describe('Property 14: The Help_Limit counts every saved message and ignores bots', () => {
  it('saves and sends exactly min(N, 5); blocked non-Trigger messages get 429; inspection counter unchanged', async () => {
    const messageArb = fc.record({ trigger: fc.boolean(), text: safeText });
    await fc.assert(
      fc.asyncProperty(fc.array(messageArb, { minLength: 1, maxLength: 12 }), async (messages) => {
        holder.fake = createFakeDynamoTable({ allowRateLimitWrites: true });
        ses.send.mockClear();
        const keys = visitorKeys();
        seedCounter(keys.inspection, 3);
        const inspectionBefore = holder.fake.get(keys.inspection);

        for (const [index, message] of messages.entries()) {
          const response = await POST(
            helpRequest({ message: message.trigger ? TRIGGER_TEXT : message.text }),
          );
          const body = (await response.json()) as { status?: string; message?: string };
          if (message.trigger) {
            expect(response.status).toBe(200);
            expect(body).toEqual({ status: 'emergency', message: EMERGENCY_MESSAGE });
          } else if (index < HELP_LIMIT) {
            expect(response.status).toBe(200);
            expect(body).toEqual({ status: 'sent' });
          } else {
            expect(response.status).toBe(429);
            const retryAfter = Number(response.headers.get('Retry-After'));
            expect(Number.isInteger(retryAfter)).toBe(true);
            expect(retryAfter).toBeGreaterThan(0);
            expect(retryAfter).toBeLessThanOrEqual(DAY_MS / 1000);
          }
        }

        const expected = Math.min(messages.length, HELP_LIMIT);
        expect(helpRecords()).toHaveLength(expected);
        expect(ses.send).toHaveBeenCalledTimes(expected);
        expect(holder.fake.get(keys.help)?.count).toBe(expected);
        expect(holder.fake.get(keys.inspection)).toEqual(inspectionBefore);
      }),
      { numRuns: 100 },
    );
  }, 30_000);

  it('ignores any non-empty Honeypot: normal answer, nothing saved, sent or counted', async () => {
    const honeypotArb = fc.string({ minLength: 1, maxLength: 50 });
    const itemArb = fc.record({ trigger: fc.boolean(), text: safeText, honeypot: honeypotArb });
    await fc.assert(
      fc.asyncProperty(
        fc.integer({ min: 0, max: HELP_LIMIT }),
        fc.array(itemArb, { minLength: 1, maxLength: 8 }),
        async (alreadyCounted, items) => {
          holder.fake = createFakeDynamoTable({ allowRateLimitWrites: true });
          ses.send.mockClear();
          const keys = visitorKeys();
          seedCounter(keys.inspection, 3);
          if (alreadyCounted > 0) seedCounter(keys.help, alreadyCounted);
          const itemsBefore = new Map(holder.fake.items);
          const callsBefore = holder.fake.calls.length;

          for (const item of items) {
            const response = await POST(
              helpRequest({ message: item.trigger ? TRIGGER_TEXT : item.text, website: item.honeypot }),
            );
            const body = (await response.json()) as unknown;
            expect(response.status).toBe(200);
            expect(body).toEqual(
              item.trigger ? { status: 'emergency', message: EMERGENCY_MESSAGE } : { status: 'sent' },
            );
          }

          expect(helpRecords()).toHaveLength(0);
          expect(ses.send).not.toHaveBeenCalled();
          expect(holder.fake.calls.length).toBe(callsBefore);
          expect(holder.fake.items).toEqual(itemsBefore);
        },
      ),
      { numRuns: 100 },
    );
  }, 30_000);
});
