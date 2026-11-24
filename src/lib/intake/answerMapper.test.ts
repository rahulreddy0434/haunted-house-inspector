import { describe, it, expect } from 'vitest';
import { mapAnswers } from '@/lib/intake/answerMapper';
import type { IntakeChoices } from '@/types/intake';

const EMPTY: IntakeChoices = {
  safety: [],
  location: null,
  placeText: '',
  duration: null,
  extras: [],
  somethingElseText: '',
};

describe('mapAnswers examples', () => {
  it('joins a location label and exact place with ": "', () => {
    expect(mapAnswers({ ...EMPTY, location: 'Kitchen', placeText: 'under the sink' }).location).toBe(
      'Kitchen: under the sink',
    );
  });

  it('uses the label alone when there is no exact place', () => {
    expect(mapAnswers({ ...EMPTY, location: 'Kitchen' }).location).toBe('Kitchen');
  });

  it('maps Other with text to "Other: text"', () => {
    expect(mapAnswers({ ...EMPTY, location: 'Other', placeText: 'text' }).location).toBe(
      'Other: text',
    );
  });

  it('passes the duration label through unchanged', () => {
    expect(mapAnswers({ ...EMPTY, duration: 'A few weeks' }).duration).toBe('A few weeks');
  });

  it('gives each extras label and the free text a full stop, in list order', () => {
    expect(
      mapAnswers({
        ...EMPTY,
        extras: ['Dripping or leaking water', 'Getting worse', 'Something else'],
        somethingElseText: 'text',
      }).recentChanges,
    ).toBe('Dripping or leaking water. Getting worse. text.');
  });

  it('does not add a full stop when free text already ends in . ! or ?', () => {
    for (const end of ['.', '!', '?']) {
      expect(
        mapAnswers({ ...EMPTY, extras: ['Something else'], somethingElseText: `text${end}` })
          .recentChanges,
      ).toBe(`text${end}`);
    }
  });

  it('returns empty strings when nothing is chosen', () => {
    expect(mapAnswers(EMPTY)).toEqual({ location: '', duration: '', recentChanges: '' });
  });
});
