// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, fireEvent, render } from '@testing-library/react';
import fc from 'fast-check';
import { ThemeProvider } from './ThemeProvider';
import { ThemeToggle } from './ThemeToggle';
import { EmergencyScope } from '@/components/ui/haunted/EmergencyScope';
import { HAUNTED_CLASS, THEME_STORAGE_KEY } from '@/lib/theme';

// Feature: haunted-mode, Property 5: Effective theme follows the model
// **Validates: Requirements 12.4, 12.5, 12.6, 13.3, 13.5, 17.13**

type Op = 'toggle' | 'mountScope' | 'unmountScope' | 'remount';
type Stored = 'haunted' | 'normal' | null;

const SWITCH_SELECTOR = '[role="switch"], button[aria-label="Haunted theme"]';

function Page({ scopes }: { scopes: number }) {
  return (
    <ThemeProvider>
      <ThemeToggle />
      {Array.from({ length: scopes }, (_, i) => (
        <EmergencyScope key={i} />
      ))}
    </ThemeProvider>
  );
}

/** What the inline head script does before React runs. */
function simulateHeadScript(): void {
  const root = document.documentElement;
  root.classList.toggle(HAUNTED_CLASS, window.localStorage.getItem(THEME_STORAGE_KEY) === 'haunted');
}

function switchState(el: Element): boolean {
  const checked = el.getAttribute('aria-checked') ?? el.getAttribute('aria-pressed');
  return checked === 'true';
}

afterEach(() => {
  cleanup();
  window.localStorage.clear();
  document.documentElement.classList.remove(HAUNTED_CLASS);
});

describe('Property 5: effective theme follows the model', () => {
  it('root class, switch and storage match the model after every operation', () => {
    const opArb = fc.constantFrom<Op>('toggle', 'mountScope', 'unmountScope', 'remount');
    fc.assert(
      fc.property(
        fc.constantFrom<Stored>('haunted', 'normal', null),
        fc.array(opArb, { minLength: 1, maxLength: 25 }),
        (initial, ops) => {
          cleanup();
          window.localStorage.clear();
          document.documentElement.classList.remove(HAUNTED_CLASS);
          if (initial !== null) window.localStorage.setItem(THEME_STORAGE_KEY, initial);
          simulateHeadScript();

          // Pure model.
          let setting: 'haunted' | 'normal' = initial === 'haunted' ? 'haunted' : 'normal';
          let scopes = 0;
          let stored: Stored = initial;

          let view = render(<Page scopes={scopes} />);
          const check = (label: string): void => {
            const root = document.documentElement;
            expect(root.classList.contains(HAUNTED_CLASS), `class after ${label}`).toBe(
              scopes === 0 && setting === 'haunted',
            );
            const switches = document.querySelectorAll(SWITCH_SELECTOR);
            expect(switches.length, `switch count after ${label}`).toBe(scopes === 0 ? 1 : 0);
            if (scopes === 0) {
              expect(switchState(switches[0]!), `switch state after ${label}`).toBe(setting === 'haunted');
            }
            expect(window.localStorage.getItem(THEME_STORAGE_KEY), `storage after ${label}`).toBe(stored);
          };

          try {
            check('initial render');
            for (const op of ops) {
              if (op === 'toggle') {
                const el = document.querySelector(SWITCH_SELECTOR);
                if (el === null) {
                  // A toggle is only possible while the switch is present.
                  expect(scopes).toBeGreaterThan(0);
                  continue;
                }
                fireEvent.click(el);
                setting = setting === 'haunted' ? 'normal' : 'haunted';
                stored = setting;
              } else if (op === 'mountScope') {
                scopes += 1;
                view.rerender(<Page scopes={scopes} />);
              } else if (op === 'unmountScope') {
                if (scopes === 0) continue;
                scopes -= 1;
                view.rerender(<Page scopes={scopes} />);
              } else {
                // Full page load: new tree, no scopes, setting read from storage, head script ran first.
                view.unmount();
                scopes = 0;
                setting = stored === 'haunted' ? 'haunted' : 'normal';
                simulateHeadScript();
                view = render(<Page scopes={scopes} />);
              }
              check(op);
            }
            // After every scope is gone, class and switch match the setting again.
            scopes = 0;
            view.rerender(<Page scopes={0} />);
            check('all scopes unmounted');
          } finally {
            view.unmount();
          }
        },
      ),
      { numRuns: 100 },
    );
  });

  it('a stored setting survives an emergency scope and returns when it unmounts', () => {
    window.localStorage.setItem(THEME_STORAGE_KEY, 'haunted');
    simulateHeadScript();
    const view = render(<Page scopes={1} />);
    expect(document.documentElement.classList.contains(HAUNTED_CLASS)).toBe(false);
    expect(document.querySelector(SWITCH_SELECTOR)).toBeNull();
    view.rerender(<Page scopes={0} />);
    expect(document.documentElement.classList.contains(HAUNTED_CLASS)).toBe(true);
    expect(switchState(document.querySelector(SWITCH_SELECTOR)!)).toBe(true);
    expect(window.localStorage.getItem(THEME_STORAGE_KEY)).toBe('haunted');
  });
});
