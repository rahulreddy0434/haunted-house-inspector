'use client';

import Link from 'next/link';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/Button';
import { EmergencyScope } from '@/components/ui/haunted/EmergencyScope';
import { StateText } from '@/components/ui/haunted/StateText';
import { TimeText } from '@/components/ui/TimeText';
import { BODY, ERROR_TEXT, HEADING, MUTED, PRIMARY_BUTTON, STATUS_BOX } from '@/components/ui/styles';
import { ReplyBox } from '@/components/results/ReplyBox';
import { SlotPicker } from '@/components/results/SlotPicker';
import { useStatusPolling } from '@/hooks/useStatusPolling';
import { EMERGENCY_MESSAGE } from '@/lib/emergency/messages';
import {
  ERROR_MESSAGES,
  HOMEOWNER_STATUS_TEXT,
  JOB_CHANGED_NOTICE,
  REPLY_TOO_LARGE_MESSAGE,
  STATUS_REFRESH_FAILED,
  STATUS_SAFETY_LINE,
} from '@/lib/jobs/copy';
import { homeownerStatusViewSchema } from '@/lib/validation/jobSchema';
import type { HomeownerStatusView } from '@/types/job';

export interface StatusPanelProps {
  id: string;
  onEmergency: () => void;
}

const FIRST_LOAD_TEXT = 'Checking your job status…';
const PLAIN_TEXT = 'whitespace-pre-wrap break-words';

type Outcome =
  | { kind: 'view'; view: HomeownerStatusView }
  | { kind: 'emergency'; view: HomeownerStatusView }
  | { kind: 'changed' }
  | { kind: 'expired' }
  | { kind: 'too-large' }
  | { kind: 'error'; message: string }
  | { kind: 'aborted' };

function errorMessage(body: unknown): string {
  if (typeof body === 'object' && body !== null && 'message' in body) {
    const { message } = body as { message: unknown };
    if (typeof message === 'string' && message.length > 0) return message;
  }
  return ERROR_MESSAGES.ACTION_FAILED;
}

function errorCode(body: unknown): string | null {
  if (typeof body === 'object' && body !== null && 'error' in body) {
    const { error } = body as { error: unknown };
    if (typeof error === 'string') return error;
  }
  return null;
}

/** POSTs JSON and sorts the response into one of the panel's outcomes. */
async function post(url: string, payload: unknown, signal: AbortSignal): Promise<Outcome> {
  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      cache: 'no-store',
      signal,
    });
    let body: unknown = null;
    try {
      body = await response.json();
    } catch {
      body = null;
    }
    if (signal.aborted) return { kind: 'aborted' };

    if (response.ok) {
      const parsed = homeownerStatusViewSchema.safeParse(body);
      if (!parsed.success) return { kind: 'error', message: ERROR_MESSAGES.ACTION_FAILED };
      return parsed.data.status === 'emergency'
        ? { kind: 'emergency', view: parsed.data }
        : { kind: 'view', view: parsed.data };
    }

    const code = errorCode(body);
    if (response.status === 409) {
      if (code === 'JOB_IS_EMERGENCY') {
        // Always the fixed text, never a message taken from the response.
        return { kind: 'emergency', view: { status: 'emergency', message: EMERGENCY_MESSAGE } };
      }
      if (code === 'ILLEGAL_TRANSITION') return { kind: 'changed' };
      if (code === 'SLOT_EXPIRED') return { kind: 'expired' };
    }
    if (response.status === 413) return { kind: 'too-large' };
    return { kind: 'error', message: errorMessage(body) };
  } catch {
    if (signal.aborted) return { kind: 'aborted' };
    return { kind: 'error', message: ERROR_MESSAGES.ACTION_FAILED };
  }
}

