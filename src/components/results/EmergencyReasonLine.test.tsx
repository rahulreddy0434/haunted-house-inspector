// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import type { UseInspectionReturn } from '@/hooks/useInspection';
import type { UseStatusPollingReturn } from '@/hooks/useStatusPolling';
import { EMERGENCY_REASON_SENTENCES } from '@/lib/emergency/reasons';
import { emergencyResult } from '@/test/inspectionFixtures';
import type { EmergencyConditionCode } from '@/lib/safety/safetyLayer';

const hooks = vi.hoisted(() => ({ inspection: null as unknown as UseInspectionReturn }));
vi.mock('@/hooks/useInspection', () => ({ useInspection: () => hooks.inspection }));
vi.mock('@/hooks/useStatusPolling', () => ({
  useStatusPolling: () => ({ view: null, gone: false, applyView: () => {} }),
}));

import { ThemeProvider } from '@/components/ThemeProvider';
import { ProEmergencyView } from '@/components/pro/ProEmergencyView';
import { EmergencyReasonLine } from './EmergencyReasonLine';
import { ResultsView } from './ResultsView';
import { StatusPanelBody } from './StatusPanel';
import { EMERGENCY_MESSAGE, PRO_EMERGENCY_NOTE } from '@/lib/emergency/messages';

const ROOT = document.documentElement;
const ID = '3f2b8c1e-5a47-4d9e-9b1a-2c7d8e6f0a11';
const RULES: EmergencyConditionCode[] = ['GAS_SMELL', 'ELECTRICAL_FIRE', 'WATER_ELECTRICAL', 'CO_ALARM'];
const ALL_SENTENCES = Object.values(EMERGENCY_REASON_SENTENCES);
const ANSWERS = { location: 'Kitchen', duration: '', recentChanges: '' };

afterEach(() => {
  cleanup();
  window.localStorage.clear();
  ROOT.classList.remove('theme-haunted');
});

function setResult(overrides: Partial<UseInspectionReturn['result'] & object> = {}): void {
  hooks.inspection = {
    result: { ...emergencyResult, ...overrides },
    loading: false,
    error: null,
    notFound: false,
    markEmergency: () => {},
  } as UseInspectionReturn;
}

function pollingWith(view: UseStatusPollingReturn['view']): UseStatusPollingReturn {
  return {
    view,
    loaded: true,
    updateFailed: false,
    refreshing: false,
    stopped: true,
    gone: false,
    refresh: () => {},
    refreshNow: () => {},
    applyView: () => {},
  } as unknown as UseStatusPollingReturn;
}

function shownSentences(container: HTMLElement): string[] {
  const text = container.textContent ?? '';
  return ALL_SENTENCES.filter((s) => text.includes(s));
}

describe('EmergencyReasonLine', () => {
  it.each(RULES)('renders the fixed sentence for %s as one plain paragraph', (rule) => {
    const sentence = EMERGENCY_REASON_SENTENCES[rule];
    render(<EmergencyReasonLine sentence={sentence} />);
    const el = screen.getByText(sentence);
    expect(el.tagName).toBe('P');
    expect(el.textContent).toBe(sentence);
  });

  it('renders nothing without a sentence', () => {
    const { container } = render(<EmergencyReasonLine />);
    expect(container.innerHTML).toBe('');
  });

  it('carries no haunted: class and renders the same plain element under the Haunted theme', () => {
    const sentence = EMERGENCY_REASON_SENTENCES.GAS_SMELL;
    const normal = render(<EmergencyReasonLine sentence={sentence} />);
    const normalHtml = normal.container.innerHTML;
    const normalClasses = Array.from(screen.getByText(sentence).classList);
    normal.unmount();

    window.localStorage.setItem('hhi_theme', 'haunted');
    ROOT.classList.add('theme-haunted');
    const haunted = render(
      <ThemeProvider>
        <EmergencyReasonLine sentence={sentence} />
      </ThemeProvider>,
    );
    const el = screen.getByText(sentence);
    expect(haunted.container.innerHTML).toBe(normalHtml);
    expect(Array.from(el.classList)).toEqual(normalClasses);
    expect(normalClasses.some((c) => c.startsWith('haunted:'))).toBe(false);
    expect(el.outerHTML).not.toContain('haunted:');
    expect(el.querySelector('[data-haunted-art]')).toBeNull();
  });
});

