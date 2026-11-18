'use client';

import {
  createContext,
  useCallback,
  useContext,
  useLayoutEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { deriveEffectiveTheme } from '@/lib/haunted/effectiveTheme';
import { applyTheme, readStoredTheme, storeTheme, type Theme } from '@/lib/theme';

export interface ThemeContextValue {
  /** What the user chose; mirrors hhi_theme. */
  setting: Theme;
  /** What is on screen. */
  effective: Theme;
  /** True while at least one emergency scope is mounted. */
  inEmergency: boolean;
  setSetting(next: Theme): void;
  registerEmergencyScope(): () => void;
}

const noop = (): void => {};
const noopRegister = (): (() => void) => noop;

const DEFAULT_CONTEXT: ThemeContextValue = {
  setting: 'normal',
  effective: 'normal',
  inEmergency: false,
  setSetting: noop,
  registerEmergencyScope: noopRegister,
};

const ThemeContext = createContext<ThemeContextValue>(DEFAULT_CONTEXT);

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [setting, setSettingState] = useState<Theme>('normal');
  const [scopes, setScopes] = useState(0);
  const [ready, setReady] = useState(false);

  // Read storage before paint. The inline head script already set the class.
  useLayoutEffect(() => {
    setSettingState(readStoredTheme());
    setReady(true);
  }, []);

  const effective: Theme = ready ? deriveEffectiveTheme(setting, scopes) : 'normal';

  useLayoutEffect(() => {
    if (ready) applyTheme(effective);
  }, [ready, effective]);

  const setSetting = useCallback(
    (next: Theme) => {
      if (scopes > 0) return;
      setSettingState(next);
      storeTheme(next);
    },
    [scopes],
  );

  const registerEmergencyScope = useCallback(() => {
    let active = true;
    setScopes((n) => n + 1);
    return () => {
      if (!active) return;
      active = false;
      setScopes((n) => Math.max(0, n - 1));
    };
  }, []);

  const value = useMemo<ThemeContextValue>(
    () => ({
      setting,
      effective,
      inEmergency: scopes > 0,
      setSetting,
      registerEmergencyScope,
    }),
    [setting, effective, scopes, setSetting, registerEmergencyScope],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

/** Outside a provider this returns a Normal, no-op value. */
export function useTheme(): ThemeContextValue {
  return useContext(ThemeContext);
}
