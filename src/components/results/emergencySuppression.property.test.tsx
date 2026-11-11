// @vitest-environment jsdom
// Feature: intake-and-triage, Property 13: Emergency results never contain cost range, job brief, or DIY steps
// **Validates: Requirements 6.5**
import { describe, it, expect, afterEach } from 'vitest';
import * as fc from 'fast-check';
import { render, cleanup } from '@testing-library/react';
import { EmergencyBanner } from './EmergencyBanner';
import { UrgencyBadge } from './UrgencyBadge';
import { IssueSummary } from './IssueSummary';
import { CostRange } from './CostRange';
import { JobBrief } from './JobBrief';
import { normalResult } from '@/test/inspectionFixtures';
import type { InspectionResult, UrgencyLevel } from '@/types/inspection';

const EXPECTED_MESSAGE =
  'This may be dangerous. Get everyone to safety and call 911. For a gas smell, leave the home first, then call 911 or your gas utility from outside.';

const alnum = fc.stringMatching(/^[A-Za-z0-9]{1,30}$/);

const costPair = fc
  .tuple(fc.integer({ min: 0, max: 999999 }), fc.integer({ min: 0, max: 999999 }))
  .map(([a, b]) => (a <= b ? ([a, b] as const) : ([b, a] as const)));

function resultArb(urgency: fc.Arbitrary<UrgencyLevel>): fc.Arbitrary<InspectionResult> {
  return fc
    .record({
      urgency,
      cost: costPair,
      brief: alnum,
      steps: fc.array(alnum, { minLength: 1, maxLength: 5 }),
      issue: alnum,
      trade: alnum,
      q1: alnum,
      q2: alnum,
    })
    .map(({ urgency: u, cost, brief, steps, issue, trade, q1, q2 }) => ({
      ...normalResult,
      urgency: u,
      isEmergency: u === 'emergency',
      costRangeLow: cost[0],
      costRangeHigh: cost[1],
      jobBrief: `BRIEF-${brief}`,
      diySteps: steps.map((s) => `STEP-${s}`),
      likelyIssue: `ISSUE-${issue}`,
      trade: `TRADE-${trade}`,
      followUpQuestions: [`Q1-${q1}`, `Q2-${q2}`] as [string, string],
    }));
}

function renderResults(r: InspectionResult) {
  return render(
    <main>
      <EmergencyBanner urgency={r.urgency} />
      <UrgencyBadge urgency={r.urgency} />
      <IssueSummary
        likelyIssue={r.likelyIssue}
        trade={r.trade}
        followUpQuestions={r.followUpQuestions}
        diySteps={r.diySteps}
        urgency={r.urgency}
      />
      <CostRange
        costRangeLow={r.costRangeLow}
        costRangeHigh={r.costRangeHigh}
        urgency={r.urgency}
      />
      <JobBrief jobBrief={r.jobBrief} urgency={r.urgency} />
    </main>,
  );
}

describe('Property 13: emergency suppression', () => {
  afterEach(() => cleanup());

  it('emergency results render no cost range, job brief or DIY steps, and show the banner', () => {
    fc.assert(
      fc.property(resultArb(fc.constant<UrgencyLevel>('emergency')), (r) => {
        const { container, queryByRole, queryByText, unmount } = renderResults(r);
        const text = container.textContent ?? '';

        expect(text).not.toContain('CA$');
        expect(text).not.toContain('rough range, not a quote');
        expect(text).not.toContain('Rough cost');
        expect(text).not.toContain('BRIEF-');
        expect(queryByRole('button', { name: /copy/i })).toBeNull();
        expect(text).not.toContain('STEP-');
        expect(queryByText('Things you can safely try')).toBeNull();

        expect(queryByText(EXPECTED_MESSAGE)).not.toBeNull();
        expect(queryByRole('alert')?.textContent).toContain(EXPECTED_MESSAGE);
        unmount();
      }),
      { numRuns: 50 },
    );
  });

  it('control: non-emergency results show cost, brief and DIY steps and no banner', () => {
    const nonEmergency = fc.constantFrom<UrgencyLevel>('urgent', 'soon', 'monitor');
    fc.assert(
      fc.property(resultArb(nonEmergency), (r) => {
        const { container, queryByRole, queryByText, unmount } = renderResults(r);
        const text = container.textContent ?? '';

        expect(text).toContain('CA$');
        expect(text).toContain('rough range, not a quote');
        expect(text).toContain('Rough cost');
        expect(text).toContain(r.jobBrief);
        expect(queryByRole('button', { name: /copy/i })).not.toBeNull();
        expect(text).toContain('STEP-');
        expect(queryByText('Things you can safely try')).not.toBeNull();
        expect(queryByText(EXPECTED_MESSAGE)).toBeNull();
        unmount();
      }),
      { numRuns: 50 },
    );
  });
});
