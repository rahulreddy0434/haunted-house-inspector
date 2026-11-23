// @vitest-environment jsdom
// Feature: chat-and-help, task 5.12. Component tests for HelpForm. Only fetch is stubbed.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { HelpForm } from '@/components/ui/help/HelpForm';
import { EMERGENCY_MESSAGE } from '@/lib/emergency/messages';
import { HELP_CONFIRMATION, HELP_FIELD_LABELS, HELP_PRIVACY_LINE } from '@/lib/help/copy';
import { HELP_FIELD_MESSAGES } from '@/lib/help/schema';

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function stubFetch(handler: () => Promise<Response> | Response) {
  const fn = vi.fn(async () => handler());
  vi.stubGlobal('fetch', fn);
  return fn;
}

async function fill(user: ReturnType<typeof userEvent.setup>, email: string, message: string) {
  if (email) await user.type(screen.getByLabelText(HELP_FIELD_LABELS.email), email);
  if (message) await user.type(screen.getByLabelText(HELP_FIELD_LABELS.message), message);
}

describe('HelpForm', () => {
  it('shows labelled fields, the submit button and the privacy line', () => {
    render(<HelpForm page="/" side="homeowner" />);
    expect(screen.getByLabelText(HELP_FIELD_LABELS.name)).toBeTruthy();
    expect(screen.getByLabelText(HELP_FIELD_LABELS.email)).toBeTruthy();
    expect(screen.getByLabelText(HELP_FIELD_LABELS.message)).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Send message' })).toBeTruthy();
    expect(screen.getByText(HELP_PRIVACY_LINE)).toBeTruthy();
  });

  it('shows errors, focuses the first invalid field and links the error with aria-describedby', async () => {
    const fetchMock = stubFetch(() => json(200, { status: 'sent' }));
    const user = userEvent.setup();
    render(<HelpForm page="/" side="homeowner" />);

    await user.click(screen.getByRole('button', { name: 'Send message' }));

    const email = screen.getByLabelText(HELP_FIELD_LABELS.email);
    const message = screen.getByLabelText(HELP_FIELD_LABELS.message);
    expect(document.activeElement).toBe(email);
    for (const [field, text] of [
      [email, HELP_FIELD_MESSAGES.email],
      [message, HELP_FIELD_MESSAGES.message],
    ] as const) {
      expect(field.getAttribute('aria-invalid')).toBe('true');
      const errorId = field.getAttribute('aria-describedby')?.split(' ').find((id) => id.endsWith('-error'));
      expect(errorId).toBeTruthy();
      const error = document.getElementById(errorId as string);
      expect(error?.textContent).toBe(text);
      expect(error?.getAttribute('role')).toBe('alert');
    }
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('focuses the message field when only the message is invalid', async () => {
    stubFetch(() => json(200, { status: 'sent' }));
    const user = userEvent.setup();
    render(<HelpForm page="/" side="homeowner" />);
    await fill(user, 'sam@example.com', '');
    await user.click(screen.getByRole('button', { name: 'Send message' }));
    expect(document.activeElement).toBe(screen.getByLabelText(HELP_FIELD_LABELS.message));
  });

  it('disables the button and shows a text status while sending, then confirms in role="status"', async () => {
    let release: (r: Response) => void = () => {};
    const fetchMock = stubFetch(() => new Promise<Response>((resolve) => (release = resolve)));
    const user = userEvent.setup();
    render(<HelpForm page="/" side="homeowner" />);
    await fill(user, 'sam@example.com', 'The boiler is noisy');
    await user.click(screen.getByRole('button', { name: 'Send message' }));

    const button = screen.getByRole('button', { name: 'Send message' }) as HTMLButtonElement;
    await waitFor(() => expect(button.disabled).toBe(true));
    expect(screen.getByText('Sending your message…')).toBeTruthy();
    expect(fetchMock).toHaveBeenCalledTimes(1);

    release(json(200, { status: 'sent' }));
    const confirmation = await screen.findByText(HELP_CONFIRMATION);
    expect(confirmation.getAttribute('role')).toBe('status');
    expect((screen.getByRole('button', { name: 'Send message' }) as HTMLButtonElement).disabled).toBe(false);
    expect((screen.getByLabelText(HELP_FIELD_LABELS.message) as HTMLTextAreaElement).value).toBe('');
  });

  it('shows the Emergency_Banner and no confirmation for an emergency answer', async () => {
    stubFetch(() => json(200, { status: 'emergency', message: EMERGENCY_MESSAGE }));
    const user = userEvent.setup();
    const { container } = render(<HelpForm page="/" side="homeowner" />);
    await fill(user, 'sam@example.com', 'I smell gas');
    await user.click(screen.getByRole('button', { name: 'Send message' }));

    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toContain(EMERGENCY_MESSAGE);
    expect(screen.queryByText(HELP_CONFIRMATION)).toBeNull();
    expect(container.querySelector('[role="alert"][class*="haunted:"]')).toBeNull();
    expect(alert.className).not.toContain('haunted:');
  });

  it('keeps the typed values and shows an alert when the send fails', async () => {
    stubFetch(() => json(500, { error: 'ACTION_FAILED', message: 'That did not work. Please try again.' }));
    const user = userEvent.setup();
    render(<HelpForm page="/" side="homeowner" />);
    await user.type(screen.getByLabelText(HELP_FIELD_LABELS.name), 'Sam');
    await fill(user, 'sam@example.com', 'The boiler is noisy');
    await user.click(screen.getByRole('button', { name: 'Send message' }));

    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toBe('That did not work. Please try again.');
    expect((screen.getByLabelText(HELP_FIELD_LABELS.name) as HTMLInputElement).value).toBe('Sam');
    expect((screen.getByLabelText(HELP_FIELD_LABELS.email) as HTMLInputElement).value).toBe('sam@example.com');
    expect((screen.getByLabelText(HELP_FIELD_LABELS.message) as HTMLTextAreaElement).value).toBe(
      'The boiler is noisy',
    );
    expect(screen.queryByText(HELP_CONFIRMATION)).toBeNull();
  });

  it('keeps the typed values when the network fails', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => Promise.reject(new TypeError('offline'))));
    const user = userEvent.setup();
    render(<HelpForm page="/" side="homeowner" />);
    await fill(user, 'sam@example.com', 'Hello there');
    await user.click(screen.getByRole('button', { name: 'Send message' }));
    await screen.findByRole('alert');
    expect((screen.getByLabelText(HELP_FIELD_LABELS.message) as HTMLTextAreaElement).value).toBe('Hello there');
  });

  it('hides the honeypot from assistive tech and the tab order', () => {
    const { container } = render(<HelpForm page="/" side="homeowner" />);
    const input = container.querySelector('input[name="website"]') as HTMLInputElement;
    expect(input.tabIndex).toBe(-1);
    expect(input.getAttribute('autocomplete')).toBe('off');
    expect(input.closest('[aria-hidden="true"]')).not.toBeNull();
  });
});
