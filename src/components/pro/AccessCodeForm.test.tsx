import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AccessCodeForm } from './AccessCodeForm';

const NETWORK_MESSAGE = "We couldn't reach the server. Please try again.";
const SESSION_NOTICE = 'Your session has ended. Please enter the access code again.';

let fetchMock: ReturnType<typeof vi.fn>;

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function setup(props: { notice?: string } = {}) {
  const onSuccess = vi.fn();
  const onDisabled = vi.fn();
  const user = userEvent.setup();
  render(<AccessCodeForm onSuccess={onSuccess} onDisabled={onDisabled} {...props} />);
  const input = screen.getByLabelText('Access code') as HTMLInputElement;
  const button = screen.getByRole('button', { name: 'Enter' }) as HTMLButtonElement;
  return { user, input, button, onSuccess, onDisabled };
}

beforeEach(() => {
  fetchMock = vi.fn();
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('AccessCodeForm', () => {
  it('renders a labelled masked input and an Enter button', () => {
    const { input, button } = setup();
    expect(input.type).toBe('password');
    expect(input.maxLength).toBe(200);
    expect(screen.getByText('Access code').tagName).toBe('LABEL');
    expect(button.type).toBe('submit');
  });

  it('disables the button while the field is empty', async () => {
    const { user, input, button } = setup();
    expect(button.disabled).toBe(true);
    await user.type(input, 'a');
    expect(button.disabled).toBe(false);
  });

  it('posts the code as JSON, disables the button while pending, then clears and calls onSuccess on 200', async () => {
    let resolve!: (r: Response) => void;
    fetchMock.mockReturnValue(new Promise<Response>((r) => (resolve = r)));
    const { user, input, button, onSuccess } = setup();
    await user.type(input, 'secret');
    await user.click(button);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('/api/pro/login');
    expect(init.method).toBe('POST');
    expect(JSON.parse(init.body as string)).toEqual({ code: 'secret' });
    expect(button.disabled).toBe(true);

    resolve(jsonResponse(200, { ok: true }));
    await waitFor(() => expect(onSuccess).toHaveBeenCalledTimes(1));
    expect(input.value).toBe('');
  });

  it('keeps the form, focuses the field and shows the alert on 401', async () => {
    fetchMock.mockResolvedValue(jsonResponse(401, { code: 'INVALID_CODE', message: 'x' }));
    const { user, input, button, onSuccess } = setup();
    await user.type(input, 'wrong');
    await user.click(button);

    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toBe("That code isn't right.");
    expect(document.activeElement).toBe(input);
    expect(input.value).toBe('wrong');
    expect(onSuccess).not.toHaveBeenCalled();
  });

  it('shows the server message on 429 and keeps the field editable', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse(429, { code: 'TOO_MANY_ATTEMPTS', message: 'Slow down, try in 5 minutes.' }),
    );
    const { user, input, button } = setup();
    await user.type(input, 'abc');
    await user.click(button);

    expect((await screen.findByRole('alert')).textContent).toBe('Slow down, try in 5 minutes.');
    expect(input.disabled).toBe(false);
    expect(input.readOnly).toBe(false);
    await user.type(input, 'd');
    expect(input.value).toBe('abcd');
  });

  it('calls onDisabled on 503', async () => {
    fetchMock.mockResolvedValue(jsonResponse(503, { code: 'PRO_DISABLED', message: 'off' }));
    const { user, input, button, onDisabled, onSuccess } = setup();
    await user.type(input, 'abc');
    await user.click(button);

    await waitFor(() => expect(onDisabled).toHaveBeenCalledTimes(1));
    expect(onSuccess).not.toHaveBeenCalled();
  });

  it('keeps the typed code and shows the network message when fetch rejects', async () => {
    fetchMock.mockRejectedValue(new TypeError('Failed to fetch'));
    const { user, input, button } = setup();
    await user.type(input, 'keepme');
    await user.click(button);

    expect((await screen.findByRole('alert')).textContent).toBe(NETWORK_MESSAGE);
    expect(input.value).toBe('keepme');
    expect(button.disabled).toBe(false);
  });

  it('keeps the typed code and shows the network message for a non-JSON response', async () => {
    fetchMock.mockResolvedValue(new Response('<html>oops</html>', { status: 502 }));
    const { user, input, button } = setup();
    await user.type(input, 'keepme');
    await user.click(button);

    expect((await screen.findByRole('alert')).textContent).toBe(NETWORK_MESSAGE);
    expect(input.value).toBe('keepme');
  });

  it('shows the notice text when provided', () => {
    setup({ notice: SESSION_NOTICE });
    expect(screen.getByText(SESSION_NOTICE)).toBeTruthy();
  });

  it('never writes the code to the console', async () => {
    const spies = (['log', 'info', 'warn', 'error', 'debug'] as const).map((m) =>
      vi.spyOn(console, m).mockImplementation(() => {}),
    );
    fetchMock
      .mockResolvedValueOnce(jsonResponse(401, { message: 'no' }))
      .mockRejectedValueOnce(new TypeError('Failed to fetch'));
    const { user, input, button } = setup();
    await user.type(input, 'topsecret-code');
    await user.click(button);
    await screen.findByRole('alert');
    await user.click(button);
    await waitFor(() => expect(screen.getByRole('alert').textContent).toBe(NETWORK_MESSAGE));

    for (const spy of spies) {
      expect(JSON.stringify(spy.mock.calls)).not.toContain('topsecret-code');
    }
  });

  it('aborts the in-flight request on unmount', async () => {
    fetchMock.mockImplementation(() => new Promise<Response>(() => {}));
    const { user, input, button } = setup();
    await user.type(input, 'abc');
    await user.click(button);

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(init.signal?.aborted).toBe(false);
    cleanup();
    expect(init.signal?.aborted).toBe(true);
  });
});
