// @vitest-environment jsdom
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import type { UseInspectionReturn } from '@/hooks/useInspection';
import type { UseProJobReturn } from '@/hooks/useProJob';
import { emergencyResult } from '@/test/inspectionFixtures';

const hooks = vi.hoisted(() => ({
  inspection: null as unknown as UseInspectionReturn,
  proJob: null as unknown as UseProJobReturn,
}));
vi.mock('@/hooks/useInspection', () => ({ useInspection: () => hooks.inspection }));
vi.mock('@/hooks/useProJob', () => ({ useProJob: () => hooks.proJob }));

import { ThemeProvider } from '@/components/ThemeProvider';
import { ThemeToggle } from '@/components/ThemeToggle';
import { EmergencyBanner } from '@/components/results/EmergencyBanner';
import { UrgencyBadge } from '@/components/results/UrgencyBadge';
import { ResultsView } from '@/components/results/ResultsView';
import { StatusPanel } from '@/components/results/StatusPanel';
import { JobDetail } from '@/components/pro/JobDetail';
import { ProEmergencyView } from '@/components/pro/ProEmergencyView';
import { EMERGENCY_MESSAGE, PRO_EMERGENCY_NOTE } from '@/lib/emergency/messages';

const ROOT = document.documentElement;
const ID = '3f2b8c1e-5a47-4d9e-9b1a-2c7d8e6f0a11';
const PRO_JOB = {
  id: ID,
  createdAt: '2030-01-01T10:00:00.000Z',
  status: 'emergency',
  urgency: 'emergency',
  likelyIssue: 'Possible gas leak',
  answers: { location: 'Kitchen', duration: '', recentChanges: 'Smelled gas' },
  emergencyNote: PRO_EMERGENCY_NOTE,
} as unknown as UseProJobReturn['job'];

function setInspection(overrides: Partial<UseInspectionReturn> = {}): void {
  hooks.inspection = {
    result: emergencyResult,
    loading: false,
    error: null,
    notFound: false,
    markEmergency: () => {},
    ...overrides,
  } as UseInspectionReturn;
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  window.localStorage.clear();
  ROOT.classList.remove('theme-haunted');
});

function tokens(el: Element): string[] {
  return Array.from(el.classList);
}

describe('Fixed emergency elements ignore the Haunted theme', () => {
  type Maker = { name: string; make: () => ReactNode; find: () => HTMLElement };
  const makers: Maker[] = [
    {
      name: 'Emergency_Banner',
      make: () => <EmergencyBanner urgency="emergency" />,
      find: () => screen.getByRole('alert'),
    },
    {
      name: 'Emergency_Badge',
      make: () => <UrgencyBadge urgency="emergency" />,
      find: () => screen.getByRole('status'),
    },
    {
      name: 'Pro note',
      make: () => (
        <ProEmergencyView
          job={{ likelyIssue: 'Possible gas leak', answers: { location: 'a', duration: 'b', recentChanges: 'c' } }}
        />
      ),
      find: () => screen.getByText(PRO_EMERGENCY_NOTE),
    },
  ];

  describe.each(makers)('$name', ({ make, find }) => {
    it('has the same classes with theme-haunted on the root, no haunted: token and no art', () => {
      const first = render(<>{make()}</>);
      const without = tokens(find());
      first.unmount();

      ROOT.classList.add('theme-haunted');
      render(<>{make()}</>);
      const el = find();
      expect(tokens(el)).toEqual(without);
      expect(tokens(el).some((c) => c.startsWith('haunted:'))).toBe(false);
      expect(el.querySelector('[data-haunted-art]')).toBeNull();
      expect(el.closest('[data-haunted-art]')).toBeNull();
    });
  });

  it('the Pro note has no haunted: token anywhere in its box', () => {
    ROOT.classList.add('theme-haunted');
    render(make1());
    function make1() {
      return (
        <ProEmergencyView
          job={{ likelyIssue: 'x', answers: { location: '', duration: '', recentChanges: '' } }}
        />
      );
    }
    const note = screen.getByText(PRO_EMERGENCY_NOTE);
    expect(note.className).not.toMatch(/haunted:/);
  });

  it('the banner keeps role="alert" and aria-live="assertive" after a theme toggle', () => {
    render(
      <ThemeProvider>
        <ThemeToggle />
        <EmergencyBanner urgency="emergency" />
      </ThemeProvider>,
    );
    const toggle = screen.getByRole('switch', { name: 'Haunted mode' });
    for (let i = 0; i < 2; i += 1) {
      fireEvent.click(toggle);
      const alert = screen.getByRole('alert');
      expect(alert.getAttribute('aria-live')).toBe('assertive');
    }
  });
});

