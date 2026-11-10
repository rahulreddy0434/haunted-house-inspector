import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { DataRetentionNotice } from './DataRetentionNotice';

type IOCallback = (entries: Array<{ isIntersecting: boolean; intersectionRatio: number }>) => void;

interface FakeObserver {
  callback: IOCallback;
  options: IntersectionObserverInit | undefined;
  observe: ReturnType<typeof vi.fn>;
  unobserve: ReturnType<typeof vi.fn>;
  disconnect: ReturnType<typeof vi.fn>;
  trigger: (isIntersecting: boolean, intersectionRatio?: number) => void;
}

let instances: FakeObserver[] = [];

function installFakeObserver(): void {
  class FakeIntersectionObserver {
    callback: IOCallback;
    options: IntersectionObserverInit | undefined;
    observe = vi.fn();
    unobserve = vi.fn();
    disconnect = vi.fn();
    constructor(callback: IOCallback, options?: IntersectionObserverInit) {
      this.callback = callback;
      this.options = options;
      instances.push(this as unknown as FakeObserver);
    }
    trigger(isIntersecting: boolean, intersectionRatio = isIntersecting ? 1 : 0): void {
      this.callback([{ isIntersecting, intersectionRatio }]);
    }
  }
  vi.stubGlobal('IntersectionObserver', FakeIntersectionObserver);
}

describe('DataRetentionNotice', () => {
  beforeEach(() => {
    instances = [];
    installFakeObserver();
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it('creates an observer with threshold 0.9 and observes the notice', () => {
    render(<DataRetentionNotice onVisible={vi.fn()} />);
    expect(instances).toHaveLength(1);
    expect(instances[0].options).toEqual({ threshold: 0.9 });
    expect(instances[0].observe).toHaveBeenCalledTimes(1);
  });

  it('does not call onVisible on mount or when not intersecting', () => {
    const onVisible = vi.fn();
    render(<DataRetentionNotice onVisible={onVisible} />);
    expect(onVisible).not.toHaveBeenCalled();
    instances[0].trigger(false, 0.5);
    expect(onVisible).not.toHaveBeenCalled();
  });

  it('fires exactly once on first intersection and not again afterwards', () => {
    const onVisible = vi.fn();
    render(<DataRetentionNotice onVisible={onVisible} />);
    instances[0].trigger(true, 0.95);
    expect(onVisible).toHaveBeenCalledTimes(1);
    expect(instances[0].disconnect).toHaveBeenCalled();
    instances[0].trigger(true, 1);
    instances[0].trigger(true, 1);
    expect(onVisible).toHaveBeenCalledTimes(1);
  });

  it('does not fire again after re-render with a new callback', () => {
    const first = vi.fn();
    const second = vi.fn();
    const { rerender } = render(<DataRetentionNotice onVisible={first} />);
    instances[0].trigger(true);
    expect(first).toHaveBeenCalledTimes(1);

    rerender(<DataRetentionNotice onVisible={second} />);
    instances[0].trigger(true);
    expect(first).toHaveBeenCalledTimes(1);
    expect(second).not.toHaveBeenCalled();
    expect(instances).toHaveLength(1);
  });

  it('disconnects on unmount before any intersection and never fires', () => {
    const onVisible = vi.fn();
    const { unmount } = render(<DataRetentionNotice onVisible={onVisible} />);
    unmount();
    expect(instances[0].disconnect).toHaveBeenCalled();
    expect(onVisible).not.toHaveBeenCalled();
  });

  it('falls back to calling onVisible once on mount when IntersectionObserver is unavailable', () => {
    vi.stubGlobal('IntersectionObserver', undefined);
    const onVisible = vi.fn();
    const { rerender } = render(<DataRetentionNotice onVisible={onVisible} />);
    expect(onVisible).toHaveBeenCalledTimes(1);
    rerender(<DataRetentionNotice onVisible={onVisible} />);
    expect(onVisible).toHaveBeenCalledTimes(1);
    expect(instances).toHaveLength(0);
  });

  it('shows a heading, mentions 30 days, and avoids technical jargon', () => {
    const { container } = render(<DataRetentionNotice onVisible={vi.fn()} />);
    expect(screen.getByRole('heading')).toBeTruthy();
    const text = container.textContent ?? '';
    expect(text).toMatch(/30 days/);
    for (const word of ['S3', 'bucket', 'AWS', 'encrypted at rest']) {
      expect(text).not.toContain(word);
    }
  });
});
