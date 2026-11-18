import Link from 'next/link';
import type { ProJobListItem } from '@/types/job';
import { UrgencyBadge } from '@/components/results/UrgencyBadge';
import { TimeText } from '@/components/ui/TimeText';
import { BODY, CARD, HEADING, MUTED } from '@/components/ui/styles';
import { PRO_STATUS_LABEL } from '@/lib/jobs/copy';

export interface JobListItemProps {
  job: ProJobListItem;
}

export function JobListItem({ job }: JobListItemProps) {
  const showTrade = job.urgency !== 'emergency' && job.trade !== null;
  return (
    <li>
      <Link
        href={`/pro/jobs/${encodeURIComponent(job.id)}`}
        className={`${CARD} flex flex-col gap-2 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 focus-visible:ring-offset-2 haunted:focus-visible:ring-haunted-accent haunted:focus-visible:ring-offset-haunted-bg`}
      >
        <span className="flex flex-wrap items-center gap-2">
          <UrgencyBadge urgency={job.urgency} />
          {showTrade ? <span className={HEADING}>{job.trade}</span> : null}
        </span>
        <span className={`${BODY} whitespace-pre-wrap break-words`}>{job.location}</span>
        <span className={`${MUTED} flex flex-wrap items-center gap-x-3 gap-y-1`}>
          <TimeText iso={job.createdAt} />
          <span>{PRO_STATUS_LABEL[job.status]}</span>
        </span>
      </Link>
    </li>
  );
}
