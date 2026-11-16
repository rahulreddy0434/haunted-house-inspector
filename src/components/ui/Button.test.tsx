import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Button } from './Button';
import { expectFocusVisible, expectHauntedPartners, expectNoMotion } from './testHelpers';

// Validates: Requirements 10.1, 10.8

describe('Button', () => {
  it('defaults to type="button" and calls onClick', async () => {
    const onClick = vi.fn();
    render(<Button onClick={onClick}>Go</Button>);
    const button = screen.getByRole('button', { name: 'Go' });
    expect(button.getAttribute('type')).toBe('button');
    await userEvent.click(button);
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('passes native attributes through, including type override', () => {
    render(
      <Button type="submit" aria-label="Send it" data-testid="b">
        Send
      </Button>,
    );
    const button = screen.getByTestId('b');
    expect(button.getAttribute('type')).toBe('submit');
    expect(button.getAttribute('aria-label')).toBe('Send it');
  });

  it('does not call onClick when disabled', async () => {
    const onClick = vi.fn();
    render(
      <Button disabled onClick={onClick}>
        Go
      </Button>,
    );
    const button = screen.getByRole('button') as HTMLButtonElement;
    expect(button.disabled).toBe(true);
    await userEvent.click(button);
    expect(onClick).not.toHaveBeenCalled();
  });

  it.each(['primary', 'secondary'] as const)(
    '%s variant has focus-visible classes, no motion and haunted partners',
    (variant) => {
      render(<Button variant={variant}>Go</Button>);
      const button = screen.getByRole('button');
      expectFocusVisible(button);
      expectNoMotion(button);
      expectHauntedPartners(button);
    },
  );

  it('uses different styling per variant', () => {
    const { rerender } = render(<Button variant="primary">Go</Button>);
    const primary = screen.getByRole('button').className;
    rerender(<Button variant="secondary">Go</Button>);
    expect(screen.getByRole('button').className).not.toBe(primary);
  });
});
