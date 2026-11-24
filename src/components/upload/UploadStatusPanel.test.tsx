import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import type { UploadErrorKind, UploadStatus } from '@/hooks/useUpload';
import { HAUNTED_COPY } from '@/lib/haunted/hauntedCopy';
import { ANALYSIS_FAILED_SAFETY_LINE } from '@/lib/jobs/copy';
import { UploadStatusPanel, type UploadStatusPanelProps } from './UploadStatusPanel';

let effective: 'normal' | 'haunted' = 'normal';
vi.mock('@/components/ThemeProvider', () => ({
  useTheme: () => ({ effective }),
}));

const PLAIN_UPLOADING = 'Uploading photos';
const PLAIN_ANALYSING = 'Checking for safety and reading your photos';

const onTryAgain = vi.fn();

function props(overrides: Partial<UploadStatusPanelProps> = {}): UploadStatusPanelProps {
  return {
    uploadStatus: 'idle',
    fileProgress: [{ name: 'a.jpg', progress: 40, status: 'uploading' }],
    uploadError: null,
    errorKind: null,
    resetAt: null,
    onTryAgain,
    ...overrides,
  };
}

beforeEach(() => {
  effective = 'normal';
  onTryAgain.mockClear();
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe('UploadStatusPanel stage text', () => {
  it('shows "Uploading photos" while uploading, and no analysing text', () => {
    render(<UploadStatusPanel {...props({ uploadStatus: 'uploading' })} />);
    expect(screen.getByText(PLAIN_UPLOADING)).toBeInTheDocument();
    expect(screen.queryByText(PLAIN_ANALYSING)).toBeNull();
    expect(screen.getByText('a.jpg')).toBeInTheDocument();
  });

  it('shows the analysing text while analysing, and no uploading text or progress', () => {
    render(<UploadStatusPanel {...props({ uploadStatus: 'analysing' })} />);
    expect(screen.getByText(PLAIN_ANALYSING)).toBeInTheDocument();
    expect(screen.queryByText(PLAIN_UPLOADING)).toBeNull();
    expect(screen.queryByText('a.jpg')).toBeNull();
  });

  it.each<UploadStatus>(['idle', 'done'])('shows no stage text when %s', (status) => {
    render(<UploadStatusPanel {...props({ uploadStatus: status })} />);
    expect(screen.queryByText(PLAIN_UPLOADING)).toBeNull();
    expect(screen.queryByText(PLAIN_ANALYSING)).toBeNull();
  });

  it('does not change text when timers advance (no timer)', () => {
    vi.useFakeTimers();
    const { rerender } = render(<UploadStatusPanel {...props({ uploadStatus: 'uploading' })} />);
    act(() => {
      vi.advanceTimersByTime(120_000);
    });
    expect(screen.getByText(PLAIN_UPLOADING)).toBeInTheDocument();
    expect(screen.queryByText(PLAIN_ANALYSING)).toBeNull();

    rerender(<UploadStatusPanel {...props({ uploadStatus: 'analysing' })} />);
    act(() => {
      vi.advanceTimersByTime(120_000);
    });
    expect(screen.getByText(PLAIN_ANALYSING)).toBeInTheDocument();
    expect(screen.queryByText(PLAIN_UPLOADING)).toBeNull();
  });
});

describe('UploadStatusPanel focus', () => {
  it('moves focus to the stage block when analysing starts', () => {
    const { rerender } = render(<UploadStatusPanel {...props({ uploadStatus: 'uploading' })} />);
    rerender(<UploadStatusPanel {...props({ uploadStatus: 'analysing' })} />);
    const block = screen.getByText(PLAIN_ANALYSING).closest('div[tabindex="-1"]');
    expect(block).not.toBeNull();
    expect(document.activeElement).toBe(block);
  });
});

describe('UploadStatusPanel Haunted line', () => {
  it('shows only the plain line in Normal mode', () => {
    render(<UploadStatusPanel {...props({ uploadStatus: 'analysing' })} />);
    expect(screen.queryByText(HAUNTED_COPY.inspecting)).toBeNull();
  });

  it('appends the Haunted line after the plain line in Haunted mode', () => {
    effective = 'haunted';
    render(<UploadStatusPanel {...props({ uploadStatus: 'analysing' })} />);
    const plain = screen.getByText(PLAIN_ANALYSING);
    const haunted = screen.getByText(HAUNTED_COPY.inspecting);
    expect(plain).toBeInTheDocument();
    expect(plain.nextElementSibling).toBe(haunted);
  });
});

describe('UploadStatusPanel errors', () => {
  it('shows the error card, focuses it, and Try again calls onTryAgain', () => {
    render(
      <UploadStatusPanel
        {...props({ uploadStatus: 'error', errorKind: 'upload', uploadError: 'Upload broke.' })}
      />,
    );
    const alert = screen.getByRole('alert');
    expect(alert).toHaveTextContent('Upload broke.');
    expect(document.activeElement).toBe(alert);
    expect(screen.queryByText(PLAIN_UPLOADING)).toBeNull();
    expect(screen.queryByText(PLAIN_ANALYSING)).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(onTryAgain).toHaveBeenCalledTimes(1);
  });

  it('falls back to a default message when none is given', () => {
    render(<UploadStatusPanel {...props({ uploadStatus: 'error', errorKind: 'upload' })} />);
    expect(screen.getByRole('alert')).toHaveTextContent('Something went wrong. Please try again.');
  });

  it.each<UploadErrorKind>(['analysis', 'timeout'])(
    'shows the safety line for %s errors',
    (kind) => {
      render(
        <UploadStatusPanel {...props({ uploadStatus: 'error', errorKind: kind, uploadError: 'x' })} />,
      );
      expect(screen.getByText(ANALYSIS_FAILED_SAFETY_LINE)).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Try again' })).toBeInTheDocument();
    },
  );

  it('shows the still-here note only for timeout errors', () => {
    render(<UploadStatusPanel {...props({ uploadStatus: 'error', errorKind: 'timeout', uploadError: 'x' })} />);
    expect(screen.getByText(/Your photos and answers are still here/)).toBeInTheDocument();
    cleanup();
    render(<UploadStatusPanel {...props({ uploadStatus: 'error', errorKind: 'upload', uploadError: 'x' })} />);
    expect(screen.queryByText(/still here/)).toBeNull();
    expect(screen.queryByText(ANALYSIS_FAILED_SAFETY_LINE)).toBeNull();
  });

  it('shows the rate limit card with no Try again button', () => {
    render(
      <UploadStatusPanel {...props({ uploadStatus: 'error', errorKind: 'rate_limit', resetAt: null })} />,
    );
    expect(screen.getByRole('alert')).toHaveTextContent(
      "You have reached today's limit of free inspections.",
    );
    expect(screen.getByText('Please come back tomorrow to inspect another problem.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Try again' })).toBeNull();
  });

  it('shows the reset time for a valid resetAt on a rate limit', () => {
    render(
      <UploadStatusPanel
        {...props({ uploadStatus: 'error', errorKind: 'rate_limit', resetAt: '2030-01-02T03:04:00Z' })}
      />,
    );
    expect(screen.getByText(/You can try again after /)).toBeInTheDocument();
  });
});
