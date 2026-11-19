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
    `(?:(?:${COLOUR_NAMES})-\\d{2,3}|white|black|transparent|current|brand-\\d+|haunted-[a-z]+)(?:/\\d+)?$`,
);

/**
 * Files whose Normal colours come from a shared recipe in `ui/styles.ts` through `<Card>`, not from
 * their own classes. The recipe's non-haunted colour classes count as the file's effective Normal
 * classes, so a change to the recipe still fails this test.
 */
const CARD_RECIPE_USERS: Record<string, 'CARD' | 'STATUS_BOX'> = {
  'results/CostRange.tsx': 'CARD',
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
    'bg-blue-700', 'bg-slate-50', 'bg-white', 'border-blue-800',
    'border-gray-500', 'border-slate-300', 'border-slate-500', 'focus-visible:ring-blue-600', 'focus-visible:ring-brand-600',
    'hover:bg-blue-800', 'hover:bg-slate-100', 'text-gray-900', 'text-red-800', 'text-slate-600',
    'text-slate-700', 'text-slate-900', 'text-white',
  ],
  'upload/DataRetentionNotice.tsx': ['bg-slate-50', 'border-slate-300', 'text-slate-900'],
  'upload/UploadFlow.tsx': [
    'bg-brand-700', 'bg-red-50', 'bg-slate-50', 'border-red-300', 'border-slate-300',
    'focus-visible:outline-brand-900', 'hover:bg-brand-800', 'text-brand-900', 'text-red-700',
    'text-red-900', 'text-slate-900', 'text-white',
  ],
  'upload/DropZone.tsx': [
    'bg-brand-100', 'bg-brand-50', 'bg-brand-700', 'bg-red-50', 'bg-white', 'border-brand-200',
    'border-brand-300', 'border-brand-600', 'border-brand-700', 'border-red-300',
    'focus-visible:outline-brand-900', 'hover:bg-brand-50', 'hover:bg-brand-800',
    'peer-focus-visible:outline-brand-900', 'text-brand-800', 'text-brand-900', 'text-red-900',
    'text-slate-700', 'text-slate-900', 'text-white',
  ],
  'upload/UploadProgress.tsx': [
    'bg-blue-600', 'bg-gray-200', 'bg-gray-400', 'bg-green-600', 'bg-red-600', 'border-gray-200',
    'text-gray-700', 'text-gray-800', 'text-gray-900',
  ],
  'upload/ContextForm.tsx': [
    'bg-white', 'border-gray-400', 'focus-visible:ring-brand-600', 'placeholder:text-gray-500',
    'text-gray-600', 'text-gray-900', 'text-red-700',
  ],
  'results/ResultsView.tsx': [
    'bg-blue-700', 'border-blue-800', 'focus-visible:ring-blue-600', 'hover:bg-blue-800',
    'text-red-800', 'text-slate-700', 'text-slate-900', 'text-white',
  ],
  'results/IssueSummary.tsx': ['bg-white', 'border-slate-300', 'text-slate-600', 'text-slate-900'],
  'results/CostRange.tsx': ['bg-white', 'border-slate-300', 'text-slate-700', 'text-slate-900'],
  'results/JobBrief.tsx': [
    'bg-blue-700', 'bg-gray-50', 'bg-white', 'border-blue-800', 'border-gray-300', 'border-gray-500',
    'focus-visible:ring-blue-600', 'hover:bg-blue-800', 'text-gray-900', 'text-green-800',
    'text-red-800', 'text-white',
  ],
  'results/StatusPanel.tsx': [],
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
  'pro/JobHistory.tsx': [],
  'pro/ActionPanel.tsx': [],
  'pro/AcceptForm.tsx': [],
  'pro/DeclineForm.tsx': [],
  'pro/AskInfoForm.tsx': [],
};

describe('Normal theme baseline (non-haunted colour classes)', () => {
  it.each(Object.entries(BASELINE))('%s keeps its Normal colour classes', (file, expected) => {
    expect(normalColourClasses(file)).toEqual([...expected].sort());
  });
});
