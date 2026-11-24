// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { GuidedIntake } from '@/components/intake/GuidedIntake';
import { EMERGENCY_MESSAGE } from '@/lib/emergency/messages';
import type { FileProgressUpdate, RunUploadFlowOptions, UploadFlowResult } from '@/lib/uploadFlow';

const push = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push }),
}));

const runUploadFlow = vi.fn<(opts: RunUploadFlowOptions) => Promise<UploadFlowResult>>();
vi.mock('@/lib/uploadFlow', () => ({
  runUploadFlow: (opts: RunUploadFlowOptions) => runUploadFlow(opts),
}));

const UPLOADING = 'Uploading photos';
const ANALYSING = 'Checking for safety and reading your photos';
const GAS_CHIP = 'I smell gas';

interface Pending {
  opts: RunUploadFlowOptions;
  resolve: (r: UploadFlowResult) => void;
}

let pending: Pending[] = [];

beforeEach(() => {
  pending = [];
  runUploadFlow.mockImplementation(
    (opts) =>
      new Promise<UploadFlowResult>((resolve) => {
        pending.push({ opts, resolve });
      }),
  );
  URL.createObjectURL = () => 'blob:test';
  URL.revokeObjectURL = () => {};
});

afterEach(() => {
  vi.useRealTimers();
  cleanup();
  vi.clearAllMocks();
});

const photo = () => new File([new Uint8Array(1024)], 'leak.jpg', { type: 'image/jpeg' });

async function addPhoto(user: ReturnType<typeof userEvent.setup>) {
  await user.upload(screen.getByLabelText('Choose photos or a video'), photo());
  await screen.findByText('Selected: 1 photo');
}

/** Renders, adds a photo, answers the location, and lands on Step 3. */
async function goToStepThree() {
  const user = userEvent.setup();
  render(<GuidedIntake />);
  await addPhoto(user);
  await user.click(screen.getByRole('button', { name: 'Next' }));
  await user.click(screen.getByRole('radio', { name: /Kitchen/ }));
  await user.click(screen.getByRole('button', { name: 'Next' }));
  expect(screen.getByRole('heading', { name: 'Review and send' })).toBeTruthy();
  return user;
}

const inspectButton = () => screen.getByRole('button', { name: 'Inspect my home' });
const backButton = () => screen.getByRole('button', { name: 'Back' });

function startInspection(user: ReturnType<typeof userEvent.setup>) {
  return user.click(inspectButton());
}

function messageText(alert: HTMLElement): string {
  const clone = alert.cloneNode(true) as HTMLElement;
  clone.querySelectorAll('[aria-hidden="true"]').forEach((n) => n.remove());
  return clone.textContent ?? '';
}

function noticeIn(root: Element): HTMLElement {
  const found = within(root as HTMLElement)
    .getAllByRole('alert')
    .find((el) => messageText(el) === EMERGENCY_MESSAGE);
  if (!found) throw new Error('Live_Emergency_Notice not found');
  return found;
}

function expectNoHauntedClass(el: HTMLElement) {
  for (const node of [el, ...Array.from(el.querySelectorAll('*'))]) {
    expect(Array.from(node.classList).some((c) => c.startsWith('haunted:'))).toBe(false);
  }
}

