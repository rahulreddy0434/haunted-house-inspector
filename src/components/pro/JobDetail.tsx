'use client';

import Link from 'next/link';
import { useCallback, useEffect, useRef, useState } from 'react';
import { AccessCodeForm } from '@/components/pro/AccessCodeForm';
import { ActionPanel } from '@/components/pro/ActionPanel';
import { JobFacts } from '@/components/pro/JobFacts';
import { JobHistory } from '@/components/pro/JobHistory';
import { PhotoGallery } from '@/components/pro/PhotoGallery';
import { ProEmergencyView } from '@/components/pro/ProEmergencyView';
import { UrgencyBadge } from '@/components/results/UrgencyBadge';
import { Button } from '@/components/ui/Button';
import { EmergencyScope } from '@/components/ui/haunted/EmergencyScope';
import { TimeText } from '@/components/ui/TimeText';
import { BODY, CARD, ERROR_TEXT, HEADING, SECONDARY_BUTTON } from '@/components/ui/styles';
import { useProJob } from '@/hooks/useProJob';
import { PRO_STATUS_LABEL, SESSION_ENDED_NOTICE } from '@/lib/jobs/copy';
import type { ProJobDetailActive } from '@/types/job';

export interface JobDetailProps {
  id: string;
}

const PAGE = 'mx-auto flex w-full max-w-2xl flex-col gap-4 p-6';
const LINK = `inline-block rounded-md px-4 py-2 text-sm font-semibold ${SECONDARY_BUTTON}`;
const DISABLED_MESSAGE = "Tradesperson access isn't available right now.";

function BackLink() {
  return (
    <div>
      <Link href="/pro" className={LINK}>
        Back to jobs
      </Link>
    </div>
  );
}

function StatusBlock({ job }: { job: ProJobDetailActive }) {
  if (job.status === 'info_requested') {
    const latest = job.infoRequests.length > 0 ? job.infoRequests[job.infoRequests.length - 1] : null;
    if (!latest) return null;
    return (
      <section aria-label="Your question" className={CARD}>
        <h2 className={HEADING}>
          You asked · <TimeText iso={latest.askedAt} />
        </h2>
        <p className={`${BODY} whitespace-pre-wrap break-words`}>{latest.question}</p>
      </section>
    );
  }

  if (job.status === 'accepted') {
    const slots = [...(job.offeredSlots ?? [])].sort((a, b) => Date.parse(a) - Date.parse(b));
    if (slots.length === 0) return null;
    return (
      <section aria-label="Offered times" className={CARD}>
        <h2 className={HEADING}>Times you offered</h2>
        <ul className={`mt-1 list-disc space-y-1 pl-5 ${BODY}`}>
          {slots.map((slot) => (
            <li key={slot}>
              <TimeText iso={slot} />
            </li>
          ))}
        </ul>
      </section>
    );
  }

  if (job.status === 'booked') {
    if (!job.bookedSlot) return null;
    return (
      <section aria-label="Booked time" className={CARD}>
        <h2 className={HEADING}>Booked time</h2>
        <p className={BODY}>
          <TimeText iso={job.bookedSlot} />
        </p>
      </section>
    );
  }

  if (job.status === 'declined') {
    if (!job.declineReason) return null;
    return (
      <section aria-label="Decline reason" className={CARD}>
        <h2 className={HEADING}>Reason you gave</h2>
        <p className={`${BODY} whitespace-pre-wrap break-words`}>{job.declineReason}</p>
      </section>
    );
  }

  return null;
}

export function JobDetail({ id }: JobDetailProps) {
  const { phase, job, error, sessionLost, reload } = useProJob(id);
  const [forceForm, setForceForm] = useState(false);
  const [disabled, setDisabled] = useState(false);
  const statusRef = useRef<HTMLParagraphElement>(null);
  const focusAfterLoadRef = useRef(false);

  // Move focus once the reloaded data has rendered.
  useEffect(() => {
    if (phase !== 'ready' || !focusAfterLoadRef.current) return;
    focusAfterLoadRef.current = false;
    statusRef.current?.focus({ preventScroll: true });
  }, [phase, job]);

  const handleActionDone = useCallback((): void => {
    focusAfterLoadRef.current = true;
    reload();
  }, [reload]);

  const handleUnauthorized = useCallback((): void => {
    setForceForm(true);
  }, []);

  const handleLoginSuccess = useCallback((): void => {
    setForceForm(false);
    reload();
  }, [reload]);

  const handleDisabled = useCallback((): void => {
    setDisabled(true);
  }, []);

  if (phase === 'unauthorized' || forceForm) {
    if (disabled) {
      return (
        <div className={PAGE}>
          <BackLink />
          <p role="alert" className={`${BODY} ${ERROR_TEXT}`}>
            {DISABLED_MESSAGE}
          </p>
        </div>
      );
    }
    return (
      <div className={PAGE}>
        <BackLink />
        <AccessCodeForm
          onSuccess={handleLoginSuccess}
          onDisabled={handleDisabled}
          notice={sessionLost || forceForm ? SESSION_ENDED_NOTICE : undefined}
        />
      </div>
    );
  }

  if (phase === 'notFound') {
    return (
      <div className={PAGE}>
        <BackLink />
        <p className={`text-lg font-semibold ${BODY}`}>We couldn&apos;t find this job.</p>
        <div>
          <Link href="/pro" className={LINK}>
            Go to the job list
          </Link>
        </div>
      </div>
    );
  }

  if (phase === 'error') {
    return (
      <div className={PAGE}>
        <BackLink />
        <p role="alert" className={`${BODY} ${ERROR_TEXT}`}>
          {error}
        </p>
        <div>
          <Button onClick={reload}>Try again</Button>
        </div>
      </div>
    );
  }

  if (phase === 'loading' || !job) {
    return (
      <div className={PAGE}>
        <BackLink />
        <p role="status" className={BODY}>
          Loading the job…
        </p>
      </div>
    );
  }

  if (job.status === 'emergency') {
    return (
      <div className={PAGE}>
        <EmergencyScope />
        <BackLink />
        <h1 className={`text-2xl font-bold ${BODY}`}>Job details</h1>
        <div>
          <UrgencyBadge urgency="emergency" />
        </div>
        <ProEmergencyView job={job} />
      </div>
    );
  }

  return (
    <div className={PAGE}>
      <BackLink />
      <h1 className={`text-2xl font-bold ${BODY}`}>Job details</h1>
      <div>
        <UrgencyBadge urgency={job.urgency} />
      </div>
      <p ref={statusRef} role="status" tabIndex={-1} className={`${BODY} font-semibold`}>
        {PRO_STATUS_LABEL[job.status]}
      </p>
      <JobFacts job={job} />
      <PhotoGallery photos={job.photos} />
      <JobHistory infoRequests={job.infoRequests} replies={job.replies} />
      <StatusBlock job={job} />
      <ActionPanel
        id={job.id}
        status={job.status}
        onDone={handleActionDone}
        onConflict={handleActionDone}
        onUnauthorized={handleUnauthorized}
      />
    </div>
  );
}
