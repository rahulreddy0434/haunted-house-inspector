'use client';

import { useCallback, useEffect, useReducer, useRef } from 'react';
import type { HomeownerStatusView } from '@/types/job';
import { homeownerStatusViewSchema } from '@/lib/validation/jobSchema';

export const STATUS_POLL_INTERVAL_MS = 30_000;

export interface UseStatusPollingReturn {
  /** Last known good view; null before the first success. */
  view: HomeownerStatusView | null;
  /** False until the first response of any kind. */
  loaded: boolean;
  /** The last request failed (the view is kept). */
  updateFailed: boolean;
  /** A request is in flight. */
  refreshing: boolean;
  /** Declined, booked, emergency or 404: no more requests. */
  stopped: boolean;
  /** 404: render nothing. */
  gone: boolean;
  /** The Refresh button: ignored while a request is in flight. */
  refresh: () => void;
  /** Aborts any in-flight request, ignores its late result and polls at once. */
  refreshNow: () => void;
  /** Applies a view from a reply or booking response and re-evaluates stopping. */
  applyView: (view: HomeownerStatusView) => void;
}

export interface UseStatusPollingOptions {
  onEmergency?: () => void;
}

type State = Omit<UseStatusPollingReturn, 'refresh' | 'refreshNow' | 'applyView'>;

type Action =
  | { type: 'reset' }
  | { type: 'start' }
  | { type: 'view'; view: HomeownerStatusView; stopped: boolean }
  | { type: 'failed' }
  | { type: 'gone' };

const INITIAL: State = {
  view: null,
  loaded: false,
  updateFailed: false,
  refreshing: false,
  stopped: false,
  gone: false,
};

function reducer(state: State, action: Action): State {
  switch (action.type) {
    case 'reset':
      return INITIAL;
    case 'start':
      return state.refreshing ? state : { ...state, refreshing: true };
    case 'view':
      return {
        ...state,
        view: action.view,
        loaded: true,
        updateFailed: false,
        refreshing: false,
        stopped: state.stopped || action.stopped,
      };
    case 'failed':
      return { ...state, loaded: true, updateFailed: true, refreshing: false };
    case 'gone':
      return { ...state, loaded: true, updateFailed: false, refreshing: false, stopped: true, gone: true };
  }
}

interface Controls {
  poll: () => void;
  pollNow: () => void;
  apply: (view: HomeownerStatusView) => void;
}

function isStopView(view: HomeownerStatusView): boolean {
  return view.status === 'declined' || view.status === 'booked' || view.status === 'emergency';
}

export function useStatusPolling(
  id: string,
  { onEmergency }: UseStatusPollingOptions = {},
): UseStatusPollingReturn {
  const [state, dispatch] = useReducer(reducer, INITIAL);
  const onEmergencyRef = useRef(onEmergency);
  const controlsRef = useRef<Controls | null>(null);

  useEffect(() => {
    onEmergencyRef.current = onEmergency;
  }, [onEmergency]);

  useEffect(() => {
    let alive = true;
    let stopped = false;
    let emergencyNotified = false;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let inFlight: AbortController | null = null;

    const clearTimer = (): void => {
      if (timer !== null) {
        clearTimeout(timer);
        timer = null;
      }
    };

    const isVisible = (): boolean => document.visibilityState === 'visible';

    const schedule = (): void => {
      clearTimer();
      if (!alive || stopped || !isVisible()) return;
      timer = setTimeout(() => {
        timer = null;
        poll();
      }, STATUS_POLL_INTERVAL_MS);
    };

    const stop = (): void => {
      stopped = true;
      clearTimer();
    };

    /** Applies a view: stop rules, one dispatch, one emergency callback. */
    const handleView = (view: HomeownerStatusView): void => {
      const stopNow = isStopView(view);
      if (stopNow) stop();
      dispatch({ type: 'view', view, stopped: stopNow });
      if (view.status === 'emergency' && !emergencyNotified) {
        emergencyNotified = true;
        onEmergencyRef.current?.();
      }
    };

    const poll = (): void => {
      if (!alive || stopped || inFlight) return;
      clearTimer();
      const controller = new AbortController();
      inFlight = controller;
      dispatch({ type: 'start' });
      void run(controller);
    };

    const run = async (controller: AbortController): Promise<void> => {
      let outcome: { kind: 'view'; view: HomeownerStatusView } | { kind: 'gone' } | { kind: 'failed' };
      try {
        const response = await fetch(`/api/inspections/${encodeURIComponent(id)}/status`, {
          method: 'GET',
          cache: 'no-store',
          signal: controller.signal,
        });
        if (response.status === 404) {
          outcome = { kind: 'gone' };
        } else if (!response.ok) {
          outcome = { kind: 'failed' };
        } else {
          const body: unknown = await response.json();
          const parsed = homeownerStatusViewSchema.safeParse(body);
          outcome = parsed.success ? { kind: 'view', view: parsed.data } : { kind: 'failed' };
        }
      } catch {
        outcome = { kind: 'failed' };
      }

      // Aborted, replaced or unmounted: ignore the late result.
      if (!alive || controller.signal.aborted || inFlight !== controller) return;
      inFlight = null;

      if (outcome.kind === 'gone') {
        stop();
        dispatch({ type: 'gone' });
        return;
      }
      if (outcome.kind === 'failed') {
        dispatch({ type: 'failed' });
      } else {
        handleView(outcome.view);
      }
      schedule();
    };

    const onVisibilityChange = (): void => {
      if (!alive) return;
      if (!isVisible()) {
        clearTimer();
        return;
      }
      if (!stopped && !inFlight) poll();
    };

    controlsRef.current = {
      poll,
      pollNow: () => {
        if (!alive || stopped) return;
        if (inFlight) {
          inFlight.abort();
          inFlight = null;
        }
        poll();
      },
      apply: (view) => {
        if (!alive || (stopped && emergencyNotified)) return;
        if (inFlight) {
          inFlight.abort();
          inFlight = null;
        }
        handleView(view);
        schedule();
      },
    };

    dispatch({ type: 'reset' });
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
  }, [id]);

  const refresh = useCallback((): void => {
    controlsRef.current?.poll();
  }, []);
  const refreshNow = useCallback((): void => {
    controlsRef.current?.pollNow();
  }, []);
  const applyView = useCallback((view: HomeownerStatusView): void => {
    controlsRef.current?.apply(view);
  }, []);

  return { ...state, refresh, refreshNow, applyView };
}