describe('GuidedIntake real stages', () => {
  it('shows "Uploading photos" with progress from onProgress and no analysis text yet', async () => {
    const user = await goToStepThree();
    await startInspection(user);

    expect(runUploadFlow).toHaveBeenCalledTimes(1);
    expect(screen.getByText(UPLOADING)).toBeTruthy();
    expect(screen.queryByText(ANALYSING)).toBeNull();
    expect(screen.getByRole('progressbar', { name: 'leak.jpg' }).getAttribute('aria-valuenow')).toBe('0');

    const update: FileProgressUpdate = { index: 0, progress: 42, status: 'uploading' };
    act(() => pending[0].opts.onProgress?.(update));
    expect(screen.getByRole('progressbar', { name: 'leak.jpg' }).getAttribute('aria-valuenow')).toBe('42');

    act(() => pending[0].opts.onProgress?.({ index: 0, progress: 100, status: 'done' }));
    expect(screen.getByRole('progressbar', { name: 'leak.jpg' }).getAttribute('aria-valuenow')).toBe('100');
    expect(screen.getByText('1 of 1 file uploaded')).toBeTruthy();
    expect(screen.queryByText(ANALYSING)).toBeNull();
  });

  it('shows the analysis text only after onAnalysing is called', async () => {
    const user = await goToStepThree();
    await startInspection(user);
    expect(screen.queryByText(ANALYSING)).toBeNull();

    act(() => pending[0].opts.onAnalysing?.());
    expect(screen.getByText(ANALYSING)).toBeTruthy();
    expect(screen.queryByText(UPLOADING)).toBeNull();
  });

  it('does not change text when timers advance', async () => {
    const user = await goToStepThree();
    await startInspection(user);

    vi.useFakeTimers();
    const before = document.body.textContent;
    act(() => {
      vi.advanceTimersByTime(120_000);
    });
    expect(document.body.textContent).toBe(before);
    expect(screen.getByText(UPLOADING)).toBeTruthy();
    expect(screen.queryByText(ANALYSING)).toBeNull();

    act(() => pending[0].opts.onAnalysing?.());
    const analysing = document.body.textContent;
    act(() => {
      vi.advanceTimersByTime(120_000);
    });
    expect(document.body.textContent).toBe(analysing);
    expect(screen.getByText(ANALYSING)).toBeTruthy();
  });

  it('disables Back and "Inspect my home" while uploading and while analysing', async () => {
    const user = await goToStepThree();
    expect((inspectButton() as HTMLButtonElement).disabled).toBe(false);
    await startInspection(user);

    expect((backButton() as HTMLButtonElement).disabled).toBe(true);
    expect((inspectButton() as HTMLButtonElement).disabled).toBe(true);

    act(() => pending[0].opts.onAnalysing?.());
    expect((backButton() as HTMLButtonElement).disabled).toBe(true);
    expect((inspectButton() as HTMLButtonElement).disabled).toBe(true);

    // Extra clicks do not start a second run.
    fireEvent.click(inspectButton());
    expect(runUploadFlow).toHaveBeenCalledTimes(1);
  });

  it('keeps the state and stays on Step 3 when the flow fails', async () => {
    const user = await goToStepThree();
    await startInspection(user);

    await act(async () => {
      pending[0].resolve({ ok: false, kind: 'upload', message: 'We could not upload your photos.' });
    });

    expect(screen.getByRole('heading', { name: 'Review and send' })).toBeTruthy();
    expect(screen.getByText('We could not upload your photos.')).toBeTruthy();
    expect(screen.getAllByText(/leak\.jpg|1 photo/).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/Kitchen/).length).toBeGreaterThan(0);
    expect((backButton() as HTMLButtonElement).disabled).toBe(false);
    expect((inspectButton() as HTMLButtonElement).disabled).toBe(false);
    expect(push).not.toHaveBeenCalled();
  });

  it('"Try again" clears the error and lets the Homeowner send again', async () => {
    const user = await goToStepThree();
    await startInspection(user);
    await act(async () => {
      pending[0].resolve({ ok: false, kind: 'analysis', message: 'The check did not finish.' });
    });

    await user.click(screen.getByRole('button', { name: 'Try again' }));
    expect(screen.queryByText('The check did not finish.')).toBeNull();
    expect(screen.getByRole('heading', { name: 'Review and send' })).toBeTruthy();

    await startInspection(user);
    expect(runUploadFlow).toHaveBeenCalledTimes(2);
    expect(screen.getByText(UPLOADING)).toBeTruthy();
    // The second run carries the same files and answers.
    expect(pending[1].opts.files.files).toHaveLength(1);
    expect(pending[1].opts.answers.location).toBe('Kitchen');
  });
});

describe('Live_Emergency_Notice placement', () => {
  it('on Step 1 sits directly below the Safety_Group before any file is added', async () => {
    const user = userEvent.setup();
    const { container } = render(<GuidedIntake />);
    expect(screen.queryAllByRole('alert').some((a) => messageText(a) === EMERGENCY_MESSAGE)).toBe(false);
    expect(screen.queryByText('Selected: 1 photo')).toBeNull();

    const chip = screen.getByRole('checkbox', { name: GAS_CHIP });
    await user.click(chip);

    const group = screen.getByRole('group', { name: /Is any of this happening right now/ });
    const notice = noticeIn(container);
    expect(group.nextElementSibling).toBe(notice);
    expect(messageText(notice)).toBe(EMERGENCY_MESSAGE);
    expectNoHauntedClass(notice);
    expect(document.activeElement).toBe(chip);
  });

  it('is removed again when the chip is turned off', async () => {
    const user = userEvent.setup();
    const { container } = render(<GuidedIntake />);
    const chip = screen.getByRole('checkbox', { name: GAS_CHIP });
    await user.click(chip);
    noticeIn(container);
    await user.click(chip);
    expect(screen.queryAllByRole('alert').some((a) => messageText(a) === EMERGENCY_MESSAGE)).toBe(false);
  });

  it('is at the top of Step 2, right after the heading', async () => {
    const user = userEvent.setup();
    const { container } = render(<GuidedIntake />);
    const chip = screen.getByRole('checkbox', { name: GAS_CHIP });
    await user.click(chip);
    await addPhoto(user);
    await user.click(screen.getByRole('button', { name: 'Next' }));

    const heading = screen.getByRole('heading', { name: 'A few quick questions' });
    const notice = noticeIn(container);
    expect(heading.nextElementSibling).toBe(notice);
    expect(messageText(notice)).toBe(EMERGENCY_MESSAGE);
    expectNoHauntedClass(notice);
    // Focus is on the step heading, never on the notice.
    expect(document.activeElement).toBe(heading);
  });

  it('is at the top of Step 3, right after the heading', async () => {
    const user = userEvent.setup();
    const { container } = render(<GuidedIntake />);
    const chip = screen.getByRole('checkbox', { name: GAS_CHIP });
    await user.click(chip);
    await addPhoto(user);
    await user.click(screen.getByRole('button', { name: 'Next' }));
    await user.click(screen.getByRole('radio', { name: /Kitchen/ }));
    await user.click(screen.getByRole('button', { name: 'Next' }));

    const heading = screen.getByRole('heading', { name: 'Review and send' });
    const notice = noticeIn(container);
    expect(heading.nextElementSibling).toBe(notice);
    expect(messageText(notice)).toBe(EMERGENCY_MESSAGE);
    expectNoHauntedClass(notice);
    expect(document.activeElement).toBe(heading);
  });

  it('shows no emergency text when no Safety_Chip is selected', async () => {
    const user = userEvent.setup();
    render(<GuidedIntake />);
    await addPhoto(user);
    await user.click(screen.getByRole('button', { name: 'Next' }));
    expect(screen.queryByText(EMERGENCY_MESSAGE)).toBeNull();
  });
});
