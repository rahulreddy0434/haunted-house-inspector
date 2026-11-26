import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { InspectionPanel } from '@/components/intake/InspectionPanel';
import { initialIntakeState } from '@/lib/intake/intakeReducer';
import { STICKY_PANEL } from '@/components/ui/styles';

// Validates: Requirements 17.2, 17.3, 17.4, 17.6, 17.9

afterEach(cleanup);

const choices = initialIntakeState.choices;

describe('InspectionPanel', () => {
  it('is titled "Your inspection", hidden below lg, and uses STICKY_PANEL without an inner scroll box', () => {
    render(<InspectionPanel step={1} choices={choices} files={null} onGoTo={vi.fn()} />);
    const panel = screen.getByRole('complementary', { hidden: true });
    expect(screen.getByRole('heading', { name: 'Your inspection', hidden: true })).toBeTruthy();
    expect(panel.className).toContain('hidden lg:block');
    expect(panel.className).not.toMatch(/overflow|max-h-|\btall:/);
    expect(panel.innerHTML).not.toMatch(/overflow-y|max-h-|overflow-auto/);
  });

  it('has no sticky classes when the panel does not fit (jsdom measures 0), and never a scroll box', () => {
    render(<InspectionPanel step={1} choices={choices} files={null} onGoTo={vi.fn()} />);
    const panel = screen.getByRole('complementary', { hidden: true });
    expect(panel.className).not.toContain('sticky');
  });

  it('adds STICKY_PANEL (lg:sticky lg:top-4) when the whole panel fits in the window', () => {
    const rect = vi
      .spyOn(Element.prototype, 'getBoundingClientRect')
      .mockReturnValue({ height: 600 } as DOMRect);
    const original = window.innerHeight;
    Object.defineProperty(window, 'innerHeight', { configurable: true, value: 900 });
    try {
      render(<InspectionPanel step={1} choices={choices} files={null} onGoTo={vi.fn()} />);
      const panel = screen.getByRole('complementary', { hidden: true });
      expect(STICKY_PANEL).toBe('lg:sticky lg:top-4');
      expect(panel.className).toContain(STICKY_PANEL);
      expect(panel.className).toContain('hidden lg:block');
      expect(panel.className).not.toMatch(/overflow|max-h-/);
    } finally {
      rect.mockRestore();
      Object.defineProperty(window, 'innerHeight', { configurable: true, value: original });
    }
  });

  it('makes finished steps buttons, marks the current step, and leaves later steps plain', async () => {
    const onGoTo = vi.fn();
    render(<InspectionPanel step={3} choices={choices} files={null} onGoTo={onGoTo} />);
    const first = screen.getByRole('button', { name: /Step 1/, hidden: true });
    expect(screen.getByRole('button', { name: /Step 2/, hidden: true })).toBeTruthy();
    expect(screen.queryByRole('button', { name: /Step 3/, hidden: true })).toBeNull();
    expect(screen.getByText('Current step')).toBeTruthy();
    await userEvent.setup().click(first);
    expect(onGoTo).toHaveBeenCalledWith(1);
  });

  it('has no buttons for later steps on step 1', () => {
    render(<InspectionPanel step={1} choices={choices} files={null} onGoTo={vi.fn()} />);
    expect(screen.queryAllByRole('button', { hidden: true })).toHaveLength(0);
  });

  it('shows the Step 3 review text for the same choices', () => {
    render(
      <InspectionPanel
        step={2}
        choices={{ ...choices, safety: ['gas'], location: 'Kitchen', duration: 'A few weeks' }}
        files={null}
        onGoTo={vi.fn()}
      />,
    );
    expect(screen.getByText('I smell gas')).toBeTruthy();
    expect(screen.getByText('Kitchen')).toBeTruthy();
    expect(screen.getByText('A few weeks')).toBeTruthy();
    expect(screen.getByText('Nothing added')).toBeTruthy();
  });

  it('shows "None selected" with no safety answers', () => {
    render(<InspectionPanel step={1} choices={choices} files={null} onGoTo={vi.fn()} />);
    expect(screen.getByText('None selected')).toBeTruthy();
  });
});
