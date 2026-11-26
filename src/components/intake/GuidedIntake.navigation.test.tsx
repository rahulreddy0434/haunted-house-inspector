// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { GuidedIntake } from '@/components/intake/GuidedIntake';

// Validates: Requirements 3.10, 3.11, 5.10, 8.2, 13.5

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
}));

const PLACE = 'Behind the boiler cupboard';
const MORE = 'A faint ticking sound at night';
const GAS = 'I smell gas';

const fetchMock = vi.fn();

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal('fetch', fetchMock);
  URL.createObjectURL = vi.fn(() => 'blob:test');
  URL.revokeObjectURL = vi.fn();
  Element.prototype.scrollIntoView = vi.fn();
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const photo = () => new File([new Uint8Array(64)], 'leak.jpg', { type: 'image/jpeg' });

const heading = (name: string) => screen.getByRole('heading', { name });
const place = () => screen.getByLabelText(/Exactly where/) as HTMLInputElement;
const more = () => screen.getByLabelText('Tell us more') as HTMLTextAreaElement;
const location = () =>
  screen.getByRole('combobox', { name: /^Where is the problem\?/ }) as HTMLSelectElement;
const duration = () =>
  screen.getByRole('combobox', { name: /^How long has this been going on\?/ }) as HTMLSelectElement;
const checkbox = (name: string) => screen.getByRole('checkbox', { name }) as HTMLInputElement;

function expectStep1() {
  expect(heading('Safety check and photos')).toBeTruthy();
  expect(screen.getByText('1 of 5 photos')).toBeTruthy();
  expect(screen.getByAltText('leak.jpg')).toBeTruthy();
  expect(checkbox(GAS).checked).toBe(true);
}

function expectStep2() {
  expect(heading('A few quick questions')).toBeTruthy();
  expect(location().value).toBe('Other');
  expect(duration().value).toBe('A few weeks');
  expect(checkbox('Getting worse').checked).toBe(true);
  expect(checkbox('Something else').checked).toBe(true);
  expect(place().value).toBe(PLACE);
  expect(more().value).toBe(MORE);
}

function expectStep3() {
  expect(heading('Review and send')).toBeTruthy();
  // The step itself, not the desktop Inspection_Panel, which shows the same text (hidden by CSS below lg).
  const review = within(heading('Review and send').parentElement as HTMLElement);
  expect(review.getByText(GAS)).toBeTruthy();
  expect(review.getByAltText(/leak\.jpg/)).toBeTruthy();
  expect(review.getByText(`Other: ${PLACE}`)).toBeTruthy();
  expect(review.getByText('A few weeks')).toBeTruthy();
  expect(review.getByText('Getting worse')).toBeTruthy();
  expect(review.getByText(MORE)).toBeTruthy();
}

async function fillEverything(user: ReturnType<typeof userEvent.setup>) {
  await user.upload(screen.getByLabelText('Choose photos or a video'), photo());
  await user.click(checkbox(GAS));

  await user.click(screen.getByRole('button', { name: 'Next' }));
  await user.selectOptions(location(), 'Other');
  await user.type(place(), PLACE);
  await user.selectOptions(duration(), 'A few weeks');
  await user.click(checkbox('Getting worse'));
  await user.click(checkbox('Something else'));
  await user.type(more(), MORE);
}

describe('GuidedIntake navigation keeps every answer', () => {
  it('keeps files, chips and text through Next, Back, Back and Next again', async () => {
    const user = userEvent.setup();
    render(<GuidedIntake />);

    await fillEverything(user);
    expectStep2();

    await user.click(screen.getByRole('button', { name: 'Next' }));
    expectStep3();

    await user.click(screen.getByRole('button', { name: 'Back' }));
    expectStep2();

    await user.click(screen.getByRole('button', { name: 'Back' }));
    expectStep1();

    await user.click(screen.getByRole('button', { name: 'Next' }));
    expectStep2();

    await user.click(screen.getByRole('button', { name: 'Next' }));
    expectStep3();
  }, 30_000);

  it('keeps the state when the Change buttons on Step 3 are used', async () => {
    const user = userEvent.setup();
    render(<GuidedIntake />);

    await fillEverything(user);
    await user.click(screen.getByRole('button', { name: 'Next' }));
    expectStep3();

    // Photos and safety go to Step 1.
    await user.click(screen.getByRole('button', { name: 'Change photos' }));
    expectStep1();
    await user.click(screen.getByRole('button', { name: 'Next' }));
    expectStep2();
    await user.click(screen.getByRole('button', { name: 'Next' }));
    expectStep3();

    await user.click(screen.getByRole('button', { name: 'Change safety check' }));
    expectStep1();
    await user.click(screen.getByRole('button', { name: 'Next' }));
    await user.click(screen.getByRole('button', { name: 'Next' }));
    expectStep3();

    // The other three go to Step 2.
    for (const name of ['Change where', 'Change how long', 'Change anything else']) {
      await user.click(screen.getByRole('button', { name }));
      expectStep2();
      await user.click(screen.getByRole('button', { name: 'Next' }));
      expectStep3();
    }

    // Going back to Step 1 from Step 2 after a Change still shows the file and safety chip.
    await user.click(screen.getByRole('button', { name: 'Change where' }));
    await user.click(screen.getByRole('button', { name: 'Back' }));
    expectStep1();
  }, 30_000);

  it('keeps the Something_Else_Text when the chip is turned off and on again', async () => {
    const user = userEvent.setup();
    render(<GuidedIntake />);

    await fillEverything(user);

    await user.click(checkbox('Something else'));
    expect(checkbox('Something else').checked).toBe(false);
    expect(screen.queryByLabelText('Tell us more')).toBeNull();

    // The text is not sent or shown while the chip is off.
    await user.click(screen.getByRole('button', { name: 'Next' }));
    expect(screen.queryByText(MORE)).toBeNull();
    await user.click(screen.getByRole('button', { name: 'Back' }));

    await user.click(checkbox('Something else'));
    expect(checkbox('Something else').checked).toBe(true);
    expect(more().value).toBe(MORE);
    expect(place().value).toBe(PLACE);
  }, 30_000);
});
