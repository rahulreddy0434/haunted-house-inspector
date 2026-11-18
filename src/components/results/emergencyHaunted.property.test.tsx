// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import fc from 'fast-check';
import type { UseInspectionReturn } from '@/hooks/useInspection';
import { emergencyResult, normalResult } from '@/test/inspectionFixtures';

type Scenario = 'direct' | 'reply409' | 'book409' | 'poll' | 'pro';

const hook = vi.hoisted(() => ({
  initial: null as unknown as UseInspectionReturn['result'],
  emergency: null as unknown as UseInspectionReturn['result'],
}));

vi.mock('@/hooks/useInspection', async () => {
  const React = await import('react');
  return {
    useInspection: (): UseInspectionReturn => {
      const [flagged, setFlagged] = React.useState(false);
      return {
        result: flagged ? hook.emergency : hook.initial,
        loading: false,
        error: null,
        notFound: false,
        markEmergency: () => setFlagged(true),
      };
    },
  };
});

import { ResultsView } from '@/components/results/ResultsView';
import { JobDetail } from '@/components/pro/JobDetail';
import { ThemeProvider } from '@/components/ThemeProvider';
import { ThemeToggle } from '@/components/ThemeToggle';
import { resetProSession } from '@/hooks/proSession';
import { EMERGENCY_MESSAGE, PRO_EMERGENCY_NOTE } from '@/lib/emergency/messages';
import { HAUNTED_CLASS, THEME_STORAGE_KEY } from '@/lib/theme';

// Feature: haunted-mode, Property 6: Emergency pages never render Haunted styling
// **Validates: Requirements 6.13, 11.1, 11.2, 11.8, 11.9, 12.1, 12.2, 12.8, 13.1, 13.2, 14.7, 17.3**

const ID = '3f2b8c1e-5a47-4d9e-9b1a-2c7d8e6f0a11';
const SLOT = '2030-01-01T10:00:00.000Z';
const SWITCH_SELECTOR = '[role="switch"], button[aria-label="Haunted theme"]';

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

async function settle(): Promise<void> {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(0);
    await vi.advanceTimersByTimeAsync(0);
  });
}

function installFetch(scenario: Scenario, message: string, pro: Record<string, unknown>): void {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: unknown) => {
      const url = String(input);
      if (url.startsWith('/api/pro/jobs/')) return json(200, pro);
      if (url.endsWith('/reply') || url.endsWith('/book')) {
        return json(409, { error: 'JOB_IS_EMERGENCY', message });
      }
      if (url.endsWith('/status')) {
        if (scenario === 'poll') return json(200, { status: 'emergency', message });
        if (scenario === 'reply409') return json(200, { status: 'info_requested', question: 'Where is the leak?' });
        if (scenario === 'book409') return json(200, { status: 'accepted', offeredSlots: [SLOT] });
      }
      return json(500, {});
    }),
  );
}

function classTokens(el: Element): string[] {
  const all = [el, ...Array.from(el.querySelectorAll('*'))];
  return all.flatMap((node) => (node.getAttribute('class') ?? '').split(/\s+/).filter(Boolean));
}

const text = fc.string({ maxLength: 80 });

describe('Property 6: emergency pages never render Haunted styling', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    window.localStorage.clear();
    document.documentElement.classList.remove(HAUNTED_CLASS);
    resetProSession();
  });
  afterEach(() => {
    cleanup();
    vi.useRealTimers();
    vi.unstubAllGlobals();
    window.localStorage.clear();
    document.documentElement.classList.remove(HAUNTED_CLASS);
  });

  it('holds for every scenario, stored setting and emergency content', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.constantFrom<Scenario>('direct', 'reply409', 'book409', 'poll', 'pro'),
        fc.constantFrom<'normal' | 'haunted'>('normal', 'haunted'),
        text,
        fc.record({ location: text, duration: text, recentChanges: text }),
        fc.boolean(),
        text,
        async (scenario, stored, likelyIssue, answers, flagOnly, serverMessage) => {
          cleanup();
          window.localStorage.setItem(THEME_STORAGE_KEY, stored);
          // The inline head script has already run.
          document.documentElement.classList.toggle(HAUNTED_CLASS, stored === 'haunted');

          const emergency = flagOnly
            ? { ...normalResult, likelyIssue, answers, isEmergency: true }
            : { ...emergencyResult, likelyIssue, answers };
          hook.emergency = emergency;
          hook.initial = scenario === 'direct' ? emergency : { ...normalResult, answers };
          const pro = {
            id: ID,
            createdAt: '2030-01-01T10:00:00.000Z',
            status: 'emergency',
            urgency: 'emergency',
            likelyIssue,
            answers,
            emergencyNote: 'Emergency',
          };
          installFetch(scenario, serverMessage, pro);

          const { unmount } = render(
            <ThemeProvider>
              <ThemeToggle />
              {scenario === 'pro' ? <JobDetail id={ID} /> : <ResultsView id={ID} />}
            </ThemeProvider>,
          );
          try {
            await settle();
            if (scenario === 'reply409') {
              fireEvent.change(screen.getByLabelText('Your reply'), { target: { value: 'Under the sink' } });
              fireEvent.click(screen.getByRole('button', { name: 'Send reply' }));
              await settle();
            } else if (scenario === 'book409') {
              fireEvent.click(screen.getByRole('radio'));
              fireEvent.click(screen.getByRole('button', { name: 'Confirm this time' }));
              await settle();
            }

            const page = document.body;
            expect(document.documentElement.classList.contains(HAUNTED_CLASS)).toBe(false);
            expect(page.querySelector(SWITCH_SELECTOR)).toBeNull();
            expect(page.querySelector('[data-ghost]')).toBeNull();
            expect(page.querySelector('[data-haunted-art]')).toBeNull();
            expect(page.querySelector('.hhi-flicker, .hhi-fog-drift')).toBeNull();
            expect(window.localStorage.getItem(THEME_STORAGE_KEY)).toBe(stored);

            const badge = page.querySelector('[data-urgency="emergency"]');
            expect(badge).not.toBeNull();
            const fixed: Element[] = [badge!];

            if (scenario === 'pro') {
              const notes = Array.from(page.querySelectorAll('p')).filter(
                (p) => p.textContent === PRO_EMERGENCY_NOTE,
              );
              expect(notes).toHaveLength(1);
              fixed.push(notes[0]!);
            } else {
              const banner = page.querySelector('[role="alert"][aria-live="assertive"]');
              expect(banner).not.toBeNull();
              expect(banner!.querySelector('p')!.textContent).toBe(EMERGENCY_MESSAGE);
              fixed.push(banner!);
            }

            for (const el of fixed) {
              expect(classTokens(el).filter((token) => token.startsWith('haunted:'))).toEqual([]);
            }
          } finally {
            unmount();
            cleanup();
          }
        },
      ),
      { numRuns: 100 },
    );
  });

  it('uses the expected exact message constants', () => {
    expect(EMERGENCY_MESSAGE).toBe(
      'This may be dangerous. Get everyone to safety and call 911. For a gas smell, leave the home first, then call 911 or your gas utility from outside.',
    );
    expect(PRO_EMERGENCY_NOTE.length).toBeGreaterThan(0);
  });
});
