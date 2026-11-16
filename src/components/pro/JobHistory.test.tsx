import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { JobHistory } from './JobHistory';

afterEach(cleanup);

describe('JobHistory', () => {
  it('orders entries ascending by time', () => {
    const { container } = render(
      <JobHistory
        infoRequests={[
          { question: 'Q2', askedAt: '2026-03-05T12:00:00.000Z' },
          { question: 'Q1', askedAt: '2026-03-05T10:00:00.000Z' },
        ]}
        replies={[{ text: 'R1', at: '2026-03-05T11:00:00.000Z' }]}
      />,
    );
    const items = Array.from(container.querySelectorAll('li')).map((li) => li.textContent ?? '');
    expect(items).toHaveLength(3);
    expect(items[0]).toContain('Q1');
    expect(items[1]).toContain('R1');
    expect(items[2]).toContain('Q2');
  });

  it('puts the question before the reply on equal times', () => {
    const at = '2026-03-05T10:00:00.000Z';
    const { container } = render(
      <JobHistory infoRequests={[{ question: 'Question', askedAt: at }]} replies={[{ text: 'Reply', at }]} />,
    );
    const items = Array.from(container.querySelectorAll('li')).map((li) => li.textContent ?? '');
    expect(items[0]).toContain('Question');
    expect(items[1]).toContain('Reply');
  });

  it('labels entries "You asked" and "Homeowner replied"', () => {
    render(
      <JobHistory
        infoRequests={[{ question: 'Q', askedAt: '2026-03-05T10:00:00.000Z' }]}
        replies={[{ text: 'R', at: '2026-03-05T11:00:00.000Z' }]}
      />,
    );
    expect(screen.getByText(/You asked/)).toBeTruthy();
    expect(screen.getByText(/Homeowner replied/)).toBeTruthy();
  });

  it('renders a <time> element with the dateTime attribute', () => {
    const { container } = render(
      <JobHistory infoRequests={[{ question: 'Q', askedAt: '2026-03-05T10:00:00.000Z' }]} replies={[]} />,
    );
    const time = container.querySelector('time');
    expect(time?.getAttribute('datetime')).toBe('2026-03-05T10:00:00.000Z');
  });

  it('renders HTML-looking text literally', () => {
    const html = '<b>bold</b><img src=x onerror=alert(1)>';
    const { container } = render(
      <JobHistory infoRequests={[{ question: html, askedAt: '2026-03-05T10:00:00.000Z' }]} replies={[{ text: html, at: '2026-03-05T11:00:00.000Z' }]} />,
    );
    expect(screen.getAllByText(html)).toHaveLength(2);
    expect(container.querySelector('b')).toBeNull();
    expect(container.querySelector('img')).toBeNull();
  });

  it('renders nothing when there are no entries', () => {
    const { container } = render(<JobHistory infoRequests={[]} replies={[]} />);
    expect(container.innerHTML).toBe('');
  });
});
