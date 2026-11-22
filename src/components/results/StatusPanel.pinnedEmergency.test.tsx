import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { EMERGENCY_MESSAGE } from '@/lib/emergency/messages';
import { normalResult } from '@/test/inspectionFixtures';
import type { HomeownerStatusView } from '@/types/job';

const applyView = vi.fn<(view: HomeownerStatusView) => void>();

vi.mock('@/hooks/useStatusPolling', () => ({
  useStatusPolling: () => ({
    view: { status: 'info_requested', question: 'Where is the leak?' },
    loaded: true,
    updateFailed: false,
    refreshing: false,
    stopped: false,
    gone: false,
    refresh: () => {},
    refreshNow: () => {},
    applyView,
  }),
}));

vi.mock('@/hooks/useInspection', () => ({
  useInspection: () => ({
    result: normalResult,
    loading: false,
    error: null,
    notFound: false,
    markEmergency: () => {},
  }),
}));

import { ResultsView } from './ResultsView';

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  applyView.mockClear();
});

function stubChat(post: Response): void {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (_url: string, init?: RequestInit) =>
      init?.method === 'POST'
        ? post
        : new Response(
            JSON.stringify({
              status: 'info_requested',
              booking: {},
              chatState: 'open',
              messages: [],
              lastSeq: 0,
            }),
            { status: 200, headers: { 'Content-Type': 'application/json' } },
          ),
    ),
  );
}

async function sendMessage(text: string): Promise<void> {
  const box = await screen.findByLabelText('Your message');
  fireEvent.change(box, { target: { value: text } });
  fireEvent.click(screen.getByRole('button', { name: 'Send' }));
}

describe('The Results page pins the emergency text for the chat', () => {
  it('uses EMERGENCY_MESSAGE for a 409 JOB_IS_EMERGENCY, whatever the response says', async () => {
    stubChat(
      new Response(
        JSON.stringify({ error: 'JOB_IS_EMERGENCY', message: 'Turn the gas valve off yourself.' }),
        { status: 409, headers: { 'Content-Type': 'application/json' } },
      ),
    );
    render(<ResultsView id="3f2b8c1e-5d4a-4e6f-9a7b-1c2d3e4f5a6b" />);
    await sendMessage('Under the sink');

    await waitFor(() => expect(applyView).toHaveBeenCalledTimes(1));
    expect(applyView).toHaveBeenCalledWith({ status: 'emergency', message: EMERGENCY_MESSAGE });
  });

  it('uses EMERGENCY_MESSAGE for a 200 emergency body, whatever the body says', async () => {
    stubChat(
      new Response(
        JSON.stringify({ status: 'emergency', message: 'Turn the gas valve off yourself.' }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      ),
    );
    render(<ResultsView id="3f2b8c1e-5d4a-4e6f-9a7b-1c2d3e4f5a6b" />);
    await sendMessage('I smell gas');

    await waitFor(() => expect(applyView).toHaveBeenCalledTimes(1));
    expect(applyView).toHaveBeenCalledWith({ status: 'emergency', message: EMERGENCY_MESSAGE });
  });
});
