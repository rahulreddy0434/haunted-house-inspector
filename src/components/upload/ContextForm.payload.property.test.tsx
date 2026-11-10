// Feature: intake-and-triage, Property 9: All three context answers are always included in the submission payload
// **Validates: Requirements 5.4**
import { useState } from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import * as fc from 'fast-check';
import { cleanup, fireEvent, render } from '@testing-library/react';
import { ContextForm } from './ContextForm';
import { buildInspectRequestBody } from '@/lib/utils/contextAnswers';
import type { ContextAnswers } from '@/types/inspection';

// Textareas normalise CR to LF, so exclude carriage returns from generated text.
const answerArb = fc
  .string({ maxLength: 500 })
  .map((s) => s.replace(/\r/g, ''));
const answersArb = fc.record({
  location: answerArb,
  duration: answerArb,
  recentChanges: answerArb,
});

const KEYS = ['location', 'duration', 'recentChanges'] as const;

afterEach(() => cleanup());

describe('Property 9: all three context answers are included in the payload', () => {
  it('buildInspectRequestBody keeps all three answer fields with original values', () => {
    fc.assert(
      fc.property(
        answersArb,
        fc.array(fc.string(), { maxLength: 5 }),
        (answers, keys) => {
          const body = buildInspectRequestBody(keys, answers);
          for (const k of KEYS) {
            expect(Object.prototype.hasOwnProperty.call(body.answers, k)).toBe(true);
            expect(body.answers[k]).toBe(answers[k]);
            expect(typeof body.answers[k]).toBe('string');
          }
          const parsed = JSON.parse(JSON.stringify(body)) as typeof body;
          expect(Object.keys(parsed.answers).sort()).toEqual([...KEYS].sort());
          expect(parsed.answers).toEqual(answers);
          expect(parsed.s3Keys).toEqual(keys);
        },
      ),
      { numRuns: 100 },
    );
  });

  it('blank optional answers stay as empty strings', () => {
    const body = buildInspectRequestBody(['a'], {
      location: 'Kitchen',
      duration: '',
      recentChanges: '',
    });
    expect(body.answers).toEqual({ location: 'Kitchen', duration: '', recentChanges: '' });
    expect(JSON.parse(JSON.stringify(body)).answers.duration).toBe('');
  });

  it('values entered in the form reach the payload unchanged', () => {
    let latest: ContextAnswers = { location: '', duration: '', recentChanges: '' };

    function Harness() {
      const [value, setValue] = useState<ContextAnswers>(latest);
      latest = value;
      return (
        <ContextForm value={value} onChange={setValue} onValidationChange={() => {}} />
      );
    }

    fc.assert(
      fc.property(answersArb, (answers) => {
        latest = { location: '', duration: '', recentChanges: '' };
        const { container, unmount } = render(<Harness />);
        const fields = {
          location: container.querySelector<HTMLTextAreaElement>('textarea[name="location"]'),
          duration: container.querySelector<HTMLTextAreaElement>('textarea[name="duration"]'),
          recentChanges: container.querySelector<HTMLTextAreaElement>(
            'textarea[name="recentChanges"]',
          ),
        };
        for (const k of KEYS) {
          const el = fields[k];
          expect(el).not.toBeNull();
          // Skip no-op changes (React ignores a change to the current value).
          if (answers[k] !== '') {
            fireEvent.change(el!, { target: { value: answers[k] } });
          }
        }
        const body = buildInspectRequestBody(['k1'], latest);
        for (const k of KEYS) {
          expect(body.answers[k]).toBe(answers[k]);
        }
        expect(Object.keys(body.answers).sort()).toEqual([...KEYS].sort());
        unmount();
        cleanup();
      }),
      { numRuns: 40 },
    );
  });
});
