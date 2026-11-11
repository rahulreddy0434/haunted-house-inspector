import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { CostRange } from './CostRange';
import type { UrgencyLevel } from '@/types/inspection';

afterEach(cleanup);

const NON_EMERGENCY: UrgencyLevel[] = ['urgent', 'soon', 'monitor'];
const LABEL = 'rough range, not a quote';

describe('CostRange', () => {
  describe.each(NON_EMERGENCY)('urgency %s', (urgency) => {
    it('renders the CAD range with an en dash', () => {
      render(<CostRange costRangeLow={1200} costRangeHigh={2400} urgency={urgency} />);
      expect(screen.getByText('CA$1,200 – CA$2,400')).toBeTruthy();
    });

    it('always shows the exact label', () => {
      render(<CostRange costRangeLow={1200} costRangeHigh={2400} urgency={urgency} />);
      expect(screen.getByText(LABEL)).toBeTruthy();
    });

    it('shows the label for a single-amount case', () => {
      render(<CostRange costRangeLow={500} costRangeHigh={500} urgency={urgency} />);
      expect(screen.getByText('CA$500')).toBeTruthy();
      expect(screen.getByText(LABEL)).toBeTruthy();
    });

    it('has no currency selector', () => {
      render(<CostRange costRangeLow={1200} costRangeHigh={2400} urgency={urgency} />);
      expect(screen.queryByRole('combobox')).toBeNull();
      expect(screen.queryByRole('listbox')).toBeNull();
    });
  });

  it('formats CAD with no decimals', () => {
    render(<CostRange costRangeLow={1234.56} costRangeHigh={1234.56} urgency="soon" />);
    expect(screen.getByText('CA$1,235')).toBeTruthy();
    cleanup();
    render(<CostRange costRangeLow={0} costRangeHigh={0} urgency="soon" />);
    expect(screen.getByText('CA$0')).toBeTruthy();
    cleanup();
    render(<CostRange costRangeLow={999999} costRangeHigh={999999} urgency="soon" />);
    expect(screen.getByText('CA$999,999')).toBeTruthy();
  });

  it('renders nothing for emergency, even with non-zero costs', () => {
    const { container } = render(
      <CostRange costRangeLow={1200} costRangeHigh={2400} urgency="emergency" />,
    );
    expect(container.innerHTML).toBe('');
    expect(screen.queryByText(LABEL)).toBeNull();
    expect(screen.queryByText(/CA\$/)).toBeNull();
  });
});
