import type { InspectionResult } from '@/types/inspection';
import { inspectionResultSchema } from '@/lib/validation/inspectionSchema';

export const INVALID_RESULT_MESSAGE = 'This result could not be loaded.';
export const LOAD_FAILED_MESSAGE = "We couldn't load this result. Please try again.";

/** What the GET /api/inspections/[id] request produced. */
export type FetchOutcome =
  | { kind: 'ok'; result: InspectionResult }
  | { kind: 'notFound' }
  | { kind: 'invalid' }
  | { kind: 'failed' };

export interface LoadState {
  result: InspectionResult | null;
  error: string | null;
  notFound: boolean;
}

/**
 * Decide the visible state once the GET has finished.
 * A valid cached result is never hidden by a failed GET (Req 14.8).
 */
export function resolveFetchOutcome(
  cached: InspectionResult | null,
  outcome: FetchOutcome,
): LoadState {
  if (outcome.kind === 'ok') {
    return { result: outcome.result, error: null, notFound: false };
  }
  if (cached) {
    return { result: cached, error: null, notFound: false };
  }
  switch (outcome.kind) {
    case 'notFound':
      return { result: null, error: null, notFound: true };
    case 'invalid':
      return { result: null, error: INVALID_RESULT_MESSAGE, notFound: false };
    case 'failed':
      return { result: null, error: LOAD_FAILED_MESSAGE, notFound: false };
  }
}

/** Fetch and validate a stored inspection. Never throws. */
export async function fetchInspection(params: {
  id: string;
  signal: AbortSignal;
  fetchImpl?: typeof fetch;
}): Promise<FetchOutcome> {
  const doFetch = params.fetchImpl ?? fetch;
  try {
    const res = await doFetch(`/api/inspections/${encodeURIComponent(params.id)}`, {
      signal: params.signal,
    });
    if (res.status === 404) return { kind: 'notFound' };
    if (!res.ok) return { kind: 'failed' };
    let body: unknown;
    try {
      body = await res.json();
    } catch {
      return { kind: 'invalid' };
    }
    const parsed = inspectionResultSchema.safeParse(body);
    if (!parsed.success) return { kind: 'invalid' };
    return { kind: 'ok', result: parsed.data as InspectionResult };
  } catch {
    return { kind: 'failed' };
  }
}

/** Fetch then resolve against the cached copy. */
export async function loadInspection(params: {
  id: string;
  signal: AbortSignal;
  cached: InspectionResult | null;
  fetchImpl?: typeof fetch;
}): Promise<LoadState & { fresh: InspectionResult | null }> {
  const outcome = await fetchInspection(params);
  const state = resolveFetchOutcome(params.cached, outcome);
  return { ...state, fresh: outcome.kind === 'ok' ? outcome.result : null };
}
