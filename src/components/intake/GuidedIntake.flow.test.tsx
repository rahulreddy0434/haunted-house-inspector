// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { UseUploadReturn } from '@/hooks/useUpload';
import { GuidedIntake } from '@/components/intake/GuidedIntake';
import { NO_FILES_MESSAGE, NO_LOCATION_MESSAGE, NO_OTHER_TEXT_MESSAGE } from '@/lib/intake/copy';

// Migrated from UploadFlow.test.tsx (task 9.1), now driven through GuidedIntake.
// useUpload is replaced with a fixed state so each case controls exactly what the
// hook reports; the real DropZone, steps and status panel are rendered.
// Validates: Requirements 8.4, 8.5, 10.6

let hookState: UseUploadReturn;
const submit = vi.fn(async () => {});
const reset = vi.fn();
const scrollIntoView = vi.fn();

vi.mock('@/hooks/useUpload', () => ({
  useUpload: () => hookState,
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
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
    clearFiles: vi.fn(),
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
  URL.createObjectURL = vi.fn(() => 'blob:test');
  URL.revokeObjectURL = vi.fn();
  hookState = makeState();
});

afterEach(() => cleanup());

type User = ReturnType<typeof userEvent.setup>;

const locationSelect = () =>
  screen.getByRole('combobox', { name: /^Where is the problem\?/ }) as HTMLSelectElement;

const inspectButton = () => screen.getByRole('button', { name: 'Inspect my home' });

/** Step 1 -> Step 2 (choose Kitchen) -> Step 3, using whatever hookState holds. */
async function goToStepThree(user: User) {
  await user.click(screen.getByRole('button', { name: 'Next' }));
  await user.selectOptions(locationSelect(), 'Kitchen');
  await user.click(screen.getByRole('button', { name: 'Next' }));
  expect(screen.getByRole('heading', { name: 'Review and send' })).toBeTruthy();
  // Moving between steps scrolls the heading; only later scrolls are of interest.
  scrollIntoView.mockClear();
}

/** Renders and reaches Step 3; returns the user and a re-render with the current hookState. */
async function renderAtStepThree() {
  const user = userEvent.setup();
  const view = render(<GuidedIntake />);
  await goToStepThree(user);
  const update = (overrides: Partial<UseUploadReturn>) => {
    hookState = makeState(overrides);
    view.rerender(<GuidedIntake />);
  };
  return { user, update };
}

describe('GuidedIntake form and send button (was UploadFlow "renders the upload form")', () => {
  it('shows the location question, the data notice and an available send button', async () => {
    const user = userEvent.setup();
    render(<GuidedIntake />);
    await user.click(screen.getByRole('button', { name: 'Next' }));
    expect(locationSelect()).toBeTruthy();
    await user.selectOptions(locationSelect(), 'Kitchen');
    await user.click(screen.getByRole('button', { name: 'Next' }));
    expect(screen.getByText('Before you send')).toBeTruthy();
    expect(inspectButton().getAttribute('aria-disabled')).toBeNull();
  });
});

describe('GuidedIntake notice prompt (confirm before sending)', () => {
  it('scrolls to the notice and prompts when it has not been seen', async () => {
    hookState = makeState({ noticeVisible: false, canSubmit: false });
    const user = userEvent.setup();
    render(<GuidedIntake />);
    await goToStepThree(user);

    expect(inspectButton().getAttribute('aria-disabled')).toBe('true');
    fireEvent.click(inspectButton());
    expect(scrollIntoView).toHaveBeenCalledTimes(1);
    expect(screen.getByText('Please read the notice below before sending.')).toBeTruthy();
    expect(submit).not.toHaveBeenCalled();
  });

  it('sends once the notice has been seen and everything is ready', async () => {
    const user = userEvent.setup();
    render(<GuidedIntake />);
    await goToStepThree(user);
    fireEvent.click(inspectButton());
    expect(submit).toHaveBeenCalledTimes(1);
    expect(screen.queryByText('Please read the notice below before sending.')).toBeNull();
  });
});

describe('GuidedIntake missing answers do not submit', () => {
  it('shows the location error on Step 2 and does not move on when no location is chosen', async () => {
    const user = userEvent.setup();
    render(<GuidedIntake />);
    await user.click(screen.getByRole('button', { name: 'Next' }));
    await user.click(screen.getByRole('button', { name: 'Next' }));
    expect(screen.getByText(NO_LOCATION_MESSAGE)).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'A few quick questions' })).toBeTruthy();
    expect(submit).not.toHaveBeenCalled();

    // The error sits on the dropdown: invalid, described by the message, and focused.
    const select = locationSelect();
    expect(select.getAttribute('aria-invalid')).toBe('true');
    const describedBy = select.getAttribute('aria-describedby');
    expect(describedBy).toBeTruthy();
    expect(document.getElementById(describedBy as string)?.textContent).toContain(NO_LOCATION_MESSAGE);
    expect(select).toHaveFocus();

    // Choosing a room clears the error.
    await user.selectOptions(select, 'Kitchen');
    expect(screen.queryByText(NO_LOCATION_MESSAGE)).toBeNull();
    expect(select.getAttribute('aria-invalid')).toBeNull();
  });

  it('requires the exact place when Other is chosen', async () => {
    const user = userEvent.setup();
    render(<GuidedIntake />);
    await user.click(screen.getByRole('button', { name: 'Next' }));
    await user.selectOptions(locationSelect(), 'Other');
    await user.click(screen.getByRole('button', { name: 'Next' }));
    expect(screen.getByRole('heading', { name: 'A few quick questions' })).toBeTruthy();
    expect(screen.getByText(NO_OTHER_TEXT_MESSAGE)).toBeTruthy();
    expect(screen.getByLabelText(/Exactly where/)).toHaveFocus();
    expect(submit).not.toHaveBeenCalled();
  });

  it('asks for a file when none is selected', async () => {
    hookState = makeState({ files: null, canSubmit: false });
    const user = userEvent.setup();
    render(<GuidedIntake />);
    await user.click(screen.getByRole('button', { name: 'Next' }));
    expect(screen.getByText(NO_FILES_MESSAGE)).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Safety check and photos' })).toBeTruthy();
    expect(submit).not.toHaveBeenCalled();
  });

  it('asks for a file when the selection is empty', async () => {
    hookState = makeState({ files: { kind: 'images', files: [] }, canSubmit: true });
    const user = userEvent.setup();
    render(<GuidedIntake />);
    await user.click(screen.getByRole('button', { name: 'Next' }));
    expect(screen.getByText(NO_FILES_MESSAGE)).toBeTruthy();
    expect(submit).not.toHaveBeenCalled();
  });

  it('asks for a file on Step 3 if the files disappear before sending', async () => {
    const { update } = await renderAtStepThree();
    update({ files: null, canSubmit: false });
    fireEvent.click(inspectButton());
    expect(screen.getByText(NO_FILES_MESSAGE)).toBeTruthy();
    expect(submit).not.toHaveBeenCalled();
  });
});

