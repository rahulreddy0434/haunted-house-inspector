import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { urgencyLabel } from '@/lib/utils/urgencyLabel';
import type { UrgencyLevel } from '@/types/inspection';

const EXPECTED = {
  emergency: 'Emergency',
  urgent: 'Urgent — act today',
  soon: 'Soon — within a week',
  monitor: 'Monitor — keep an eye on it',
} as const;

describe('urgencyLabel', () => {
  // Feature: intake-and-triage, Property 15: Urgency label mapping is exhaustive and exact
  // **Validates: Requirements 9.2**
  it('maps every urgency level to its exact non-empty label', () => {
    fc.assert(
      fc.property(
        fc.constantFrom<UrgencyLevel>('emergency', 'urgent', 'soon', 'monitor'),
        (u) => {
          const label = urgencyLabel(u);
          expect(label).toBeDefined();
          expect(label.length).toBeGreaterThan(0);
          expect(label).toBe(EXPECTED[u]);
        },
      ),
    );
  });

  it('returns the documented strings', () => {
    expect(urgencyLabel('urgent')).toBe('Urgent — act today');
  });
});
