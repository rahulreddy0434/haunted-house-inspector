// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, screen, within } from '@testing-library/react';
import { ProDashboard } from './ProDashboard';
import { renderWithChrome } from './renderWithChrome.test-util';
import { resetProSession } from '@/hooks/proSession';

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

let jobsResponse: () => Response;

beforeEach(() => {
  resetProSession();
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: unknown) => {
      const url = typeof input === 'string' ? input : String(input);
      if (url === '/api/pro/jobs') return jobsResponse();
      throw new Error(`unexpected fetch: ${url}`);
    }),
  );
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('Pro header chrome', () => {
  it('shows the PRO tag and no Log out on the access code screen', async () => {
    jobsResponse = () => json(401, { error: 'UNAUTHORIZED', message: 'no' });
    renderWithChrome(<ProDashboard />);
    expect(await screen.findByLabelText('Access code')).toBeTruthy();
    expect(within(screen.getByRole('banner')).getByText('PRO')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Log out' })).toBeNull();
  });

  it('shows exactly one Log out, inside the header, on a signed-in page', async () => {
    jobsResponse = () => json(200, { jobs: [] });
    renderWithChrome(<ProDashboard />);
    await screen.findByRole('button', { name: 'Refresh' });
    const buttons = screen.getAllByRole('button', { name: 'Log out' });
    expect(buttons).toHaveLength(1);
    expect(within(screen.getByRole('banner')).getByRole('button', { name: 'Log out' })).toBe(buttons[0]);
  });
});
