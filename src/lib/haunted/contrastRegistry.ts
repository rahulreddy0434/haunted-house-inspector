// Colour pairs are token names; hex values live only in tailwind.config.ts.
// Row ids and ratios follow the colour pair table in the haunted-mode design.
// Imports palette.ts, so this module is for tests and tooling, not the browser bundle.
import type { Theme } from '@/lib/theme';
import { contrastRatio, minimumFor, type ContrastRole } from './contrast';
import { resolveColour, type ColourRef } from './palette';

export type PairRole = ContrastRole;
export type ColourSpec = ColourRef;

export interface ColourPair {
  id: string;
  theme: Theme;
  role: PairRole;
  usage: string;
  fg: ColourSpec;
  bg: ColourSpec;
}

const FOG: ColourSpec = { base: 'haunted.bg', overlay: 'haunted.fog', alpha: 0.3 };
const COBWEB: ColourSpec = { base: 'haunted.surface', overlay: 'haunted.border', alpha: 0.3 };

function row(
  id: string,
  theme: Theme,
  role: PairRole,
  fg: ColourSpec,
  bg: ColourSpec,
  usage: string,
): ColourPair {
  return { id, theme, role, usage, fg, bg };
}

const H = (id: string, role: PairRole, fg: ColourSpec, bg: ColourSpec, usage: string) =>
  row(id, 'haunted', role, fg, bg, usage);
const N = (id: string, role: PairRole, fg: ColourSpec, bg: ColourSpec, usage: string) =>
  row(id, 'normal', role, fg, bg, usage);

const FIXED_EMERGENCY: ReadonlyArray<Omit<ColourPair, 'theme'>> = [
  { id: 'F-01', role: 'body', fg: 'white', bg: 'red.700', usage: 'Emergency banner text and icon' },
  { id: 'F-02', role: 'non-text', fg: 'red.900', bg: 'white', usage: 'Banner border against the page' },
  { id: 'F-03', role: 'body', fg: 'red.900', bg: 'red.100', usage: 'Emergency badge text' },
  { id: 'F-04', role: 'non-text', fg: 'red.600', bg: 'red.100', usage: 'Emergency badge border' },
  { id: 'F-05', role: 'body', fg: 'slate.900', bg: 'slate.50', usage: 'Pro emergency note (NOTE_BOX)' },
];