export function StatusPanel({ id, onEmergency }: StatusPanelProps) {
  const { view, loaded, updateFailed, refreshing, gone, refresh, refreshNow, applyView } =
    useStatusPolling(id, { onEmergency });

  const [replyText, setReplyText] = useState('');
  const [sending, setSending] = useState(false);
  const [replyError, setReplyError] = useState<string | null>(null);
  const [booking, setBooking] = useState(false);
  const [bookError, setBookError] = useState<string | null>(null);
  const [changed, setChanged] = useState(false);
  const [unsentReply, setUnsentReply] = useState<string | null>(null);
  const [removedSlots, setRemovedSlots] = useState<readonly string[]>([]);

  const statusRef = useRef<HTMLDivElement | null>(null);
  const confirmationRef = useRef<HTMLParagraphElement | null>(null);
  const pendingFocus = useRef<'status' | 'confirmation' | null>(null);
  const controllers = useRef<Set<AbortController>>(new Set());

  useEffect(() => {
    const active = controllers.current;
    return () => {
      for (const controller of active) controller.abort();
      active.clear();
    };
  }, []);

  // Move focus after the view that the request produced has been rendered.
  useEffect(() => {
    const target = pendingFocus.current;
    if (target === null) return;
    const element = target === 'confirmation' ? confirmationRef.current : statusRef.current;
    if (element === null) return;
    pendingFocus.current = null;
    element.focus({ preventScroll: true });
  }, [view]);

  const run = useCallback(
    async (url: string, payload: unknown): Promise<Outcome> => {
      const controller = new AbortController();
      controllers.current.add(controller);
      try {
        return await post(url, payload, controller.signal);
      } finally {
        controllers.current.delete(controller);
      }
    },
    [],
  );

  const handleEmergencyOrChanged = useCallback(
    (outcome: Outcome, unsent: string | null): boolean => {
      if (outcome.kind === 'emergency') {
        // applyView re-evaluates the stop rules and calls onEmergency once.
        applyView(outcome.view);
        return true;
      }
      if (outcome.kind === 'changed') {
        setChanged(true);
        setUnsentReply(unsent);
        refreshNow();
        return true;
      }
      return false;
    },
    [applyView, refreshNow],
  );

  async function sendReply(): Promise<void> {
    const text = replyText;
    setSending(true);
    setReplyError(null);
    setChanged(false);
    setUnsentReply(null);
    const outcome = await run(`/api/inspections/${encodeURIComponent(id)}/reply`, { text });
    if (outcome.kind === 'aborted') return;
    setSending(false);
    if (handleEmergencyOrChanged(outcome, text)) {
      if (outcome.kind === 'changed') setReplyText('');
      return;
    }
    if (outcome.kind === 'view' && outcome.view.status === 'new') {
      setReplyText('');
      pendingFocus.current = 'status';
      applyView(outcome.view);
    } else if (outcome.kind === 'too-large') {
      setReplyError(REPLY_TOO_LARGE_MESSAGE);
    } else if (outcome.kind === 'error') {
      setReplyError(outcome.message);
    } else {
      setReplyError(ERROR_MESSAGES.ACTION_FAILED);
    }
  }

  async function confirmSlot(slot: string): Promise<void> {
    setBooking(true);
    setBookError(null);
    setChanged(false);
    setUnsentReply(null);
    const outcome = await run(`/api/inspections/${encodeURIComponent(id)}/book`, { slot });
    if (outcome.kind === 'aborted') return;
    setBooking(false);
    if (handleEmergencyOrChanged(outcome, null)) return;
    if (outcome.kind === 'view' && outcome.view.status === 'booked') {
      pendingFocus.current = 'confirmation';
      applyView(outcome.view);
    } else if (outcome.kind === 'expired') {
      const now = Date.now();
      const offered = view?.status === 'accepted' ? view.offeredSlots : [];
      const passed = offered.filter((s) => Date.parse(s) <= now);
      setRemovedSlots((current) => [...new Set([...current, ...passed, slot])]);
      setBookError(ERROR_MESSAGES.SLOT_EXPIRED);
    } else if (outcome.kind === 'error') {
      setBookError(outcome.message);
    } else {
      setBookError(ERROR_MESSAGES.ACTION_FAILED);
    }
  }

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
    <section aria-label="Job status" className={`${STATUS_BOX} space-y-3`}>
      {statusText !== null ? (
        <div
          key={view?.status ?? 'loading'}
          ref={statusRef}
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

      {changed ? (
        <p role="status" className={BODY}>
          {JOB_CHANGED_NOTICE}
        </p>
      ) : null}

      {changed && unsentReply !== null ? (
        <div className="space-y-1">
          <p className={HEADING}>Your unsent reply</p>
          <p className={`${BODY} ${PLAIN_TEXT}`}>{unsentReply}</p>
        </div>
      ) : null}

      {view?.status === 'info_requested' ? (
        <div className="space-y-3">
          <div className="space-y-1">
            <p className={HEADING}>The tradesperson asks</p>
            <p className={`${BODY} ${PLAIN_TEXT}`}>{view.question}</p>
          </div>
          <ReplyBox
            value={replyText}
            onChange={setReplyText}
            onSubmit={() => void sendReply()}
            sending={sending}
            error={replyError}
          />
        </div>
      ) : null}

      {view?.status === 'accepted' ? (
        <SlotPicker
          slots={view.offeredSlots.filter((slot) => !removedSlots.includes(slot))}
          booking={booking}
          onConfirm={(slot) => void confirmSlot(slot)}
          error={bookError}
        />
      ) : null}

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

      {view?.status === 'booked' ? (
        <div className="space-y-3">
          <p
            role="status"
            ref={confirmationRef}
            tabIndex={-1}
            className={`${BODY} focus:outline-none`}
          >
            Your appointment: <TimeText iso={view.bookedSlot} />
          </p>
          <p className={MUTED}>{STATUS_SAFETY_LINE}</p>
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
    </section>
  );
}
