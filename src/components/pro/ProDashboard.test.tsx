import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ProDashboard } from './ProDashboard';
import { renderWithChrome } from './renderWithChrome.test-util';
import { resetProSession } from '@/hooks/proSession';
import { metadata } from '@/app/pro/page';

const NOTICE = 'Your session has ended. Please enter the access code again.';
const DISABLED = "Tradesperson access isn't available right now.";
const JOB_ID = '11111111-1111-4111-8111-111111111111';

const JOBS_BODY = {
  jobs: [
    {
      id: JOB_ID,
      createdAt: '2025-03-04T10:30:00.000Z',
      urgency: 'urgent',
      trade: 'Plumber',
      location: 'Springfield, IL',
      status: 'new',
    },
  ],
};

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

interface Routes {
  jobs: Array<() => Response>;
  login?: () => Response;
  logout?: () => Response | Promise<Response>;
}

let routes: Routes;
let fetchMock: ReturnType<typeof vi.fn>;

function urlOf(input: unknown): string {
  return typeof input === 'string' ? input : String(input);
}

function callsTo(url: string): unknown[][] {
  return fetchMock.mock.calls.filter((c) => urlOf(c[0]) === url);
}

beforeEach(() => {
  resetProSession();
  routes = { jobs: [] };
  fetchMock = vi.fn(async (input: unknown) => {
    const url = urlOf(input);
    if (url === '/api/pro/jobs') {
      const next = routes.jobs.length > 1 ? routes.jobs.shift() : routes.jobs[0];
      if (!next) throw new Error('no jobs response configured');
      return next();
    }
    if (url === '/api/pro/login') {
      if (!routes.login) throw new Error('no login response configured');
      return routes.login();
    }
    if (url === '/api/pro/logout') {
      if (!routes.logout) throw new Error('no logout response configured');
      return routes.logout();
    }
    throw new Error(`unexpected fetch: ${url}`);
  });
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('ProDashboard', () => {
  it('shows the access code form without the notice on a first-load 401', async () => {
    routes.jobs = [() => json(401, { error: 'UNAUTHORIZED', message: 'no' })];
    renderWithChrome(<ProDashboard />);
    expect(await screen.findByLabelText('Access code')).toBeTruthy();
    expect(screen.queryByText(NOTICE)).toBeNull();
  });

  it('refetches and shows the list after a successful login', async () => {
    routes.jobs = [
      () => json(401, { error: 'UNAUTHORIZED', message: 'no' }),
      () => json(200, JOBS_BODY),
    ];
    routes.login = () => json(200, { ok: true });
    const user = userEvent.setup();
    renderWithChrome(<ProDashboard />);
    await user.type(await screen.findByLabelText('Access code'), 'letmein');
    await user.click(screen.getByRole('button', { name: 'Enter' }));

    const link = await screen.findByRole('link', { name: /Plumber|Springfield/ });
    expect(link.getAttribute('href')).toBe(`/pro/jobs/${JOB_ID}`);
    expect(screen.getByText('Springfield, IL')).toBeTruthy();
    expect(screen.queryByLabelText('Access code')).toBeNull();
    expect(callsTo('/api/pro/jobs')).toHaveLength(2);
    expect(callsTo('/api/pro/login')).toHaveLength(1);
  });

  it('shows the form with the notice and no job data after a later 401', async () => {
    routes.jobs = [
      () => json(200, JOBS_BODY),
      () => json(401, { error: 'UNAUTHORIZED', message: 'no' }),
    ];
    const user = userEvent.setup();
    renderWithChrome(<ProDashboard />);
    expect(await screen.findByText('Springfield, IL')).toBeTruthy();

    await waitFor(() => {
      expect((screen.getByRole('button', { name: 'Refresh' }) as HTMLButtonElement).disabled).toBe(false);
    });
    await user.click(screen.getByRole('button', { name: 'Refresh' }));

    expect(await screen.findByText(NOTICE)).toBeTruthy();
    expect(screen.getByLabelText('Access code')).toBeTruthy();
    expect(screen.queryByText('Springfield, IL')).toBeNull();
    expect(screen.queryByText('Plumber')).toBeNull();
    expect(screen.queryByRole('link', { name: /Plumber|Springfield/ })).toBeNull();
  });

  it('shows the unavailable message and no form on a 503', async () => {
    routes.jobs = [() => json(503, { error: 'PRO_DISABLED', message: 'off' })];
    renderWithChrome(<ProDashboard />);
    expect(await screen.findByText(DISABLED)).toBeTruthy();
    expect(screen.queryByLabelText('Access code')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Enter' })).toBeNull();
  });

  it('posts to logout and shows the form again', async () => {
    routes.jobs = [() => json(200, JOBS_BODY)];
    routes.logout = () => json(200, { ok: true });
    const user = userEvent.setup();
    renderWithChrome(<ProDashboard />);
    await screen.findByText('Springfield, IL');
    await user.click(screen.getByRole('button', { name: 'Log out' }));

    expect(await screen.findByLabelText('Access code')).toBeTruthy();
    expect(screen.queryByText(NOTICE)).toBeNull();
    expect(screen.queryByText('Springfield, IL')).toBeNull();
    const logoutCalls = callsTo('/api/pro/logout');
    expect(logoutCalls).toHaveLength(1);
    expect((logoutCalls[0][1] as RequestInit).method).toBe('POST');
  });

  it('shows the form again when the logout request fails', async () => {
    routes.jobs = [() => json(200, JOBS_BODY)];
    routes.logout = () => {
      throw new TypeError('Failed to fetch');
    };
    const user = userEvent.setup();
    renderWithChrome(<ProDashboard />);
    await screen.findByText('Springfield, IL');
    await user.click(screen.getByRole('button', { name: 'Log out' }));

    expect(await screen.findByLabelText('Access code')).toBeTruthy();
    expect(screen.queryByText('Springfield, IL')).toBeNull();
    expect(callsTo('/api/pro/logout')).toHaveLength(1);
  });
});

describe('/pro page metadata', () => {
  it('asks search engines not to index or follow the page', () => {
    expect(metadata.robots).toEqual({ index: false, follow: false });
  });
});
