// @vitest-environment jsdom
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { GuidedIntake } from './GuidedIntake';
import { DURATION_OPTIONS, EXTRAS_OPTIONS, LOCATION_OPTIONS } from '@/lib/intake/options';
import { SAFETY_CHIPS } from '@/lib/intake/safetyChips';

// Validates: Requirements 6.1, 6.2, 6.3, 6.10, 13.6

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
}));

beforeAll(() => {
  // jsdom has no object URLs; the photo preview needs them.
  URL.createObjectURL = vi.fn(() => 'blob:test');
  URL.revokeObjectURL = vi.fn();
  Element.prototype.scrollIntoView = vi.fn();
});

afterEach(cleanup);

const SAFETY_NAME = /^Is any of this happening right now\?/;
const LOCATION_NAME = /^Where is the problem\?/;
const DURATION_NAME = /^How long has this been going on\?/;
const EXTRAS_NAME = /^Anything else\?/;

/** Adding a photo needs a file picker, which a keyboard cannot drive in jsdom; everything after is keyboard only. */
async function addPhoto(user: ReturnType<typeof userEvent.setup>) {
  const input = document.querySelector('input[type="file"]') as HTMLInputElement;
  await user.upload(input, new File([new Uint8Array(10)], 'leak.jpg', { type: 'image/jpeg' }));
}

async function renderStepOne() {
  const user = userEvent.setup();
  render(<GuidedIntake />);
  return user;
}

async function renderStepTwo() {
  const user = await renderStepOne();
  await addPhoto(user);
  const next = screen.getByRole('button', { name: 'Next' });
  next.focus();
  await user.keyboard('{Enter}');
  await screen.findByRole('combobox', { name: LOCATION_NAME });
  return user;
}

describe('GuidedIntake keyboard: Step 1 Safety_Group', () => {
  it('is a named group of four checkboxes with one Tab stop each, then the file picker and Next', async () => {
    const user = await renderStepOne();
    const group = screen.getByRole('group', { name: SAFETY_NAME });
    const boxes = within(group).getAllByRole('checkbox');
    expect(boxes).toHaveLength(SAFETY_CHIPS.length);

    for (const box of boxes) {
      await user.tab();
      expect(box).toHaveFocus();
    }
    await user.tab();
    expect(document.querySelector('input[type="file"]')).toHaveFocus();
    await user.tab();
    expect(screen.getByRole('button', { name: 'Try it with a sample photo' })).toHaveFocus();
    await user.tab();
    expect(screen.getByRole('button', { name: 'Next' })).toHaveFocus();
  });

  it('toggles each chip with Space', async () => {
    const user = await renderStepOne();
    const boxes = within(screen.getByRole('group', { name: SAFETY_NAME })).getAllByRole('checkbox');
    for (const box of boxes) {
      await user.tab();
      expect(box).not.toBeChecked();
      await user.keyboard(' ');
      expect(box).toBeChecked();
    }
    await user.tab({ shift: true });
    await user.tab({ shift: true });
    expect(boxes[1]).toHaveFocus();
    await user.keyboard(' ');
    expect(boxes[1]).not.toBeChecked();
    expect(boxes[0]).toBeChecked();
  });
});

