import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { statusAfterSend } from '@/lib/chat/rules';
import type { ChatSide } from '@/types/chat';
import type { JobStatus } from '@/types/job';

// Feature: chat-and-help, Property 4: Status rules for chat
// **Validates: Requirements 2.1, 2.2, 2.3, 2.7, 21.3**

const openStatuses: JobStatus[] = ['new', 'info_requested', 'accepted', 'booked'];
const sides: ChatSide[] = ['homeowner', 'tradesperson'];

/** Pure model: one rule per message. */
function model(status: JobStatus, side: ChatSide): JobStatus {
  if (side === 'tradesperson' && status === 'new') return 'info_requested';
  if (side === 'homeowner' && status === 'info_requested') return 'new';
  return status;
}

describe('Property 4: Status rules for chat', () => {
  it('any sequence of sends on an Open_Status follows one rule per message', () => {
    fc.assert(
      fc.property(
        fc.constantFrom(...openStatuses),
        fc.array(fc.constantFrom(...sides), { maxLength: 30 }),
        (start, sequence) => {
          let actual: JobStatus = start;
          let expected: JobStatus = start;
          for (const side of sequence) {
            const result = statusAfterSend(actual, side);
            expect(result.ok).toBe(true);
            if (!result.ok) return;
            expected = model(expected, side);
            expect(result.next).toBe(expected);
            expect(result.changed).toBe(result.next !== actual);
            actual = result.next;
          }
          expect(actual).toBe(expected);
        },
      ),
      { numRuns: 200 },
    );
  });
});
