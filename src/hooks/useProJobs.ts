'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { ProJobListItem } from '@/types/job';
import { apiErrorSchema, proJobsResponseSchema } from '@/lib/validation/jobSchema';
import { ERROR_MESSAGES } from '@/lib/jobs/copy';
import { hadProSession, markProSession } from '@/hooks/proSession';

export type ProJobsPhase = 'loading' | 'ready' | 'unauthorized';

export interface UseProJobsReturn {
  /**
   * `loading` until the first response. `unauthorized` on a 401. Any other
   * failure leaves `ready` with the previous list (empty on a first failure)
   * and `error` set.
   */
  phase: ProJobsPhase;
  /** Last good list; kept when a refresh fails and cleared on a 401. */
  jobs: ProJobListItem[];
  /** Server message or the generic list message; cleared by the next success. */
  error: string | null;
  /** HTTP status of the failure behind `error` (503 means access is disabled); null otherwise. */
  errorStatus: number | null;
  /** A request is in flight. The Refresh button is disabled while true. */
  refreshing: boolean;
  /**
   * The last response was a 401 after an earlier success in this page
   * lifetime: show the form with the "session ended" notice. False on a
   * first-load 401. Same value as `hadProSession()` from `proSession.ts`
   * at the time of the 401.
   */
  sessionLost: boolean;
  /** Ignored while a request is in flight. Never called on a timer. */
  refresh: () => void;
}

type Outcome =
  | { kind: 'ok'; jobs: ProJobListItem[] }
  | { kind: 'unauthorized' }
  | { kind: 'failed'; message: string; status: number | null };

async function serverMessage(response: Response): Promise<string> {
  try {
    const parsed = apiErrorSchema.safeParse(await response.json());
    if (parsed.success && parsed.data.message) return parsed.data.message;
  } catch {
    // fall through to the generic message
  }
  return ERROR_MESSAGES.LOAD_FAILED.list;
}

export function useProJobs(): UseProJobsReturn {
  const [phase, setPhase] = useState<ProJobsPhase>('loading');
  const [jobs, setJobs] = useState<ProJobListItem[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [errorStatus, setErrorStatus] = useState<number | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [sessionLost, setSessionLost] = useState(false);
  const loadRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    let alive = true;
    let inFlight: AbortController | null = null;

    const run = async (controller: AbortController): Promise<void> => {
      let outcome: Outcome;
      try {
        const response = await fetch('/api/pro/jobs', {
          method: 'GET',
          cache: 'no-store',
          credentials: 'same-origin',
          signal: controller.signal,
        });
        if (response.status === 401) {
          outcome = { kind: 'unauthorized' };
        } else if (!response.ok) {
          outcome = { kind: 'failed', message: await serverMessage(response), status: response.status };
        } else {
          const parsed = proJobsResponseSchema.safeParse(await response.json());
          outcome = parsed.success
            ? { kind: 'ok', jobs: parsed.data.jobs }
            : { kind: 'failed', message: ERROR_MESSAGES.LOAD_FAILED.list, status: null };
        }
      } catch {
        outcome = { kind: 'failed', message: ERROR_MESSAGES.LOAD_FAILED.list, status: null };
      }

      if (!alive || controller.signal.aborted || inFlight !== controller) return;
      inFlight = null;
      setRefreshing(false);

      if (outcome.kind === 'ok') {
        markProSession();
        setJobs(outcome.jobs);
        setError(null);
        setErrorStatus(null);
        setSessionLost(false);
        setPhase('ready');
      } else if (outcome.kind === 'unauthorized') {
        setSessionLost(hadProSession());
        setJobs([]);
        setError(null);
        setErrorStatus(null);
        setPhase('unauthorized');
      } else {
        setError(outcome.message);
        setErrorStatus(outcome.status);
        setPhase((current) => (current === 'loading' ? 'ready' : current));
      }
    };

    const load = (): void => {
      if (!alive || inFlight) return;
      const controller = new AbortController();
      inFlight = controller;
      setRefreshing(true);
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
  }, []);

  const refresh = useCallback((): void => {
    loadRef.current?.();
  }, []);

  return { phase, jobs, error, errorStatus, refreshing, sessionLost, refresh };
}
