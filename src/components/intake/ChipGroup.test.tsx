import { describe, expect, it } from 'vitest';
import { useState } from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ChipGroup } from './ChipGroup';

// Validates: Requirements 5.3, 5.5, 5.6, 6.2, 6.3, 6.9, 6.10

const OPTIONS = [
  { value: 'a', label: 'Alpha' },
  { value: 'b', label: 'Bravo' },
  { value: 'c', label: 'Charlie' },
] as const;

function Single() {
  const [sel, setSel] = useState<string[]>([]);
  return (
    <>
      <ChipGroup
        legend="Pick one"
        name="one"
        mode="single"
        options={OPTIONS}
        selected={sel}
        onSelect={(v) => setSel([v])}
        onClear={() => setSel([])}
      />
      <button type="button">after</button>
    </>
  );
}

function Multi() {
  const [sel, setSel] = useState<string[]>([]);
  return (
    <ChipGroup
      legend="Pick many"
      name="many"
      mode="multiple"
      options={OPTIONS}
      selected={sel}
      onSelect={(v) => setSel((s) => (s.includes(v) ? s.filter((x) => x !== v) : [...s, v]))}
    />
  );
}

// The visible check mark is aria-hidden, so the accessible name is the label alone.
const chip = (name: string) => screen.getByRole(screen.queryAllByRole('radio').length ? 'radio' : 'checkbox', { name });

describe('ChipGroup', () => {
  it('names a single-choice group as a radiogroup by its legend', () => {
    render(<Single />);
    const group = screen.getByRole('radiogroup', { name: 'Pick one' });
    const legend = group.querySelector('legend');
    expect(legend?.id).toBeTruthy();
    expect(group.getAttribute('aria-labelledby')).toBe(legend?.id);
    expect(screen.getAllByRole('radio')).toHaveLength(3);
  });

  it('names a multi-choice group as a group by its legend', () => {
    render(<Multi />);
    const group = screen.getByRole('group', { name: 'Pick many' });
    const legend = group.querySelector('legend');
    expect(group.getAttribute('aria-labelledby')).toBe(legend?.id);
    expect(screen.getAllByRole('checkbox')).toHaveLength(3);
  });

  it('single-choice has one Tab stop, and arrows move and select', async () => {
    const user = userEvent.setup();
    render(<Single />);
    await user.tab();
    expect(chip('Alpha')).toHaveFocus();
    await user.keyboard('{ArrowDown}');
    expect(chip('Bravo')).toHaveFocus();
    expect(chip('Bravo')).toBeChecked();
    await user.keyboard('{ArrowRight}');
    expect(chip('Charlie')).toBeChecked();
    expect(chip('Bravo')).not.toBeChecked();
    await user.keyboard('{ArrowUp}');
    expect(chip('Bravo')).toBeChecked();
    // One stop for the group: Tab leaves it (Clear button is next since something is selected).
    await user.tab();
    expect(screen.getByRole('button', { name: 'Clear' })).toHaveFocus();
  });

  it('single-choice replaces the selection and Clear removes it', async () => {
    const user = userEvent.setup();
    render(<Single />);
    expect(screen.queryByRole('button', { name: 'Clear' })).toBeNull();
    await user.click(chip('Alpha'));
    await user.click(chip('Bravo'));
    expect(chip('Bravo')).toBeChecked();
    expect(chip('Alpha')).not.toBeChecked();
    await user.click(screen.getByRole('button', { name: 'Clear' }));
    for (const r of screen.getAllByRole('radio')) expect(r).not.toBeChecked();
    expect(screen.queryByRole('button', { name: 'Clear' })).toBeNull();
  });

  it('multi-choice has one Tab stop per checkbox and Space toggles', async () => {
    const user = userEvent.setup();
    render(<Multi />);
    await user.tab();
    expect(chip('Alpha')).toHaveFocus();
    await user.tab();
    expect(chip('Bravo')).toHaveFocus();
    await user.tab();
    expect(chip('Charlie')).toHaveFocus();
    await user.keyboard(' ');
    expect(chip('Charlie')).toBeChecked();
    await user.keyboard(' ');
    expect(chip('Charlie')).not.toBeChecked();
  });

  it('multi-choice toggles items on and off independently', async () => {
    const user = userEvent.setup();
    render(<Multi />);
    await user.click(chip('Alpha'));
    await user.click(chip('Bravo'));
    expect(chip('Alpha')).toBeChecked();
    expect(chip('Bravo')).toBeChecked();
    await user.click(chip('Alpha'));
    expect(chip('Alpha')).not.toBeChecked();
    expect(chip('Bravo')).toBeChecked();
  });
});


