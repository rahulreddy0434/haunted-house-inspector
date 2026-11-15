import { describe, expect, it, vi } from 'vitest';
import fc from 'fast-check';

vi.mock('server-only', () => ({}));

import { replyTriggersEmergency } from './replyCheck';
import { checkEmergency } from './safetyLayer';

const TRIGGERS: Array<[string, string]> = [
  ['GAS_SMELL', 'I can smell gas in the kitchen'],
  ['GAS_SMELL', 'It smells like rotten eggs'],
  ['ELECTRICAL_FIRE', 'There were sparks coming from the outlet'],
  ['ELECTRICAL_FIRE', 'a burning smell near the panel and scorch marks'],
  ['WATER_ELECTRICAL', 'Water is flooding near the electrical panel'],
  ['CO_ALARM', 'The carbon monoxide alarm is going off'],
  ['CO_ALARM', 'our CO alarm beeped'],
];

describe('replyTriggersEmergency', () => {
  it.each(TRIGGERS)('detects %s: "%s"', (_code, phrase) => {
    expect(replyTriggersEmergency(phrase)).toBe(true);
  });

  it('is case-insensitive', () => {
    expect(replyTriggersEmergency('GAS SMELL EVERYWHERE')).toBe(true);
  });

  it('does not flag clean text', () => {
    expect(replyTriggersEmergency('Yes, the drip is constant and only under the sink.')).toBe(false);
  });

  it('does not flag short or empty text', () => {
    expect(replyTriggersEmergency('ok')).toBe(false);
    expect(replyTriggersEmergency('')).toBe(false);
  });

  it('matches checkEmergency for a single context answer (property)', () => {
    const phrase = fc.constantFrom(...TRIGGERS.map(([, p]) => p));
    const text = fc.oneof(
      fc.string({ maxLength: 120 }),
      fc.tuple(fc.string({ maxLength: 40 }), phrase, fc.string({ maxLength: 40 })).map((p) => p.join(' ')),
    );
    fc.assert(
      fc.property(text, (s) => {
        const expected = checkEmergency({
          contextAnswers: { location: s, duration: '', recentChanges: '' },
        }).isEmergency;
        expect(replyTriggersEmergency(s)).toBe(expected);
      }),
    );
  });
});
