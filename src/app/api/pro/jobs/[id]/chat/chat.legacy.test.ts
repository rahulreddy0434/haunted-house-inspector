import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createFakeDynamoTable, type FakeDynamoTable } from '@/test/fakeDynamoTable';
import { FIXTURE_NOW_MS, makeChatItem, makeJobItem } from '@/test/jobFixtures';
import {
  TEST_SECRET,
  callWithId,
  consoleSpies,
  makeRequest,
  validProCookie,
  withEnv,
  type ConsoleSpies,
} from '@/test/proRouteHarness';
import type { ChatReadResponse } from '@/types/chat';

vi.mock('server-only', () => ({}));

const holder = vi.hoisted(() => ({ fake: null as unknown as FakeDynamoTable }));
vi.mock('@aws-sdk/lib-dynamodb', async (importOriginal) => {
  const { fakeDynamoMockFactory } = await import('@/test/fakeDynamoTable');
  return fakeDynamoMockFactory(() => holder.fake)(
    importOriginal as () => Promise<typeof import('@aws-sdk/lib-dynamodb')>,
  );
});

import { GET } from './route';

const MIN = 60 * 1000;
const at = (minutesAgo: number): string => new Date(FIXTURE_NOW_MS - minutesAgo * MIN).toISOString();

let spies: ConsoleSpies;
let restoreEnv: () => void;

beforeEach(() => {
  restoreEnv = withEnv({ DYNAMODB_TABLE_NAME: 'test-table', SESSION_SECRET: TEST_SECRET });
  spies = consoleSpies();
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(FIXTURE_NOW_MS);
});

afterEach(() => {
  vi.useRealTimers();
  restoreEnv();
  spies.restore();
});

describe('Pro chat GET with legacy messages', () => {
  it('returns legacy questions and replies by stored time, then chat messages', async () => {
    holder.fake = createFakeDynamoTable();
    const job = makeJobItem('info_requested', {
      infoRequests: [
        { question: 'Is the leak constant?', askedAt: at(50) },
        { question: 'Where exactly is it?', askedAt: at(40) },
        { question: 'Any photos of the pipe?', askedAt: at(30) },
      ],
      replies: [
        { text: 'Yes, all day.', at: at(45) },
        { text: 'Under the kitchen sink.', at: at(35) },
      ],
      replyCount: 2,
      chatSeq: 2,
      chatLastAt: at(10),
    });
    holder.fake.seed({ ...job });
    holder.fake.seed({ ...makeChatItem(job.id, 1, { side: 'homeowner', text: 'Sent a photo.', sentAt: at(20) }) });
    holder.fake.seed({ ...makeChatItem(job.id, 2, { side: 'tradesperson', text: 'Thanks, looking.', sentAt: at(10) }) });

    const response = await callWithId(
      GET,
      makeRequest(`/api/pro/jobs/${job.id}/chat`, { cookie: validProCookie(FIXTURE_NOW_MS) }),
      job.id,
    );
    expect(response.status).toBe(200);
    const body = (await response.json()) as ChatReadResponse;

    expect(body.status).toBe('info_requested');
    expect(body.booking).toEqual({});
    expect(body.lastSeq).toBe(2);
    expect(body.messages).toEqual([
      { id: 'q-0', side: 'tradesperson', text: 'Is the leak constant?', sentAt: at(50), legacy: true },
      { id: 'r-0', side: 'homeowner', text: 'Yes, all day.', sentAt: at(45), legacy: true },
      { id: 'q-1', side: 'tradesperson', text: 'Where exactly is it?', sentAt: at(40), legacy: true },
      { id: 'r-1', side: 'homeowner', text: 'Under the kitchen sink.', sentAt: at(35), legacy: true },
      { id: 'q-2', side: 'tradesperson', text: 'Any photos of the pipe?', sentAt: at(30), legacy: true },
      { id: 'c-1', side: 'homeowner', text: 'Sent a photo.', sentAt: at(20), legacy: false },
      { id: 'c-2', side: 'tradesperson', text: 'Thanks, looking.', sentAt: at(10), legacy: false },
    ]);
  });
});
