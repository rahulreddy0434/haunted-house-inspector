import type { InspectionResult } from '@/types/inspection';
import { inspectionResultSchema } from '@/lib/validation/inspectionSchema';
import { isEmergencyResult } from '@/lib/emergency/emergencyView';

/** sessionStorage key for a cached result. */
export function resultCacheKey(id: string): string {
  return `hhi_result_${id}`;
}

/** Store the result for this tab. Storage failures are swallowed. */
export function cacheResult(result: InspectionResult): void {
  if (typeof window === 'undefined') return;
  try {
    if (!isEmergencyResult(result)) {
      const existing = readCachedResult(result.id);
      if (existing && isEmergencyResult(existing)) return; // never downgrade (Req 11.7)
    }
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
    if (!parsed.success) return null;
    // An entry stored under this key but belonging to another id is never trusted.
    if (parsed.data.id !== id) return null;
    return parsed.data as InspectionResult;
  } catch {
    return null;
  }
}
