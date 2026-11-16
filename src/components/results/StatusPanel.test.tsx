import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { StatusPanel } from './StatusPanel';
import { EMERGENCY_MESSAGE } from '@/lib/emergency/messages';
import {
  ERROR_MESSAGES,
  HOMEOWNER_STATUS_TEXT,
  JOB_CHANGED_NOTICE,
  REPLY_TOO_LARGE_MESSAGE,
  STATUS_REFRESH_FAILED,
  STATUS_SAFETY_LINE,
} from '@/lib/jobs/copy';

// Validates: Requirements 8.3, 8.11, 8.19, 9.1, 9.6, 9.7, 9.12, 10.1, 15.5

process.env.TZ = 'America/Toronto';

const ID = 'job-123';
const STATUS_URL = `/api/inspections/${ID}/status`;
const REPLY_URL = `/api/inspections/${ID}/reply`;
const BOOK_URL = `/api/inspections/${ID}/book`;

const NOW = '2026-03-01T12:00:00.000Z';
const A = '2026-03-05T20:00:00.000Z';
const B = '2026-03-06T15:00:00.000Z';
const C = '2026-03-07T18:30:00.000Z';

interface Reply {
  status: number;
  body?: unknown;
}
type Handler = (init: RequestInit | undefined) => Reply | Promise<Reply> | Promise<never>;

const routes = new Map<string, Handler>();
const calls: string[] = [];

function route(method: string, url: string, handler: Handler | Reply): void {
  routes.set(`${method} ${url}`, typeof handler === 'function' ? handler : () => handler);
}

function count(method: string, url: string): number {
  return calls.filter((c) => c === `${method} ${url}`).length;
}

const fetchStub = vi.fn(async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
  const url = typeof input === 'string' ? input : input instanceof URL ? input.pathname : input.url;
  const key = `${init?.method ?? 'GET'} ${url}`;
  calls.push(key);
  const handler = routes.get(key);
  if (!handler) throw new Error(`Unrouted request: ${key}`);
  const reply = await handler(init);
  return new Response(JSON.stringify(reply.body ?? null), {
    status: reply.status,
    headers: { 'Content-Type': 'application/json' },
  });
});

