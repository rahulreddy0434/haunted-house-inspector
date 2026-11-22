import fc from 'fast-check';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createFakeDynamoTable, type FakeDynamoTable } from '@/test/fakeDynamoTable';
import { FIXTURE_NOW_MS, makeJobItem } from '@/test/jobFixtures';
import {
  TEST_SECRET,
  callWithId,
  consoleSpies,
  makeRequest,
  validProCookie,
  withEnv,
  type ConsoleSpies,
} from '@/test/proRouteHarness';
import { statusAfterSend } from '@/lib/chat/rules';
import type { ChatReadResponse, ChatSendResponse, ChatSide } from '@/types/chat';
import type { JobStatus } from '@/types/job';

vi.mock('server-only', () => ({}));

const holder = vi.hoisted(() => ({ fake: null as unknown as FakeDynamoTable }));
vi.mock('@aws-sdk/lib-dynamodb', async (importOriginal) => {
  const { fakeDynamoMockFactory } = await import('@/test/fakeDynamoTable');
  return fakeDynamoMockFactory(() => holder.fake)(
    importOriginal as () => Promise<typeof import('@aws-sdk/lib-dynamodb')>,
  );
});

import { GET as homeownerGet, POST as homeownerPost } from './route';
import { POST as proPost } from '@/app/api/pro/jobs/[id]/chat/route';

const OPEN_STATUSES = ['new', 'info_requested', 'accepted', 'booked'] as const satisfies readonly JobStatus[];

/** Safe text: no emergency trigger can be built from these characters. */
const messageText = fc.string({
  unit: fc.constantFrom(...'xyz0123 '.split('')),
  minLength: 1,
  maxLength: 40,
}).filter((t) => t.trim().length > 0);

/** Each step is one send. Each Side stays under 10 sends per 60 s, so the rate limit never applies. */
const stepArb = fc.record({
  side: fc.constantFrom<ChatSide>('homeowner', 'tradesperson'),
  text: messageText,
  /** Extra seconds added to the clock before the send (injected clock). */
  extraSeconds: fc.integer({ min: 0, max: 90 }),
});

let spies: ConsoleSpies;
let restoreEnv: () => void;

beforeEach(() => {
  restoreEnv = withEnv({ DYNAMODB_TABLE_NAME: 'test-table', SESSION_SECRET: TEST_SECRET });
  spies = consoleSpies();
  vi.useFakeTimers({ toFake: ['Date'] });
});

afterEach(() => {
  vi.useRealTimers();
  restoreEnv();
  spies.restore();
});

describe('chat status rules through the routes', () => {
  // Feature: chat-and-help, Property 4: Status rules for chat
  // **Validates: Requirements 2.1, 2.2, 2.3, 2.7, 21.3**
  it(
    'stored status equals the model and the stored thread length equals the accepted messages',
    async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.constantFrom(...OPEN_STATUSES),
          fc.array(stepArb, { minLength: 1, maxLength: 30 }),
          async (initial, steps) => {
            holder.fake = createFakeDynamoTable();
            const job = makeJobItem(initial);
            holder.fake.seed({ ...job });
            const id = job.id;
            let clock = FIXTURE_NOW_MS;
            vi.setSystemTime(clock);

            let modelStatus: JobStatus = initial;
            let accepted = 0;
            const sentOrder: Array<{ side: ChatSide; text: string }> = [];

            for (const step of steps) {
              // 7 s minimum spacing keeps each Side below 10 sends in any 60 s window.
              clock += 7_000 + step.extraSeconds * 1_000;
              vi.setSystemTime(clock);

              const path = `/api/inspections/${id}/chat`;
              const response =
                step.side === 'homeowner'
                  ? await callWithId(homeownerPost, makeRequest(path, { body: { text: step.text } }), id)
                  : await callWithId(
                      proPost,
                      makeRequest(`/api/pro/jobs/${id}/chat`, {
                        body: { text: step.text },
                        cookie: validProCookie(clock),
                      }),
                      id,
                    );

              const rule = statusAfterSend(modelStatus, step.side);
              expect(rule.ok).toBe(true);
              if (!rule.ok) return;
              expect(response.status).toBe(200);
              const body = (await response.json()) as ChatSendResponse;
              modelStatus = rule.next;
              accepted += 1;
              sentOrder.push({ side: step.side, text: step.text.trim() });

              expect(body.status).toBe(modelStatus);
              expect(body.message.id).toBe(`c-${accepted}`);

              // Stored state after every send: status and thread length move together.
              const storedJob = holder.fake.get(`JOB#${id}`);
              expect(storedJob?.status).toBe(modelStatus);
              expect(storedJob?.chatSeq).toBe(accepted);
              const chatItems = [...holder.fake.items.values()].filter(
                (it) => it.PK === `JOB#${id}` && typeof it.SK === 'string' && it.SK.startsWith('CHAT#'),
              );
              expect(chatItems).toHaveLength(accepted);
            }

            // The thread read back through the route matches what was accepted, in order.
            const read = await callWithId(
              homeownerGet,
              makeRequest(`/api/inspections/${id}/chat?after=0`),
              id,
            );
            expect(read.status).toBe(200);
            const readBody = (await read.json()) as ChatReadResponse;
            expect(readBody.status).toBe(modelStatus);
            expect(readBody.lastSeq).toBe(accepted);
            expect(readBody.messages.map((m) => ({ side: m.side, text: m.text }))).toEqual(sentOrder);
          },
        ),
        { numRuns: 100 },
      );
    },
    30_000,
  );
});
