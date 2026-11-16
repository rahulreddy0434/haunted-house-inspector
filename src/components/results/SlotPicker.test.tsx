import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { SlotPicker } from './SlotPicker';

// Validates: Requirements 6.5, 9.6, 9.7

process.env.TZ = 'America/Toronto';

const A = '2026-03-05T20:00:00.000Z';
const B = '2026-03-06T15:00:00.000Z';
const C = '2026-03-07T18:30:00.000Z';

afterEach(cleanup);

function setup(
  props: Partial<{ slots: readonly string[]; booking: boolean; error: string | null }> = {},
) {
  const onConfirm = vi.fn<(slot: string) => void>();
  const ui = (p: typeof props) => (
    <SlotPicker slots={p.slots ?? [A, B, C]} booking={p.booking ?? false} error={p.error} onConfirm={onConfirm} />
  );
  const view = render(ui(props));
  return { onConfirm, rerender: (p: typeof props) => view.rerender(ui(p)) };
}

const confirmButton = () => screen.getByRole('button', { name: 'Confirm this time' });

describe('SlotPicker', () => {
  it('renders radios in a fieldset group named "Pick a time" sharing one name', () => {
    setup();
    const group = screen.getByRole('group', { name: 'Pick a time' });
    expect(group.tagName).toBe('FIELDSET');
    const radios = within(group).getAllByRole('radio');
    expect(radios).toHaveLength(3);
    const names = new Set(radios.map((r) => r.getAttribute('name')));
    expect(names.size).toBe(1);
    expect([...names][0]).toBeTruthy();
  });

  it('orders slots ascending even when passed unsorted', () => {
    setup({ slots: [C, A, B] });
    const values = screen.getAllByRole('radio').map((r) => (r as HTMLInputElement).value);
    expect(values).toEqual([A, B, C]);
  });

  it('labels each slot with a <time dateTime> and a zone name', () => {
    setup();
    for (const slot of [A, B, C]) {
      const radio = screen
        .getAllByRole('radio')
        .find((r) => (r as HTMLInputElement).value === slot) as HTMLInputElement;
      const label = radio.labels?.[0];
      const time = label?.querySelector('time');
      expect(time?.getAttribute('datetime')).toBe(slot);
      expect(time?.textContent).toMatch(/\b(?:[A-Z]{2,5}|GMT[+-]\d+|UTC)\s*$/);
    }
  });

  it('disables confirm until a slot is selected, and while booking', async () => {
    const user = userEvent.setup();
    const { rerender } = setup();
    expect(confirmButton()).toBeDisabled();
    await user.click(screen.getAllByRole('radio')[0]);
    expect(confirmButton()).toBeEnabled();
    rerender({ booking: true });
    expect(confirmButton()).toBeDisabled();
  });

  it('calls onConfirm with the chosen slot', async () => {
    const user = userEvent.setup();
    const { onConfirm } = setup({ slots: [C, A, B] });
    await user.click(screen.getAllByRole('radio')[1]);
    await user.click(confirmButton());
    expect(onConfirm).toHaveBeenCalledTimes(1);
    expect(onConfirm).toHaveBeenCalledWith(B);
  });

  it('supports keyboard selection: Tab focuses the group, Space selects', async () => {
    const user = userEvent.setup();
    const { onConfirm } = setup();
    await user.tab();
    const radios = screen.getAllByRole('radio');
    expect(radios[0]).toHaveFocus();
    await user.keyboard(' ');
    expect(radios[0]).toBeChecked();
    await user.tab();
    expect(confirmButton()).toHaveFocus();
    await user.keyboard('{Enter}');
    expect(onConfirm).toHaveBeenCalledWith(A);
  });

  it('moves selection between radios with the arrow keys', async () => {
    const user = userEvent.setup();
    setup();
    const radios = screen.getAllByRole('radio');
    await user.click(radios[0]);
    await user.keyboard('{ArrowDown}');
    expect(radios[1]).toBeChecked();
    expect(radios[1]).toHaveFocus();
  });

  it('clears the selection when the chosen slot is removed from props', async () => {
    const user = userEvent.setup();
    const { rerender } = setup();
    await user.click(screen.getAllByRole('radio')[1]);
    expect(confirmButton()).toBeEnabled();
    rerender({ slots: [A, C] });
    expect(screen.getAllByRole('radio').some((r) => (r as HTMLInputElement).checked)).toBe(false);
    expect(confirmButton()).toBeDisabled();
  });

  it('shows error text in role="alert"', () => {
    setup({ error: 'That time was just taken.' });
    expect(screen.getByRole('alert')).toHaveTextContent('That time was just taken.');
  });

  it('shows no alert without an error', () => {
    setup();
    expect(screen.queryByRole('alert')).toBeNull();
  });
});
