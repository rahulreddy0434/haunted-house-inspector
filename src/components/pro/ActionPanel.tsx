'use client';

import { AcceptForm } from '@/components/pro/AcceptForm';
import { DeclineForm } from '@/components/pro/DeclineForm';
import { Card } from '@/components/ui/Card';
import { ERROR_TEXT, HEADING } from '@/components/ui/styles';
import { useProActions } from '@/hooks/useProActions';
import type { UseProActionsResult } from '@/hooks/useProActions';
import type { JobStatus } from '@/types/job';

export interface ActionPanelProps {
  id: string;
  status: JobStatus;
  /** Called with the new status after a successful action. */
  onDone: (status: JobStatus) => void;
  /** Called on 409 so the detail can reload and match the real status. */
  onConflict: () => void;
  /** Called on 401 so the access code form can be shown. */
  onUnauthorized: () => void;
}

/** Decline control for the Pro job page (rendered before the booking controls). */
export function DeclineSection({ actions }: { actions: UseProActionsResult }) {
  const { pending, message, failedPath, send } = actions;
  return (
    <Card as="section" aria-labelledby="pro-decline-heading" className="space-y-6">
      <h2 id="pro-decline-heading" className={HEADING}>
        Can&apos;t take this job?
      </h2>
      <DeclineForm
        pending={pending}
        onSubmit={(reason) => void send('decline', reason.trim() ? { reason } : {})}
      />
      {message && failedPath === 'decline' ? (
        <p role="alert" className={`text-sm ${ERROR_TEXT}`}>
          {message}
        </p>
      ) : null}
    </Card>
  );
}

/** Accept form for the Pro job page; shows the error when accept fails. */
export function AcceptSection({ actions }: { actions: UseProActionsResult }) {
  const { pending, message, failedPath, send } = actions;
  return (
    <Card as="section" aria-labelledby="pro-accept-heading" className="space-y-6">
      <h2 id="pro-accept-heading" className={HEADING}>
        Accept and offer times
      </h2>
      <AcceptForm pending={pending} onSubmit={(slots) => void send('accept', { slots })} />
      {message && failedPath !== 'decline' ? (
        <p role="alert" className={`text-sm ${ERROR_TEXT}`}>
          {message}
        </p>
      ) : null}
    </Card>
  );
}

export function ActionPanel({ id, status, onDone, onConflict, onUnauthorized }: ActionPanelProps) {
  const { pending, message, send } = useProActions(id, { onDone, onConflict, onUnauthorized });

  if (status !== 'new' && status !== 'info_requested') return null;

  return (
    <Card as="section" aria-labelledby="pro-actions-heading" className="space-y-6">
      <h2 id="pro-actions-heading" className={HEADING}>
        Your response
      </h2>
      <AcceptForm pending={pending} onSubmit={(slots) => void send('accept', { slots })} />
      <DeclineForm
        pending={pending}
        onSubmit={(reason) => void send('decline', reason.trim() ? { reason } : {})}
      />
      {message ? (
        <p role="alert" className={`text-sm ${ERROR_TEXT}`}>
          {message}
        </p>
      ) : null}
    </Card>
  );
}
