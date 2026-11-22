'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { BookingData } from '@/types/chat';
import type { JobStatus, ProJobDetail, ProJobDetailActive } from '@/types/job';
import { toProEmergencyDetail } from '@/lib/jobs/views';
import { apiErrorSchema, proJobDetailSchema } from '@/lib/validation/jobSchema';
import { ERROR_MESSAGES } from '@/lib/jobs/copy';
import { hadProSession, markProSession } from '@/hooks/proSession';

export type ProJobPhase = 'loading' | 'ready' | 'unauthorized' | 'notFound' | 'error';

export interface UseProJobReturn {
  phase: ProJobPhase;
  /** Set only in `ready`. */
  job: ProJobDetail | null;
  /** Server message or the generic detail message; set only in `error`. */
  error: string | null;
  /**
   * The last response was a 401 after an earlier success in this page
   * lifetime (see `proSession.ts`): show the form with the "session ended"
   * notice. False on a first-load 401.
   */
  sessionLost: boolean;
  /** Repeats the request (the "Try again" button, or after the access form succeeds). */
  reload: () => void;
  /**
   * Patches the loaded job from a chat response in one state update. An
   * `emergency` status replaces the job with its emergency view.
   */
  applyLive: (next: LiveUpdate) => void;
}

export interface LiveUpdate {
  status: JobStatus;
  booking: BookingData;
}

/** Pure patch used by `applyLive`: status plus only the booking facts that exist for it. */
export function patchLive(job: ProJobDetail, next: LiveUpdate): ProJobDetail {
  if (next.status === 'emergency') {
    return job.status === 'emergency' ? job : toProEmergencyDetail(job);
  }
  if (job.status === 'emergency') return job;
  const { offeredSlots: _o, bookedSlot: _b, declineReason: _d, ...rest } = job;
  void _o;
  void _b;
  void _d;
  const patched: ProJobDetailActive = { ...rest, status: next.status };
  if (next.booking.offeredSlots !== undefined) patched.offeredSlots = [...next.booking.offeredSlots];
  if (next.booking.bookedSlot !== undefined) patched.bookedSlot = next.booking.bookedSlot;
  if (next.booking.declineReason !== undefined) patched.declineReason = next.booking.declineReason;
  return patched;
}

interface State {
  phase: ProJobPhase;
  job: ProJobDetail | null;
  error: string | null;
  sessionLost: boolean;
}

const LOADING: State = { phase: 'loading', job: null, error: null, sessionLost: false };

function failure(message: string): State {
  return { phase: 'error', job: null, error: message, sessionLost: false };
}

async function serverMessage(response: Response): Promise<string> {
  try {
    const parsed = apiErrorSchema.safeParse(await response.json());
    if (parsed.success && parsed.data.message) return parsed.data.message;
  } catch {
    // fall through to the generic message
  }
  return ERROR_MESSAGES.LOAD_FAILED.detail;
}

export function useProJob(id: string): UseProJobReturn {
  const [state, setState] = useState<State>(LOADING);
  const loadRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    let alive = true;
    let inFlight: AbortController | null = null;

    const run = async (controller: AbortController): Promise<void> => {
      let next: State;
      try {
        const response = await fetch(`/api/pro/jobs/${encodeURIComponent(id)}`, {
          method: 'GET',
          cache: 'no-store',
          credentials: 'same-origin',
          signal: controller.signal,
        });
        if (response.status === 401) {
          next = { phase: 'unauthorized', job: null, error: null, sessionLost: hadProSession() };
        } else if (response.status === 404) {
          next = { phase: 'notFound', job: null, error: null, sessionLost: false };
        } else if (!response.ok) {
          next = failure(await serverMessage(response));
        } else {
          const parsed = proJobDetailSchema.safeParse(await response.json());
          if (parsed.success) {
            markProSession();
            next = { phase: 'ready', job: parsed.data, error: null, sessionLost: false };
          } else {
            next = failure(ERROR_MESSAGES.LOAD_FAILED.detail);
          }
        }
      } catch {
        next = failure(ERROR_MESSAGES.LOAD_FAILED.detail);
      }

      if (!alive || controller.signal.aborted || inFlight !== controller) return;
      inFlight = null;
      setState(next);
    };

    const load = (): void => {
      if (!alive) return;
      inFlight?.abort();
      const controller = new AbortController();
      inFlight = controller;
      setState(LOADING);
      void run(controller);
    };

    loadRef.current = load;
    load();

    return () => {
      alive = false;
      inFlight?.abort();
      inFlight = null;
      loadRef.current = null;
    };
  }, [id]);

  const reload = useCallback((): void => {
    loadRef.current?.();
  }, []);

  const applyLive = useCallback((next: LiveUpdate): void => {
    setState((current) =>
      current.phase === 'ready' && current.job
        ? { ...current, job: patchLive(current.job, next) }
        : current,
    );
  }, []);

  return { ...state, reload, applyLive };
}