describe('Homeowner emergency view (ResultsView)', () => {
  it.each(RULES)('shows the sentence for the saved rule %s under the banner, before the h1', (rule) => {
    setResult({ emergencyRule: rule, emergencySource: 'precheck' });
    const { container } = render(<ResultsView id={ID} />);
    const sentence = EMERGENCY_REASON_SENTENCES[rule];
    const line = screen.getByText(sentence);
    const banner = screen.getByText(EMERGENCY_MESSAGE);
    expect(banner.compareDocumentPosition(line) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    const h1 = screen.getByRole('heading', { level: 1 });
    expect(line.compareDocumentPosition(h1) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(shownSentences(container)).toEqual([sentence]);
    expect(line.className).not.toMatch(/haunted:/);
  });

  it.each(['precheck', 'postcheck', 'override'] as const)(
    'shows the same sentence whatever the saved source (%s)',
    (source) => {
      setResult({ emergencyRule: 'CO_ALARM', emergencySource: source });
      render(<ResultsView id={ID} />);
      expect(screen.getByText(EMERGENCY_REASON_SENTENCES.CO_ALARM)).toBeTruthy();
    },
  );

  it('shows no sentence for a job with no saved rule and keeps the rest of the page', () => {
    setResult();
    const { container } = render(<ResultsView id={ID} />);
    expect(shownSentences(container)).toEqual([]);
    expect(screen.getByText(EMERGENCY_MESSAGE)).toBeTruthy();
    expect(screen.getByText('Emergency')).toBeTruthy();
    expect(screen.getByRole('heading', { level: 1 })).toBeTruthy();
  });
});

describe('Homeowner emergency view (StatusPanelBody)', () => {
  it.each(RULES)('shows the sentence from an emergency status view for %s', (rule) => {
    const sentence = EMERGENCY_REASON_SENTENCES[rule];
    const { container } = render(
      <StatusPanelBody
        id={ID}
        polling={pollingWith({ status: 'emergency', message: EMERGENCY_MESSAGE, reasonSentence: sentence })}
      />,
    );
    expect(shownSentences(container)).toEqual([sentence]);
    expect(screen.getByText(sentence).className).not.toMatch(/haunted:/);
  });

  it('shows no sentence when the emergency view has no reasonSentence', () => {
    const { container } = render(
      <StatusPanelBody id={ID} polling={pollingWith({ status: 'emergency', message: EMERGENCY_MESSAGE })} />,
    );
    expect(container.textContent).toBe('');
  });
});

describe('Pro emergency note (ProEmergencyView)', () => {
  it.each(RULES)('shows the sentence for %s directly under the note', (rule) => {
    const sentence = EMERGENCY_REASON_SENTENCES[rule];
    const { container } = render(
      <ProEmergencyView job={{ likelyIssue: 'Possible emergency', answers: ANSWERS, reasonSentence: sentence }} />,
    );
    const note = screen.getByText(PRO_EMERGENCY_NOTE);
    const line = screen.getByText(sentence);
    expect(note.nextElementSibling).toBe(line);
    expect(shownSentences(container)).toEqual([sentence]);
    expect(line.className).not.toMatch(/haunted:/);
  });

  it('shows no sentence for an old job and keeps the note, issue and answers', () => {
    const { container } = render(
      <ProEmergencyView job={{ likelyIssue: 'Possible emergency', answers: ANSWERS }} />,
    );
    expect(shownSentences(container)).toEqual([]);
    expect(screen.getByText(PRO_EMERGENCY_NOTE)).toBeTruthy();
    expect(screen.getByText('Possible emergency')).toBeTruthy();
    expect(screen.getByText('Kitchen')).toBeTruthy();
  });

  it('renders the sentence the same way under the Haunted theme', () => {
    const sentence = EMERGENCY_REASON_SENTENCES.WATER_ELECTRICAL;
    const job = { likelyIssue: 'x', answers: ANSWERS, reasonSentence: sentence };
    const normal = render(<ProEmergencyView job={job} />);
    const normalHtml = normal.container.innerHTML;
    normal.unmount();
    ROOT.classList.add('theme-haunted');
    const haunted = render(
      <ThemeProvider>
        <ProEmergencyView job={job} />
      </ThemeProvider>,
    );
    expect(haunted.container.innerHTML).toBe(normalHtml);
    expect(screen.getByText(sentence).className).not.toMatch(/haunted:/);
  });
});
