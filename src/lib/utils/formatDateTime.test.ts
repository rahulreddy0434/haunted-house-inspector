import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { formatDateTime } from './formatDateTime';

const originalTz = process.env.TZ;
process.env.TZ = 'America/Toronto';

// Setting TZ after Node has started is not reliable on every platform, so
// the exact-zone assertions only run when the runtime honoured it.
const tzHonoured =
  new Intl.DateTimeFormat('en-US').resolvedOptions().timeZone === 'America/Toronto';

describe('formatDateTime', () => {
  beforeAll(() => {
    process.env.TZ = 'America/Toronto';
  });
  afterAll(() => {
    if (originalTz === undefined) delete process.env.TZ;
    else process.env.TZ = originalTz;
  });

  it('includes a short zone name', () => {
    const out = formatDateTime('2026-03-05T20:00:00.000Z', 'en-US');
    expect(out).toMatch(/\b(?:[A-Z]{2,5}|GMT[+-]\d+|UTC)\s*$/);
    expect(out).toContain('2026');
  });

  it.skipIf(!tzHonoured)('shows EST in winter (TZ honoured by ICU)', () => {
    expect(formatDateTime('2026-03-05T20:00:00.000Z', 'en-US')).toMatch(/3:00\s?PM EST$/);
  });

  it.skipIf(!tzHonoured)('shows EDT in summer (TZ honoured by ICU)', () => {
    expect(formatDateTime('2026-07-05T20:00:00.000Z', 'en-US')).toMatch(/4:00\s?PM EDT$/);
  });

  it.each(['not-a-date', ''])('returns the raw string for invalid input %j', (input) => {
    expect(() => formatDateTime(input, 'en-US')).not.toThrow();
    expect(formatDateTime(input, 'en-US')).toBe(input);
  });

  it('returns the raw string for an invalid locale tag', () => {
    expect(formatDateTime('2026-03-05T20:00:00.000Z', 'not a locale!!')).toBe(
      '2026-03-05T20:00:00.000Z',
    );
  });
});
