import type { InspectionResult } from '@/types/inspection';
import { inspectionResultSchema } from '@/lib/validation/inspectionSchema';

/** sessionStorage key for a cached result. */
export function resultCacheKey(id: string): string {
  return `hhi_result_${id}`;
}

/** Store the result for this tab. Storage failures are swallowed. */
export function cacheResult(result: InspectionResult): void {
  if (typeof window === 'undefined') return;
  try {
    window.sessionStorage.setItem(resultCacheKey(result.id), JSON.stringify(result));
  } catch {
    // Ignore: quota, private mode, or storage disabled.
  }
}

/** Read and validate a cached result; returns null for anything unusable. */
export function readCachedResult(id: string): InspectionResult | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.sessionStorage.getItem(resultCacheKey(id));
    if (raw === null) return null;
    const parsed = inspectionResultSchema.safeParse(JSON.parse(raw));
    return parsed.success ? (parsed.data as InspectionResult) : null;
  } catch {
    return null;
  }
}
