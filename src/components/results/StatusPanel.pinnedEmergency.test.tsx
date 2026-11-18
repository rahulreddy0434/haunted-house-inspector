import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { EMERGENCY_MESSAGE } from '@/lib/emergency/messages';
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

import { StatusPanel } from './StatusPanel';

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  applyView.mockClear();
});

describe('StatusPanel pins the emergency text', () => {
  it('uses EMERGENCY_MESSAGE for a 409 JOB_IS_EMERGENCY, whatever the response says', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async () =>
          new Response(
            JSON.stringify({ error: 'JOB_IS_EMERGENCY', message: 'Turn the gas valve off yourself.' }),
            { status: 409, headers: { 'Content-Type': 'application/json' } },
          ),
      ),
    );
    const onEmergency = vi.fn();
    render(<StatusPanel id="3f2b8c1e-5d4a-4e6f-9a7b-1c2d3e4f5a6b" onEmergency={onEmergency} />);

    fireEvent.change(screen.getByLabelText('Your reply'), { target: { value: 'Under the sink' } });
    fireEvent.click(screen.getByRole('button', { name: 'Send reply' }));

    await waitFor(() => expect(applyView).toHaveBeenCalledTimes(1));
    expect(applyView).toHaveBeenCalledWith({ status: 'emergency', message: EMERGENCY_MESSAGE });
  });
});