export const CONTRAST_REGISTRY: readonly ColourPair[] = [
  // Haunted theme, text and icons
  H('H-01', 'body', 'haunted.text', 'haunted.bg', 'Page text, header and footer text'),
  H('H-02', 'body', 'haunted.text', 'haunted.surface', 'Card text'),
  H('H-03', 'body', 'haunted.text', 'haunted.field', 'Fields, status box, badges, secondary buttons'),
  H('H-04', 'body', 'haunted.muted', 'haunted.bg', 'Lead text, footer'),
  H('H-05', 'body', 'haunted.muted', 'haunted.surface', 'Card hints'),
  H('H-06', 'body', 'haunted.muted', 'haunted.field', 'Placeholders, hints in fields'),
  H('H-07', 'body', 'haunted.accent', 'haunted.bg', 'Page title, site link, links'),
  H('H-08', 'body', 'haunted.accent', 'haunted.surface', 'Card headings'),
  H('H-09', 'body', 'haunted.accent', 'haunted.field', 'Headings in the status box'),
  H('H-10', 'body', 'haunted.on-accent', 'haunted.accent', 'Primary button text'),
  H('H-11', 'body', 'haunted.on-accent', 'haunted.accent-hover', 'Primary button text on hover'),
  H('H-12', 'body', 'haunted.error', 'haunted.bg', 'Error text on page'),
  H('H-13', 'body', 'haunted.error', 'haunted.surface', 'Error text in cards and the upload error box'),
  H('H-14', 'body', 'haunted.error', 'haunted.field', 'Error text in fields'),
  H('H-15', 'body', 'haunted.ok', 'haunted.bg', '"Copied!" on page'),
  H('H-16', 'body', 'haunted.ok', 'haunted.surface', '"Copied!" in a card'),
  H('H-17', 'body', 'haunted.text', FOG, 'Footer and page text over the fog'),
  H('H-18', 'body', 'haunted.muted', FOG, 'Footer text over the fog'),
  H('H-19', 'body', 'haunted.accent', FOG, 'Links over the fog'),
  H('H-20', 'body', 'haunted.error', FOG, 'Errors over the fog'),
  H('H-21', 'body', 'haunted.text', COBWEB, 'Card text over a cobweb'),
  H('H-22', 'body', 'haunted.muted', COBWEB, 'Card hints over a cobweb'),
  H('H-23', 'body', 'haunted.accent', COBWEB, 'Card headings over a cobweb'),
  H('H-24', 'body', 'haunted.error', COBWEB, 'Errors over a cobweb'),
  // Haunted theme, non-text
  H('H-25', 'non-text', 'haunted.border', 'haunted.bg', 'Field and secondary button border on the page; switch track border'),
  H('H-26', 'non-text', 'haunted.border', 'haunted.surface', 'Field border inside a card'),
  H('H-27', 'non-text', 'haunted.border', 'haunted.field', 'Border against its own field fill'),
  H('H-28', 'non-text', 'haunted.border', FOG, 'Field border over the fog'),
  H('H-29', 'non-text', 'haunted.accent', 'haunted.bg', 'Primary button against the page; focus ring; switch track On'),
  H('H-30', 'non-text', 'haunted.accent', 'haunted.surface', 'Primary button and focus ring inside a card'),
  H('H-31', 'non-text', 'haunted.accent', 'haunted.field', 'Focus ring on fields and badge border (urgent)'),
  H('H-32', 'non-text', 'haunted.accent', FOG, 'Primary button and focus ring over the fog'),
  H('H-33', 'non-text', 'haunted.on-accent', 'haunted.accent', 'Switch thumb, On'),
  H('H-34', 'non-text', 'haunted.muted', 'haunted.field', 'Switch thumb, Off'),
  H('H-35', 'non-text', 'haunted.soon', 'haunted.field', 'Soon badge border'),
  H('H-36', 'non-text', 'haunted.ok', 'haunted.field', 'Monitor badge border, done progress'),
  // Fixed emergency pairs, once per theme (same colours)
  ...FIXED_EMERGENCY.map((p) => ({ ...p, theme: 'normal' as Theme })),
  ...FIXED_EMERGENCY.map((p) => ({ ...p, theme: 'haunted' as Theme })),
  // Normal theme, text
  N('N-01', 'body', 'gray.900', 'white', 'Body text, site link'),
  N('N-02', 'body', 'slate.900', 'white', 'Card text'),
  N('N-03', 'body', 'slate.600', 'white', 'HEADING'),
  N('N-04', 'body', 'slate.700', 'white', 'MUTED, cost label'),
  N('N-05', 'body', 'gray.700', 'white', 'Home lead text'),
  N('N-06', 'body', 'gray.600', 'white', 'Footer, hints'),
  N('N-07', 'body', 'brand.700', 'white', 'Home page title'),
  N('N-08', 'body', 'brand.800', 'white', 'Drop zone label'),
  N('N-09', 'body', 'brand.900', 'white', 'Upload status line'),
  N('N-10', 'body', 'red.800', 'white', 'Error text'),
  N('N-11', 'body', 'red.700', 'white', 'Field error text'),
  N('N-12', 'body', 'green.800', 'white', '"Copied!"'),
  N('N-13', 'body', 'slate.900', 'slate.50', 'Status box, retention notice'),
  N('N-14', 'body', 'slate.700', 'slate.50', 'Muted text in status box'),
  N('N-15', 'body', 'gray.900', 'gray.50', 'Job brief textarea'),
  N('N-16', 'body', 'red.900', 'red.50', 'Upload error box'),
  N('N-17', 'body', 'brand.800', 'brand.50', 'Drop zone button hover'),
  N('N-18', 'body', 'slate.900', 'slate.100', 'Secondary button hover'),
  N('N-19', 'body', 'white', 'brand.700', 'Upload primary button'),
  N('N-20', 'body', 'white', 'brand.800', 'Upload primary button hover'),
  N('N-21', 'body', 'white', 'blue.700', 'PRIMARY_BUTTON'),
  N('N-22', 'body', 'white', 'blue.800', 'PRIMARY_BUTTON hover'),
  N('N-23', 'body', 'orange.900', 'orange.100', 'Urgent badge text'),
  N('N-24', 'body', 'yellow.900', 'yellow.100', 'Soon badge text'),
  N('N-25', 'body', 'green.900', 'green.100', 'Monitor badge text'),
  // Normal theme, non-text
  N('N-26', 'non-text', 'gray.500', 'white', 'Field border; switch track Off; switch thumb Off'),
  N('N-27', 'non-text', 'gray.500', 'gray.50', 'Textarea border on gray-50'),
  N('N-28', 'non-text', 'slate.500', 'white', 'Secondary button border'),
  N('N-29', 'non-text', 'blue.700', 'white', 'Primary button against the page'),
  N('N-30', 'non-text', 'blue.600', 'white', 'Focus ring (blue-600)'),
  N('N-31', 'non-text', 'brand.600', 'white', 'Focus ring (brand-600)'),
  N('N-32', 'non-text', 'brand.600', 'slate.50', 'Focus ring inside a status box'),
  // Guided intake (ChipGroup, StepProgress). The other intake pairs reuse existing rows:
  //   chip text N-02/H-03, chip border N-28/H-25/H-27, selected chip text N-21/H-10,
  //   selected chip fill against the page N-29/H-29, focus ring against the page N-30/H-29,
  //   progress fill against track H-31, "Step N of 3" N-04/H-04, emergency banner F-01/F-02.
  N('N-33', 'non-text', 'blue.800', 'white', 'Selected chip border against the page'),
  N('N-34', 'non-text', 'blue.700', 'slate.300', 'Progress fill against its track'),
  // Normal_Palette base pairs (screens-polish task 1.4). The Haunted equivalents are
  // H-01/H-02 (text), H-05 (muted on card), H-07/H-08 (accent text), H-10/H-11 (accent button text),
  // H-29/H-30 (focus ring) and H-35/H-36/H-31 (badge borders), so they are not repeated here.
  N('N-35', 'body', 'normal.text', 'normal.page', 'Text on the page background'),
  N('N-36', 'body', 'normal.text', 'normal.card', 'Text on a card'),
  N('N-37', 'body', 'normal.muted', 'normal.page', 'Muted text on the page background'),
  N('N-38', 'body', 'normal.muted', 'normal.card', 'Muted text on a card'),
  N('N-39', 'body', 'normal.accent', 'normal.page', 'Accent text and links on the page'),
  N('N-40', 'body', 'normal.accent', 'normal.card', 'Accent text and headings on a card'),
  N('N-41', 'body', 'normal.card', 'normal.accent', 'Accent button text'),
  N('N-42', 'body', 'normal.card', 'normal.accent-hover', 'Accent button text on hover'),
  N('N-43', 'non-text', 'normal.accent', 'normal.page', 'Focus ring and accent button against the page'),
  N('N-44', 'non-text', 'normal.accent', 'normal.card', 'Focus ring and accent button inside a card'),
  N('N-45', 'body', 'badge.soon-text', 'badge.soon-bg', 'Soon badge text'),
  N('N-46', 'body', 'badge.urgent-text', 'badge.urgent-bg', 'Urgent badge text'),
  N('N-47', 'body', 'badge.monitor-text', 'badge.monitor-bg', 'Monitor badge text'),
  N('N-48', 'body', 'badge.emergency-text', 'badge.emergency-bg', 'Emergency badge text'),
  // Emergency badge colours are fixed, so the same pair is registered for Haunted too.
  H('H-37', 'body', 'badge.emergency-text', 'badge.emergency-bg', 'Emergency badge text (fixed colours)'),
  // Header and footer (screens-polish task 2.4). Haunted header and footer are transparent over haunted.bg.
  N('N-49', 'body', 'normal.accent', 'normal.card', 'Header title'),
  N('N-50', 'body', 'normal.card', 'normal.text', 'PRO tag text'),
  N('N-51', 'body', 'normal.text', 'normal.card', 'Log out button text'),
  N('N-52', 'non-text', 'normal.muted', 'normal.card', 'Log out button border'),
  N('N-53', 'body', 'gray.900', 'normal.card', 'Haunted_Switch label'),
  N('N-54', 'non-text', 'gray.500', 'normal.card', 'Haunted_Switch track border and thumb, Off'),
  N('N-55', 'body', 'normal.muted', 'normal.card', 'Footer text'),
  N('N-56', 'body', 'normal.accent', 'normal.card', 'Footer link'),
  // Emergency_Reason_Sentence (screens-polish task 3.12). It sits directly on the page background on the
  // results, status and Pro emergency views. EmergencyScope forces the effective theme to Normal there,
  // so no Haunted row is needed. Same colours as N-35; kept as its own row so the usage is traceable.
  N('N-57', 'body', 'normal.text', 'normal.page', 'Emergency reason sentence on the page background'),
  H('H-38', 'body', 'haunted.accent', 'haunted.bg', 'Header title'),
  H('H-39', 'body', 'haunted.on-accent', 'haunted.accent', 'PRO tag text'),
  H('H-40', 'body', 'haunted.text', 'haunted.field', 'Log out button text'),
  H('H-41', 'non-text', 'haunted.border', 'haunted.bg', 'Log out button border'),
  H('H-42', 'body', 'haunted.text', 'haunted.bg', 'Haunted_Switch label'),
  H('H-43', 'non-text', 'haunted.border', 'haunted.field', 'Haunted_Switch track border, Off'),
  H('H-44', 'body', 'haunted.muted', 'haunted.bg', 'Footer text'),
  H('H-45', 'body', 'haunted.accent', 'haunted.bg', 'Footer link'),
];

export { minimumFor };

export interface RegistryFailure {
  pair: ColourPair;
  ratio: number;
  minimum: number;
}

/** Returns every pair whose ratio is below its minimum. Empty means all pass. */
export function checkRegistry(): RegistryFailure[] {
  const failures: RegistryFailure[] = [];
  for (const pair of CONTRAST_REGISTRY) {
    const ratio = contrastRatio(resolveColour(pair.fg), resolveColour(pair.bg));
    const minimum = minimumFor(pair.role);
    if (ratio < minimum) failures.push({ pair, ratio, minimum });
  }
  return failures;
}

export function formatFailure(f: RegistryFailure): string {
  const { pair, ratio, minimum } = f;
  return `${pair.id} [${pair.theme}/${pair.role}] ${pair.usage}: ratio ${ratio.toFixed(2)} is below the minimum ${minimum}`;
}
