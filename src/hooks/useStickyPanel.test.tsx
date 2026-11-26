import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, render } from '@testing-library/react';
import { useStickyPanel } from '@/hooks/useStickyPanel';
import { STICKY_PANEL } from '@/components/ui/styles';

// Validates: Requirement 17.9

let panelHeight = 600;
let observers: MockResizeObserver[] = [];

class MockResizeObserver {
  observed: Element[] = [];
  disconnected = false;
  constructor(public callback: ResizeObserverCallback) {
    observers.push(this);
  }
  observe(target: Element) {
    this.observed.push(target);
  }
  unobserve() {}
  disconnect() {
    this.disconnected = true;
  }
  trigger() {
    this.callback([], this as unknown as ResizeObserver);
  }
}

function setWindowHeight(value: number) {
  Object.defineProperty(window, 'innerHeight', { configurable: true, value });
}

function Probe() {
  const { ref, sticky, className } = useStickyPanel<HTMLDivElement>();
  return (
    <div ref={ref} data-testid="panel" data-sticky={String(sticky)} className={className}>
      panel
    </div>
  );
}

const originalHeight = window.innerHeight;

beforeEach(() => {
  panelHeight = 600;
  observers = [];
  vi.stubGlobal('ResizeObserver', MockResizeObserver);
  vi.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(
    () => ({ height: panelHeight }) as DOMRect,
  );
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  setWindowHeight(originalHeight);
});

describe('useStickyPanel', () => {
  it('sticks when the panel and the 16 px offset fit in the window', () => {
    setWindowHeight(900);
    const { getByTestId } = render(<Probe />);
    const el = getByTestId('panel');
    expect(el.dataset.sticky).toBe('true');
    expect(el.className).toBe(STICKY_PANEL);
  });

  it('scrolls with the page (no sticky classes) when the panel does not fit', () => {
    setWindowHeight(500);
    const { getByTestId } = render(<Probe />);
    const el = getByTestId('panel');
    expect(el.dataset.sticky).toBe('false');
    expect(el.className).toBe('');
  });

  it('is not sticky at the first render and uses the boundary: height + 16 equals the window', () => {
    setWindowHeight(616);
    const { getByTestId } = render(<Probe />);
    expect(getByTestId('panel').dataset.sticky).toBe('true');
    cleanup();
    setWindowHeight(615);
    expect(render(<Probe />).getByTestId('panel').dataset.sticky).toBe('false');
  });

  it('re-checks when the window is resized', () => {
    setWindowHeight(900);
    const { getByTestId } = render(<Probe />);
    expect(getByTestId('panel').dataset.sticky).toBe('true');
    act(() => {
      setWindowHeight(400);
      window.dispatchEvent(new Event('resize'));
    });
    expect(getByTestId('panel').dataset.sticky).toBe('false');
    act(() => {
      setWindowHeight(1000);
      window.dispatchEvent(new Event('resize'));
    });
    expect(getByTestId('panel').dataset.sticky).toBe('true');
  });

  it('re-checks when the panel content changes size', () => {
    setWindowHeight(900);
    const { getByTestId } = render(<Probe />);
    expect(observers).toHaveLength(1);
    expect(observers[0].observed).toContain(getByTestId('panel'));
    expect(getByTestId('panel').dataset.sticky).toBe('true');
    act(() => {
      panelHeight = 1200;
      observers[0].trigger();
    });
    expect(getByTestId('panel').dataset.sticky).toBe('false');
    act(() => {
      panelHeight = 300;
      observers[0].trigger();
    });
    expect(getByTestId('panel').dataset.sticky).toBe('true');
  });

  it('stays not sticky for a zero-height (hidden) panel', () => {
    setWindowHeight(900);
    panelHeight = 0;
    expect(render(<Probe />).getByTestId('panel').dataset.sticky).toBe('false');
  });

  it('removes the resize listener and disconnects the observer on unmount', () => {
    setWindowHeight(900);
    const remove = vi.spyOn(window, 'removeEventListener');
    const { unmount } = render(<Probe />);
    unmount();
    expect(observers[0].disconnected).toBe(true);
    expect(remove).toHaveBeenCalledWith('resize', expect.any(Function));
  });

  it('works without ResizeObserver (jsdom) and still follows window resizes', () => {
    vi.unstubAllGlobals();
    vi.stubGlobal('ResizeObserver', undefined);
    setWindowHeight(900);
    const { getByTestId } = render(<Probe />);
    expect(getByTestId('panel').dataset.sticky).toBe('true');
    act(() => {
      setWindowHeight(300);
      window.dispatchEvent(new Event('resize'));
    });
    expect(getByTestId('panel').dataset.sticky).toBe('false');
  });
});
