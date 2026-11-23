// @vitest-environment jsdom
// Feature: chat-and-help, task 6.5. Results page order (Requirements 17.1 to 17.4, 21.12, 21.17).
// Real ResultsView with the real ChatPanel and hooks. Only fetch is mocked.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, render } from '@testing-library/react';
import { ResultsView } from '@/components/results/ResultsView';
import { FAST_INTERVAL_MS } from '@/lib/chat/pollSchedule';
import { EMERGENCY_MESSAGE } from '@/lib/emergency/messages';
import { HELP_HEADING } from '@/lib/help/copy';
import { RESULTS_PAGE_NOTICE } from '@/lib/jobs/copy';
import { emergencyResult, normalResult } from '@/test/inspectionFixtures';

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

function statusBody(status: Status): Record<string, unknown> {
  switch (status) {
    case 'new':
      return { status };
    case 'info_requested':
      return { status, question: 'Is the drip constant?' };
    case 'accepted':
      return { status, offeredSlots: [SLOT_A, SLOT_B] };
    case 'booked':
      return { status, bookedSlot: SLOT_B };
    case 'declined':
      return { status, reason: 'Too far away.' };
  }
}

function bookingFor(status: Status): Record<string, unknown> {
  if (status === 'accepted') return { offeredSlots: [SLOT_A, SLOT_B] };
  if (status === 'booked') return { bookedSlot: SLOT_B };
  return {};
}

function chatBody(status: Status): Record<string, unknown> {
  return {
    status,
    booking: bookingFor(status),
    chatState: status === 'declined' ? 'read_only' : 'open',
    messages: [],
    lastSeq: 0,
  };
}

let urls: string[];
let currentStatus: Status;
let currentResult: unknown;

function stubFetch(): void {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: string) => {
      const url = String(input);
      urls.push(url);
      if (url.endsWith('/status')) return json(200, statusBody(currentStatus));
      if (url.includes('/chat')) return json(200, chatBody(currentStatus));
      if (url === `/api/inspections/${ID}`) return json(200, currentResult);
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
  currentResult = normalResult;
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

function heading(root: HTMLElement, text: string): Element | null {
  return Array.from(root.querySelectorAll('h2')).find((h) => h.textContent === text) ?? null;
}

function textElement(root: HTMLElement, text: string, selector = 'p, legend, a'): Element | null {
  return (
    Array.from(root.querySelectorAll(selector)).find((e) => (e.textContent ?? '').includes(text)) ?? null
  );
}

/** The page-level link: the declined status card has its own copy earlier on the page. */
function pageLink(root: HTMLElement): Element | null {
  const links = Array.from(root.querySelectorAll('a')).filter(
    (a) => a.textContent === 'Start a new inspection',
  );
  return links[links.length - 1] ?? null;
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

async function renderResults(): Promise<HTMLElement> {
  stubFetch();
  const holder = document.createElement('div');
  document.body.appendChild(holder);
  render(<ResultsView id={ID} />, { container: holder });
  await advance(0);
  await advance(0);
  return holder;
}

describe('Results page order', () => {
  const ALL: Status[] = ['new', 'info_requested', 'accepted', 'booked', 'declined'];

  for (const status of ALL) {
    it(`shows the sections in order for status ${status}`, async () => {
      currentStatus = status;
      const holder = await renderResults();

      const last: [string, Element | null][] = [];
      if (status === 'accepted') last.push(['Pick a time', textElement(holder, 'Pick a time', 'legend')]);
      if (status === 'booked') last.push(['booking confirmation', textElement(holder, 'Your appointment')]);

      expectInOrder([
        ['heading', holder.querySelector('h1')],
        ['urgency', holder.querySelector('h1')?.nextElementSibling ?? null],
        ['issue', holder.querySelector('section[aria-label="Issue summary"]')],
        ['cost', holder.querySelector('section[aria-label="Rough cost"]')],
        ['job brief', holder.querySelector('#job-brief-heading')],
        ['status', holder.querySelector('section[aria-label="Job status"]')],
        ['chat', heading(holder, 'Messages')],
        ...last,
        ['likely diagnosis note', textElement(holder, 'This is a likely diagnosis')],
        ['results notice', textElement(holder, RESULTS_PAGE_NOTICE)],
        ['Start a new inspection', pageLink(holder)],
        ['help', heading(holder, HELP_HEADING)],
      ]);

      // Booking controls: only one of the two, only for its status.
      expect(textElement(holder, 'Pick a time', 'legend') !== null).toBe(status === 'accepted');
      expect(textElement(holder, 'Your appointment') !== null).toBe(status === 'booked');
      // Nothing from the job content follows the booking control except the notices and links.
      expect(holder.querySelector('section[aria-label="Booking"]') !== null).toBe(
        status === 'accepted' || status === 'booked',
      );
    });
  }

  it('shows the emergency view with no chat, booking or help', async () => {
    currentResult = emergencyResult;
    currentStatus = 'new';
    const holder = await renderResults();

    expect(holder.textContent).toContain(EMERGENCY_MESSAGE);
    expect(heading(holder, 'Messages')).toBeNull();
    expect(heading(holder, HELP_HEADING)).toBeNull();
    expect(textElement(holder, 'Pick a time', 'legend')).toBeNull();
    expect(textElement(holder, 'Your appointment')).toBeNull();
    expect(holder.querySelector('section[aria-label="Booking"]')).toBeNull();
    expect(urls.some((u) => u.includes('/chat') || u.endsWith('/status'))).toBe(false);
    expect(textElement(holder, 'Start a new inspection', 'a')).not.toBeNull();
  });

  it('shows "Pick a time" after the chat and before the notices within one chat poll of an accept', async () => {
    currentStatus = 'new';
    const holder = await renderResults();
    expect(textElement(holder, 'Pick a time', 'legend')).toBeNull();

    currentStatus = 'accepted';
    await advance(FAST_INTERVAL_MS);

    expectInOrder([
      ['status', holder.querySelector('section[aria-label="Job status"]')],
      ['chat', heading(holder, 'Messages')],
      ['Pick a time', textElement(holder, 'Pick a time', 'legend')],
      ['results notice', textElement(holder, RESULTS_PAGE_NOTICE)],
      ['Start a new inspection', pageLink(holder)],
      ['help', heading(holder, HELP_HEADING)],
    ]);
  });
});