describe('EmergencyScope source', () => {
  const source = readFileSync(
    join(process.cwd(), 'src/components/ui/haunted/EmergencyScope.tsx'),
    'utf8',
  );

  it('imports and calls useLayoutEffect and never uses useEffect', () => {
    expect(source).toMatch(/import\s*\{[^}]*\buseLayoutEffect\b[^}]*\}\s*from\s*'react'/);
    expect(source).toMatch(/\buseLayoutEffect\s*\(/);
    expect(source).not.toMatch(/\buseEffect\b/);
  });
});

describe('Emergency views remove theme-haunted in the same render', () => {
  function mountHaunted(ui: ReactNode) {
    window.localStorage.setItem('hhi_theme', 'haunted');
    ROOT.classList.add('theme-haunted');
    return render(<ThemeProvider>{ui}</ThemeProvider>);
  }
  const hasClass = () => ROOT.classList.contains('theme-haunted');

  it('Results_Page with an emergency result', () => {
    setInspection();
    mountHaunted(<ResultsView id={ID} />);
    expect(screen.getByRole('alert')).toBeTruthy();
    expect(hasClass()).toBe(false);
    expect(window.localStorage.getItem('hhi_theme')).toBe('haunted');
  });

  it('Pro job page with an emergency job', () => {
    hooks.proJob = {
      phase: 'ready',
      job: PRO_JOB,
      error: null,
      sessionLost: false,
      reload: () => {},
    } as UseProJobReturn;
    mountHaunted(<JobDetail id={ID} />);
    expect(screen.getByText(PRO_EMERGENCY_NOTE)).toBeTruthy();
    expect(hasClass()).toBe(false);
  });

  // The two network cases need the fetch promise to settle; this flushes
  // microtasks only (no fake or real timers).
  async function flush(): Promise<void> {
    for (let i = 0; i < 10; i += 1) {
      await act(async () => {
        await Promise.resolve();
      });
    }
  }
  function json(status: number, body: unknown): Response {
    return new Response(JSON.stringify(body), { status });
  }

  it('status poll returning emergency', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => json(200, { status: 'emergency', message: 'x' })));
    mountHaunted(<StatusPanel id={ID} onEmergency={() => {}} />);
    expect(hasClass()).toBe(true);
    await flush();
    expect(hasClass()).toBe(false);
    expect(window.localStorage.getItem('hhi_theme')).toBe('haunted');
  });

  it('reply returning JOB_IS_EMERGENCY', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) =>
        String(url).endsWith('/reply')
          ? json(409, { error: 'JOB_IS_EMERGENCY', message: 'x' })
          : json(200, { status: 'info_requested', question: 'Where is the leak?' }),
      ),
    );
    mountHaunted(<StatusPanel id={ID} onEmergency={() => {}} />);
    await flush();
    expect(hasClass()).toBe(true);
    fireEvent.change(screen.getByLabelText('Your reply'), { target: { value: 'Under the sink' } });
    fireEvent.click(screen.getByRole('button', { name: 'Send reply' }));
    await flush();
    expect(hasClass()).toBe(false);
  });
});

describe('Leaving an emergency page restores Haunted', () => {
  it('brings back the class and the switch (on) with hhi_theme unchanged', () => {
    setInspection();
    window.localStorage.setItem('hhi_theme', 'haunted');
    ROOT.classList.add('theme-haunted');
    function App({ show }: { show: boolean }) {
      return (
        <ThemeProvider>
          <ThemeToggle />
          {show ? <ResultsView id={ID} /> : <p>Home</p>}
        </ThemeProvider>
      );
    }
    const { rerender } = render(<App show />);
    expect(ROOT.classList.contains('theme-haunted')).toBe(false);
    expect(screen.queryByText(/Haunted mode/)).toBeNull();
    expect(screen.getByRole('link', { name: 'Start a new inspection' })).toBeTruthy();

    rerender(<App show={false} />);
    expect(ROOT.classList.contains('theme-haunted')).toBe(true);
    expect(window.localStorage.getItem('hhi_theme')).toBe('haunted');
    const toggle = screen.getByRole('switch', { name: 'Haunted mode' });
    expect(toggle.getAttribute('aria-checked')).toBe('true');
  });
});

describe('Exact emergency strings', () => {
  it('EMERGENCY_MESSAGE', () => {
    expect(EMERGENCY_MESSAGE).toBe(
      'This may be dangerous. Get everyone to safety and call 911. For a gas smell, leave the home first, then call 911 or your gas utility from outside.',
    );
  });
  it('PRO_EMERGENCY_NOTE', () => {
    expect(PRO_EMERGENCY_NOTE).toBe('Emergency: the homeowner was told to call 911');
  });
});
