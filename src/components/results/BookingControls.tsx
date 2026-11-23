'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Card } from '@/components/ui/Card';
import { TimeText } from '@/components/ui/TimeText';
import { BODY, MUTED } from '@/components/ui/styles';
import { SlotPicker } from '@/components/results/SlotPicker';
import type { UseStatusPollingReturn } from '@/hooks/useStatusPolling';
import { EMERGENCY_MESSAGE } from '@/lib/emergency/messages';
import { ERROR_MESSAGES, JOB_CHANGED_NOTICE, STATUS_SAFETY_LINE } from '@/lib/jobs/copy';
import { homeownerStatusViewSchema } from '@/lib/validation/jobSchema';
import type { HomeownerStatusView } from '@/types/job';

export interface BookingControlsProps {
  id: string;
  polling: UseStatusPollingReturn;
  /**
   * True when the controls sit inside another card (the status panel), so no
   * card of their own is drawn. Default: the controls draw their own card.
   */
  embedded?: boolean;
}

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

/** POSTs JSON and sorts the response into one of the controls' outcomes. */
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

/** The slot picker, the booking request and the booking confirmation. */
export function BookingControls({ id, polling, embedded = false }: BookingControlsProps) {
  const { view, gone, refreshNow, applyView } = polling;

  const [booking, setBooking] = useState(false);
  const [bookError, setBookError] = useState<string | null>(null);
  const [changed, setChanged] = useState(false);
  const [removedSlots, setRemovedSlots] = useState<readonly string[]>([]);

  const confirmationRef = useRef<HTMLParagraphElement | null>(null);
  const pendingFocus = useRef(false);
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
    if (!pendingFocus.current) return;
    const element = confirmationRef.current;
    if (element === null) return;
    pendingFocus.current = false;
    element.focus({ preventScroll: true });
  }, [view]);

  const run = useCallback(async (url: string, payload: unknown): Promise<Outcome> => {
    const controller = new AbortController();
    controllers.current.add(controller);
    try {
      return await post(url, payload, controller.signal);
    } finally {
      controllers.current.delete(controller);
    }
  }, []);

  const handleEmergencyOrChanged = useCallback(
    (outcome: Outcome): boolean => {
      if (outcome.kind === 'emergency') {
        // applyView re-evaluates the stop rules and calls onEmergency once.
        applyView(outcome.view);
        return true;
      }
      if (outcome.kind === 'changed') {
        setChanged(true);
        refreshNow();
        return true;
      }
      return false;
    },
    [applyView, refreshNow],
  );

  async function confirmSlot(slot: string): Promise<void> {
    setBooking(true);
    setBookError(null);
    setChanged(false);
    const outcome = await run(`/api/inspections/${encodeURIComponent(id)}/book`, { slot });
    if (outcome.kind === 'aborted') return;
    setBooking(false);
    if (handleEmergencyOrChanged(outcome)) return;
    if (outcome.kind === 'view' && outcome.view.status === 'booked') {
      pendingFocus.current = true;
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

  if (view?.status === 'emergency' || gone) return null;

  const showPicker = view?.status === 'accepted';
  const showConfirmation = view?.status === 'booked';
  if (!changed && !showPicker && !showConfirmation) return null;

  const content = (
    <>
      {changed ? (
        <p role="status" className={BODY}>
          {JOB_CHANGED_NOTICE}
        </p>
      ) : null}

      {view?.status === 'accepted' ? (
        <SlotPicker
          slots={view.offeredSlots.filter((slot) => !removedSlots.includes(slot))}
          booking={booking}
          onConfirm={(slot) => void confirmSlot(slot)}
          error={bookError}
        />
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
    </>
  );

  if (embedded) return content;
  return (
    <Card as="section" tone="status" aria-label="Booking" className="space-y-3">
      {content}
    </Card>
  );
}
