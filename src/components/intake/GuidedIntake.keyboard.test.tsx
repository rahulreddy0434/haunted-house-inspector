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
  await screen.findByRole('radiogroup', { name: LOCATION_NAME });
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

describe('GuidedIntake keyboard: Step 2 Location_Group and Duration_Group', () => {
  it('names the three groups', async () => {
    await renderStepTwo();
    expect(screen.getByRole('radiogroup', { name: LOCATION_NAME })).toBeInTheDocument();
    expect(screen.getByRole('radiogroup', { name: DURATION_NAME })).toBeInTheDocument();
    expect(screen.getByRole('group', { name: EXTRAS_NAME })).toBeInTheDocument();
  });

  it('gives each single-choice group one Tab stop and moves the choice with the arrow keys', async () => {
    const user = await renderStepTwo();
    const location = screen.getByRole('radiogroup', { name: LOCATION_NAME });
    const radios = within(location).getAllByRole('radio');
    expect(radios).toHaveLength(LOCATION_OPTIONS.length);

    await user.tab(); // from the heading into the group
    expect(radios[0]).toHaveFocus();
    await user.keyboard('{ArrowDown}');
    expect(radios[1]).toHaveFocus();
    expect(radios[1]).toBeChecked();
    await user.keyboard('{ArrowDown}');
    expect(radios[2]).toBeChecked();
    expect(radios[1]).not.toBeChecked();
    await user.keyboard('{ArrowUp}');
    expect(radios[1]).toBeChecked();
    await user.keyboard('{ArrowRight}');
    expect(radios[2]).toBeChecked();
    await user.keyboard('{ArrowLeft}');
    expect(radios[1]).toBeChecked();

    // Only the checked radio is a Tab stop; the next stops are Clear, then the text box.
    await user.tab();
    expect(screen.getAllByRole('button', { name: 'Clear' })[0]).toHaveFocus();
    await user.tab();
    expect(screen.getByRole('textbox', { name: /Exact place/ })).toHaveFocus();

    // Duration: one stop, arrows move the choice.
    const duration = within(screen.getByRole('radiogroup', { name: DURATION_NAME })).getAllByRole(
      'radio',
    );
    expect(duration).toHaveLength(DURATION_OPTIONS.length);
    await user.tab();
    expect(duration[0]).toHaveFocus();
    await user.keyboard('{ArrowDown}{ArrowDown}');
    expect(duration[2]).toBeChecked();
    await user.keyboard('{ArrowUp}{ArrowUp}{ArrowUp}'); // wraps to the last
    expect(duration[duration.length - 1]).toBeChecked();
    expect(duration.filter((r) => (r as HTMLInputElement).checked)).toHaveLength(1);
  });

  it('chooses a radio with Space on each chip of both single-choice groups', async () => {
    const user = await renderStepTwo();
    const location = within(screen.getByRole('radiogroup', { name: LOCATION_NAME })).getAllByRole(
      'radio',
    );
    await user.tab();
    expect(location[0]).toHaveFocus();
    await user.keyboard(' ');
    expect(location[0]).toBeChecked();

    // Clear, text box, then duration.
    await user.tab();
    await user.tab();
    await user.tab();
    const duration = within(screen.getByRole('radiogroup', { name: DURATION_NAME })).getAllByRole(
      'radio',
    );
    expect(duration[0]).toHaveFocus();
    await user.keyboard(' ');
    expect(duration[0]).toBeChecked();
  });
});

describe('GuidedIntake keyboard: Step 2 Extras_Group and navigation', () => {
  it('gives every extras checkbox its own Tab stop, toggled with Space, then Back and Next', async () => {
    const user = await renderStepTwo();
    const extras = within(screen.getByRole('group', { name: EXTRAS_NAME })).getAllByRole(
      'checkbox',
    );
    expect(extras).toHaveLength(EXTRAS_OPTIONS.length);

    // Skip to the first extras checkbox: location (1), duration (1) stops, plus the text box.
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
