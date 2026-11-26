// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import * as fc from 'fast-check';
import { GuidedIntake } from '@/components/intake/GuidedIntake';
import { exactPlaceLimit, somethingElseLimit } from '@/lib/intake/answerMapper';
import { initialIntakeState } from '@/lib/intake/intakeReducer';
import {
  MAX_ANSWER_LENGTH,
  buildInspectRequestBody,
  clampAnswer,
} from '@/lib/utils/contextAnswers';
import type { RunUploadFlowOptions, UploadFlowResult } from '@/lib/uploadFlow';

// Migrated from ContextForm.payload.property.test.tsx and
// ContextForm.limit.property.test.tsx (task 9.1). The mapper rules themselves are
// covered by Properties 4 and 5 and answerMapper.test.ts; these tests cover what
// the old form tests checked beyond them: the request payload built from the
// screen, and the counters and limits shown on the text boxes.
// Validates: Requirements 8.4, 8.5, 10.6

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
}));

const runUploadFlow = vi.fn<(opts: RunUploadFlowOptions) => Promise<UploadFlowResult>>();
vi.mock('@/lib/uploadFlow', () => ({
  runUploadFlow: (opts: RunUploadFlowOptions) => runUploadFlow(opts),
}));

beforeEach(() => {
  runUploadFlow.mockImplementation(() => new Promise<UploadFlowResult>(() => {}));
  URL.createObjectURL = () => 'blob:test';
  URL.revokeObjectURL = () => {};
  Element.prototype.scrollIntoView = vi.fn();
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

const KEYS = ['location', 'duration', 'recentChanges'] as const;

type User = ReturnType<typeof userEvent.setup>;

async function addPhoto(user: User) {
  const photo = new File([new Uint8Array(64)], 'leak.jpg', { type: 'image/jpeg' });
  await user.upload(screen.getByLabelText('Choose photos or a video'), photo);
  await screen.findByText('1 of 5 photos');
}

const next = (user: User) => user.click(screen.getByRole('button', { name: 'Next' }));

/** Photo, Step 2 with Kitchen chosen; leaves the Homeowner on Step 2. */
async function goToStepTwo(user: User) {
  await addPhoto(user);
  await next(user);
  await user.selectOptions(
    screen.getByRole('combobox', { name: /^Where is the problem\?/ }),
    'Kitchen',
  );
}

async function sendFromStepTwo(user: User) {
  await next(user);
  await user.click(screen.getByRole('button', { name: 'Inspect my home' }));
  expect(runUploadFlow).toHaveBeenCalledTimes(1);
  return runUploadFlow.mock.calls[0][0];
}

describe('request payload (was ContextForm Property 9)', () => {
  it('buildInspectRequestBody keeps all three answers unchanged for any input', () => {
    // Feature: guided-intake, migrated Property 9 (payload keeps all three answers)
    fc.assert(
      fc.property(
        fc.record({
          location: fc.string({ maxLength: 500 }),
          duration: fc.string({ maxLength: 500 }),
          recentChanges: fc.string({ maxLength: 500 }),
        }),
        fc.array(fc.string(), { maxLength: 5 }),
        (answers, keys) => {
          const body = buildInspectRequestBody(keys, answers);
          for (const k of KEYS) {
            expect(Object.prototype.hasOwnProperty.call(body.answers, k)).toBe(true);
            expect(body.answers[k]).toBe(answers[k]);
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
    const body = buildInspectRequestBody(['a'], { location: 'Kitchen', duration: '', recentChanges: '' });
    expect(body.answers).toEqual({ location: 'Kitchen', duration: '', recentChanges: '' });
    expect(JSON.parse(JSON.stringify(body)).answers.duration).toBe('');
  });

  it('GuidedIntake sends only a location when nothing else was chosen, with all three fields present', async () => {
    const user = userEvent.setup();
    render(<GuidedIntake />);
    await goToStepTwo(user);
    const opts = await sendFromStepTwo(user);
    expect(opts.answers).toEqual({ location: 'Kitchen', duration: '', recentChanges: '' });
    const body = buildInspectRequestBody(['k1'], opts.answers);
    expect(Object.keys(body.answers).sort()).toEqual([...KEYS].sort());
  });

  it('values entered on the screen reach the request in the three answer fields', async () => {
    const user = userEvent.setup();
    render(<GuidedIntake />);
    await goToStepTwo(user);
    await user.type(screen.getByLabelText(/Exactly where/), 'under the sink');
    await user.selectOptions(
    screen.getByRole('combobox', { name: /^How long has this been going on\?/ }),
    'A few weeks',
  );
    await user.click(screen.getByRole('checkbox', { name: 'Getting worse' }));
    await user.click(screen.getByRole('checkbox', { name: 'Something else' }));
    await user.type(screen.getByLabelText('Tell us more'), 'A faint ticking sound');

    const opts = await sendFromStepTwo(user);
    expect(opts.answers).toEqual({
      location: 'Kitchen: under the sink',
      duration: 'A few weeks',
      recentChanges: 'Getting worse. A faint ticking sound.',
    });
    const body = buildInspectRequestBody(['k1'], opts.answers);
    expect(body.answers).toEqual(opts.answers);
  });
});

describe('answer length limits (was ContextForm Property 10)', () => {
  it('clampAnswer keeps exactly the first 500 UTF-16 units of over-long input', () => {
    fc.assert(
      fc.property(
        fc
          .string({ unit: 'grapheme', minLength: 501, maxLength: 2000 })
          .filter((s) => s.length > MAX_ANSWER_LENGTH),
        (s) => {
          const out = clampAnswer(s);
          expect(out).toBe(s.slice(0, MAX_ANSWER_LENGTH));
          expect(out.length).toBe(MAX_ANSWER_LENGTH);
        },
      ),
      { numRuns: 100 },
    );
  });

  it('clampAnswer leaves input of 500 characters or fewer unchanged', () => {
    fc.assert(
      fc.property(
        fc.string({ unit: 'grapheme', maxLength: 500 }).filter((s) => s.length <= 500),
        (s) => {
          expect(clampAnswer(s)).toBe(s);
        },
      ),
      { numRuns: 100 },
    );
  });

  it('the Exact_Place box shows 0/limit, then n/limit as the Homeowner types', async () => {
    const user = userEvent.setup();
    render(<GuidedIntake />);
    await goToStepTwo(user);
    const limit = exactPlaceLimit('Kitchen');
    expect(screen.getByText(`0/${limit}`)).toBeTruthy();
    await user.type(screen.getByLabelText(/Exactly where/), 'abc');
    expect(screen.getByText(`3/${limit}`)).toBeTruthy();
    expect(screen.queryByText(/Only the first/)).toBeNull();
  });

  it('the Something_Else box shows its own limit', async () => {
    const user = userEvent.setup();
    render(<GuidedIntake />);
    await goToStepTwo(user);
    await user.click(screen.getByRole('checkbox', { name: 'Something else' }));
    const limit = somethingElseLimit({
      ...initialIntakeState.choices,
      extras: ['Something else'],
    });
    expect(screen.getByText(`0/${limit}`)).toBeTruthy();
  });

  it('text exactly at the limit is kept whole and shows no over-limit note', async () => {
    const user = userEvent.setup();
    render(<GuidedIntake />);
    await goToStepTwo(user);
    const limit = exactPlaceLimit('Kitchen');
    const text = 'x'.repeat(limit);
    fireEvent.change(screen.getByLabelText(/Exactly where/), { target: { value: text } });
    expect(screen.getByText(`${limit}/${limit}`)).toBeTruthy();
    expect(screen.queryByText(/Only the first/)).toBeNull();
    const opts = await sendFromStepTwo(user);
    expect(opts.answers.location).toBe(`Kitchen: ${text}`);
    expect(opts.answers.location.length).toBe(MAX_ANSWER_LENGTH);
  });

  it('over-long text is flagged and only the first part is sent, never more than 500 characters', async () => {
    const user = userEvent.setup();
    render(<GuidedIntake />);
    await goToStepTwo(user);
    const limit = exactPlaceLimit('Kitchen');
    fireEvent.change(screen.getByLabelText(/Exactly where/), { target: { value: 'y'.repeat(600) } });
    expect(screen.getByText(new RegExp(`Only the first ${limit} characters will be sent`))).toBeTruthy();
    const opts = await sendFromStepTwo(user);
    expect(opts.answers.location).toBe(`Kitchen: ${'y'.repeat(limit)}`);
    expect(opts.answers.location.length).toBeLessThanOrEqual(MAX_ANSWER_LENGTH);
  });

  it('over-long Something_Else text is shortened so recentChanges stays within 500 characters', async () => {
    const user = userEvent.setup();
    render(<GuidedIntake />);
    await goToStepTwo(user);
    await user.click(screen.getByRole('checkbox', { name: 'Something else' }));
    fireEvent.change(screen.getByLabelText('Tell us more'), { target: { value: 'z'.repeat(900) } });
    const opts = await sendFromStepTwo(user);
    expect(opts.answers.recentChanges.length).toBeLessThanOrEqual(MAX_ANSWER_LENGTH);
    expect(opts.answers.recentChanges.startsWith('zzz')).toBe(true);
  });
});
