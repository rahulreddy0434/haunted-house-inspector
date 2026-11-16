import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen, within } from '@testing-library/react';
import { JobFacts, type JobFactsProps } from './JobFacts';
import { CostRange } from '@/components/results/CostRange';
import { formatConfidence } from '@/lib/utils/formatConfidence';

afterEach(cleanup);

type Job = JobFactsProps['job'];

function makeJob(overrides: Partial<Job> = {}): Job {
  return {
    likelyIssue: 'Leaking pipe under the sink',
    trade: 'plumber',
    confidence: 0.75,
    costRangeLow: 150,
    costRangeHigh: 400,
    jobBrief: 'Water drips under the kitchen sink.',
    urgency: 'soon',
    followUpQuestions: ['Is the drip constant?', 'Is the cabinet floor soft?'],
    answers: { location: 'Kitchen', duration: 'Two days', recentChanges: 'New dishwasher' },
    ...overrides,
  };
}

describe('JobFacts', () => {
  it('renders the cost exactly as CostRange does, with the quote label next to it', () => {
    const job = makeJob();
    const { container: alone } = render(
      <CostRange costRangeLow={job.costRangeLow} costRangeHigh={job.costRangeHigh} urgency={job.urgency} />,
    );
    const expectedAmount = within(alone).getByTestId('cost-amount').textContent;
    cleanup();

    render(<JobFacts job={job} />);
    expect(screen.getByTestId('cost-amount').textContent).toBe(expectedAmount);
    expect(screen.getByTestId('cost-label').textContent).toBe('rough range, not a quote');
  });

  it('shows confidence as ~75% with its label', () => {
    render(<JobFacts job={makeJob({ confidence: 0.75 })} />);
    expect(formatConfidence(0.75)).toBe('~75%');
    expect(screen.getByText('AI confidence in this diagnosis')).toBeTruthy();
    expect(screen.getByText('~75%')).toBeTruthy();
  });

  it('shows the three answer labels and values', () => {
    render(<JobFacts job={makeJob()} />);
    expect(screen.getByText('Where in the home')).toBeTruthy();
    expect(screen.getByText('How long')).toBeTruthy();
    expect(screen.getByText('Anything else')).toBeTruthy();
    expect(screen.getByText('Kitchen')).toBeTruthy();
    expect(screen.getByText('Two days')).toBeTruthy();
    expect(screen.getByText('New dishwasher')).toBeTruthy();
  });

  it('shows "Not answered" for empty and whitespace-only answers', () => {
    render(<JobFacts job={makeJob({ answers: { location: 'Kitchen', duration: '', recentChanges: '   ' } })} />);
    expect(screen.getAllByText('Not answered')).toHaveLength(2);
  });

  it('never renders diySteps, even when passed in an object with extra fields', () => {
    const base = makeJob();
    const withExtra: Job & { diySteps: string[] } = { ...base, diySteps: ['Turn off the main valve yourself'] };
    const { container } = render(<JobFacts job={withExtra} />);
    expect(container.textContent).not.toContain('Turn off the main valve yourself');
    expect(container.textContent?.toLowerCase()).not.toContain('diy');
  });

  it('shows the follow-up questions', () => {
    render(<JobFacts job={makeJob()} />);
    expect(screen.getByText('Is the drip constant?')).toBeTruthy();
    expect(screen.getByText('Is the cabinet floor soft?')).toBeTruthy();
  });
});
