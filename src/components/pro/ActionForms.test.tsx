// @vitest-environment jsdom

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react';
import { ActionPanel } from '@/components/pro/ActionPanel';
import { AcceptForm } from '@/components/pro/AcceptForm';
import { DeclineForm } from '@/components/pro/DeclineForm';
import type { JobStatus } from '@/types/job';

const ID = 'job-123';

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

let fetchMock: ReturnType<typeof vi.fn<(input: string, init?: RequestInit) => Promise<Response>>>;
const onDone = vi.fn<(status: JobStatus) => void>();
const onConflict = vi.fn<() => void>();
const onUnauthorized = vi.fn<() => void>();

function renderPanel(status: JobStatus) {
  return render(
    <ActionPanel
      id={ID}
      status={status}
      onDone={onDone}
      onConflict={onConflict}
      onUnauthorized={onUnauthorized}
    />,
  );
}

function first(): HTMLInputElement {
  return screen.getByLabelText('First time you can start') as HTMLInputElement;
}
function declineBox(): HTMLTextAreaElement {
  return screen.getByLabelText('Reason (optional)') as HTMLTextAreaElement;
}
function lastBody(): unknown {
  const init = fetchMock.mock.calls[fetchMock.mock.calls.length - 1][1];
  return JSON.parse(String(init?.body));
}

