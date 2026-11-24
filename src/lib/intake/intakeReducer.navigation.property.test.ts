import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { intakeReducer, type IntakeAction } from '@/lib/intake/intakeReducer';
import { arbIntakeChoices } from '@/lib/intake/testArbitraries';
import type { IntakeState, IntakeStep } from '@/types/intake';

const arbStep: fc.Arbitrary<IntakeStep> = fc.constantFrom<IntakeStep>(1, 2, 3);

const arbNavAction: fc.Arbitrary<IntakeAction> = fc.constantFrom<IntakeAction>(
  { type: 'next' },
  { type: 'back' },
  { type: 'goTo', step: 1 },
  { type: 'goTo', step: 2 },
  { type: 'goTo', step: 3 },
);

describe('intakeReducer navigation', () => {
  // Feature: guided-intake, Property 8: Next, Back and Change never alter the choices
  // **Validates: Requirements 3.10, 3.11, 8.2, 13.5**
  it('keeps the same choices reference and a step of 1, 2 or 3 after every navigation action', () => {
    fc.assert(
      fc.property(
        arbIntakeChoices,
        arbStep,
        fc.array(arbNavAction, { maxLength: 50 }),
        (choices, step, actions) => {
          let state: IntakeState = { step, choices };
          for (const action of actions) {
            state = intakeReducer(state, action);
            expect(state.choices).toBe(choices);
            expect([1, 2, 3]).toContain(state.step);
          }
        },
      ),
      { numRuns: 200 },
    );
  });
});
