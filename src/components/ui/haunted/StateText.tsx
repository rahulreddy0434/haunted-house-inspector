'use client';

import type { AriaRole } from 'react';
import { useTheme } from '@/components/ThemeProvider';
import { HAUNTED_COPY, type HauntedCopyKey } from '@/lib/haunted/hauntedCopy';

export interface StateTextProps {
  /** The plain line. Always shown. */
  plain: string;
  /** Key of the haunted line, shown after the plain line only while Haunted. */
  hauntedKey: HauntedCopyKey;
  role?: AriaRole;
  className?: string;
}

/** Plain line in its own span; haunted line in a second span while Haunted. */
export function StateText({ plain, hauntedKey, role, className }: StateTextProps) {
  const { effective } = useTheme();
  return (
    <p role={role} className={className}>
      <span>{plain}</span>
      {effective === 'haunted' ? (
        <span className="block">{HAUNTED_COPY[hauntedKey]}</span>
      ) : null}
    </p>
  );
}
