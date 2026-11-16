import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { JobList, type JobListProps } from './JobList';
import type { ProJobListItem } from '@/types/job';

const JOB: ProJobListItem = {
  id: '11111111-1111-4111-8111-111111111111',
  createdAt: '2025-03-04T10:30:00.000Z',
  urgency: 'urgent',
  trade: 'Plumber',
  location: 'Springfield, IL',
  status: 'new',
};

function renderList(overrides: Partial<JobListProps> = {}) {
  const props: JobListProps = {
    jobs: [JOB],
    error: null,
    refreshing: false,
    onRefresh: vi.fn(),
    ...overrides,
  };
  render(<JobList {...props} />);
  return props;
}

afterEach(() => {
  cleanup();
});

describe('JobList', () => {
  it('shows badge, trade, location, time and status label in a link to the job', () => {
    renderList();
    const link = screen.getByRole('link');
    expect(link.getAttribute('href')).toBe(`/pro/jobs/${JOB.id}`);
    expect(within(link).getByText('Urgent — act today')).toBeTruthy();
    expect(within(link).getByText('Plumber')).toBeTruthy();
    expect(within(link).getByText('Springfield, IL')).toBeTruthy();
    expect(within(link).getByText('New')).toBeTruthy();
    const time = link.querySelector('time');
    expect(time?.getAttribute('datetime')).toBe(JOB.createdAt);
  });

  it('shows the status label for other statuses', () => {
    renderList({ jobs: [{ ...JOB, status: 'info_requested' }] });
    expect(screen.getByText("Waiting for the homeowner's reply")).toBeTruthy();
  });

  it('shows no trade for an emergency item', () => {
    renderList({ jobs: [{ ...JOB, urgency: 'emergency', trade: null, status: 'emergency' }] });
    const link = screen.getByRole('link');
    expect(within(link).getAllByText('Emergency').length).toBeGreaterThan(0);
    expect(within(link).queryByText('Plumber')).toBeNull();
  });

  it('shows "No jobs yet." for an empty list', () => {
    renderList({ jobs: [] });
    expect(screen.getByText('No jobs yet.')).toBeTruthy();
    expect(screen.queryByRole('link')).toBeNull();
  });

  it('shows "Loading jobs…" with role status while loading and disables Refresh', () => {
    renderList({ jobs: [], loading: true });
    expect(screen.getByRole('status').textContent).toBe('Loading jobs…');
    expect(screen.queryByText('No jobs yet.')).toBeNull();
    expect((screen.getByRole('button', { name: 'Refresh' }) as HTMLButtonElement).disabled).toBe(true);
  });

  it('shows the error in role alert above the kept list', () => {
    renderList({ error: 'Something went wrong.' });
    const alert = screen.getByRole('alert');
    expect(alert.textContent).toBe('Something went wrong.');
    const link = screen.getByRole('link');
    expect(alert.compareDocumentPosition(link) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('disables Refresh while refreshing and does not call onRefresh', async () => {
    const props = renderList({ refreshing: true });
    const button = screen.getByRole('button', { name: 'Refresh' }) as HTMLButtonElement;
    expect(button.disabled).toBe(true);
    await userEvent.setup().click(button);
    expect(props.onRefresh).not.toHaveBeenCalled();
  });

  it('calls onRefresh when Refresh is clicked', async () => {
    const props = renderList();
    const button = screen.getByRole('button', { name: 'Refresh' }) as HTMLButtonElement;
    expect(button.disabled).toBe(false);
    await userEvent.setup().click(button);
    expect(props.onRefresh).toHaveBeenCalledTimes(1);
  });

  it('renders HTML-looking location text literally', () => {
    const location = '<script>alert(1)</script><b>x</b>';
    const { container } = render(<JobList jobs={[{ ...JOB, location }]} error={null} refreshing={false} onRefresh={() => {}} />);
    expect(screen.getAllByText(location).length).toBeGreaterThan(0);
    expect(container.querySelector('script')).toBeNull();
    expect(container.querySelector('b')).toBeNull();
  });
});
