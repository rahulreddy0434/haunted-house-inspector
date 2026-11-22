'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { z } from 'zod';
import type { BookingData, ChatMessage, ChatSide } from '@/types/chat';
import type { JobStatus } from '@/types/job';
import { chatAccess } from '@/lib/chat/rules';
import { pollDelayMs } from '@/lib/chat/pollSchedule';
import { mergeThread } from '@/lib/chat/thread';
import {
  chatEmergencyResponseSchema,
  chatReadResponseSchema,
  chatSendResponseSchema,
} from '@/lib/chat/validation';

type OpenStatus = Exclude<JobStatus, 'emergency'>;

export interface UseChatThreadOptions {
  /** The viewer's Side. Decides the endpoint. */
  side: ChatSide;
  jobId: string;
  /** The page's current status; null until the page knows it. */
  status: JobStatus | null;
  /** Called only when the status or the booking data differs from the previous response. */
  onJobChange: (next: { status: OpenStatus; booking: BookingData }) => void;
  /** Called once on a 409 JOB_IS_EMERGENCY or a 200 emergency response. */
  onEmergency: () => void;
  /** Called on a 401 (Pro side). */
  onUnauthorized?: () => void;
}

export interface UseChatThreadReturn {
  messages: ChatMessage[];
  loaded: boolean;
  /** The last poll failed; the messages are kept. */
  checkFailed: boolean;
  sending: boolean;
  /** Limit and failure text for the panel (role="alert"). */
  sendError: string | null;
  send: (text: string) => Promise<'sent' | 'refused' | 'emergency'>;
}

const SEND_FAILED_TEXT = 'Your message was not sent. Please try again.';

const errorBodySchema = z.object({
  error: z.string().optional(),
  message: z.string().optional(),
  status: z.enum(['new', 'info_requested', 'accepted', 'declined', 'booked', 'emergency']).optional(),
});

function chatUrl(side: ChatSide, jobId: string): string {
  const id = encodeURIComponent(jobId);
  return side === 'homeowner' ? `/api/inspections/${id}/chat` : `/api/pro/jobs/${id}/chat`;
}

interface Controls {
  send: (text: string) => Promise<'sent' | 'refused' | 'emergency'>;
  reschedule: () => void;
}

