import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import type { Theme } from '@/lib/theme';
import { contrastRatio, minimumFor } from './contrast';
import { resolveColour } from './palette';
import { CONTRAST_REGISTRY, formatFailure, type ColourSpec, type PairRole } from './contrastRegistry';

/**
 * Colour pairs used by src/components/ui/help/*. All colours come from constants in
 * src/components/ui/styles.ts (directly or through TextField, TextAreaField and Button).
 * The Help section sits in a CARD, so text is on the card surface.
 */
interface HelpPair {
  id: string;
  theme: Theme;
  role: PairRole;
  fg: ColourSpec;
  bg: ColourSpec;
  used: string;
}

const HELP_PAIRS: readonly HelpPair[] = [
  { id: 'N-04', theme: 'normal', role: 'body', fg: 'slate.700', bg: 'white', used: 'MUTED: privacy line, sending status, labels, count' },
  { id: 'N-03', theme: 'normal', role: 'body', fg: 'slate.600', bg: 'white', used: 'HEADING in the card' },
  { id: 'N-10', theme: 'normal', role: 'body', fg: 'red.800', bg: 'white', used: 'ERROR_TEXT: field errors, send failure' },
  { id: 'N-13', theme: 'normal', role: 'body', fg: 'slate.900', bg: 'slate.50', used: 'STATUS_BOX confirmation' },
  { id: 'N-01', theme: 'normal', role: 'body', fg: 'gray.900', bg: 'white', used: 'FIELD text' },
  { id: 'N-26', theme: 'normal', role: 'non-text', fg: 'gray.500', bg: 'white', used: 'FIELD border' },
  { id: 'N-31', theme: 'normal', role: 'non-text', fg: 'brand.600', bg: 'white', used: 'FIELD focus ring' },
  { id: 'H-05', theme: 'haunted', role: 'body', fg: 'haunted.muted', bg: 'haunted.surface', used: 'MUTED and HEADING in the card' },
  { id: 'H-13', theme: 'haunted', role: 'body', fg: 'haunted.error', bg: 'haunted.surface', used: 'ERROR_TEXT in the card' },
  { id: 'H-03', theme: 'haunted', role: 'body', fg: 'haunted.text', bg: 'haunted.field', used: 'STATUS_BOX confirmation; FIELD text' },
  { id: 'H-26', theme: 'haunted', role: 'non-text', fg: 'haunted.border', bg: 'haunted.surface', used: 'FIELD border in the card' },
  { id: 'H-30', theme: 'haunted', role: 'non-text', fg: 'haunted.accent', bg: 'haunted.surface', used: 'FIELD focus ring in the card' },
];

const COVERED_CONSTANTS = new Set(['CARD', 'STATUS_BOX', 'MUTED', 'HEADING', 'ERROR_TEXT', 'FIELD']);

describe('Contrast_Registry rows for the help components', () => {
  for (const pair of HELP_PAIRS) {
    it(`${pair.id} [${pair.theme}] ${pair.used} exists and meets WCAG AA`, () => {
      const row = CONTRAST_REGISTRY.find((p) => p.id === pair.id && p.theme === pair.theme);
      expect(row, `${pair.id} missing for ${pair.theme}`).toBeDefined();
      expect(row?.fg).toEqual(pair.fg);
      expect(row?.bg).toEqual(pair.bg);
      expect(row?.role).toBe(pair.role);

      const ratio = contrastRatio(resolveColour(pair.fg), resolveColour(pair.bg));
      const minimum = minimumFor(pair.role);
      if (ratio < minimum) {
        throw new Error(formatFailure({ pair: row!, ratio, minimum }));
      }
    });
  }

  it('help components import only style constants whose pairs are listed', () => {
    const dir = path.resolve(__dirname, '../../components/ui/help');
    const files = readdirSync(dir).filter((f) => f.endsWith('.tsx'));
    expect(files.length).toBeGreaterThan(0);
    for (const file of files) {
      const source = readFileSync(path.join(dir, file), 'utf8');
      const match = /import\s*\{([^}]*)\}\s*from\s*'@\/components\/ui\/styles'/.exec(source);
      if (!match) continue;
      for (const name of match[1].split(',').map((s) => s.trim()).filter(Boolean)) {
        expect(COVERED_CONSTANTS.has(name), `${file} uses ${name}, which has no help registry rows`).toBe(true);
      }
    }
  });
});
