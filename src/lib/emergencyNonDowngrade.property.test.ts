import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fc from 'fast-check';
import { renderHook, act, cleanup } from '@testing-library/react';
import type { InspectionResult } from '@/types/inspection';
import { arbitraryInspectionResult } from '@/test/jobFixtures';
import { toEmergencyResult, isEmergencyResult } from '@/lib/emergency/emergencyView';
import { resolveFetchOutcome, loadInspection, type FetchOutcome } from '@/lib/inspectionLoader';
import { cacheResult, readCachedResult, resultCacheKey } from '@/lib/sessionResultCache';
import { useInspection } from '@/hooks/useInspection';

// Feature: pro-dashboard-and-booking, Property 14: A cached emergency is never downgraded
// **Validates: Requirements 11.6, 11.7, 16.12**

type NonEmergencyUrgency = 'urgent' | 'soon' | 'monitor';
type Kind = 'ok' | 'notFound' | 'invalid' | 'failed';

const arbitraryUrgency = fc.constantFrom('urgent', 'soon', 'monitor') as fc.Arbitrary<NonEmergencyUrgency>;
const arbitraryKind = fc.constantFrom('ok', 'notFound', 'invalid', 'failed') as fc.Arbitrary<Kind>;

/** A non-emergency copy of the same result id. */
function nonEmergencyCopy(r: InspectionResult, urgency: NonEmergencyUrgency): InspectionResult {
  return { ...r, urgency, isEmergency: false, jobBrief: r.jobBrief || 'Brief' };
}

function outcomeFor(kind: Kind, copy: InspectionResult): FetchOutcome {
  return kind === 'ok' ? { kind, result: copy } : { kind };
}

function responseFor(kind: Kind, copy: InspectionResult): () => Promise<Response> {
  switch (kind) {
    case 'ok':
      return () => Promise.resolve(new Response(JSON.stringify(copy), { status: 200 }));
    case 'notFound':
      return () => Promise.resolve(new Response('{}', { status: 404 }));
    case 'invalid':
      return () => Promise.resolve(new Response(JSON.stringify({ id: 'x' }), { status: 200 }));
    case 'failed':
      return () => Promise.reject(new TypeError('network'));
  }
}

describe('Property 14: a cached emergency is never downgraded', () => {
  beforeEach(() => window.sessionStorage.clear());
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
    window.sessionStorage.clear();
  });

  it('resolveFetchOutcome returns the cached emergency for every fresh outcome', () => {
    fc.assert(
      fc.property(arbitraryInspectionResult, arbitraryUrgency, arbitraryKind, (r, urgency, kind) => {
        const cached = toEmergencyResult(r);
        const state = resolveFetchOutcome(cached, outcomeFor(kind, nonEmergencyCopy(r, urgency)));
        expect(state).toEqual({ result: cached, error: null, notFound: false });
        expect(isEmergencyResult(state.result as InspectionResult)).toBe(true);
      }),
      { numRuns: 100 },
    );
  });

  it('loadInspection returns no non-emergency fresh copy', async () => {
    await fc.assert(
      fc.asyncProperty(arbitraryInspectionResult, arbitraryUrgency, arbitraryKind, async (r, urgency, kind) => {
        const cached = toEmergencyResult(r);
        const copy = nonEmergencyCopy(r, urgency);
        const outcome = await loadInspection({
          id: r.id,
          signal: new AbortController().signal,
          cached,
          fetchImpl: vi.fn(responseFor(kind, copy)) as unknown as typeof fetch,
        });
        expect(outcome.result).toEqual(cached);
        expect(outcome.fresh === null || isEmergencyResult(outcome.fresh)).toBe(true);
      }),
      { numRuns: 100 },
    );
  });

  it('cacheResult of a non-emergency copy leaves the emergency entry unchanged', () => {
    fc.assert(
      fc.property(arbitraryInspectionResult, arbitraryUrgency, (r, urgency) => {
        window.sessionStorage.clear();
        const cached = toEmergencyResult(r);
        cacheResult(cached);
        const before = window.sessionStorage.getItem(resultCacheKey(r.id));
        cacheResult(nonEmergencyCopy(r, urgency));
        expect(window.sessionStorage.getItem(resultCacheKey(r.id))).toBe(before);
        expect(readCachedResult(r.id)).toEqual(cached);
      }),
      { numRuns: 100 },
    );
  });

  it('after markEmergency the cache holds the emergency shape', () => {
    fetchNeverResolves();
    fc.assert(
      fc.property(arbitraryInspectionResult, arbitraryUrgency, (r, urgency) => {
        window.sessionStorage.clear();
        const normal = nonEmergencyCopy(r, urgency);
        cacheResult(normal);
        const { result, unmount } = renderHook(() => useInspection(normal.id));
        act(() => result.current.markEmergency());
        const entry = readCachedResult(normal.id);
        unmount();
        expect(entry).not.toBeNull();
        expect(entry).toMatchObject({
          urgency: 'emergency',
          isEmergency: true,
          costRangeLow: 0,
          costRangeHigh: 0,
          jobBrief: '',
          diySteps: [],
        });
      }),
      { numRuns: 100 },
    );
  });
});

function fetchNeverResolves(): void {
  vi.stubGlobal('fetch', vi.fn(() => new Promise<Response>(() => {})));
}
