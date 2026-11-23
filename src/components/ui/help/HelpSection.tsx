'use client';

import { useId } from 'react';
import { HelpForm } from '@/components/ui/help/HelpForm';
import { CARD, HEADING } from '@/components/ui/styles';
import { HELP_HEADING } from '@/lib/help/copy';
import type { HelpPage } from '@/lib/help/schema';
import type { ChatSide } from '@/types/chat';

export interface HelpSectionProps {
  page: HelpPage;
  jobId?: string;
  /** Defaults to tradesperson on /pro pages and homeowner elsewhere. */
  side?: ChatSide;
}

export function HelpSection({ page, jobId, side }: HelpSectionProps) {
  const headingId = useId();
  const resolvedSide: ChatSide =
    side ?? (page === '/pro' || page === '/pro/jobs' ? 'tradesperson' : 'homeowner');

  return (
    <section aria-labelledby={headingId} className={`${CARD} space-y-3`}>
      <h2 id={headingId} className={HEADING}>
        {HELP_HEADING}
      </h2>
      <HelpForm page={page} side={resolvedSide} jobId={jobId} />
    </section>
  );
}
