// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { JobDetail } from './JobDetail';
import { resetProSession } from '@/hooks/proSession';

const ID = 'job-123';
const JOB_URL = `/api/pro/jobs/${ID}`;

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

const JOB = {
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
};

beforeEach(() => {
  resetProSession();
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: string, init?: RequestInit): Promise<Response> => {
      const url = String(input);
      const method = init?.method ?? 'GET';
      if (method === 'GET' && url === JOB_URL) return json(200, JOB);
      if (method === 'GET' && url.startsWith(`${JOB_URL}/chat`)) {
        return json(200, {
          status: 'new',
          booking: {},
          chatState: 'open',
          messages: [],
          lastSeq: 0,
        });
      }
      if (method === 'POST' && url === `${JOB_URL}/decline`) {
        return json(500, { error: 'ACTION_FAILED', message: 'Decline failed.' });
      }
      if (method === 'POST' && url === `${JOB_URL}/accept`) {
        return json(500, { error: 'ACTION_FAILED', message: 'Accept failed.' });
      }
      return json(500, {});
    }),
  );
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function card(name: string): HTMLElement {
  return screen.getByRole('region', { name });
}

describe('JobDetail action errors', () => {
  it('shows a decline failure inside the decline card only', async () => {
    const user = userEvent.setup();
    render(<JobDetail id={ID} />);
    await user.click(await screen.findByRole('button', { name: 'Decline job' }));

    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toBe('Decline failed.');
    expect(screen.getAllByRole('alert')).toHaveLength(1);

    const decline = card("Can't take this job?");
    expect(decline.contains(alert)).toBe(true);
    expect(within(decline).getByRole('button', { name: 'Decline job' })).toBeTruthy();
    expect(card('Accept and offer times').contains(alert)).toBe(false);
  });

  it('shows an accept failure inside the accept card only', async () => {
    const user = userEvent.setup();
    render(<JobDetail id={ID} />);
    await screen.findByRole('button', { name: 'Accept job' });
    const accept = card('Accept and offer times');
    fireEvent.change(within(accept).getByLabelText('First time you can start'), {
      target: { value: '2030-02-01T09:00' },
    });
    await user.click(within(accept).getByRole('button', { name: 'Accept job' }));

    const alert = await screen.findByRole('alert');
    await waitFor(() => expect(alert.textContent).toBe('Accept failed.'));
    expect(screen.getAllByRole('alert')).toHaveLength(1);

    expect(accept.contains(alert)).toBe(true);
    expect(card("Can't take this job?").contains(alert)).toBe(false);
  });
});
