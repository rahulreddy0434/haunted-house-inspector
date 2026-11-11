import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import type { UseUploadReturn } from '@/hooks/useUpload';
import { UploadFlow } from './UploadFlow';

let hookState: UseUploadReturn;
const submit = vi.fn(async () => {});
const reset = vi.fn();
const scrollIntoView = vi.fn();

vi.mock('@/hooks/useUpload', () => ({
  useUpload: () => hookState,
}));

function makeState(overrides: Partial<UseUploadReturn> = {}): UseUploadReturn {
  return {
    files: { kind: 'images', files: [new File(['x'], 'a.jpg', { type: 'image/jpeg' })] },
    answers: { location: 'Kitchen', duration: '', recentChanges: '' },
    noticeVisible: true,
    uploadStatus: 'idle',
    uploadError: null,
    inspectionId: null,
    fileProgress: [],
    canSubmit: true,
    errorKind: null,
    resetAt: null,
    setFiles: vi.fn(),
    setAnswers: vi.fn(),
    markNoticeVisible: vi.fn(),
    submit,
    reset,
    clearAll: vi.fn(),
    ...overrides,
  };
}

beforeEach(() => {
  submit.mockClear();
  reset.mockClear();
  scrollIntoView.mockClear();
  Element.prototype.scrollIntoView = scrollIntoView;
  hookState = makeState();
});

afterEach(() => cleanup());

const submitButton = () => screen.getByRole('button', { name: 'Inspect my home' });

describe('UploadFlow', () => {
  it('renders the upload form and submit button', () => {
    render(<UploadFlow />);
    expect(screen.getByLabelText(/where in your home/i)).toBeTruthy();
    expect(screen.getByText('What happens to your upload')).toBeTruthy();
    expect(submitButton().getAttribute('aria-disabled')).toBeNull();
  });

  it('scrolls to the notice and prompts when it has not been seen', () => {
    hookState = makeState({ noticeVisible: false, canSubmit: false });
    render(<UploadFlow />);
    expect(submitButton().getAttribute('aria-disabled')).toBe('true');
    fireEvent.click(submitButton());
    expect(scrollIntoView).toHaveBeenCalledTimes(1);
    expect(screen.getByText('Please read the notice below before sending.')).toBeTruthy();
    expect(submit).not.toHaveBeenCalled();
  });

  it('shows the location error and does not submit when location is empty', () => {
    hookState = makeState({
      answers: { location: '', duration: '', recentChanges: '' },
      canSubmit: false,
    });
    render(<UploadFlow />);
    fireEvent.click(submitButton());
    expect(screen.getByText('Please tell us where the problem is.')).toBeTruthy();
    expect(submit).not.toHaveBeenCalled();
  });

  it('asks for a file when none is selected', () => {
    hookState = makeState({ files: null, canSubmit: false });
    render(<UploadFlow />);
    fireEvent.click(submitButton());
    expect(screen.getByText('Please add a photo or a short video first.')).toBeTruthy();
    expect(submit).not.toHaveBeenCalled();
  });

  it('calls submit when everything is ready', () => {
    render(<UploadFlow />);
    fireEvent.click(submitButton());
    expect(submit).toHaveBeenCalledTimes(1);
  });

  it('shows the loading state while analysing and blocks submits', () => {
    hookState = makeState({ uploadStatus: 'analysing' });
    render(<UploadFlow />);
    expect(screen.getByText('Inspecting your home…')).toBeTruthy();
    fireEvent.click(submitButton());
    expect(submit).not.toHaveBeenCalled();
  });

  it('shows the error and Try again calls reset', () => {
    hookState = makeState({
      uploadStatus: 'error',
      uploadError: 'Upload failed.',
      errorKind: 'upload',
    });
    render(<UploadFlow />);
    expect(screen.getByText('Upload failed.')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(reset).toHaveBeenCalledTimes(1);
  });

  it('shows a friendly daily-limit message without a retry button', () => {
    hookState = makeState({
      uploadStatus: 'error',
      uploadError: 'rate limited',
      errorKind: 'rate_limit',
      resetAt: '2030-01-01T10:00:00.000Z',
    });
    render(<UploadFlow />);
    expect(screen.getByText(/today's limit of free inspections/i)).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Try again' })).toBeNull();
  });
});