describe('GuidedIntake file handling', () => {
  it('passes the current files to DropZone (shown as the selected photos)', () => {
    render(<GuidedIntake />);
    expect(screen.getByText('1 of 5 photos')).toBeTruthy();
    cleanup();
    hookState = makeState({ files: null, canSubmit: false });
    render(<GuidedIntake />);
    expect(screen.getByText('No photos or video added yet.')).toBeTruthy();
    expect(screen.queryByText(/ of 5 photos$/)).toBeNull();
  });

  it('calls setFiles when files are accepted', async () => {
    const user = userEvent.setup();
    render(<GuidedIntake />);
    const added = new File(['y'], 'b.jpg', { type: 'image/jpeg' });
    await user.upload(screen.getByLabelText('Add more photos'), added);
    const setFiles = hookState.setFiles as ReturnType<typeof vi.fn>;
    expect(setFiles).toHaveBeenCalledTimes(1);
    const arg = setFiles.mock.calls[0][0] as { kind: string; files: File[] };
    expect(arg.kind).toBe('images');
    expect(arg.files).toHaveLength(2);
    expect(arg.files).toContain(added);
  });

  it('clears via clearFiles only, keeping the answers', async () => {
    const user = userEvent.setup();
    render(<GuidedIntake />);
    (hookState.setAnswers as ReturnType<typeof vi.fn>).mockClear();
    await user.click(screen.getByRole('button', { name: 'Clear selection' }));
    expect(hookState.clearFiles).toHaveBeenCalledTimes(1);
    expect(hookState.setFiles).not.toHaveBeenCalled();
    expect(hookState.setAnswers).not.toHaveBeenCalled();
    expect(hookState.clearAll).not.toHaveBeenCalled();
  });

  it('never calls setFiles with an empty selection', async () => {
    const user = userEvent.setup();
    render(<GuidedIntake />);
    await user.click(screen.getByRole('button', { name: 'Clear selection' }));
    await user.click(screen.getByRole('button', { name: 'Next' }));
    const calls = (hookState.setFiles as ReturnType<typeof vi.fn>).mock.calls as [
      { files: File[] },
    ][];
    expect(calls.every(([f]) => f.files.length > 0)).toBe(true);
  });
});