beforeEach(() => {
  fetchMock = vi.fn<(input: string, init?: RequestInit) => Promise<Response>>(async () =>
    json(200, { status: 'accepted' }),
  );
  vi.stubGlobal('fetch', fetchMock);
  onDone.mockClear();
  onConflict.mockClear();
  onUnauthorized.mockClear();
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('ActionPanel controls per status', () => {
  it('new shows accept and decline only (questions go through the chat)', () => {
    renderPanel('new');
    expect(screen.getByRole('button', { name: 'Accept job' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Decline job' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Send question' })).toBeNull();
  });

  it('info_requested shows accept and decline only', () => {
    renderPanel('info_requested');
    expect(screen.getByRole('button', { name: 'Accept job' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Decline job' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Send question' })).toBeNull();
  });

  it.each(['accepted', 'declined', 'booked', 'emergency'] as const)('%s renders nothing', (status) => {
    const { container } = renderPanel(status);
    expect(container.innerHTML).toBe('');
  });
});

describe('AcceptForm', () => {
  it('labels the slots and requires only the first', () => {
    render(<AcceptForm pending={false} onSubmit={vi.fn()} />);
    expect(first().required).toBe(true);
    expect((screen.getByLabelText('Second time') as HTMLInputElement).required).toBe(false);
    expect((screen.getByLabelText('Third time') as HTMLInputElement).required).toBe(false);
  });

  it('posts only the filled slots as ISO strings', async () => {
    renderPanel('new');
    fireEvent.change(first(), { target: { value: '2026-11-20T09:00' } });
    fireEvent.change(screen.getByLabelText('Third time'), { target: { value: '2026-11-22T14:30' } });
    fireEvent.click(screen.getByRole('button', { name: 'Accept job' }));
    await waitFor(() => expect(onDone).toHaveBeenCalledWith('accepted'));
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe(`/api/pro/jobs/${ID}/accept`);
    expect(init?.method).toBe('POST');
    expect(lastBody()).toEqual({
      slots: [new Date('2026-11-20T09:00').toISOString(), new Date('2026-11-22T14:30').toISOString()],
    });
  });
});

describe('DeclineForm counts', () => {
  it('shows a live decline count linked by aria-describedby', () => {
    render(<DeclineForm pending={false} onSubmit={vi.fn()} />);
    fireEvent.change(declineBox(), { target: { value: 'abc' } });
    const ids = (declineBox().getAttribute('aria-describedby') ?? '').split(' ');
    const text = ids.map((i) => document.getElementById(i)?.textContent);
    expect(text).toContain('3 / 200');
  });


  it('over the decline limit shows an error and disables the button', () => {
    const onSubmit = vi.fn();
    render(<DeclineForm pending={false} onSubmit={onSubmit} />);
    fireEvent.change(declineBox(), { target: { value: 'x'.repeat(201) } });
    expect(screen.getByRole('alert')).toBeTruthy();
    const button = screen.getByRole('button', { name: 'Decline job' }) as HTMLButtonElement;
    expect(button.disabled).toBe(true);
    fireEvent.submit(button.closest('form') as HTMLFormElement);
    expect(onSubmit).not.toHaveBeenCalled();
  });

});

describe('ActionPanel requests', () => {
  it('disables every control of every form while pending', async () => {
    let release: (r: Response) => void = () => {};
    fetchMock.mockImplementationOnce(
      () => new Promise<Response>((resolve) => { release = resolve; }),
    );
    renderPanel('new');
    fireEvent.change(first(), { target: { value: '2026-11-20T09:00' } });
    fireEvent.click(screen.getByRole('button', { name: 'Accept job' }));
    await waitFor(() => expect(first().disabled).toBe(true));
    const controls = document.querySelectorAll<HTMLInputElement | HTMLTextAreaElement | HTMLButtonElement>(
      'input, textarea, button',
    );
    expect(controls.length).toBe(6);
    controls.forEach((c) => expect(c.disabled).toBe(true));
    release(json(200, { status: 'accepted' }));
    await waitFor(() => expect(onDone).toHaveBeenCalledWith('accepted'));
  });

  it('decline success calls onDone with the response status', async () => {
    fetchMock.mockResolvedValueOnce(json(200, { status: 'declined' }));
    renderPanel('new');
    fireEvent.change(declineBox(), { target: { value: 'Too far away' } });
    fireEvent.click(screen.getByRole('button', { name: 'Decline job' }));
    await waitFor(() => expect(onDone).toHaveBeenCalledWith('declined'));
    expect(fetchMock.mock.calls[0][0]).toBe(`/api/pro/jobs/${ID}/decline`);
    expect(lastBody()).toEqual({ reason: 'Too far away' });
  });

  it('empty decline sends {}', async () => {
    fetchMock.mockResolvedValueOnce(json(200, { status: 'declined' }));
    renderPanel('new');
    fireEvent.click(screen.getByRole('button', { name: 'Decline job' }));
    await waitFor(() => expect(onDone).toHaveBeenCalledWith('declined'));
    expect(lastBody()).toEqual({});
  });

  it('500 shows the message, keeps typed text and slots, and re-enables controls', async () => {
    fetchMock.mockResolvedValueOnce(json(500, { message: 'Boom from server' }));
    renderPanel('new');
    fireEvent.change(first(), { target: { value: '2026-11-20T09:00' } });
    fireEvent.change(declineBox(), { target: { value: 'keep me' } });
    fireEvent.click(screen.getByRole('button', { name: 'Accept job' }));
    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toBe('Boom from server');
    expect(first().value).toBe('2026-11-20T09:00');
    expect(declineBox().value).toBe('keep me');
    await waitFor(() => expect(first().disabled).toBe(false));
    expect((screen.getByRole('button', { name: 'Accept job' }) as HTMLButtonElement).disabled).toBe(false);
    expect(onDone).not.toHaveBeenCalled();
  });

  it('network error shows the friendly message', async () => {
    fetchMock.mockRejectedValueOnce(new TypeError('failed'));
    renderPanel('new');
    fireEvent.change(first(), { target: { value: '2026-11-20T09:00' } });
    fireEvent.click(screen.getByRole('button', { name: 'Accept job' }));
    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toBe("We couldn't reach the server. Please try again.");
  });

  it('409 calls onConflict', async () => {
    fetchMock.mockResolvedValueOnce(json(409, { message: 'Already handled' }));
    renderPanel('new');
    fireEvent.click(screen.getByRole('button', { name: 'Decline job' }));
    await waitFor(() => expect(onConflict).toHaveBeenCalledTimes(1));
    expect(onDone).not.toHaveBeenCalled();
    expect(onUnauthorized).not.toHaveBeenCalled();
  });

  it('401 calls onUnauthorized', async () => {
    fetchMock.mockResolvedValueOnce(json(401, { message: 'Nope' }));
    renderPanel('new');
    fireEvent.click(screen.getByRole('button', { name: 'Decline job' }));
    await waitFor(() => expect(onUnauthorized).toHaveBeenCalledTimes(1));
    expect(onDone).not.toHaveBeenCalled();
    expect(onConflict).not.toHaveBeenCalled();
  });
});
