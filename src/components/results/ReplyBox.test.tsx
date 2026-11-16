import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { ReplyBox, REPLY_MAX_LENGTH } from './ReplyBox';
import { REPLY_RETENTION_NOTE, REPLY_TOO_LONG_MESSAGE } from '@/lib/jobs/copy';

// Validates: Requirements 9, 14

afterEach(cleanup);

interface HarnessProps {
  initial?: string;
  sending?: boolean;
  error?: string | null;
  onSubmit?: () => void;
}

function Harness({ initial = '', sending = false, error, onSubmit = () => {} }: HarnessProps) {
  const [value, setValue] = useState(initial);
  return <ReplyBox value={value} onChange={setValue} onSubmit={onSubmit} sending={sending} error={error} />;
}

const sendButton = () => screen.getByRole('button', { name: 'Send reply' });
const box = () => screen.getByLabelText('Your reply') as HTMLTextAreaElement;

describe('ReplyBox', () => {
  it('shows the live counter while typing', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    expect(screen.getByText('0/500')).toBeTruthy();
    await user.type(box(), 'hello');
    expect(screen.getByText('5/500')).toBeTruthy();
  });

  it('shows 120/500 for a 120-character reply', () => {
    render(<Harness initial={'a'.repeat(120)} />);
    expect(screen.getByText('120/500')).toBeTruthy();
  });

  it('flags a 612-character reply without cutting it, and still allows sending', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    render(<Harness onSubmit={onSubmit} />);
    fireEvent.change(box(), { target: { value: 'a'.repeat(612) } });

    const count = screen.getByText('612/500, too long');
    const alert = screen.getByRole('alert');
    expect(alert.textContent).toBe(REPLY_TOO_LONG_MESSAGE);
    expect(alert.textContent).toBe('Your reply is too long. Please shorten it to 500 characters or fewer.');

    const describedBy = (box().getAttribute('aria-describedby') ?? '').split(' ');
    expect(describedBy).toContain(count.id);
    expect(describedBy).toContain(alert.id);

    expect(box().hasAttribute('maxlength')).toBe(false);
    expect(box().value).toHaveLength(612);
    expect(REPLY_MAX_LENGTH).toBe(500);

    const button = sendButton() as HTMLButtonElement;
    expect(button.disabled).toBe(false);
    await user.click(button);
    expect(onSubmit).toHaveBeenCalledTimes(1);
  });

  it('disables Send reply for empty and whitespace-only text', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    expect((sendButton() as HTMLButtonElement).disabled).toBe(true);
    await user.type(box(), '   ');
    expect((sendButton() as HTMLButtonElement).disabled).toBe(true);
    await user.type(box(), 'x');
    expect((sendButton() as HTMLButtonElement).disabled).toBe(false);
  });

  it('calls onSubmit when a valid reply is sent', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    render(<Harness initial="Tuesday works" onSubmit={onSubmit} />);
    await user.click(sendButton());
    expect(onSubmit).toHaveBeenCalledTimes(1);
  });

  it('disables the box and the button while sending', () => {
    render(<Harness initial="Tuesday works" sending />);
    expect(box().disabled).toBe(true);
    expect((sendButton() as HTMLButtonElement).disabled).toBe(true);
  });

  it('shows the retention note and a labelled textarea', () => {
    render(<Harness />);
    expect(screen.getByText(REPLY_RETENTION_NOTE)).toBeTruthy();
    expect(screen.getByLabelText('Your reply').tagName).toBe('TEXTAREA');
  });

  it('shows the error prop in role="alert"', () => {
    render(<Harness error="Could not send. Try again." />);
    expect(screen.getByRole('alert').textContent).toBe('Could not send. Try again.');
  });
});
