// @vitest-environment jsdom
// Feature: chat-and-help, task 4.6. Integration tests for the live page updates.
// Real ResultsView / JobDetail with the real ChatPanel and hooks. Only fetch is mocked.

import { Profiler } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, render } from '@testing-library/react';
import { ResultsView } from '@/components/results/ResultsView';
import { JobDetail } from '@/components/pro/JobDetail';
import { resetProSession } from '@/hooks/proSession';
import { FAST_INTERVAL_MS } from '@/lib/chat/pollSchedule';
import { EMERGENCY_MESSAGE } from '@/lib/emergency/messages';
import { HOMEOWNER_STATUS_TEXT, PRO_STATUS_LABEL } from '@/lib/jobs/copy';
import { proJobDetailSchema } from '@/lib/validation/jobSchema';
import { normalResult } from '@/test/inspectionFixtures';

const ID = normalResult.id;
const SLOT_A = '2030-03-01T09:00:00.000Z';
const SLOT_B = '2030-03-02T12:00:00.000Z';

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

interface ChatMessageFixture {
  id: string;
  side: 'homeowner' | 'tradesperson';
  text: string;
  sentAt: string;
  legacy: boolean;
}

function readBody(
  status: string,
  booking: Record<string, unknown> = {},
  messages: ChatMessageFixture[] = [],
  lastSeq = 0,
) {
  return {
    status,
    booking,
    chatState: status === 'declined' ? 'read_only' : 'open',
    messages,
    lastSeq,
  };
}

let chatResponse: () => Response;
let statusResponse: () => Response;
let urls: string[];

function stubFetch(routes: (url: string) => Response | null): void {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: string) => {
      const url = String(input);
      urls.push(url);
      return routes(url) ?? json(500, {});
    }),
  );
}

async function advance(ms: number): Promise<void> {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
}