export function useChatThread(options: UseChatThreadOptions): UseChatThreadReturn {
  const { side, jobId, status } = options;

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [checkFailed, setCheckFailed] = useState(false);
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);

  const callbacksRef = useRef({
    onJobChange: options.onJobChange,
    onEmergency: options.onEmergency,
    onUnauthorized: options.onUnauthorized,
  });
  const statusRef = useRef<JobStatus | null>(status);
  const controlsRef = useRef<Controls | null>(null);

  // Keep the latest callbacks and the page's status available to the timer chain.
  useEffect(() => {
    callbacksRef.current = {
      onJobChange: options.onJobChange,
      onEmergency: options.onEmergency,
      onUnauthorized: options.onUnauthorized,
    };
  }, [options.onJobChange, options.onEmergency, options.onUnauthorized]);

  useEffect(() => {
    if (statusRef.current === status) return;
    if (status !== null) statusRef.current = status;
    controlsRef.current?.reschedule();
  }, [status]);

  useEffect(() => {
    let alive = true;
    let stopped = false;
    let emergencyNotified = false;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let inFlight: AbortController | null = null;
    let pendingPoll = false;
    let sendingNow = false;
    let cursor: number | null = null;
    let lastJob: { status: OpenStatus; bookingKey: string; booking: BookingData } | null = null;
    let lastActivityAt = Date.now();
    const url = chatUrl(side, jobId);

    const clearTimer = (): void => {
      if (timer !== null) {
        clearTimeout(timer);
        timer = null;
      }
    };

    const isVisible = (): boolean => document.visibilityState === 'visible';

    const currentAccess = () => chatAccess(statusRef.current ?? 'new');

    const schedule = (): void => {
      clearTimer();
      if (!alive || stopped || inFlight) return;
      const delay = pollDelayMs({
        access: currentAccess(),
        visible: isVisible(),
        msSinceActivity: Date.now() - lastActivityAt,
      });
      if (delay === null) return;
      timer = setTimeout(() => {
        timer = null;
        poll();
      }, delay);
    };

    const stopAll = (): void => {
      stopped = true;
      clearTimer();
      pendingPoll = false;
      inFlight?.abort();
      inFlight = null;
    };

    const handleEmergency = (): void => {
      if (emergencyNotified) return;
      emergencyNotified = true;
      stopAll();
      setMessages([]);
      callbacksRef.current.onEmergency();
    };

    const handleUnauthorized = (): void => {
      stopAll();
      callbacksRef.current.onUnauthorized?.();
    };

    /** Calls onJobChange only when the status or the booking data differ. */
    const noteJob = (next: { status: OpenStatus; booking: BookingData }): void => {
      const bookingKey = JSON.stringify(next.booking);
      const previous = lastJob;
      lastJob = { status: next.status, bookingKey, booking: next.booking };
      statusRef.current = next.status;
      const differs = previous
        ? previous.status !== next.status || previous.bookingKey !== bookingKey
        : next.status !== status;
      if (differs) callbacksRef.current.onJobChange(next);
    };

    const poll = (): void => {
      if (!alive || stopped || inFlight) return;
      if (cursor !== null && currentAccess() !== 'open') return;
      if (cursor === null && currentAccess() === 'closed') return;
      clearTimer();
      const controller = new AbortController();
      inFlight = controller;
      void run(controller);
    };

    const run = async (controller: AbortController): Promise<void> => {
      const first = cursor === null;
      const requestUrl = first ? url : `${url}?after=${cursor}`;
      let outcome:
        | { kind: 'read'; data: z.infer<typeof chatReadResponseSchema> }
        | { kind: 'emergency' }
        | { kind: 'unauthorized' }
        | { kind: 'failed' };
      try {
        const response = await fetch(requestUrl, {
          method: 'GET',
          cache: 'no-store',
          signal: controller.signal,
        });
        if (response.status === 401) {
          outcome = { kind: 'unauthorized' };
        } else if (response.status === 409) {
          const body = errorBodySchema.safeParse(await response.json());
          outcome =
            body.success && body.data.error === 'JOB_IS_EMERGENCY'
              ? { kind: 'emergency' }
              : { kind: 'failed' };
        } else if (!response.ok) {
          outcome = { kind: 'failed' };
        } else {
          const raw: unknown = await response.json();
          const emergency = chatEmergencyResponseSchema.safeParse(raw);
          if (emergency.success) {
            outcome = { kind: 'emergency' };
          } else {
            const parsed = chatReadResponseSchema.safeParse(raw);
            outcome = parsed.success ? { kind: 'read', data: parsed.data } : { kind: 'failed' };
          }
        }
      } catch {
        outcome = { kind: 'failed' };
      }

      if (!alive || controller.signal.aborted || inFlight !== controller) return;
      inFlight = null;

      if (outcome.kind === 'emergency') {
        handleEmergency();
        return;
      }
      if (outcome.kind === 'unauthorized') {
        handleUnauthorized();
        return;
      }
      if (outcome.kind === 'failed') {
        setCheckFailed(true);
        setLoaded(true);
      } else {
        const { data } = outcome;
        cursor = data.lastSeq;
        if (data.messages.length > 0) {
          setMessages((prev) => mergeThread(prev, data.messages));
          if (!first) lastActivityAt = Date.now();
        }
        setCheckFailed(false);
        setLoaded(true);
        noteJob({ status: data.status, booking: data.booking });
      }

      if (pendingPoll) {
        pendingPoll = false;
        poll();
        return;
      }
      schedule();
    };

    const send = async (text: string): Promise<'sent' | 'refused' | 'emergency'> => {
      if (!alive || stopped || sendingNow) return 'refused';
      sendingNow = true;
      setSending(true);
      setSendError(null);
      try {
        const response = await fetch(url, {
          method: 'POST',
          cache: 'no-store',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ text }),
        });
        if (!alive) return 'refused';

        if (response.status === 401) {
          handleUnauthorized();
          return 'refused';
        }

        let raw: unknown = null;
        try {
          raw = await response.json();
        } catch {
          raw = null;
        }
        if (!alive) return 'refused';

        if (response.ok) {
          if (chatEmergencyResponseSchema.safeParse(raw).success) {
            handleEmergency();
            return 'emergency';
          }
          const parsed = chatSendResponseSchema.safeParse(raw);
          if (!parsed.success) {
            setSendError(SEND_FAILED_TEXT);
            return 'refused';
          }
          lastActivityAt = Date.now();
          setMessages((prev) => mergeThread(prev, [parsed.data.message]));
          noteJob({ status: parsed.data.status, booking: parsed.data.booking });
          // One poll at once. The cursor is not moved by the send response.
          if (inFlight) pendingPoll = true;
          else poll();
          return 'sent';
        }

        const body = errorBodySchema.safeParse(raw);
        const errorBody = body.success ? body.data : {};
        if (response.status === 409 && errorBody.error === 'JOB_IS_EMERGENCY') {
          handleEmergency();
          return 'emergency';
        }
        if (response.status === 409 && errorBody.error === 'ILLEGAL_TRANSITION') {
          if (errorBody.status && errorBody.status !== 'emergency') {
            noteJob({ status: errorBody.status, booking: lastJob?.booking ?? {} });
            schedule();
          } else if (errorBody.status === 'emergency') {
            handleEmergency();
            return 'emergency';
          }
        }
        setSendError(errorBody.message ?? SEND_FAILED_TEXT);
        return 'refused';
      } catch {
        if (alive) setSendError(SEND_FAILED_TEXT);
        return 'refused';
      } finally {
        sendingNow = false;
        if (alive) setSending(false);
      }
    };

    const onVisibilityChange = (): void => {
      if (!alive || stopped) return;
      if (!isVisible()) {
        clearTimer();
        return;
      }
      if (cursor !== null && currentAccess() === 'open' && !inFlight) poll();
    };

    controlsRef.current = {
      send,
      reschedule: () => {
        if (!alive) return;
        if (currentAccess() === 'closed') {
          if (statusRef.current === 'emergency') handleEmergencyQuiet();
          return;
        }
        if (currentAccess() !== 'open') {
          clearTimer();
          return;
        }
        // A status-only change must not restart a pending timer (Requirement 6.18).
        if (timer === null) schedule();
      },
    };

    /** The page itself learned about the emergency: stop and drop the messages, no callback. */
    function handleEmergencyQuiet(): void {
      emergencyNotified = true;
      stopAll();
      setMessages([]);
    }

    document.addEventListener('visibilitychange', onVisibilityChange);
    poll();

    return () => {
      alive = false;
      clearTimer();
      inFlight?.abort();
      inFlight = null;
      document.removeEventListener('visibilitychange', onVisibilityChange);
      controlsRef.current = null;
    };
    // `status` is read once, as the baseline for the first response.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [side, jobId]);

  const send = useCallback(
    (text: string): Promise<'sent' | 'refused' | 'emergency'> =>
      controlsRef.current ? controlsRef.current.send(text) : Promise.resolve('refused'),
    [],
  );

  return { messages, loaded, checkFailed, sending, sendError, send };
}
