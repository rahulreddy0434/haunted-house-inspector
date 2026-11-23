// @vitest-environment jsdom
// Feature: chat-and-help, task 6.5. Pro job page order (Requirements 16.1 to 16.4, 21.12, 21.17).
// Real JobDetail with the real ChatPanel and hooks. Only fetch is mocked.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, render } from '@testing-library/react';
import { JobDetail } from '@/components/pro/JobDetail';
import { resetProSession } from '@/hooks/proSession';
import { FAST_INTERVAL_MS } from '@/lib/chat/pollSchedule';
import { HELP_HEADING } from '@/lib/help/copy';
import { proJobDetailSchema } from '@/lib/validation/jobSchema';
import { normalResult } from '@/test/inspectionFixtures';

const ID = normalResult.id;
const SLOT_A = '2030-03-01T09:00:00.000Z';
const SLOT_B = '2030-03-02T12:00:00.000Z';

type Status = 'new' | 'info_requested' | 'accepted' | 'booked' | 'declined';

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function chatBody(status: Status, booking: Record<string, unknown>): Record<string, unknown> {
  return {
    status,
    booking,
    chatState: status === 'declined' ? 'read_only' : 'open',
    messages: [],
    lastSeq: 0,
  };
}

function proJob(status: Status | 'emergency'): Record<string, unknown> {
  if (status === 'emergency') {
    const emergency = {
      id: ID,
      createdAt: '2030-01-01T10:00:00.000Z',
      status,
      urgency: 'emergency',
      likelyIssue: 'Possible gas leak',
      answers: { location: 'Kitchen', duration: 'Today', recentChanges: 'None' },
      emergencyNote: 'Emergency job.',
    };
    expect(proJobDetailSchema.safeParse(emergency).success).toBe(true);
    return emergency;
  }
  const job = {
    id: ID,
    createdAt: '2030-01-01T10:00:00.000Z',
    status,
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
    ...(status === 'accepted' ? { offeredSlots: [SLOT_A, SLOT_B] } : {}),
    ...(status === 'booked' ? { bookedSlot: SLOT_B } : {}),
    ...(status === 'declined' ? { declineReason: 'Too far away.' } : {}),
  };
  expect(proJobDetailSchema.safeParse(job).success).toBe(true);
  return job;
}

let urls: string[];
let chatResponse: () => Response;

function serve(job: Record<string, unknown>): void {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: string) => {
      const url = String(input);
      urls.push(url);
      if (url === `/api/pro/jobs/${ID}`) return json(200, job);
      if (url.startsWith(`/api/pro/jobs/${ID}/chat`)) return chatResponse();
      return json(500, {});
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

function heading(root: HTMLElement, text: string): Element | null {
  return Array.from(root.querySelectorAll('h2')).find((h) => h.textContent === text) ?? null;
}

function expectInOrder(named: [string, Element | null][]): void {
  for (const [name, el] of named) expect(el, `${name} is missing`).not.toBeNull();
  for (let i = 1; i < named.length; i += 1) {
    const before = named[i - 1][1] as Element;
    const after = named[i][1] as Element;
    const follows = Boolean(before.compareDocumentPosition(after) & Node.DOCUMENT_POSITION_FOLLOWING);
    expect(follows, `${named[i][0]} should come after ${named[i - 1][0]}`).toBe(true);
  }
}

async function renderJob(status: Status | 'emergency'): Promise<HTMLElement> {
  const job = proJob(status);
  const booking =
    status === 'accepted' ? { offeredSlots: [SLOT_A, SLOT_B] } : status === 'booked' ? { bookedSlot: SLOT_B } : {};
  chatResponse = () => json(200, chatBody(status === 'emergency' ? 'new' : status, booking));
  serve(job);
  const holder = document.createElement('div');
  document.body.appendChild(holder);
  render(<JobDetail id={ID} />, { container: holder });
  await advance(0);
  await advance(0);
  return holder;
}

describe('Pro job page order', () => {
  const ALL: Status[] = ['new', 'info_requested', 'accepted', 'booked', 'declined'];

  for (const status of ALL) {
    it(`shows the sections in order for status ${status}`, async () => {
      const holder = await renderJob(status);

      const decline =
        status === 'declined'
          ? holder.querySelector('section[aria-label="Decline reason"]')
          : holder.querySelector('#pro-decline-heading');
      const accept = holder.querySelector('#pro-accept-heading');
      const offered = holder.querySelector('section[aria-label="Offered times"]');
      const booked = holder.querySelector('section[aria-label="Booked time"]');

      const bookingControl: [string, Element | null][] = [];
      if (status === 'new' || status === 'info_requested') bookingControl.push(['accept form', accept]);
      if (status === 'accepted') bookingControl.push(['offered times', offered]);
      if (status === 'booked') bookingControl.push(['booked time', booked]);

      // Accepted and booked jobs have no decline control and no decline reason.
      const declineControl: [string, Element | null][] =
        status === 'accepted' || status === 'booked' ? [] : [['decline', decline]];

      expectInOrder([
        ['job facts', holder.querySelector('section[aria-label="Job facts"]')],
        ['photos', holder.querySelector('section[aria-label="Photos"]')],
        ['chat', heading(holder, 'Messages')],
        ...declineControl,
        ...bookingControl,
        ['help', heading(holder, HELP_HEADING)],
      ]);

      // The booking control is the last job content before the help section.
      expect(accept !== null).toBe(status === 'new' || status === 'info_requested');
      expect(offered !== null).toBe(status === 'accepted');
      expect(booked !== null).toBe(status === 'booked');
      expect(holder.querySelector('#pro-decline-heading') !== null).toBe(
        status === 'new' || status === 'info_requested',
      );
      expect(holder.querySelector('section[aria-label="Decline reason"]') !== null).toBe(status === 'declined');
    });
  }

  it('shows the emergency view with no chat or help', async () => {
    const holder = await renderJob('emergency');

    expect(heading(holder, 'Messages')).toBeNull();
    expect(heading(holder, HELP_HEADING)).toBeNull();
    expect(holder.querySelector('#pro-accept-heading')).toBeNull();
    expect(holder.querySelector('#pro-decline-heading')).toBeNull();
    expect(holder.querySelector('section[aria-label="Offered times"]')).toBeNull();
    expect(holder.querySelector('section[aria-label="Booked time"]')).toBeNull();
    expect(urls.some((u) => u.includes('/chat'))).toBe(false);
  });

  it('shows the booked Time_Slot last before the help section within one chat poll', async () => {
    const holder = await renderJob('accepted');
    expect(holder.querySelector('section[aria-label="Booked time"]')).toBeNull();

    chatResponse = () => json(200, chatBody('booked', { bookedSlot: SLOT_B }));
    await advance(FAST_INTERVAL_MS);

    const booked = holder.querySelector('section[aria-label="Booked time"]');
    expect(booked?.querySelector(`time[datetime="${SLOT_B}"]`)).not.toBeNull();
    expectInOrder([
      ['chat', heading(holder, 'Messages')],
      ['booked time', booked],
      ['help', heading(holder, HELP_HEADING)],
    ]);
    expect(holder.querySelector('section[aria-label="Offered times"]')).toBeNull();
  });
});
