// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { JobDetail } from './JobDetail';
import { resetProSession } from '@/hooks/proSession';
import { PRO_EMERGENCY_NOTE } from '@/lib/emergency/messages';
import { proJobDetailSchema } from '@/lib/validation/jobSchema';

const ID = 'job-123';
const JOB_URL = `/api/pro/jobs/${ID}`;

interface Call {
  url: string;
  method: string;
}

type Handler = (call: Call) => Response;

let calls: Call[];
let handler: Handler;

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function activeJob(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: ID,
    createdAt: '2030-01-01T10:00:00.000Z',
    status: 'new',
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
    ...overrides,
  };
}

function emergencyJob(): Record<string, unknown> {
  return {
    id: ID,
    createdAt: '2030-01-01T10:00:00.000Z',
    status: 'emergency',
    urgency: 'emergency',
    likelyIssue: 'Possible gas leak',
    answers: { location: 'Kitchen', duration: '', recentChanges: 'Smelled gas' },
    emergencyNote: 'Emergency: the homeowner was told to leave and call 911.',
  };
}

/** Fail the test early if a fixture drifts from the schema the hook uses. */
function valid(body: Record<string, unknown>): Record<string, unknown> {
  expect(proJobDetailSchema.safeParse(body).success).toBe(true);
  return body;
}

function serveJob(body: Record<string, unknown>): void {
  const checked = valid(body);
  handler = (call) => (call.method === 'GET' && call.url === JOB_URL ? json(200, checked) : json(500, {}));
}

beforeEach(() => {
  resetProSession();
  calls = [];
  handler = () => json(500, { error: 'ACTION_FAILED', message: 'unhandled' });
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: string, init?: RequestInit): Promise<Response> => {
      const call: Call = { url: String(input), method: init?.method ?? 'GET' };
      calls.push(call);
      return handler(call);
    }),
  );
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function jobGets(): number {
  return calls.filter((c) => c.method === 'GET' && c.url === JOB_URL).length;
}

describe('JobDetail active jobs', () => {
  it('puts "Back to jobs" (to /pro) first and shows the status label in role="status"', async () => {
    serveJob(activeJob());
    const { container } = render(<JobDetail id={ID} />);
    const status = await screen.findByText('New');
    expect(status.getAttribute('role')).toBe('status');

    const firstLink = container.querySelector('a');
    expect(firstLink?.textContent).toBe('Back to jobs');
    expect(firstLink?.getAttribute('href')).toBe('/pro');
    expect(screen.getByText('Dripping pipe under the sink')).toBeTruthy();
    expect(container.querySelectorAll('img')).toHaveLength(1);
  });

  it('info_requested shows the latest question under "You asked"', async () => {
    serveJob(
      activeJob({
        status: 'info_requested',
        infoRequests: [
          { question: 'First old question?', askedAt: '2030-01-01T11:00:00.000Z' },
          { question: 'Latest question?', askedAt: '2030-01-02T11:00:00.000Z' },
        ],
      }),
    );
    render(<JobDetail id={ID} />);
    const section = (await screen.findByRole('region', { name: 'Your question' })) as HTMLElement;
    expect(within(section).getByText(/You asked/)).toBeTruthy();
    expect(within(section).getByText('Latest question?')).toBeTruthy();
    expect(within(section).queryByText('First old question?')).toBeNull();
  });

  it('accepted shows the offered slots in ascending order as <time>', async () => {
    const later = '2030-03-03T15:00:00.000Z';
    const earlier = '2030-03-01T09:00:00.000Z';
    const middle = '2030-03-02T12:00:00.000Z';
    serveJob(activeJob({ status: 'accepted', offeredSlots: [later, earlier, middle] }));
    render(<JobDetail id={ID} />);
    const section = (await screen.findByRole('region', { name: 'Offered times' })) as HTMLElement;
    const times = Array.from(section.querySelectorAll('time')).map((t) => t.getAttribute('datetime'));
    expect(times).toEqual([earlier, middle, later]);
  });

  it('booked shows the booked slot and not the offered slots', async () => {
    const booked = '2030-03-02T12:00:00.000Z';
    serveJob(
      activeJob({
        status: 'booked',
        bookedSlot: booked,
        offeredSlots: ['2030-03-01T09:00:00.000Z', booked],
      }),
    );
    const { container } = render(<JobDetail id={ID} />);
    const section = (await screen.findByRole('region', { name: 'Booked time' })) as HTMLElement;
    expect(section.querySelector('time')?.getAttribute('datetime')).toBe(booked);
    expect(screen.queryByRole('region', { name: 'Offered times' })).toBeNull();
    expect(container.querySelector('time[datetime="2030-03-01T09:00:00.000Z"]')).toBeNull();
  });

  it('declined shows the reason and not the offered slots', async () => {
    serveJob(
      activeJob({
        status: 'declined',
        declineReason: 'Too far away',
        offeredSlots: ['2030-03-01T09:00:00.000Z'],
      }),
    );
    const { container } = render(<JobDetail id={ID} />);
    const section = (await screen.findByRole('region', { name: 'Decline reason' })) as HTMLElement;
    expect(within(section).getByText('Too far away')).toBeTruthy();
    expect(screen.queryByRole('region', { name: 'Offered times' })).toBeNull();
    expect(container.querySelector('time[datetime="2030-03-01T09:00:00.000Z"]')).toBeNull();
  });
});

