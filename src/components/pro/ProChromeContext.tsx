'use client';

import { createContext, useCallback, useContext, useMemo, useState } from 'react';
import type { ReactNode } from 'react';

export interface ProChromeState {
  tag: 'PRO';
  /** Present only for a signed-in Pro_User. */
  onLogout?: () => void;
}

interface ProChromeContextValue {
  chrome: ProChromeState | null;
  /** Registers the Pro chrome and returns a function that clears it. */
  registerProChrome(next: ProChromeState): () => void;
}

const noopRegister = (): (() => void) => () => {};

const ProChromeContext = createContext<ProChromeContextValue>({
  chrome: null,
  registerProChrome: noopRegister,
});

/** Wraps the header and the page content so both see the same registration. */
export function ProChromeProvider({ children }: { children: ReactNode }) {
  const [chrome, setChrome] = useState<ProChromeState | null>(null);

  const registerProChrome = useCallback((next: ProChromeState) => {
    setChrome(next);
    return () => {
      setChrome((current) => (current === next ? null : current));
    };
  }, []);

  const value = useMemo(() => ({ chrome, registerProChrome }), [chrome, registerProChrome]);
  return <ProChromeContext.Provider value={value}>{children}</ProChromeContext.Provider>;
}

export function useProChrome(): ProChromeContextValue {
  return useContext(ProChromeContext);
}
