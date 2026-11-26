// @vitest-environment jsdom
import { useState } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { GuidedIntake } from '@/components/intake/GuidedIntake';
import { DropZone } from '@/components/upload/DropZone';
import { SAFETY_CHIPS } from '@/lib/intake/safetyChips';
import { HOME_LAYOUT } from '@/lib/layout/sections';
import type { AcceptedFiles } from '@/lib/validation/mediaValidation';
import type { UploadFlowResult } from '@/lib/uploadFlow';

// Task 4 follow-up (screens-polish). Four small checks on behaviour that was only
// covered indirectly: Clear selection, Remove, the "1 video" count and the section order.
// Validates: Requirements 16.4, 17.1, 17.3, 17.4

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
}));
vi.mock('@/lib/uploadFlow', () => ({
  runUploadFlow: () => new Promise<UploadFlowResult>(() => {}),
}));

beforeEach(() => {
  URL.createObjectURL = () => 'blob:test';
  URL.revokeObjectURL = () => {};
  Element.prototype.scrollIntoView = vi.fn();
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

type User = ReturnType<typeof userEvent.setup>;

const photo = (name: string, lastModified = 1) =>
  new File([new Uint8Array(32)], name, { type: 'image/jpeg', lastModified });

async function addPhoto(user: User, name = 'leak.jpg') {
  await user.upload(screen.getByLabelText('Choose photos or a video'), photo(name));
  await screen.findByText('1 of 5 photos');
}

const next = (user: User) => user.click(screen.getByRole('button', { name: 'Next' }));

describe('Clear selection', () => {
  it('keeps every answer and every safety chip', async () => {
    const user = userEvent.setup();
    render(<GuidedIntake />);

    // Step 1: all four safety chips and a photo.
    for (const chip of SAFETY_CHIPS) {
      await user.click(screen.getByRole('checkbox', { name: chip.label }));
    }
    await addPhoto(user);

    // Step 2: fill every answer.
    await next(user);
    await user.selectOptions(
      screen.getByRole('combobox', { name: /^Where is the problem\?/ }),
      'Kitchen',
    );
    await user.type(screen.getByLabelText(/Exactly where/), 'under the sink');
    await user.selectOptions(
      screen.getByRole('combobox', { name: /^How long has this been going on\?/ }),
      'A few weeks',
    );
    await user.click(screen.getByRole('checkbox', { name: 'Flickering lights' }));

    // Back to Step 1 and clear the photos.
    await user.click(screen.getByRole('button', { name: 'Back' }));
    await user.click(screen.getByRole('button', { name: 'Clear selection' }));
    expect(screen.queryByText('1 of 5 photos')).toBeNull();
    for (const chip of SAFETY_CHIPS) {
      expect((screen.getByRole('checkbox', { name: chip.label }) as HTMLInputElement).checked).toBe(true);
    }

    // Every answer is still there on Step 2 after adding a photo again.
    await addPhoto(user, 'again.jpg');
    await next(user);
    expect((screen.getByRole('combobox', { name: /^Where is the problem\?/ }) as HTMLSelectElement).value).toBe('Kitchen');
    expect((screen.getByLabelText(/Exactly where/) as HTMLInputElement).value).toBe('under the sink');
    expect(
      (screen.getByRole('combobox', { name: /^How long has this been going on\?/ }) as HTMLSelectElement).value,
    ).toBe('A few weeks');
    expect((screen.getByRole('checkbox', { name: 'Flickering lights' }) as HTMLInputElement).checked).toBe(true);
  });
});

/** Controlled DropZone, as the parent owns the selection. */
function Harness({ initial, onChange }: { initial: AcceptedFiles | null; onChange?: (f: AcceptedFiles) => void }) {
  const [value, setValue] = useState<AcceptedFiles | null>(initial);
  return (
    <DropZone
      value={value}
      onFilesAccepted={(files) => {
        onChange?.(files);
        setValue(files);
      }}
      onValidationError={() => {}}
      onSelectionCleared={() => setValue(null)}
    />
  );
}

describe('DropZone selection list', () => {
  it('Remove removes only that file and keeps the order of the others', async () => {
    const user = userEvent.setup();
    const a = photo('a.jpg', 1);
    const b = photo('b.jpg', 2);
    const c = photo('c.jpg', 3);
    const d = photo('d.jpg', 4);
    const onChange = vi.fn();
    render(<Harness initial={{ kind: 'images', files: [a, b, c, d] }} onChange={onChange} />);
    expect(screen.getAllByRole('img').map((i) => i.getAttribute('alt'))).toEqual(['a.jpg', 'b.jpg', 'c.jpg', 'd.jpg']);

    await user.click(screen.getByRole('button', { name: 'Remove b.jpg' }));

    expect(onChange).toHaveBeenCalledTimes(1);
    expect((onChange.mock.calls[0][0] as AcceptedFiles).files).toEqual([a, c, d]);
    expect(screen.getAllByRole('img').map((i) => i.getAttribute('alt'))).toEqual(['a.jpg', 'c.jpg', 'd.jpg']);
    expect(screen.getByText('3 of 5 photos')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Remove b.jpg' })).toBeNull();
  });

  it('shows "1 video" for a video selection', () => {
    const frames = [1, 2, 3].map((i) => new File([new Uint8Array(8)], `frame-${i}.jpg`, { type: 'image/jpeg' }));
    render(
      <Harness
        initial={{ kind: 'frames', files: frames, source: { name: 'clip.mp4', size: 2048 } }}
      />,
    );
    expect(screen.getByText('1 video')).toBeTruthy();
    expect(screen.queryByText(/of 5 photos/)).toBeNull();
  });
});

describe('Home page section order', () => {
  const order = (container: HTMLElement) => {
    const root = container.firstElementChild as HTMLElement;
    return Array.from(root.children).map((el) => el.getAttribute('data-section'));
  };

  it('renders the current step, then the inspection panel, as HOME_LAYOUT.phone says', async () => {
    const user = userEvent.setup();
    const { container } = render(<GuidedIntake />);
    expect(order(container)).toEqual([...HOME_LAYOUT.phone]);

    // The same order holds on every step.
    await addPhoto(user);
    await next(user);
    expect(order(container)).toEqual([...HOME_LAYOUT.phone]);
    expect(within(container).getByRole('heading', { name: 'A few quick questions' })).toBeTruthy();
  });

  it('has the desktop left column followed by the right column equal to the phone order', () => {
    expect([...HOME_LAYOUT.desktop.left, ...HOME_LAYOUT.desktop.right]).toEqual([...HOME_LAYOUT.phone]);
  });
});