describe('GuidedIntake upload and analysis stages', () => {
  it('shows "Uploading photos" with the file progress while uploading', async () => {
    const { update } = await renderAtStepThree();
    update({
      uploadStatus: 'uploading',
      fileProgress: [{ name: 'a.jpg', progress: 40, status: 'uploading' }],
    });
    expect(screen.getByText('Uploading photos')).toBeTruthy();
    expect(screen.queryByText('Checking for safety and reading your photos')).toBeNull();
    expect(screen.getByRole('progressbar', { name: 'a.jpg' }).getAttribute('aria-valuenow')).toBe('40');
  });

  it('shows the loading state while analysing and blocks submits', async () => {
    const { update } = await renderAtStepThree();
    update({ uploadStatus: 'analysing' });
    expect(screen.getByText('Checking for safety and reading your photos')).toBeTruthy();
    expect((inspectButton() as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByRole('button', { name: 'Back' }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(inspectButton());
    expect(submit).not.toHaveBeenCalled();
  });
});

describe('GuidedIntake error cards and retry', () => {
  it('shows the upload error on Step 3 and Try again calls reset', async () => {
    const { update } = await renderAtStepThree();
    update({ uploadStatus: 'error', uploadError: 'Upload failed.', errorKind: 'upload' });
    expect(screen.getByRole('heading', { name: 'Review and send' })).toBeTruthy();
    expect(screen.getByText('Upload failed.')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(reset).toHaveBeenCalledTimes(1);
  });

  it.each(['analysis', 'timeout'] as const)(
    'shows the 911 safety line under the error when the %s fails',
    async (errorKind) => {
      const { update } = await renderAtStepThree();
      update({
        uploadStatus: 'error',
        uploadError: "We couldn't analyse your photos. Please try again.",
        errorKind,
      });
      expect(
        screen.getByText(
          'If you smell gas, see sparks or hear a CO alarm, leave the home and call 911.',
        ),
      ).toBeTruthy();
      expect(screen.getByRole('button', { name: 'Try again' })).toBeTruthy();
    },
  );

  it('says the photos and answers are still here after a timeout', async () => {
    const { update } = await renderAtStepThree();
    update({ uploadStatus: 'error', uploadError: 'Too slow.', errorKind: 'timeout' });
    expect(screen.getByText(/Your photos and answers are still here/)).toBeTruthy();
  });

  it.each(['upload', 'validation'] as const)(
    'does not show the safety line for a %s error',
    async (errorKind) => {
      const { update } = await renderAtStepThree();
      update({ uploadStatus: 'error', uploadError: 'Upload failed.', errorKind });
      expect(screen.queryByText(/call 911/)).toBeNull();
    },
  );

  it('shows a friendly daily-limit message without a retry button', async () => {
    const { update } = await renderAtStepThree();
    update({
      uploadStatus: 'error',
      uploadError: 'rate limited',
      errorKind: 'rate_limit',
      resetAt: '2030-01-01T10:00:00.000Z',
    });
    expect(screen.getByText(/today's limit of free inspections/i)).toBeTruthy();
    expect(screen.getByText(/You can try again after /)).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Try again' })).toBeNull();
  });

  it('lets Back go to Step 2 and stay there while an error shows, then Next returns to Step 3', async () => {
    const { user, update } = await renderAtStepThree();
    update({ uploadStatus: 'error', uploadError: 'Upload failed.', errorKind: 'upload' });
    expect(screen.getByRole('heading', { name: 'Review and send' })).toBeTruthy();

    await user.click(screen.getByRole('button', { name: 'Back' }));
    expect(screen.queryByRole('heading', { name: 'Review and send' })).toBeNull();
    expect(locationSelect().value).toBe('Kitchen');

    await user.click(screen.getByRole('button', { name: 'Next' }));
    expect(screen.getByRole('heading', { name: 'Review and send' })).toBeTruthy();
    expect(screen.getByText('Upload failed.')).toBeTruthy();
  });

  it('keeps the chosen answers and files visible while an error is shown', async () => {
    const { update } = await renderAtStepThree();
    update({ uploadStatus: 'error', uploadError: 'Upload failed.', errorKind: 'upload' });
    expect(screen.getAllByText(/Kitchen/).length).toBeGreaterThan(0);
    // The step's own review (the desktop Inspection_Panel also lists the photo; it is hidden by CSS below lg).
    const review = within(screen.getByRole('heading', { name: 'Review and send' }).parentElement as HTMLElement);
    expect(review.getByAltText(/a\.jpg/)).toBeTruthy();
    expect((inspectButton() as HTMLButtonElement).disabled).toBe(false);
  });
});
