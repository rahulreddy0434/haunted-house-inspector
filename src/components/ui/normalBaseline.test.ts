/*
 * screens-polish task 1.3 (Requirements 1.9, 15.2): deliberate update after task 1.2.
 *
 * Test mechanics: COLOUR_CLASS now also recognises 
ormal-* and adge-* token colours. Without
 * that the new token classes would be invisible and the lock would be weaker, not stricter.
 * No other file's expectation changed.
 *
 * ui/styles.ts
 *   removed: bg-blue-700, bg-slate-50, bg-white, border-blue-800, border-gray-500, border-slate-300,
 *     border-slate-500, focus-visible:ring-blue-600, focus-visible:ring-brand-600, hover:bg-blue-800,
 *     hover:bg-slate-100, text-gray-900, text-red-800, text-slate-600, text-slate-700, text-slate-900,
 *     text-white
 *   added: active:bg-normal-accent-hover, active:bg-normal-table-head, active:border-normal-accent-hover,
 *     active:text-normal-accent-hover, bg-badge-emergency-bg, bg-badge-monitor-bg, bg-badge-soon-bg,
 *     bg-badge-urgent-bg, bg-normal-accent, bg-normal-card, bg-normal-page, border-badge-emergency-bg,
 *     border-badge-monitor-text, border-badge-soon-text, border-badge-urgent-text, border-normal-accent,
 *     border-normal-card-border, border-normal-muted, focus-visible:ring-normal-accent,
 *     hover:bg-normal-accent-hover, hover:bg-normal-page, hover:border-normal-accent-hover,
 *     hover:text-normal-accent-hover, text-badge-emergency-text, text-badge-monitor-text,
 *     text-badge-soon-text, text-badge-urgent-text, text-normal-accent, text-normal-card,
 *     text-normal-emergency, text-normal-muted, text-normal-text
 *   renamed (old -> new): bg-white -> bg-normal-card, bg-slate-50 -> bg-normal-page,
 *     bg-blue-700 -> bg-normal-accent, border-slate-300 -> border-normal-card-border,
 *     border-gray-500 / border-slate-500 -> border-normal-muted, border-blue-800 -> border-normal-accent,
 *     text-slate-900 / text-gray-900 -> text-normal-text, text-slate-600 / text-slate-700 -> text-normal-muted,
 *     text-red-800 -> text-normal-emergency, text-white -> text-normal-card,
 *     focus-visible:ring-blue-600 / ring-brand-600 -> focus-visible:ring-normal-accent,
 *     hover:bg-blue-800 -> hover:bg-normal-accent-hover, hover:bg-slate-100 -> hover:bg-normal-page
 *
 * results/CostRange.tsx (colours come from CARD in ui/styles.ts)
 *   removed: bg-white, border-slate-300, text-slate-900
 *   added: bg-normal-card, border-normal-card-border, text-normal-text
 *   unchanged: text-slate-700 (the file's own class)
 *
 * screens-polish task 2.3 (Requirements 1.9, 15.2): header, footer, layout and Pro page chrome.
 * New locked entries (none of these files was in the baseline before; expectations are not loosened):
 *
 * ui/SiteHeader.tsx (new file)
 *   locked: bg-normal-card, bg-normal-text, border-normal-card-border, focus-visible:ring-normal-accent,
 *     focus:bg-normal-card, focus:text-normal-text, text-normal-accent, text-normal-card
 *
 * ui/SiteFooter.tsx (new file)
 *   locked: bg-normal-card, border-normal-card-border, focus-visible:ring-normal-accent
 *
 * ../app/layout.tsx (outside components/, reached through a relative path)
 *   removed: border-gray-200, focus:bg-white, focus:text-gray-900, text-gray-600 (header, footer and skip link
 *     moved into SiteHeader.tsx / SiteFooter.tsx)
 *   locked: bg-white, text-gray-900 (the body classes that remain)
 *
 * screens-polish task 2.6 (page background): ../app/layout.tsx body now uses the PAGE_BG recipe.
 *   removed: bg-white, text-gray-900
 *   added: bg-normal-page, text-normal-text (read from the PAGE_BG recipe in ui/styles.ts, so a recipe
 *     change still fails this test; the body's own haunted: classes are unchanged)
 *   test mechanics: CARD_RECIPE_USERS also maps '../app/layout.tsx' to 'PAGE_BG'
 *
 * pro/ProDashboard.tsx, pro/JobDetail.tsx, pro/ProChrome.tsx, pro/ProChromeContext.tsx
 *   no own Normal colour classes before or after task 2 (empty lists, so any raw colour class added later fails)
 *
 * screens-polish task 3.12 (Requirements 1.9, 14.1, 15.2): Emergency_Reason_Sentence.
 *
 * results/EmergencyReasonLine.tsx (new file)
 *   locked: text-normal-text (no haunted: class, no theme variant)
 *
 * results/ResultsView.tsx
 *   unchanged: bg-blue-700, border-blue-800, focus-visible:ring-blue-600, hover:bg-blue-800, text-red-800,
 *     text-slate-700, text-slate-900, text-white (the sentence adds no class here; it comes from the component)
 *
 * results/StatusPanel.tsx
 *   unchanged: empty list (the sentence adds no class here)
 *
 * pro/ProEmergencyView.tsx (new entry)
 *   locked: empty list (colours come from NOTE_BOX/BODY recipes and EmergencyReasonLine; any raw colour
 *     class added later fails)
 *
 * screens-polish task 4.7 (Requirements 1.9, 15.2): intake and upload components restyled in task 4.
 * Expectations were edited to the new classes; nothing was loosened.
 *
 * upload/DataRetentionNotice.tsx
 *   removed: bg-slate-50, border-slate-300, text-slate-900
 *   added: bg-normal-notice, border-normal-notice-border, text-normal-accent, text-normal-text
 *   renamed (old -> new): bg-slate-50 -> bg-normal-notice, border-slate-300 -> border-normal-notice-border,
 *     text-slate-900 -> text-normal-text
 *
 * upload/DropZone.tsx
 *   removed: bg-white, border-brand-200
 *   added: bg-normal-accent, bg-normal-card, bg-normal-notice, bg-normal-table-head, border-normal-accent,
 *     border-normal-card-border, border-normal-muted, focus-visible:ring-normal-accent,
 *     hover:bg-normal-accent-hover, peer-focus-visible:ring-normal-accent, text-normal-accent,
 *     text-normal-card, text-normal-muted, text-normal-text
 *   unchanged: bg-brand-100, bg-brand-50, bg-brand-700, bg-red-50, border-brand-300, border-brand-600,
 *     border-brand-700, border-red-300, focus-visible:outline-brand-900, hover:bg-brand-50,
 *     hover:bg-brand-800, peer-focus-visible:outline-brand-900, text-brand-800, text-brand-900,
 *     text-red-900, text-slate-700, text-slate-900, text-white
 *
 * intake/InspectionPanel.tsx (new file): locked: border-normal-card-border
 * intake/LiveSummary.tsx (new file): locked: text-normal-text
 * intake/StepTwo.tsx, intake/StepThree.tsx, intake/SelectField.tsx, intake/StepList.tsx,
 *   intake/ReviewList.tsx, intake/GuidedIntake.tsx: locked: empty lists (no own colour classes; any raw
 *   colour class added later fails)
 * ../app/page.tsx (new entry): locked: text-normal-muted, text-normal-text
 *
 * screens-polish task 4 follow-up: the empty-state drop area in upload/DropZone.tsx now uses the same
 * Normal tokens as the drop area shown with photos (DROP_AREA, DROP_AREA_ACTIVE, ADD_LABEL, MUTED_TEXT).
 * Expectations were edited to the new classes; nothing was loosened.
 *
 * upload/DropZone.tsx
 *   removed: bg-brand-100, bg-brand-50, border-brand-300, border-brand-600,
 *     peer-focus-visible:outline-brand-900, text-slate-900
 *   added: none (bg-normal-card, bg-normal-notice, border-normal-accent, border-normal-muted,
 *     peer-focus-visible:ring-normal-accent, text-normal-muted and text-normal-text were already listed;
 *     the empty-state area now uses them too)
 *   unchanged: bg-brand-700, border-brand-700, focus-visible:outline-brand-900, hover:bg-brand-50,
 *     hover:bg-brand-800, text-brand-800, text-brand-900, text-slate-700, text-white (the "Try again" and
 *     "Use photos instead" buttons, the "Preparing" line and the no-files line, which this follow-up leaves alone)
 *   renamed (old -> new): bg-brand-50 -> bg-normal-card, border-brand-300 -> border-normal-muted,
 *     text-slate-900 -> text-normal-text, bg-brand-100 -> bg-normal-notice, border-brand-600 -> border-normal-accent,
 *     peer-focus-visible:outline-brand-900 -> peer-focus-visible:ring-normal-accent
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Normal-theme baseline (haunted-mode task 3.1, Requirements 3.5, 16.8).
 *
 * Captured BEFORE any edit of styles.ts or the task 3.3 components. For each file it lists the
 * colour classes that do NOT start with `haunted:` (Normal theme and variant classes such as
 * `hover:` and `focus-visible:`). The lists are inline on purpose so nothing updates them silently.
 *
 * Allowed later change (task 3.2): the FIELD recipe border `border-gray-400` becomes
 * `border-gray-500`. Update only the `ui/styles.ts` expectation below. `ContextForm.tsx` and
 * `JobBrief.tsx` hold their own `border-gray-400` and must stay unchanged unless 3.3 says otherwise.
 *
 * Files with an empty list use no raw colour classes in Normal (they use shared recipes).
 */

