import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import { contextAnswersSchema } from '@/lib/validation/inspectionSchema';

describe('contextAnswersSchema', () => {
  // Feature: intake-and-triage, Property 8: Whitespace-only location answer is invalid
  it('rejects any whitespace-only location (including empty)', () => {
    // **Validates: Requirements 5.2**
    fc.assert(
      fc.property(
        fc.stringOf(fc.constantFrom(' ', '\t', '\n')),
        (location) => {
          const result = contextAnswersSchema.safeParse({ location });
          expect(result.success).toBe(false);
        },
      ),
      { numRuns: 100 },
    );
  });

  it('accepts a normal location', () => {
    const result = contextAnswersSchema.safeParse({ location: 'Kitchen' });
    expect(result.success).toBe(true);
  });
});
