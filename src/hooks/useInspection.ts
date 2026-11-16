'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { InspectionResult } from '@/types/inspection';
import { cacheResult, readCachedResult } from '@/lib/sessionResultCache';
import { loadInspection } from '@/lib/inspectionLoader';
import { isEmergencyResult, toEmergencyResult } from '@/lib/emergency/emergencyView';

export interface UseInspectionReturn {
  result: InspectionResult | null;
  loading: boolean;
  error: string | null;
  notFound: boolean;
  /** Switch to the emergency view of the current result (no-op without one). */
  markEmergency: () => void;
}

interface State extends Omit<UseInspectionReturn, 'markEmergency'> {
  /** The id this state belongs to. */
  forId: string | null;
}

const INITIAL: State = { forId: null, result: null, loading: true, error: null, notFound: false };

export function useInspection(id: string): UseInspectionReturn {
  const [state, setState] = useState<State>(INITIAL);
  const stateRef = useRef<State>(INITIAL);
  stateRef.current = state;

  const markEmergency = useCallback((): void => {
    const current = stateRef.current.result;
    if (!current) return;
    const emergency = toEmergencyResult(current);
    cacheResult(emergency); // storage errors are swallowed inside
    stateRef.current = { ...stateRef.current, result: emergency };
    setState((prev) => (prev.result ? { ...prev, result: emergency } : prev));
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    // sessionStorage only exists in the browser, so read it after mount.
    const cached = readCachedResult(id);
    setState(
      cached
        ? { forId: id, result: cached, loading: false, error: null, notFound: false }
        : { forId: id, result: null, loading: true, error: null, notFound: false },
    );

    void loadInspection({ id, signal: controller.signal, cached }).then((outcome) => {
      if (controller.signal.aborted) return;
      // markEmergency may have run while the GET was in flight; never downgrade it.
      const live = stateRef.current;
      if (
        live.forId === id &&
        live.result &&
        isEmergencyResult(live.result) &&
        outcome.result &&
        !isEmergencyResult(outcome.result)
      ) {
        return;
      }
      if (outcome.fresh) cacheResult(outcome.fresh);
      setState({
        forId: id,
        result: outcome.result,
        loading: false,
        error: outcome.error,
        notFound: outcome.notFound,
      });
    });

    return () => controller.abort();
  }, [id]);

  // Never expose another id's state while the new id's effect is pending.
  if (state.forId !== id) return { result: null, loading: true, error: null, notFound: false, markEmergency };
  return {
    result: state.result,
    loading: state.loading,
    error: state.error,
    notFound: state.notFound,
    markEmergency,
  };
}