const COLOUR_NAMES =
  'slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose';
const COLOUR_CLASS = new RegExp(
  '^(?:[a-z0-9-]+:)*(?:text|bg|border|ring|ring-offset|accent|fill|stroke|divide|placeholder|outline)-' +
    `(?:(?:${COLOUR_NAMES})-\\d{2,3}|white|black|transparent|current|brand-\\d+|haunted-[a-z]+|normal-[a-z-]+|badge-[a-z-]+)(?:/\\d+)?$`,
);

/**
 * Files whose Normal colours come from a shared recipe in `ui/styles.ts` through `<Card>`, not from
 * their own classes. The recipe's non-haunted colour classes count as the file's effective Normal
 * classes, so a change to the recipe still fails this test.
 */
const CARD_RECIPE_USERS: Record<string, 'CARD' | 'STATUS_BOX' | 'PAGE_BG'> = {
  'results/CostRange.tsx': 'CARD',
  '../app/layout.tsx': 'PAGE_BG',
};

function recipeSource(name: string): string {
  const styles = readFileSync(join(process.cwd(), 'src', 'components', 'ui', 'styles.ts'), 'utf8');
  const match = new RegExp(`export const ${name} =\\s*'([^']*)'`).exec(styles);
  if (!match) throw new Error(`Recipe ${name} not found in styles.ts`);
  return match[1];
}