describe('GuidedIntake keyboard: Step 2 Location_Select and Duration_Select', () => {
  it('names the two dropdowns and the extras group', async () => {
    await renderStepTwo();
    expect(screen.getByRole('combobox', { name: LOCATION_NAME })).toBeInTheDocument();
    expect(screen.getByRole('combobox', { name: DURATION_NAME })).toBeInTheDocument();
    expect(screen.getByRole('group', { name: EXTRAS_NAME })).toBeInTheDocument();
    expect(screen.queryByRole('radiogroup')).toBeNull();
  });

  it('lists the empty first option, then every option in order', async () => {
    await renderStepTwo();
    const location = screen.getByRole('combobox', { name: LOCATION_NAME });
    expect(within(location).getAllByRole('option').map((o) => o.textContent)).toEqual([
      'Choose a room',
      ...LOCATION_OPTIONS,
    ]);
    const duration = screen.getByRole('combobox', { name: DURATION_NAME });
    expect(within(duration).getAllByRole('option').map((o) => o.textContent)).toEqual([
      'Choose how long (optional)',
      ...DURATION_OPTIONS,
    ]);
  });

  it('gives each dropdown one Tab stop, in reading order, and chooses an option', async () => {
    const user = await renderStepTwo();
    const location = screen.getByRole('combobox', { name: LOCATION_NAME });
    const duration = screen.getByRole('combobox', { name: DURATION_NAME });

    await user.tab(); // from the heading into the room dropdown
    expect(location).toHaveFocus();
    await user.selectOptions(location, LOCATION_OPTIONS[1]);
    expect(location).toHaveValue(LOCATION_OPTIONS[1]);
    expect(location).toHaveFocus();

    // Next stops: the exact-place text box, then the duration dropdown. No Clear buttons.
    await user.tab();
    expect(screen.getByRole('textbox', { name: /Exactly where/ })).toHaveFocus();
    await user.tab();
    expect(duration).toHaveFocus();
    expect(screen.queryByRole('button', { name: 'Clear' })).toBeNull();

    await user.selectOptions(duration, DURATION_OPTIONS[2]);
    expect(duration).toHaveValue(DURATION_OPTIONS[2]);
    expect(within(duration).getAllByRole('option', { selected: true })).toHaveLength(1);
  });

  it('clears the duration by choosing the empty option', async () => {
    const user = await renderStepTwo();
    const duration = screen.getByRole('combobox', { name: DURATION_NAME });
    await user.selectOptions(duration, DURATION_OPTIONS[0]);
    expect(duration).toHaveValue(DURATION_OPTIONS[0]);
    await user.selectOptions(duration, 'Choose how long (optional)');
    expect(duration).toHaveValue('');
  });
});
describe('GuidedIntake keyboard: Step 2 Extras_Group and navigation', () => {
  it('gives every extras checkbox its own Tab stop, toggled with Space, then Back and Next', async () => {
    const user = await renderStepTwo();
    const extras = within(screen.getByRole('group', { name: EXTRAS_NAME })).getAllByRole(
      'checkbox',
    );
    expect(extras).toHaveLength(EXTRAS_OPTIONS.length);

    // Skip to the first extras checkbox: room dropdown, exact place text, duration dropdown.
    await user.tab(); // location
    await user.tab(); // exact place text
    await user.tab(); // duration
    await user.tab(); // first extra
    for (let i = 0; i < extras.length; i++) {
      expect(extras[i]).toHaveFocus();
      await user.keyboard(' ');
      expect(extras[i]).toBeChecked();
      if (i < extras.length - 1) await user.tab();
    }

    // "Something else" is last and reveals its text box, which is the next stop.
    await user.tab();
    expect(screen.getByRole('textbox', { name: /Tell us more/ })).toHaveFocus();
    await user.tab();
    expect(screen.getByRole('button', { name: 'Back' })).toHaveFocus();
    await user.tab();
    expect(screen.getByRole('button', { name: 'Next' })).toHaveFocus();

    // Space unticks an extra again.
    await user.tab({ shift: true });
    await user.tab({ shift: true });
    await user.tab({ shift: true });
    expect(extras[extras.length - 1]).toHaveFocus();
    await user.keyboard(' ');
    expect(extras[extras.length - 1]).not.toBeChecked();
  });

  it('reaches Back and Next by Tab and activates Back with Enter', async () => {
    const user = await renderStepTwo();
    const extras = within(screen.getByRole('group', { name: EXTRAS_NAME })).getAllByRole(
      'checkbox',
    );
    extras[extras.length - 1].focus();
    await user.tab();
    expect(screen.getByRole('button', { name: 'Back' })).toHaveFocus();
    await user.tab();
    expect(screen.getByRole('button', { name: 'Next' })).toHaveFocus();
    await user.tab({ shift: true });
    await user.keyboard('{Enter}');
    expect(await screen.findByRole('group', { name: SAFETY_NAME })).toBeInTheDocument();
  });
});
