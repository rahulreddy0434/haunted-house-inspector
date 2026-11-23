'use client';

import Link from 'next/link';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { EmergencyScope } from '@/components/ui/haunted/EmergencyScope';
import { StateText } from '@/components/ui/haunted/StateText';
import { BODY, ERROR_TEXT, MUTED, PRIMARY_BUTTON } from '@/components/ui/styles';
import { BookingControls } from '@/components/results/BookingControls';
import { useStatusPolling } from '@/hooks/useStatusPolling';
import type { UseStatusPollingReturn } from '@/hooks/useStatusPolling';
import {
  HOMEOWNER_STATUS_TEXT,
  STATUS_REFRESH_FAILED,
  STATUS_SAFETY_LINE,
} from '@/lib/jobs/copy';

export interface StatusPanelProps {
  id: string;
  onEmergency: () => void;
  /** When given, the panel reads this instead of polling by itself. */
  polling?: UseStatusPollingReturn;
  /** True when the page shows the booking controls somewhere else. */
  hideBooking?: boolean;
}

export interface StatusPanelBodyProps {
  id: string;
  polling: UseStatusPollingReturn;
  /** True when the page shows the booking controls somewhere else. */
  hideBooking?: boolean;
}

const FIRST_LOAD_TEXT = 'Checking your job status…';
const PLAIN_TEXT = 'whitespace-pre-wrap break-words';

function StatusPanelWithHook({
  id,
  onEmergency,
  hideBooking,
}: {
  id: string;
  onEmergency: () => void;
  hideBooking: boolean;
}) {
  const polling = useStatusPolling(id, { onEmergency });
  return <StatusPanelBody id={id} polling={polling} hideBooking={hideBooking} />;
}

export function StatusPanel({ id, onEmergency, polling, hideBooking = false }: StatusPanelProps) {
  if (polling) return <StatusPanelBody id={id} polling={polling} hideBooking={hideBooking} />;
  return <StatusPanelWithHook id={id} onEmergency={onEmergency} hideBooking={hideBooking} />;
}

export function StatusPanelBody({ id, polling, hideBooking = false }: StatusPanelBodyProps) {
  const { view, loaded, updateFailed, refreshing, gone, refresh } = polling;

  if (view?.status === 'emergency') return <EmergencyScope />;
  if (gone) return null;

  const failedFirstLoad = view === null && loaded && updateFailed;
  const showRefresh =
    failedFirstLoad ||
    view?.status === 'new' ||
    view?.status === 'info_requested' ||
    view?.status === 'accepted';

  let statusText: string | null = null;
  if (view === null) {
    if (!loaded) statusText = FIRST_LOAD_TEXT;
  } else {
    statusText = HOMEOWNER_STATUS_TEXT[view.status];
  }

  return (
    <Card as="section" tone="status" aria-label="Job status" className="space-y-3">
      {statusText !== null ? (
        <div
          key={view?.status ?? 'loading'}
          role="status"
          tabIndex={-1}
          className={`${BODY} font-medium focus:outline-none`}
        >
          {view === null ? (
            <StateText plain={statusText} hauntedKey="statusChecking" />
          ) : (
            statusText
          )}
        </div>
      ) : null}

      {hideBooking ? null : <BookingControls id={id} polling={polling} embedded />}

      {view?.status === 'declined' ? (
        <div className="space-y-3">
          {view.reason ? <p className={`${BODY} ${PLAIN_TEXT}`}>{view.reason}</p> : null}
          <p className={MUTED}>{STATUS_SAFETY_LINE}</p>
          <Link
            href="/"
            className={`inline-flex min-h-11 items-center rounded-lg px-4 py-2 text-sm font-medium ${PRIMARY_BUTTON}`}
          >
            Start a new inspection
          </Link>
        </div>
      ) : null}

      {updateFailed ? (
        <p role="alert" className={`text-sm ${ERROR_TEXT}`}>
          {STATUS_REFRESH_FAILED}
        </p>
      ) : null}

      {showRefresh ? (
        <Button variant="secondary" onClick={refresh} disabled={refreshing}>
          Refresh
        </Button>
      ) : null}
    </Card>
  );
}