function normalColourClasses(relativePath: string): string[] {
  const recipe = CARD_RECIPE_USERS[relativePath];
  const source =
    readFileSync(join(process.cwd(), 'src', 'components', relativePath), 'utf8') +
    (recipe ? ' ' + recipeSource(recipe) : '');
  const tokens = source
    .split(/[\s'"`{}()<>=,;]+/)
    .filter((token) => !token.startsWith('haunted:') && COLOUR_CLASS.test(token));
  return [...new Set(tokens)].sort();
}

const BASELINE: Record<string, string[]> = {
  'ui/styles.ts': [
    'active:bg-normal-accent-hover', 'active:bg-normal-table-head', 'active:border-normal-accent-hover',
    'active:text-normal-accent-hover', 'bg-badge-emergency-bg', 'bg-badge-monitor-bg', 'bg-badge-soon-bg',
    'bg-badge-urgent-bg', 'bg-normal-accent', 'bg-normal-card', 'bg-normal-page',
    'border-badge-emergency-bg', 'border-badge-monitor-text', 'border-badge-soon-text',
    'border-badge-urgent-text', 'border-normal-accent', 'border-normal-card-border', 'border-normal-muted',
    'focus-visible:ring-normal-accent', 'hover:bg-normal-accent-hover', 'hover:bg-normal-page',
    'hover:border-normal-accent-hover', 'hover:text-normal-accent-hover', 'text-badge-emergency-text',
    'text-badge-monitor-text', 'text-badge-soon-text', 'text-badge-urgent-text', 'text-normal-accent',
    'text-normal-card', 'text-normal-emergency', 'text-normal-muted', 'text-normal-text',
  ],
  'upload/DataRetentionNotice.tsx': ['bg-normal-notice', 'border-normal-notice-border', 'text-normal-accent', 'text-normal-text'],
  'upload/UploadStatusPanel.tsx': [
    'bg-brand-700', 'bg-red-50', 'bg-slate-50', 'border-red-300', 'border-slate-300',
    'focus-visible:outline-brand-900', 'hover:bg-brand-800', 'text-brand-900', 'text-red-900',
    'text-slate-900', 'text-white',
  ],
  'upload/DropZone.tsx': [
    'bg-brand-700', 'bg-normal-accent', 'bg-normal-card', 'bg-normal-notice',
    'bg-normal-table-head', 'bg-red-50', 'border-brand-700',
    'border-normal-accent', 'border-normal-card-border', 'border-normal-muted', 'border-red-300',
    'focus-visible:outline-brand-900', 'focus-visible:ring-normal-accent', 'hover:bg-brand-50',
    'hover:bg-brand-800', 'hover:bg-normal-accent-hover',
    'peer-focus-visible:ring-normal-accent', 'text-brand-800', 'text-brand-900', 'text-normal-accent',
    'text-normal-card', 'text-normal-muted', 'text-normal-text', 'text-red-900', 'text-slate-700',
    'text-white',
  ],
  'upload/UploadProgress.tsx': [
    'bg-blue-600', 'bg-gray-200', 'bg-gray-400', 'bg-green-600', 'bg-red-600', 'border-gray-200',
    'text-gray-700', 'text-gray-800', 'text-gray-900',
  ],
  'results/ResultsView.tsx': [
    'bg-blue-700', 'border-blue-800', 'focus-visible:ring-blue-600', 'hover:bg-blue-800',
    'text-red-800', 'text-slate-700', 'text-slate-900', 'text-white',
  ],
  'results/IssueSummary.tsx': ['bg-white', 'border-slate-300', 'text-slate-600', 'text-slate-900'],
  'results/CostRange.tsx': ['bg-normal-card', 'border-normal-card-border', 'text-normal-text', 'text-slate-700'],
  'results/JobBrief.tsx': [
    'bg-blue-700', 'bg-gray-50', 'bg-white', 'border-blue-800', 'border-gray-300', 'border-gray-500',
    'focus-visible:ring-blue-600', 'hover:bg-blue-800', 'text-gray-900', 'text-green-800',
    'text-red-800', 'text-white',
  ],
  'results/StatusPanel.tsx': [],
  'results/EmergencyReasonLine.tsx': ['text-normal-text'],
  'pro/ProEmergencyView.tsx': [],
  'results/ReplyBox.tsx': [],
  'results/SlotPicker.tsx': ['accent-blue-700', 'focus-visible:ring-blue-600'],
  'results/UrgencyBadge.tsx': [
    'bg-green-100', 'bg-orange-100', 'bg-red-100', 'bg-yellow-100', 'border-green-600',
    'border-orange-600', 'border-red-600', 'border-yellow-600', 'text-green-900', 'text-orange-900',
    'text-red-900', 'text-yellow-900',
  ],
  'pro/AccessCodeForm.tsx': [],
  'pro/JobListItem.tsx': ['focus-visible:ring-blue-600'],
  'pro/PhotoGallery.tsx': ['focus-visible:ring-blue-600'],
  'pro/JobFacts.tsx': [],
  'pro/ActionPanel.tsx': [],
  'pro/ProDashboard.tsx': [],
  'pro/JobDetail.tsx': [],
  'pro/ProChrome.tsx': [],
  'pro/ProChromeContext.tsx': [],
  'ui/SiteHeader.tsx': [
    'bg-normal-card', 'bg-normal-text', 'border-normal-card-border', 'focus-visible:ring-normal-accent',
    'focus:bg-normal-card', 'focus:text-normal-text', 'text-normal-accent', 'text-normal-card',
  ],
  'ui/SiteFooter.tsx': ['bg-normal-card', 'border-normal-card-border', 'focus-visible:ring-normal-accent'],
  '../app/layout.tsx': ['bg-normal-page', 'text-normal-text'],
  'pro/AcceptForm.tsx': [],
  'pro/DeclineForm.tsx': [],
  'intake/InspectionPanel.tsx': ['border-normal-card-border'],
  'intake/LiveSummary.tsx': ['text-normal-text'],
  'intake/StepTwo.tsx': [],
  'intake/StepThree.tsx': [],
  'intake/SelectField.tsx': [],
  'intake/StepList.tsx': [],
  'intake/ReviewList.tsx': [],
  'intake/GuidedIntake.tsx': [],
  '../app/page.tsx': ['text-normal-muted', 'text-normal-text'],
};

describe('Normal theme baseline (non-haunted colour classes)', () => {
  it.each(Object.entries(BASELINE))('%s keeps its Normal colour classes', (file, expected) => {
    expect(normalColourClasses(file)).toEqual([...expected].sort());
  });
});
