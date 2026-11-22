import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import type { Theme } from '@/lib/theme';
import { contrastRatio, minimumFor } from './contrast';
import { resolveColour } from './palette';
import { CONTRAST_REGISTRY, formatFailure, type ColourSpec, type PairRole } from './contrastRegistry';

/**
 * Colour pairs used by src/components/ui/chat/*. Every colour comes from a constant in
 * src/components/ui/styles.ts. Each row names the registry id that must hold the pair.
 */
interface ChatPair {
  id: string;
  theme: Theme;
  role: PairRole;
  fg: ColourSpec;
  bg: ColourSpec;
  used: string;
}

const CHAT_PAIRS: readonly ChatPair[] = [
  // Normal theme
  { id: 'N-02', theme: 'normal', role: 'body', fg: 'slate.900', bg: 'white', used: 'CARD bubble text' },
  { id: 'N-13', theme: 'normal', role: 'body', fg: 'slate.900', bg: 'slate.50', used: 'STATUS_BOX bubble text (own messages)' },
  { id: 'N-04', theme: 'normal', role: 'body', fg: 'slate.700', bg: 'white', used: 'MUTED: sender line, hints, count, loading' },
  { id: 'N-14', theme: 'normal', role: 'body', fg: 'slate.700', bg: 'slate.50', used: 'MUTED inside STATUS_BOX bubble' },
  { id: 'N-03', theme: 'normal', role: 'body', fg: 'slate.600', bg: 'white', used: 'HEADING: "Messages"' },
  { id: 'N-10', theme: 'normal', role: 'body', fg: 'red.800', bg: 'white', used: 'ERROR_TEXT: send and check errors' },
  { id: 'N-01', theme: 'normal', role: 'body', fg: 'gray.900', bg: 'white', used: 'FIELD text in the composer' },
  { id: 'N-26', theme: 'normal', role: 'non-text', fg: 'gray.500', bg: 'white', used: 'FIELD border' },
  { id: 'N-31', theme: 'normal', role: 'non-text', fg: 'brand.600', bg: 'white', used: 'FIELD focus ring' },
  // Haunted theme
  { id: 'H-02', theme: 'haunted', role: 'body', fg: 'haunted.text', bg: 'haunted.surface', used: 'CARD bubble text' },
  { id: 'H-03', theme: 'haunted', role: 'body', fg: 'haunted.text', bg: 'haunted.field', used: 'STATUS_BOX bubble text; FIELD text' },
  { id: 'H-04', theme: 'haunted', role: 'body', fg: 'haunted.muted', bg: 'haunted.bg', used: 'MUTED and HEADING on the page' },
  { id: 'H-05', theme: 'haunted', role: 'body', fg: 'haunted.muted', bg: 'haunted.surface', used: 'MUTED sender line in a CARD bubble' },
  { id: 'H-06', theme: 'haunted', role: 'body', fg: 'haunted.muted', bg: 'haunted.field', used: 'MUTED in STATUS_BOX bubble; placeholder' },
  { id: 'H-12', theme: 'haunted', role: 'body', fg: 'haunted.error', bg: 'haunted.bg', used: 'ERROR_TEXT on the page' },
  { id: 'H-13', theme: 'haunted', role: 'body', fg: 'haunted.error', bg: 'haunted.surface', used: 'ERROR_TEXT inside a card' },
  { id: 'H-25', theme: 'haunted', role: 'non-text', fg: 'haunted.border', bg: 'haunted.bg', used: 'FIELD border on the page' },
  { id: 'H-26', theme: 'haunted', role: 'non-text', fg: 'haunted.border', bg: 'haunted.surface', used: 'FIELD border inside a card' },
  { id: 'H-29', theme: 'haunted', role: 'non-text', fg: 'haunted.accent', bg: 'haunted.bg', used: 'FIELD focus ring on the page' },
  { id: 'H-30', theme: 'haunted', role: 'non-text', fg: 'haunted.accent', bg: 'haunted.surface', used: 'FIELD focus ring inside a card' },
];

/** Style constants the chat components may use; each is covered by the rows above. */
const COVERED_CONSTANTS = new Set(['CARD', 'STATUS_BOX', 'MUTED', 'HEADING', 'ERROR_TEXT', 'FIELD']);

describe('Contrast_Registry rows for the chat components', () => {
  for (const pair of CHAT_PAIRS) {
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

  it('chat components import only style constants whose pairs are listed', () => {
    const dir = path.resolve(__dirname, '../../components/ui/chat');
    const files = readdirSync(dir).filter((f) => f.endsWith('.tsx'));
    expect(files.length).toBeGreaterThan(0);
    for (const file of files) {
      const source = readFileSync(path.join(dir, file), 'utf8');
      const match = /import\s*\{([^}]*)\}\s*from\s*'@\/components\/ui\/styles'/.exec(source);
      if (!match) continue;
      const names = match[1].split(',').map((s) => s.trim()).filter(Boolean);
      for (const name of names) {
        expect(COVERED_CONSTANTS.has(name), `${file} uses ${name}, which has no chat registry rows`).toBe(true);
      }
    }
  });
});
