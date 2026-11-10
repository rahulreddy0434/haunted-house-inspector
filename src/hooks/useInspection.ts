'use client';

import { useEffect, useState } from 'react';
import type { InspectionResult } from '@/types/inspection';
import { cacheResult, readCachedResult } from '@/lib/sessionResultCache';
import { loadInspection } from '@/lib/inspectionLoader';

export interface UseInspectionReturn {
  result: InspectionResult | null;
  loading: boolean;
  error: string | null;
  notFound: boolean;
}

interface State extends UseInspectionReturn {
  /** The id this state belongs to. */
  forId: string | null;
}

const INITIAL: State = { forId: null, result: null, loading: true, error: null, notFound: false };

export function useInspection(id: string): UseInspectionReturn {
  const [state, setState] = useState<State>(INITIAL);

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
  if (state.forId !== id) return { result: null, loading: true, error: null, notFound: false };
  return {
    result: state.result,
    loading: state.loading,
    error: state.error,
    notFound: state.notFound,
  };
}