beforeEach(() => {
  vi.useFakeTimers();
  urls = [];
  sessionStorage.clear();
  resetProSession();
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

function hasChatPanel(root: HTMLElement): boolean {
  return Array.from(root.querySelectorAll('h2')).some((h) => h.textContent === 'Messages');
}

describe('Results page live updates', () => {
  function serveResultsPage(): void {
    stubFetch((url) => {
      if (url.endsWith('/status')) return statusResponse();
      if (url.includes('/chat')) return chatResponse();
      if (url === `/api/inspections/${ID}`) return json(200, normalResult);
      return null;
    });
  }

  it('shows "Pick a time" within one chat poll, with status text, controls and chat changing in one render', async () => {
    statusResponse = () => json(200, { status: 'new' });
    chatResponse = () => json(200, readBody('new'));
    serveResultsPage();

    const snapshots: { statusText: string; pickATime: boolean; chat: boolean }[] = [];
    const holder = document.createElement('div');
    document.body.appendChild(holder);
    const snapshot = () => ({
      statusText: holder.querySelector('[aria-label="Job status"] [role="status"]')?.textContent ?? '',
      pickATime: holder.textContent?.includes('Pick a time') ?? false,
      chat: hasChatPanel(holder),
    });
    render(
      <Profiler id="results" onRender={() => snapshots.push(snapshot())}>
        <ResultsView id={ID} />
      </Profiler>,
      { container: holder },
    );
    await advance(0);
    await advance(0);

    expect(holder.textContent).toContain(HOMEOWNER_STATUS_TEXT.new);
    expect(snapshot().pickATime).toBe(false);
    expect(snapshot().chat).toBe(true);
    const statusPollsBefore = urls.filter((u) => u.endsWith('/status')).length;
    expect(statusPollsBefore).toBe(1);

    // The Pro accepts. Only the chat poll can tell the page within 5 s.
    chatResponse = () => json(200, readBody('accepted', { offeredSlots: [SLOT_A, SLOT_B] }));
    snapshots.length = 0;
    await advance(FAST_INTERVAL_MS);

    // No second status poll happened: the update came from the chat poll alone.
    expect(urls.filter((u) => u.endsWith('/status'))).toHaveLength(statusPollsBefore);
    const now = snapshot();
    expect(now.pickATime).toBe(true);
    expect(now.statusText).toBe(HOMEOWNER_STATUS_TEXT.accepted);
    expect(now.chat).toBe(true);
    expect(holder.querySelectorAll(`time[datetime="${SLOT_A}"]`).length).toBeGreaterThan(0);

    // Every commit shows one status: the status text and the booking controls never disagree.
    expect(snapshots.length).toBeGreaterThan(0);
    for (const s of snapshots) {
      expect(s.pickATime).toBe(s.statusText === HOMEOWNER_STATUS_TEXT.accepted);
      expect(s.chat).toBe(true);
    }
  });

  it('removes the chat panel in the same render as the emergency view on a 409 JOB_IS_EMERGENCY', async () => {
    statusResponse = () => json(200, { status: 'new' });
    chatResponse = () => json(200, readBody('new'));
    serveResultsPage();

    const snapshots: { chat: boolean; emergency: boolean }[] = [];
    const holder = document.createElement('div');
    document.body.appendChild(holder);
    const snapshot = () => ({
      chat: hasChatPanel(holder),
      emergency: holder.textContent?.includes(EMERGENCY_MESSAGE) ?? false,
    });
    render(
      <Profiler id="results" onRender={() => snapshots.push(snapshot())}>
        <ResultsView id={ID} />
      </Profiler>,
      { container: holder },
    );
    await advance(0);
    await advance(0);
    expect(snapshot()).toEqual({ chat: true, emergency: false });

    chatResponse = () =>
      json(409, { error: 'JOB_IS_EMERGENCY', message: EMERGENCY_MESSAGE, status: 'emergency' });
    snapshots.length = 0;
    await advance(FAST_INTERVAL_MS);

    expect(snapshot()).toEqual({ chat: false, emergency: true });
    expect(snapshots.length).toBeGreaterThan(0);
    // In no commit is the chat panel shown together with, or instead of, the emergency state.
    for (const s of snapshots) {
      expect(s.chat).toBe(!s.emergency);
    }
    expect(holder.textContent).not.toContain('Pick a time');
  });
});

describe('Pro page live updates', () => {
  function proJob(overrides: Record<string, unknown> = {}): Record<string, unknown> {
    const job = {
      id: ID,
      createdAt: '2030-01-01T10:00:00.000Z',
      status: 'accepted',
      urgency: 'soon',
      likelyIssue: 'Dripping pipe under the sink',
      trade: 'Plumber',
      confidence: 0.7,
      costRangeLow: 100,
      costRangeHigh: 300,
      jobBrief: 'A pipe under the kitchen sink is dripping.',
      followUpQuestions: ['Is the drip constant?', 'Is the cupboard floor wet?'],
      answers: { location: 'Kitchen', duration: 'Two days', recentChanges: 'None' },
      infoRequests: [],
      replies: [],
      photos: ['https://example.test/photo-1.jpg'],
      offeredSlots: [SLOT_A, SLOT_B],
      ...overrides,
    };
    expect(proJobDetailSchema.safeParse(job).success).toBe(true);
    return job;
  }

  function serveProPage(job: Record<string, unknown>): void {
    stubFetch((url) => {
      if (url === `/api/pro/jobs/${ID}`) return json(200, job);
      if (url.startsWith(`/api/pro/jobs/${ID}/chat`)) return chatResponse();
      return null;
    });
  }

  it('shows the booked Time_Slot within one chat poll, status text and booked time in one render', async () => {
    chatResponse = () => json(200, readBody('accepted', { offeredSlots: [SLOT_A, SLOT_B] }));
    serveProPage(proJob());

    const holder = document.createElement('div');
    document.body.appendChild(holder);
    const snapshots: { label: string; bookedTime: string | null; offered: boolean; chat: boolean }[] = [];
    const snapshot = () => ({
      label: holder.querySelector('p[role="status"]')?.textContent ?? '',
      bookedTime:
        holder.querySelector('section[aria-label="Booked time"] time')?.getAttribute('datetime') ?? null,
      offered: holder.querySelector('section[aria-label="Offered times"]') !== null,
      chat: hasChatPanel(holder),
    });
    render(
      <Profiler id="pro" onRender={() => snapshots.push(snapshot())}>
        <JobDetail id={ID} />
      </Profiler>,
      { container: holder },
    );
    await advance(0);
    await advance(0);
    expect(snapshot()).toMatchObject({ label: PRO_STATUS_LABEL.accepted, bookedTime: null, offered: true });

    chatResponse = () => json(200, readBody('booked', { bookedSlot: SLOT_B }));
    snapshots.length = 0;
    await advance(FAST_INTERVAL_MS);

    expect(snapshot()).toEqual({
      label: PRO_STATUS_LABEL.booked,
      bookedTime: SLOT_B,
      offered: false,
      chat: true,
    });
    // No commit shows the new status text with the old slot block, or the reverse.
    expect(snapshots.length).toBeGreaterThan(0);
    for (const s of snapshots) {
      expect(s.label === PRO_STATUS_LABEL.booked).toBe(s.bookedTime === SLOT_B);
      expect(s.chat).toBe(true);
    }
    // The job itself was loaded once; the update came from the chat poll.
    expect(urls.filter((u) => u === `/api/pro/jobs/${ID}`)).toHaveLength(1);
  });

  it('shows old questions and replies as the first messages of the thread', async () => {
    const infoRequests = [
      { question: 'Is the drip constant?', askedAt: '2030-01-02T09:00:00.000Z' },
      { question: 'Any photos of the pipe?', askedAt: '2030-01-02T11:00:00.000Z' },
    ];
    const replies = [{ text: 'Yes, all day.', at: '2030-01-02T10:00:00.000Z' }];
    chatResponse = () =>
      json(
        200,
        readBody(
          'new',
          {},
          [
            { id: 'q-0', side: 'tradesperson', text: infoRequests[0].question, sentAt: infoRequests[0].askedAt, legacy: true },
            { id: 'r-0', side: 'homeowner', text: replies[0].text, sentAt: replies[0].at, legacy: true },
            { id: 'q-1', side: 'tradesperson', text: infoRequests[1].question, sentAt: infoRequests[1].askedAt, legacy: true },
            { id: 'c-1', side: 'homeowner', text: 'Photo sent just now.', sentAt: '2030-01-03T08:00:00.000Z', legacy: false },
          ],
          1,
        ),
      );
    serveProPage(proJob({ status: 'new', offeredSlots: undefined, infoRequests, replies }));

    const { container } = render(<JobDetail id={ID} />);
    await advance(0);
    await advance(0);

    const items = Array.from(container.querySelectorAll('ol li')).map((li) => li.textContent ?? '');
    expect(items).toHaveLength(4);
    expect(items[0]).toContain('You');
    expect(items[0]).toContain('Is the drip constant?');
    expect(items[1]).toContain('Homeowner');
    expect(items[1]).toContain('Yes, all day.');
    expect(items[2]).toContain('Any photos of the pipe?');
    expect(items[3]).toContain('Photo sent just now.');
  });
});
