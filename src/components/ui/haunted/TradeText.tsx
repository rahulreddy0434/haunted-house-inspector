'use client';

import { useTheme } from '@/components/ThemeProvider';
import { mapTrade } from '@/lib/haunted/tradeMapper';
import { ArtBoundary } from './ArtBoundary';
import { GhostIcon } from './GhostIcon';

export interface TradeTextProps {
  trade: string;
  /** Applied to the element holding the real trade. */
  className?: string;
}

/** The real trade, unchanged, plus a ghost chip only while Haunted. */
export function TradeText({ trade, className }: TradeTextProps) {
  const { effective } = useTheme();
  const ghost = effective === 'haunted' ? mapTrade(trade) : null;
  return (
    <>
      <span className={className}>{trade}</span>
      {ghost ? (
        <span
          data-ghost
          className="ml-2 inline-flex items-center gap-1 rounded-full border border-haunted-border bg-haunted-field px-2 py-0.5 text-sm text-haunted-text"
        >
          <ArtBoundary>
            <GhostIcon />
          </ArtBoundary>
          {ghost.label}
        </span>
      ) : null}
    </>
  );
}
