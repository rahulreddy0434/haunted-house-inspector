import type { Theme } from '@/lib/theme';

/** The theme on screen: any mounted emergency scope forces Normal. */
export function deriveEffectiveTheme(setting: Theme, emergencyScopes: number): Theme {
  return emergencyScopes > 0 ? 'normal' : setting;
}
