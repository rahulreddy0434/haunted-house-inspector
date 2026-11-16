import { describe, expect, it, vi } from 'vitest';
import { useState } from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { TextField } from './TextField';
import { expectFocusVisible, expectHauntedPartners, expectNoMotion } from './testHelpers';

// Validates: Requirements 10.1, 10.8

function Controlled({ onValue, ...props }: { onValue?: (v: string) => void; error?: string | null; count?: string; disabled?: boolean }) {
  const [value, setValue] = useState('');
  return (
    <TextField
      label="Your note"
      value={value}
      onChange={(v) => {
        setValue(v);
        onValue?.(v);
      }}
      {...props}
    />
  );
}

describe('TextField', () => {
  it('links the label to the control', () => {
    render(<Controlled />);
    const control = screen.getByLabelText('Your note');
    expect(control.tagName).toBe('INPUT');
    expect(control.id).not.toBe('');
  });

  it('calls onChange with the string value', async () => {
    const onValue = vi.fn();
    render(<Controlled onValue={onValue} />);
    await userEvent.type(screen.getByLabelText('Your note'), 'hi');
    expect(onValue).toHaveBeenNthCalledWith(1, 'h');
    expect(onValue).toHaveBeenLastCalledWith('hi');
  });

  it('has no aria-describedby, aria-invalid or alert without count or error', () => {
    render(<Controlled />);
    const control = screen.getByLabelText('Your note');
    expect(control.hasAttribute('aria-describedby')).toBe(false);
    expect(control.hasAttribute('aria-invalid')).toBe(false);
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('describes the control by the count only when a count is rendered', () => {
    render(<Controlled count="3 / 200" />);
    const control = screen.getByLabelText('Your note');
    const count = screen.getByText('3 / 200');
    expect(control.getAttribute('aria-describedby')).toBe(count.id);
    expect(count.id).not.toBe('');
  });

  it('describes the control by the error only, and marks it invalid with role="alert"', () => {
    render(<Controlled error="Please add a note." />);
    const control = screen.getByLabelText('Your note');
    const alert = screen.getByRole('alert');
    expect(alert.textContent).toBe('Please add a note.');
    expect(control.getAttribute('aria-describedby')).toBe(alert.id);
    expect(control.getAttribute('aria-invalid')).toBe('true');
  });

  it('lists both count and error ids when both are rendered', () => {
    render(<Controlled count="3 / 200" error="Too short." />);
    const control = screen.getByLabelText('Your note');
    const ids = (control.getAttribute('aria-describedby') ?? '').split(' ');
    expect(ids).toEqual([screen.getByText('3 / 200').id, screen.getByRole('alert').id]);
  });

  it('treats a null error as no error', () => {
    render(<Controlled error={null} />);
    expect(screen.queryByRole('alert')).toBeNull();
    expect(screen.getByLabelText('Your note').hasAttribute('aria-invalid')).toBe(false);
  });

  it('supports the disabled state', async () => {
    const onValue = vi.fn();
    render(<Controlled disabled onValue={onValue} />);
    const control = screen.getByLabelText('Your note') as HTMLInputElement | HTMLTextAreaElement;
    expect(control.disabled).toBe(true);
    await userEvent.type(control, 'x');
    expect(onValue).not.toHaveBeenCalled();
  });

  it('has focus-visible classes, no motion classes and haunted partners', () => {
    render(<Controlled error="Oops" />);
    const control = screen.getByLabelText('Your note');
    expectFocusVisible(control);
    expectNoMotion(control);
    expectHauntedPartners(control);
    expectNoMotion(screen.getByRole('alert'));
    expectHauntedPartners(screen.getByRole('alert'));
  });
});
