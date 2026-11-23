// @vitest-environment jsdom
// Feature: chat-and-help, task 5.12. One Help_Section per page and none in emergency views.
// Real pages, hooks and ChatPanel. Only fetch is stubbed.
import { Profiler } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, render, screen } from '@testing-library/react';
import Home from '@/app/page';
import { ProDashboard } from '@/components/pro/ProDashboard';
import { JobDetail } from '@/components/pro/JobDetail';
import { ResultsView } from '@/components/results/ResultsView';
import { resetProSession } from '@/hooks/proSession';
import { FAST_INTERVAL_MS } from '@/lib/chat/pollSchedule';
import { EMERGENCY_MESSAGE } from '@/lib/emergency/messages';
import { HELP_HEADING } from '@/lib/help/copy';
import { proJobDetailSchema } from '@/lib/validation/jobSchema';
import { emergencyResult, normalResult } from '@/test/inspectionFixtures';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn() }),
  usePathname: () => '/',
  useSearchParams: () => new URLSearchParams(),
}));

const ID = normalResult.id;

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function stubFetch(routes: (url: string) => Response | null): void {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: string) => routes(String(input)) ?? json(500, { error: 'ACTION_FAILED', message: 'x' })),
  );
}

function helpCount(root: ParentNode = document.body): number {
  return Array.from(root.querySelectorAll('h2')).filter((h) => h.textContent === HELP_HEADING).length;
}

function chatBody(status: string) {
  return { status, booking: {}, chatState: 'open', messages: [], lastSeq: 0 };
}

