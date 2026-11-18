'use client';

import { useLayoutEffect } from 'react';
import { useTheme } from '@/components/ThemeProvider';

/**
 * Mount on an Emergency_Page. While mounted the effective theme is Normal.
 * Uses useLayoutEffect so the class is removed before the browser paints.
 * The cleanup restores the stored theme when the page is left.
 */
export function EmergencyScope(): null {
  const { registerEmergencyScope } = useTheme();
  useLayoutEffect(() => registerEmergencyScope(), [registerEmergencyScope]);
  return null;
}