describe('JobDetail emergency job', () => {
  it('shows the Pro note with no buttons, forms, photos or cost', async () => {
    serveJob(emergencyJob());
    const { container } = render(<JobDetail id={ID} />);
    expect(await screen.findByText(PRO_EMERGENCY_NOTE)).toBeTruthy();
    expect(screen.queryAllByRole('button')).toHaveLength(0);
    expect(container.querySelectorAll('form')).toHaveLength(0);
    expect(container.querySelectorAll('img')).toHaveLength(0);
    const text = container.textContent ?? '';
    expect(text).not.toMatch(/rough/i);
    expect(text).not.toMatch(/\$/);
  });
});

describe('JobDetail load failures', () => {
  it('404 shows the not-found text and a link to /pro', async () => {
    handler = () => json(404, { error: 'NOT_FOUND', message: 'nope' });
    render(<JobDetail id={ID} />);
    expect(await screen.findByText("We couldn't find this job.")).toBeTruthy();
    const links = screen.getAllByRole('link');
    expect(links.length).toBeGreaterThan(0);
    for (const link of links) expect(link.getAttribute('href')).toBe('/pro');
  });

  it('500 shows the server message in role="alert" and "Try again" recovers', async () => {
    handler = () => json(500, { error: 'LOAD_FAILED', message: 'The database is napping.' });
    render(<JobDetail id={ID} />);
    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toBe('The database is napping.');

    serveJob(activeJob());
    await userEvent.setup().click(screen.getByRole('button', { name: 'Try again' }));
    expect(await screen.findByText('Dripping pipe under the sink')).toBeTruthy();
    expect(screen.queryByRole('alert')).toBeNull();
    expect(jobGets()).toBe(2);
  });

  it('401 shows the access code form and a successful login reloads the job', async () => {
    handler = (call) => {
      if (call.method === 'GET' && call.url === JOB_URL) return json(401, { error: 'UNAUTHORIZED', message: 'x' });
      return json(500, {});
    };
    render(<JobDetail id={ID} />);
    const input = await screen.findByLabelText('Access code');

    const body = valid(activeJob());
    handler = (call) => {
      if (call.method === 'POST' && call.url === '/api/pro/login') return json(200, { ok: true });
      if (call.method === 'GET' && call.url === JOB_URL) return json(200, body);
      return json(500, {});
    };
    const user = userEvent.setup();
    await user.type(input, 'secret');
    await user.click(screen.getByRole('button', { name: 'Enter' }));

    expect(await screen.findByText('Dripping pipe under the sink')).toBeTruthy();
    expect(screen.queryByLabelText('Access code')).toBeNull();
    expect(jobGets()).toBe(2);
  });
});

describe('JobDetail after an action', () => {
  it('reloads the job and focuses the status element after a successful decline', async () => {
    let declined = false;
    const fresh = valid(activeJob());
    const after = valid(activeJob({ status: 'declined', declineReason: 'Too far away' }));
    handler = (call) => {
      if (call.method === 'POST' && call.url === `${JOB_URL}/decline`) {
        declined = true;
        return json(200, { status: 'declined' });
      }
      if (call.method === 'GET' && call.url === JOB_URL) return json(200, declined ? after : fresh);
      return json(500, {});
    };
    render(<JobDetail id={ID} />);
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: 'Decline job' }));

    const statusEl = (): HTMLElement => screen.getByText('Declined', { selector: '[role="status"]' });
    await waitFor(() => expect(statusEl()).toBeTruthy());
    expect(jobGets()).toBe(2);
    await waitFor(() => expect(document.activeElement).toBe(statusEl()));
  });
});
