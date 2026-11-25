'use client';

import { useLayoutEffect, useRef } from 'react';
import { useProChrome } from '@/components/pro/ProChromeContext';

export interface ProChromeProps {
  /** True only for a signed-in Pro_User. The access code form passes false. */
  loggedIn: boolean;
  onLogout: () => void;
}

/**
 * Mount on every /pro page. While mounted the header shows the "PRO" tag and,
 * when `loggedIn` is true, a "Log out" button that calls `onLogout`.
 */
export function ProChrome({ loggedIn, onLogout }: ProChromeProps): null {
  const { registerProChrome } = useProChrome();
  const latest = useRef(onLogout);
  useLayoutEffect(() => {
    latest.current = onLogout;
  });

  useLayoutEffect(
    () =>
      registerProChrome({
        tag: 'PRO',
        onLogout: loggedIn ? () => latest.current() : undefined,
      }),
    [registerProChrome, loggedIn],
  );
  return null;
}
