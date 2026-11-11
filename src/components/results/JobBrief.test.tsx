import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { JobBrief } from './JobBrief';

// Validates: Requirements 6.5, 9.6, 9.7

const BRIEF = 'Water is dripping from the ceiling near the kitchen light.\nStain is about 30 cm wide.';
const COPIED_DURATION_MS = 2500;
const FALLBACK_TEXT = "Copying didn't work. Select the text below and copy it yourself.";

const originalDescriptor = Object.getOwnPropertyDescriptor(navigator, 'clipboard');

function setClipboard(value: unknown): void {
  Object.defineProperty(navigator, 'clipboard', { value, configurable: true, writable: true });
}

async function clickCopy(): Promise<void> {
  const button = screen.getByRole('button');
  await act(async () => {
    fireEvent.click(button);
  });
}

async function advance(ms: number): Promise<void> {
  await act(async () => {
    vi.advanceTimersByTime(ms);
  });
}

function expectFallback(): void {
  const textarea = screen.getByRole('textbox') as HTMLTextAreaElement;
  expect(textarea.readOnly).toBe(true);
  expect(textarea.value).toBe(BRIEF);
  expect(screen.getByText(FALLBACK_TEXT)).toBeTruthy();
  expect(document.activeElement).toBe(textarea);
  expect(textarea.selectionStart).toBe(0);
  expect(textarea.selectionEnd).toBe(BRIEF.length);
  expect(screen.queryByText('Copied!')).toBeNull();
}

describe('JobBrief', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
    vi.restoreAllMocks();
    if (originalDescriptor) {
      Object.defineProperty(navigator, 'clipboard', originalDescriptor);
    } else {
      delete (navigator as unknown as Record<string, unknown>).clipboard;
    }
  });

  describe('clipboard success', () => {
    it('copies the exact brief and shows "Copied!" for at least 2 s, then resets', async () => {
      const writeText = vi.fn().mockResolvedValue(undefined);
      setClipboard({ writeText });
      render(<JobBrief jobBrief={BRIEF} urgency="soon" />);

      expect(screen.getByRole('button').textContent).toBe('Copy');
      await clickCopy();

      expect(writeText).toHaveBeenCalledTimes(1);
      expect(writeText).toHaveBeenCalledWith(BRIEF);
      expect(screen.getByText('Copied!')).toBeTruthy();
      expect(screen.queryByRole('textbox')).toBeNull();

      await advance(1999);
      expect(screen.getByText('Copied!')).toBeTruthy();
      await advance(1);
      expect(screen.getByText('Copied!')).toBeTruthy();

      await advance(COPIED_DURATION_MS - 2000);
      expect(screen.queryByText('Copied!')).toBeNull();
      expect(screen.getByRole('button').textContent).toBe('Copy');
    });

    it('a second click while "Copied!" is shown restarts the timer', async () => {
      const writeText = vi.fn().mockResolvedValue(undefined);
      setClipboard({ writeText });
      render(<JobBrief jobBrief={BRIEF} urgency="urgent" />);

      await clickCopy();
      await advance(2000);
      await clickCopy();
      expect(writeText).toHaveBeenCalledTimes(2);

      // 2000 ms after the second click: still visible (would be gone had the first timer survived).
      await advance(2000);
      expect(screen.getByText('Copied!')).toBeTruthy();
      await advance(COPIED_DURATION_MS - 2000 - 1);
      expect(screen.getByText('Copied!')).toBeTruthy();
      await advance(1);
      expect(screen.queryByText('Copied!')).toBeNull();
    });
  });

  describe('clipboard failure', () => {
    it('shows the textarea fallback when writeText rejects', async () => {
      setClipboard({ writeText: vi.fn().mockRejectedValue(new Error('denied')) });
      render(<JobBrief jobBrief={BRIEF} urgency="monitor" />);
      await clickCopy();
      expectFallback();
    });

    it('shows the textarea fallback when writeText throws synchronously', async () => {
      setClipboard({
        writeText: vi.fn(() => {
          throw new Error('sync failure');
        }),
      });
      render(<JobBrief jobBrief={BRIEF} urgency="soon" />);
      await clickCopy();
      expectFallback();
    });

    it('shows the textarea fallback when navigator.clipboard is undefined', async () => {
      setClipboard(undefined);
      render(<JobBrief jobBrief={BRIEF} urgency="soon" />);
      await clickCopy();
      expectFallback();
    });
  });

  describe('emergency', () => {
    it('renders nothing, even with a non-empty brief', () => {
      const { container } = render(<JobBrief jobBrief={BRIEF} urgency="emergency" />);
      expect(container.innerHTML).toBe('');
      expect(screen.queryByRole('button')).toBeNull();
      expect(screen.queryByText(/Water is dripping/)).toBeNull();
    });
  });

  describe('unmounting', () => {
    it('does not throw or log errors when unmounted during the "Copied!" timer', async () => {
      const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      setClipboard({ writeText: vi.fn().mockResolvedValue(undefined) });
      const { unmount } = render(<JobBrief jobBrief={BRIEF} urgency="soon" />);
      await clickCopy();
      expect(screen.getByText('Copied!')).toBeTruthy();

      expect(() => unmount()).not.toThrow();
      await advance(COPIED_DURATION_MS * 2);
      expect(errorSpy).not.toHaveBeenCalled();
    });

    it('does not throw or log errors when unmounted while the clipboard promise is pending', async () => {
      const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      let resolveWrite: () => void = () => {};
      const pending = new Promise<void>((resolve) => {
        resolveWrite = resolve;
      });
      setClipboard({ writeText: vi.fn().mockReturnValue(pending) });
      const { unmount } = render(<JobBrief jobBrief={BRIEF} urgency="soon" />);

      await clickCopy();
      expect(() => unmount()).not.toThrow();

      await act(async () => {
        resolveWrite();
        await pending;
      });
      await advance(COPIED_DURATION_MS * 2);
      expect(errorSpy).not.toHaveBeenCalled();
      expect(vi.getTimerCount()).toBe(0);
    });
  });
});
