import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { EMERGENCY_MESSAGE, EmergencyBanner } from './EmergencyBanner';

// Hard-coded on purpose (Requirement 6.4) so a typo in the component is caught.
const REQUIRED_MESSAGE =
  'This may be dangerous. Get everyone to safety and call 911. For a gas smell, leave the home first, then call 911 or your gas utility from outside.';

afterEach(cleanup);

describe('EmergencyBanner (Requirement 6.4)', () => {
  it('exports the exact required message', () => {
    expect(EMERGENCY_MESSAGE).toBe(REQUIRED_MESSAGE);
  });

  it('renders exactly the required message for emergency', () => {
    render(<EmergencyBanner urgency="emergency" />);
    const el = screen.getByText(REQUIRED_MESSAGE, { exact: true });
    expect(el.tagName).toBe('P');
    expect(el.textContent).toBe(REQUIRED_MESSAGE);
  });

  it('has role="alert"', () => {
    render(<EmergencyBanner urgency="emergency" />);
    expect(screen.getByRole('alert')).toBeTruthy();
  });

  it.each(['urgent', 'soon', 'monitor'] as const)('renders nothing for %s', (urgency) => {
    const { container } = render(<EmergencyBanner urgency={urgency} />);
    expect(container.innerHTML).toBe('');
    expect(screen.queryByRole('alert')).toBeNull();
    expect(screen.queryByText(REQUIRED_MESSAGE)).toBeNull();
  });

  it('contains no extra advice beyond the message (ignoring the aria-hidden symbol)', () => {
    render(<EmergencyBanner urgency="emergency" />);
    const alert = screen.getByRole('alert');
    const clone = alert.cloneNode(true) as HTMLElement;
    clone.querySelectorAll('[aria-hidden="true"]').forEach((n) => n.remove());
    expect((clone.textContent ?? '').trim()).toBe(REQUIRED_MESSAGE);
  });
});
