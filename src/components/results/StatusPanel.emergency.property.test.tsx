// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, act, fireEvent } from '@testing-library/react';
import fc from 'fast-check';
import type { UseInspectionReturn } from '@/hooks/useInspection';
import { emergencyResult } from '@/test/inspectionFixtures';

const hook = vi.hoisted(() => ({ value: null as unknown as UseInspectionReturn }));
vi.mock('@/hooks/useInspection', () => ({ useInspection: () => hook.value }));

import { StatusPanel } from '@/components/results/StatusPanel';
import { ResultsView } from '@/components/results/ResultsView';

// Feature: pro-dashboard-and-booking, Property 2: Emergency stays emergency, through every handler and every view
// **Validates: Requirements 8.5, 8.12, 11.8, 16.3**

const ID = '3f2b8c1e-5a47-4d9e-9b1a-2c7d8e6f0a11';
const RUNS = 100;

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status });
}

async function settle(ms = 0): Promise<void> {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
}

function statusCalls(fetchMock: ReturnType<typeof vi.fn>): number {
  return fetchMock.mock.calls.filter(([url]) => String(url).endsWith('/status')).length;
}

describe('Property 2 (UI): emergency stays emergency', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    cleanup();
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('a status response of emergency empties the panel, stops polling and notifies once', async () => {
    await fc.assert(
      fc.asyncProperty(fc.string(), async (message) => {
        const fetchMock = vi.fn(async () => json(200, { status: 'emergency', message }));
        vi.stubGlobal('fetch', fetchMock);
        const onEmergency = vi.fn();
        const { container, unmount } = render(<StatusPanel id={ID} onEmergency={onEmergency} />);
        await settle();
        expect(container.innerHTML).toBe('');
        expect(onEmergency).toHaveBeenCalledTimes(1);
        const calls = fetchMock.mock.calls.length;
        await settle(95_000);
        expect(fetchMock.mock.calls.length).toBe(calls);
        expect(onEmergency).toHaveBeenCalledTimes(1);
        unmount();
        cleanup();
      }),
      { numRuns: RUNS },
    );
  });

  it('an emergency view from a reply (200 or 409) after a non-emergency view empties the panel and stops polling', async () => {
    await fc.assert(
      fc.asyncProperty(fc.string(), fc.boolean(), async (message, via409) => {
        const fetchMock = vi.fn(async (url: string) => {
          if (String(url).endsWith('/reply')) {
            return via409
              ? json(409, { error: 'JOB_IS_EMERGENCY', message })
              : json(200, { status: 'emergency', message });
          }
          return json(200, { status: 'info_requested', question: 'Where is the leak?' });
        });
        vi.stubGlobal('fetch', fetchMock);
        const onEmergency = vi.fn();
        const { container, unmount } = render(<StatusPanel id={ID} onEmergency={onEmergency} />);
        await settle();
        expect(container.textContent).toContain('Where is the leak?');
        expect(onEmergency).not.toHaveBeenCalled();

        fireEvent.change(screen.getByLabelText('Your reply'), { target: { value: 'It is under the sink' } });
        fireEvent.click(screen.getByRole('button', { name: 'Send reply' }));
        await settle();

        expect(container.innerHTML).toBe('');
        expect(onEmergency).toHaveBeenCalledTimes(1);
        const statusBefore = statusCalls(fetchMock);
        await settle(95_000);
        expect(statusCalls(fetchMock)).toBe(statusBefore);
        expect(onEmergency).toHaveBeenCalledTimes(1);
        unmount();
        cleanup();
      }),
      { numRuns: RUNS },
    );
  });

  it('ResultsView with an emergency result mounts no status panel and sends no status request', async () => {
    const fetchMock = vi.fn(async () => json(200, { status: 'new' }));
    vi.stubGlobal('fetch', fetchMock);
    await fc.assert(
      fc.asyncProperty(fc.string({ minLength: 1 }), async (likelyIssue) => {
        hook.value = {
          result: { ...emergencyResult, likelyIssue },
          loading: false,
          error: null,
          notFound: false,
          markEmergency: () => {},
        };
        const { unmount } = render(<ResultsView id={ID} />);
        await settle(95_000);
        expect(screen.queryByRole('region', { name: 'Job status' })).toBeNull();
        expect(screen.queryByRole('button', { name: 'Refresh' })).toBeNull();
        expect(fetchMock).not.toHaveBeenCalled();
        unmount();
        cleanup();
      }),
      { numRuns: RUNS },
    );
  });
});