beforeEach(() => {
  routes.clear();
  calls.length = 0;
  fetchStub.mockClear();
  vi.stubGlobal('fetch', fetchStub);
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date(NOW));
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

function status(body: unknown): void {
  route('GET', STATUS_URL, { status: 200, body });
}

function setup() {
  const onEmergency = vi.fn<() => void>();
  const user = userEvent.setup();
  const utils = render(<StatusPanel id={ID} onEmergency={onEmergency} />);
  return { onEmergency, user, ...utils };
}

const replyBox = () => screen.getByLabelText('Your reply') as HTMLTextAreaElement;
const sendButton = () => screen.getByRole('button', { name: 'Send reply' });
const confirmButton = () => screen.getByRole('button', { name: 'Confirm this time' });

async function typeAndSend(user: ReturnType<typeof userEvent.setup>, text: string) {
  await user.type(replyBox(), text);
  await user.click(sendButton());
}

describe('StatusPanel states', () => {
  it('shows the first-load text before any response, with no Refresh', async () => {
    route('GET', STATUS_URL, () => new Promise<never>(() => {}));
    setup();
    expect(await screen.findByText('Checking your job status…')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Refresh' })).toBeNull();
  });

  it('new: shows the waiting text, Refresh, no safety line, no reply box', async () => {
    status({ status: 'new' });
    setup();
    expect(await screen.findByText(HOMEOWNER_STATUS_TEXT.new)).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Refresh' })).toBeTruthy();
    expect(screen.queryByText(STATUS_SAFETY_LINE)).toBeNull();
    expect(screen.queryByLabelText('Your reply')).toBeNull();
  });

  it('info_requested: shows the text, the question and the reply box', async () => {
    status({ status: 'info_requested', question: 'Is the leak constant?' });
    setup();
    expect(await screen.findByText(HOMEOWNER_STATUS_TEXT.info_requested)).toBeTruthy();
    expect(screen.getByText('Is the leak constant?')).toBeTruthy();
    expect(replyBox()).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Refresh' })).toBeTruthy();
    expect(screen.queryByText(STATUS_SAFETY_LINE)).toBeNull();
  });

  it('accepted: shows the text and the offered slots, no safety line', async () => {
    status({ status: 'accepted', offeredSlots: [A, B] });
    setup();
    expect(await screen.findByText(HOMEOWNER_STATUS_TEXT.accepted)).toBeTruthy();
    expect(screen.getAllByRole('radio')).toHaveLength(2);
    expect(document.querySelector(`time[datetime="${A}"]`)).toBeTruthy();
    expect(screen.queryByText(STATUS_SAFETY_LINE)).toBeNull();
    expect(screen.queryByLabelText('Your reply')).toBeNull();
    expect(screen.getByRole('button', { name: 'Refresh' })).toBeTruthy();
  });

  it('declined with a reason: reason, safety line, link, no reply box, no Refresh', async () => {
    status({ status: 'declined', reason: 'Fully booked this month' });
    setup();
    expect(await screen.findByText(HOMEOWNER_STATUS_TEXT.declined)).toBeTruthy();
    expect(screen.getByText('Fully booked this month')).toBeTruthy();
    expect(screen.getByText(STATUS_SAFETY_LINE)).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Start a new inspection' }).getAttribute('href')).toBe('/');
    expect(screen.queryByLabelText('Your reply')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Refresh' })).toBeNull();
  });

  it('declined without a reason: shows the safety line and no reason text', async () => {
    status({ status: 'declined' });
    setup();
    expect(await screen.findByText(HOMEOWNER_STATUS_TEXT.declined)).toBeTruthy();
    expect(screen.getByText(STATUS_SAFETY_LINE)).toBeTruthy();
    expect(screen.queryByText('Fully booked this month')).toBeNull();
  });

  it('booked: confirmation with <time>, safety line, no reply box, no edit or cancel control', async () => {
    status({ status: 'booked', bookedSlot: B });
    setup();
    expect(await screen.findByText(HOMEOWNER_STATUS_TEXT.booked)).toBeTruthy();
    expect(screen.getByText(/Your appointment:/)).toBeTruthy();
    expect(document.querySelector(`time[datetime="${B}"]`)).toBeTruthy();
    expect(screen.getByText(STATUS_SAFETY_LINE)).toBeTruthy();
    expect(screen.queryByLabelText('Your reply')).toBeNull();
    expect(screen.queryByRole('radio')).toBeNull();
    expect(screen.queryByRole('button')).toBeNull();
    expect(screen.queryByRole('link', { name: /cancel|change|edit|reschedule/i })).toBeNull();
    expect(screen.queryByText(/\b(cancel|edit|reschedule)\b/i)).toBeNull();
  });

  it('does not render or alter the "Standard notice"', async () => {
    status({ status: 'new' });
    setup();
    await screen.findByText(HOMEOWNER_STATUS_TEXT.new);
    expect(screen.queryByText(/likely diagnosis/i)).toBeNull();
  });

  it('renders free text as text, not markup', async () => {
    status({ status: 'info_requested', question: 'Is it <b>wet</b>?' });
    setup();
    expect(await screen.findByText('Is it <b>wet</b>?')).toBeTruthy();
    expect(document.querySelector('b')).toBeNull();
  });

  it('renders a declined reason as text', async () => {
    status({ status: 'declined', reason: '<b>Sorry</b>' });
    setup();
    expect(await screen.findByText('<b>Sorry</b>')).toBeTruthy();
    expect(document.querySelector('b')).toBeNull();
  });
});

describe('StatusPanel loading problems', () => {
  it('failed first load shows the alert and Refresh, which retries', async () => {
    route('GET', STATUS_URL, { status: 500, body: {} });
    const { user } = setup();
    expect((await screen.findByRole('alert')).textContent).toBe(STATUS_REFRESH_FAILED);
    status({ status: 'new' });
    await user.click(screen.getByRole('button', { name: 'Refresh' }));
    expect(await screen.findByText(HOMEOWNER_STATUS_TEXT.new)).toBeTruthy();
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('404 renders nothing and sends no retry', async () => {
    route('GET', STATUS_URL, { status: 404, body: { error: 'NOT_FOUND' } });
    const { container } = setup();
    await waitFor(() => expect(count('GET', STATUS_URL)).toBe(1));
    await waitFor(() => expect(container.innerHTML).toBe(''));
    await new Promise((r) => setTimeout(r, 50));
    expect(count('GET', STATUS_URL)).toBe(1);
  });

  it('ignores Refresh while a request is in flight', async () => {
    status({ status: 'new' });
    const { user } = setup();
    await screen.findByText(HOMEOWNER_STATUS_TEXT.new);
    let release: (r: Reply) => void = () => {};
    route('GET', STATUS_URL, () => new Promise<Reply>((resolve) => (release = resolve)));
    const refresh = screen.getByRole('button', { name: 'Refresh' });
    await user.click(refresh);
    await waitFor(() => expect(count('GET', STATUS_URL)).toBe(2));
    expect((screen.getByRole('button', { name: 'Refresh' }) as HTMLButtonElement).disabled).toBe(true);
    await user.click(screen.getByRole('button', { name: 'Refresh' }));
    await user.click(screen.getByRole('button', { name: 'Refresh' }));
    expect(count('GET', STATUS_URL)).toBe(2);
    release({ status: 200, body: { status: 'new' } });
    await waitFor(() =>
      expect((screen.getByRole('button', { name: 'Refresh' }) as HTMLButtonElement).disabled).toBe(false),
    );
  });
});

describe('StatusPanel reply flow', () => {
  beforeEach(() => status({ status: 'info_requested', question: 'Is the leak constant?' }));

  it('200: moves to new, clears the text and focuses the status element', async () => {
    route('POST', REPLY_URL, { status: 200, body: { status: 'new' } });
    const { user } = setup();
    await screen.findByLabelText('Your reply');
    await typeAndSend(user, 'It drips all day');
    const el = await screen.findByText(HOMEOWNER_STATUS_TEXT.new);
    expect(screen.queryByLabelText('Your reply')).toBeNull();
    await waitFor(() => expect(document.activeElement).toBe(el));
    expect(el.getAttribute('role')).toBe('status');
    expect(JSON.parse(String(fetchStub.mock.calls.find((c) => c[1]?.method === 'POST')?.[1]?.body))).toEqual({
      text: 'It drips all day',
    });
  });

  it('400 keeps the text and shows the server message', async () => {
    route('POST', REPLY_URL, {
      status: 400,
      body: { error: 'INVALID_REQUEST', message: 'Your reply is too long. Shorten it.' },
    });
    const { user } = setup();
    await screen.findByLabelText('Your reply');
    await typeAndSend(user, 'abc');
    expect((await screen.findByRole('alert')).textContent).toContain('Your reply is too long. Shorten it.');
    expect(replyBox().value).toBe('abc');
  });

  it('413 shows "Please shorten your reply." and keeps the text', async () => {
    route('POST', REPLY_URL, { status: 413, body: { error: 'PAYLOAD_TOO_LARGE', message: 'ignored' } });
    const { user } = setup();
    await screen.findByLabelText('Your reply');
    await typeAndSend(user, 'abc');
    expect((await screen.findByRole('alert')).textContent).toContain(REPLY_TOO_LARGE_MESSAGE);
    expect(replyBox().value).toBe('abc');
  });

  it('429 shows the server message and keeps the text', async () => {
    route('POST', REPLY_URL, {
      status: 429,
      body: { error: 'REPLY_LIMIT_REACHED', message: ERROR_MESSAGES.REPLY_LIMIT_REACHED },
    });
    const { user } = setup();
    await screen.findByLabelText('Your reply');
    await typeAndSend(user, 'abc');
    expect((await screen.findByRole('alert')).textContent).toContain(ERROR_MESSAGES.REPLY_LIMIT_REACHED);
    expect(replyBox().value).toBe('abc');
  });

  it('500 shows a failure message and keeps the text', async () => {
    route('POST', REPLY_URL, { status: 500, body: {} });
    const { user } = setup();
    await screen.findByLabelText('Your reply');
    await typeAndSend(user, 'abc');
    expect((await screen.findByRole('alert')).textContent).toContain(ERROR_MESSAGES.ACTION_FAILED);
    expect(replyBox().value).toBe('abc');
  });

  it('network error shows a failure message and keeps the text', async () => {
    route('POST', REPLY_URL, () => Promise.reject(new TypeError('network down')));
    const { user } = setup();
    await screen.findByLabelText('Your reply');
    await typeAndSend(user, 'abc');
    expect((await screen.findByRole('alert')).textContent).toContain(ERROR_MESSAGES.ACTION_FAILED);
    expect(replyBox().value).toBe('abc');
  });

  it('409 ILLEGAL_TRANSITION refreshes at once and shows the notice with "Your unsent reply"', async () => {
    route('POST', REPLY_URL, { status: 409, body: { error: 'ILLEGAL_TRANSITION', message: 'x' } });
    const { user } = setup();
    await screen.findByLabelText('Your reply');
    status({ status: 'declined' });
    await typeAndSend(user, 'my <b>reply</b>');
    expect(await screen.findByText(JOB_CHANGED_NOTICE)).toBeTruthy();
    expect(screen.getByText('Your unsent reply')).toBeTruthy();
    expect(screen.getByText('my <b>reply</b>')).toBeTruthy();
    await waitFor(() => expect(count('GET', STATUS_URL)).toBe(2));
    expect(await screen.findByText(HOMEOWNER_STATUS_TEXT.declined)).toBeTruthy();
  });

  it('409 JOB_IS_EMERGENCY calls onEmergency once and renders nothing', async () => {
    route('POST', REPLY_URL, {
      status: 409,
      body: { error: 'JOB_IS_EMERGENCY', message: EMERGENCY_MESSAGE },
    });
    const { user, onEmergency, container } = setup();
    await screen.findByLabelText('Your reply');
    await typeAndSend(user, 'abc');
    await waitFor(() => expect(onEmergency).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(container.innerHTML).toBe(''));
    expect(onEmergency).toHaveBeenCalledTimes(1);
  });
});

describe('StatusPanel booking flow', () => {
  beforeEach(() => status({ status: 'accepted', offeredSlots: [A, B, C] }));

  async function pick(user: ReturnType<typeof userEvent.setup>, slot: string) {
    const radio = (await screen.findAllByRole('radio')).find(
      (r) => (r as HTMLInputElement).value === slot,
    ) as HTMLElement;
    await user.click(radio);
    await user.click(confirmButton());
  }

  it('200 shows the confirmation with <time> and focuses it', async () => {
    route('POST', BOOK_URL, { status: 200, body: { status: 'booked', bookedSlot: B } });
    const { user } = setup();
    await pick(user, B);
    const confirmation = await screen.findByText(/Your appointment:/);
    expect(document.querySelector(`time[datetime="${B}"]`)).toBeTruthy();
    expect(screen.getByText(STATUS_SAFETY_LINE)).toBeTruthy();
    expect(screen.queryByRole('radio')).toBeNull();
    await waitFor(() => expect(document.activeElement).toBe(confirmation));
    expect(JSON.parse(String(fetchStub.mock.calls.find((c) => c[1]?.method === 'POST')?.[1]?.body))).toEqual({
      slot: B,
    });
  });

  it('SLOT_EXPIRED shows the message and keeps the remaining future slots', async () => {
    route('POST', BOOK_URL, {
      status: 409,
      body: { error: 'SLOT_EXPIRED', message: ERROR_MESSAGES.SLOT_EXPIRED },
    });
    const { user } = setup();
    const radios = await screen.findAllByRole('radio');
    expect(radios).toHaveLength(3);
    await user.click(radios[0]);
    // Time passes: A is now in the past, B and C are not.
    vi.setSystemTime(new Date('2026-03-06T00:00:00.000Z'));
    await user.click(confirmButton());
    expect((await screen.findByRole('alert')).textContent).toBe('That time has passed. Please pick another.');
    const remaining = screen.getAllByRole('radio').map((r) => (r as HTMLInputElement).value);
    expect(remaining).toEqual([B, C]);
    expect(count('GET', STATUS_URL)).toBe(1);
  });

  it('409 ILLEGAL_TRANSITION refreshes at once and shows the notice, without an unsent reply block', async () => {
    route('POST', BOOK_URL, { status: 409, body: { error: 'ILLEGAL_TRANSITION', message: 'x' } });
    const { user } = setup();
    await screen.findAllByRole('radio');
    status({ status: 'declined', reason: 'Changed my mind' });
    await user.click(screen.getAllByRole('radio')[0]);
    await user.click(confirmButton());
    expect(await screen.findByText(JOB_CHANGED_NOTICE)).toBeTruthy();
    await waitFor(() => expect(count('GET', STATUS_URL)).toBe(2));
    expect(await screen.findByText('Changed my mind')).toBeTruthy();
    expect(screen.queryByText('Your unsent reply')).toBeNull();
  });

  it('409 JOB_IS_EMERGENCY calls onEmergency once and renders nothing', async () => {
    route('POST', BOOK_URL, {
      status: 409,
      body: { error: 'JOB_IS_EMERGENCY', message: EMERGENCY_MESSAGE },
    });
    const { user, onEmergency, container } = setup();
    await pick(user, A);
    await waitFor(() => expect(onEmergency).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(container.innerHTML).toBe(''));
    expect(onEmergency).toHaveBeenCalledTimes(1);
  });

  it('500 shows a failure message and keeps the slots', async () => {
    route('POST', BOOK_URL, { status: 500, body: {} });
    const { user } = setup();
    await pick(user, A);
    expect((await screen.findByRole('alert')).textContent).toBe(ERROR_MESSAGES.ACTION_FAILED);
    expect(screen.getAllByRole('radio')).toHaveLength(3);
  });
});
