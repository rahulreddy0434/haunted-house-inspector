import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { ProEmergencyView, type ProEmergencyViewProps } from './ProEmergencyView';

afterEach(cleanup);

const JOB: ProEmergencyViewProps['job'] = {
  emergencyNote: 'Emergency: the homeowner was told to leave and call 911.',
  likelyIssue: 'Possible gas leak near the stove',
  answers: { location: 'Kitchen', duration: '', recentChanges: 'Smelled gas this morning' },
};

describe('ProEmergencyView', () => {
  it('shows the note, likely issue and answers', () => {
    render(<ProEmergencyView job={JOB} />);
    expect(screen.getByText(JOB.emergencyNote)).toBeTruthy();
    expect(screen.getByText(JOB.likelyIssue)).toBeTruthy();
    expect(screen.getByText('Kitchen')).toBeTruthy();
    expect(screen.getByText('Smelled gas this morning')).toBeTruthy();
    expect(screen.getByText('Not answered')).toBeTruthy();
  });

  it('has no buttons, photo links, images, cost text, trade or brief', () => {
    const { container } = render(<ProEmergencyView job={JOB} />);
    expect(screen.queryAllByRole('button')).toHaveLength(0);
    expect(container.querySelectorAll('a')).toHaveLength(0);
    expect(container.querySelectorAll('img')).toHaveLength(0);
    const text = container.textContent ?? '';
    expect(text).not.toMatch(/rough/i);
    expect(text).not.toMatch(/\$/);
    expect(text).not.toMatch(/trade/i);
    expect(text).not.toMatch(/brief/i);
  });
});