function proJob(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  const job = {
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
  expect(proJobDetailSchema.safeParse(job).success).toBe(true);
  return job;
}

const UNAUTHORIZED = () => json(401, { error: 'UNAUTHORIZED', message: 'Please enter the access code.' });

beforeEach(() => {
  sessionStorage.clear();
  resetProSession();
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('Help_Section placement (real timers)', () => {
  it('Home has exactly one', () => {
    stubFetch(() => null);
    render(<Home />);
    expect(helpCount()).toBe(1);
  });

  it('Results page: one on a normal result, not-found and error; none on loading or emergency result', async () => {
    stubFetch((url) => {
      if (url.endsWith('/status')) return json(200, { status: 'new' });
      if (url.includes('/chat')) return json(200, chatBody('new'));
      if (url === `/api/inspections/${ID}`) return json(200, normalResult);
      return null;
    });
    const normal = render(<ResultsView id={ID} />);
    expect(helpCount()).toBe(0); // loading
    await screen.findByText('Your inspection result');
    expect(helpCount()).toBe(1);
    normal.unmount();
    sessionStorage.clear(); // the result is cached per session

    stubFetch((url) => (url === `/api/inspections/${ID}` ? json(404, { error: 'NOT_FOUND', message: 'no' }) : null));
    const missing = render(<ResultsView id={ID} />);
    await screen.findByText('Result could not be found');
    expect(helpCount()).toBe(1);
    missing.unmount();

    stubFetch((url) =>
      url === `/api/inspections/${ID}` ? json(500, { error: 'LOAD_FAILED', message: 'Server is napping.' }) : null,
    );
    const failed = render(<ResultsView id={ID} />);
    await screen.findByRole('alert');
    expect(helpCount()).toBe(1);
    failed.unmount();

    stubFetch((url) => (url === `/api/inspections/${ID}` ? json(200, emergencyResult) : null));
    render(<ResultsView id={ID} />);
    await screen.findByText(EMERGENCY_MESSAGE);
    expect(helpCount()).toBe(0);
  });

  it('Pro dashboard: one on the access-code form and one on the job list', async () => {
    stubFetch((url) => (url === '/api/pro/jobs' ? UNAUTHORIZED() : null));
    const form = render(<ProDashboard />);
    await screen.findByLabelText('Access code');
    expect(helpCount()).toBe(1);
    form.unmount();

    stubFetch((url) => (url === '/api/pro/jobs' ? json(200, { jobs: [] }) : null));
    render(<ProDashboard />);
    await screen.findByRole('button', { name: 'Log out' });
    expect(helpCount()).toBe(1);
  });

  it('Pro job page: one on the job, the access-code form and not-found; none on loading or emergency', async () => {
    stubFetch((url) => {
      if (url === `/api/pro/jobs/${ID}`) return json(200, proJob());
      if (url.startsWith(`/api/pro/jobs/${ID}/chat`)) return json(200, chatBody('new'));
      return null;
    });
    const ready = render(<JobDetail id={ID} />);
    expect(helpCount()).toBe(0); // loading
    await screen.findByText('Job details');
    expect(helpCount()).toBe(1);
    ready.unmount();

    stubFetch((url) => (url === `/api/pro/jobs/${ID}` ? UNAUTHORIZED() : null));
    const form = render(<JobDetail id={ID} />);
    await screen.findByLabelText('Access code');
    expect(helpCount()).toBe(1);
    form.unmount();

    stubFetch((url) => (url === `/api/pro/jobs/${ID}` ? json(404, { error: 'NOT_FOUND', message: 'no' }) : null));
    const missing = render(<JobDetail id={ID} />);
    await screen.findByText("We couldn't find this job.");
    expect(helpCount()).toBe(1);
    missing.unmount();

    stubFetch((url) =>
      url === `/api/pro/jobs/${ID}`
        ? json(200, {
            id: ID,
            createdAt: '2030-01-01T10:00:00.000Z',
            status: 'emergency',
            urgency: 'emergency',
            likelyIssue: 'Possible gas leak',
            answers: { location: 'Kitchen', duration: '', recentChanges: 'Smelled gas' },
            emergencyNote: 'Emergency: the homeowner was told to leave and call 911.',
          })
        : null,
    );
    render(<JobDetail id={ID} />);
    await screen.findByText('Job details');
    expect(helpCount()).toBe(0);
  });
});

describe('Help_Section removed in the same render as an emergency (fake timers)', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  async function advance(ms: number): Promise<void> {
    await act(async () => {
      await vi.advanceTimersByTimeAsync(ms);
    });
  }

  it('Results page', async () => {
    let chat = () => json(200, chatBody('new'));
    stubFetch((url) => {
      if (url.endsWith('/status')) return json(200, { status: 'new' });
      if (url.includes('/chat')) return chat();
      if (url === `/api/inspections/${ID}`) return json(200, normalResult);
      return null;
    });
    const holder = document.createElement('div');
    document.body.appendChild(holder);
    const snapshots: { help: number; emergency: boolean }[] = [];
    const snap = () => ({ help: helpCount(holder), emergency: holder.textContent?.includes(EMERGENCY_MESSAGE) ?? false });
    render(
      <Profiler id="r" onRender={() => snapshots.push(snap())}>
        <ResultsView id={ID} />
      </Profiler>,
      { container: holder },
    );
    await advance(0);
    await advance(0);
    expect(snap()).toEqual({ help: 1, emergency: false });

    chat = () => json(409, { error: 'JOB_IS_EMERGENCY', message: EMERGENCY_MESSAGE, status: 'emergency' });
    snapshots.length = 0;
    await advance(FAST_INTERVAL_MS);

    expect(snap()).toEqual({ help: 0, emergency: true });
    expect(snapshots.length).toBeGreaterThan(0);
    for (const s of snapshots) expect(s.help).toBe(s.emergency ? 0 : 1);
  });

  it('Pro job page', async () => {
    let chat = () => json(200, chatBody('new'));
    stubFetch((url) => {
      if (url === `/api/pro/jobs/${ID}`) return json(200, proJob());
      if (url.startsWith(`/api/pro/jobs/${ID}/chat`)) return chat();
      return null;
    });
    const holder = document.createElement('div');
    document.body.appendChild(holder);
    const snapshots: { help: number; emergency: boolean }[] = [];
    const snap = () => ({
      help: helpCount(holder),
      // The chat panel is rendered only outside the emergency view.
      emergency: !Array.from(holder.querySelectorAll('h2')).some((h) => h.textContent === 'Messages'),
    });
    render(
      <Profiler id="p" onRender={() => snapshots.push(snap())}>
        <JobDetail id={ID} />
      </Profiler>,
      { container: holder },
    );
    await advance(0);
    await advance(0);
    expect(helpCount(holder)).toBe(1);

    chat = () => json(409, { error: 'JOB_IS_EMERGENCY', message: EMERGENCY_MESSAGE, status: 'emergency' });
    snapshots.length = 0;
    await advance(FAST_INTERVAL_MS);

    expect(helpCount(holder)).toBe(0);
    expect(snapshots.length).toBeGreaterThan(0);
    // Whenever the chat panel is gone (emergency view), the Help_Section is gone in the same commit.
    for (const s of snapshots) expect(s.help === 1).toBe(!s.emergency);
  });
});
