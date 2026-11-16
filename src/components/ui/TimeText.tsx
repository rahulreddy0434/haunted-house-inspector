'use client';

import { formatDateTime } from '@/lib/utils/formatDateTime';

export interface TimeTextProps {
  /** UTC ISO timestamp. Used as the `dateTime` attribute. */
  iso: string;
  className?: string;
}

export function TimeText({ iso, className }: TimeTextProps) {
  return (
    <time dateTime={iso} className={className}>
      {formatDateTime(iso)}
    </time>
  );
}
