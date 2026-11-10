import { useState } from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, fireEvent, render } from '@testing-library/react';
import fc from 'fast-check';
import { ContextForm } from './ContextForm';
import { MAX_ANSWER_LENGTH, clampAnswer } from '@/lib/utils/contextAnswers';
import type { ContextAnswers } from '@/types/inspection';

// Feature: intake-and-triage, Property 10: Character count limit enforcement
// **Validates: Requirements 5.5**

type Field = keyof ContextAnswers;
const FIELDS: Field[] = ['location', 'duration', 'recentChanges'];

// Mix of ASCII and grapheme/emoji strings (the latter contain surrogate pairs).
const unitArb = fc.constantFrom<'grapheme-ascii' | 'grapheme'>('grapheme-ascii', 'grapheme');
const overLong = unitArb.chain((unit) =>
  fc.string({ unit, minLength: 501, maxLength: 2000 }).filter((s) => s.length > 500 && !/[\r\n]/.test(s)),
);
const atOrUnder = fc.string({ maxLength: 500 }).filter((s) => !/[\r\n]/.test(s));

let latest: ContextAnswers = { location: '', duration: '', recentChanges: '' };

function Harness() {
  const [value, setValue] = useState<ContextAnswers>(latest);
  latest = value;
  return (
    <ContextForm
      value={value}
      onChange={(next) => {
        latest = next;
        setValue(next);
      }}
      onValidationChange={() => {}}
    />
  );
}

function enterText(field: Field, text: string) {
  latest = { location: '', duration: '', recentChanges: '' };
  const { container } = render(<Harness />);
  const textarea = container.querySelector<HTMLTextAreaElement>(`textarea[name="${field}"]`)!;
  fireEvent.change(textarea, { target: { value: text } });
  const describedBy = textarea.getAttribute('aria-describedby')!.split(' ')[0];
  const counter = container.ownerDocument.getElementById(describedBy)!;
  return { textarea, counterText: counter.textContent, container };
}

describe('Property 10: Character count limit enforcement', () => {
  afterEach(cleanup);

  it('clampAnswer keeps exactly the first 500 UTF-16 units of over-long input', () => {
    fc.assert(
      fc.property(overLong, (s) => {
        const out = clampAnswer(s);
        expect(out).toBe(s.slice(0, MAX_ANSWER_LENGTH));
        expect(out.length).toBe(MAX_ANSWER_LENGTH);
      }),
      { numRuns: 100 },
    );
  });

  it('clampAnswer is identity for input of 500 characters or fewer', () => {
    fc.assert(
      fc.property(fc.string({ unit: 'grapheme', maxLength: 500 }).filter((s) => s.length <= 500), (s) => {
        expect(clampAnswer(s)).toBe(s);
      }),
      { numRuns: 100 },
    );
  });

  for (const field of FIELDS) {
    it(`${field}: over-long input is stored as the first 500 chars and counter shows 500/500`, () => {
      fc.assert(
        fc.property(overLong, (s) => {
          const { textarea, counterText } = enterText(field, s);
          const expected = s.slice(0, MAX_ANSWER_LENGTH);
          expect(latest[field]).toBe(expected);
          expect(textarea.value).toBe(expected);
          expect(counterText).toBe('500/500');
          cleanup();
        }),
        { numRuns: 30 },
      );
    });

    it(`${field}: exactly 500 chars shows 500/500 and is kept intact`, () => {
      fc.assert(
        fc.property(
          fc.string({ minLength: 500, maxLength: 500 }).filter((s) => !/[\r\n]/.test(s)),
          (s) => {
            const { counterText } = enterText(field, s);
            expect(latest[field]).toBe(s);
            expect(counterText).toBe('500/500');
            cleanup();
          },
        ),
        { numRuns: 30 },
      );
    });

    it(`${field}: n < 500 chars shows n/500 and is kept intact`, () => {
      fc.assert(
        fc.property(atOrUnder.filter((s) => s.length < 500), (s) => {
          const { counterText } = enterText(field, s);
          expect(latest[field]).toBe(s);
          expect(counterText).toBe(`${s.length}/500`);
          cleanup();
        }),
        { numRuns: 30 },
      );
    });
  }
});
