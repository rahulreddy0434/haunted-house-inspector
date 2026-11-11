import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cacheResult, readCachedResult, resultCacheKey } from '@/lib/sessionResultCache';
import { emergencyResult, normalResult } from '@/test/inspectionFixtures';

const OTHER_ID = '22222222-2222-4222-8222-222222222222';

beforeEach(() => {
  sessionStorage.clear();
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  sessionStorage.clear();
});

describe('sessionResultCache', () => {
  it('round-trips a normal result', () => {
    cacheResult(normalResult);
    expect(readCachedResult(normalResult.id)).toEqual(normalResult);
  });

  it('round-trips an emergency-shaped result', () => {
    cacheResult(emergencyResult);
    const read = readCachedResult(emergencyResult.id);
    expect(read).toEqual(emergencyResult);
    expect(read?.urgency).toBe('emergency');
    expect(read?.isEmergency).toBe(true);
    expect(read?.diySteps).toEqual([]);
    expect(read?.jobBrief).toBe('');
  });

  it('uses the key hhi_result_{id} and does not collide across ids', () => {
    expect(resultCacheKey('abc')).toBe('hhi_result_abc');
    const other = { ...normalResult, id: OTHER_ID, likelyIssue: 'Different issue.' };
    cacheResult(normalResult);
    cacheResult(other);
    expect(sessionStorage.getItem(`hhi_result_${normalResult.id}`)).toBe(JSON.stringify(normalResult));
    expect(sessionStorage.getItem(`hhi_result_${OTHER_ID}`)).toBe(JSON.stringify(other));
    expect(readCachedResult(normalResult.id)).toEqual(normalResult);
    expect(readCachedResult(OTHER_ID)).toEqual(other);
  });

  it('returns null when there is no entry', () => {
    expect(readCachedResult(normalResult.id)).toBeNull();
  });

  it('returns null for invalid JSON without throwing', () => {
    sessionStorage.setItem(resultCacheKey(normalResult.id), '{not json');
    expect(() => readCachedResult(normalResult.id)).not.toThrow();
    expect(readCachedResult(normalResult.id)).toBeNull();
  });

  it('returns null for schema-invalid entries', () => {
    const { urgency: _urgency, ...missingUrgency } = normalResult;
    void _urgency;
    const invalid: unknown[] = [
      missingUrgency,
      { ...normalResult, costRangeLow: 500, costRangeHigh: 100 },
      { ...normalResult, confidence: 'high' },
      { ...normalResult, s3Keys: 'frames/a.jpg' },
      null,
      [],
      [normalResult],
      'a string',
      42,
    ];
    for (const value of invalid) {
      sessionStorage.setItem(resultCacheKey(normalResult.id), JSON.stringify(value));
      expect(readCachedResult(normalResult.id)).toBeNull();
    }
  });

  it('cacheResult does not throw when setItem throws', () => {
    for (const name of ['QuotaExceededError', 'SecurityError']) {
      vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
        throw new DOMException('blocked', name);
      });
      expect(() => cacheResult(normalResult)).not.toThrow();
      vi.restoreAllMocks();
    }
  });

  it('readCachedResult returns null when getItem throws', () => {
    cacheResult(normalResult);
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new DOMException('blocked', 'SecurityError');
    });
    expect(() => readCachedResult(normalResult.id)).not.toThrow();
    expect(readCachedResult(normalResult.id)).toBeNull();
  });

  it('does not return an entry stored under a different id', () => {
    cacheResult(normalResult);
    expect(readCachedResult(OTHER_ID)).toBeNull();
  });

  it('ignores an entry whose id does not match the requested id', () => {
    // An entry for id A planted under id B's key must not be returned for B.
    sessionStorage.setItem(resultCacheKey(OTHER_ID), JSON.stringify(normalResult));
    expect(readCachedResult(OTHER_ID)).toBeNull();
  });

  describe('when window is undefined (SSR)', () => {
    it('cacheResult does not throw and readCachedResult returns null', () => {
      vi.stubGlobal('window', undefined);
      expect(() => cacheResult(normalResult)).not.toThrow();
      expect(readCachedResult(normalResult.id)).toBeNull();
    });
  });
});
