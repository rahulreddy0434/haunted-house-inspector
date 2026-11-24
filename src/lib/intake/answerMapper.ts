import { SAFETY_CHIPS } from '@/lib/intake/safetyChips';
import { EXTRAS_OPTIONS, SOMETHING_ELSE } from '@/lib/intake/options';
import { MAX_ANSWER_LENGTH } from '@/lib/utils/contextAnswers';
import type { IntakeChoices, LocationOption } from '@/types/intake';
import type { ContextAnswers } from '@/types/inspection';

/** Same set the Safety_Layer strips before matching. */
const ZERO_WIDTH = /[\u00AD\u200B-\u200D\u2060\uFEFF]/g;
const CONTROL = /\p{Cc}/gu;
const WHITESPACE_RUN = /\s+/g;
const SENTENCE_END = /[.!?]$/;

/** ": " between a location label and its text. */
const LOCATION_SEPARATOR_LENGTH = 2;

/**
 * Clean Free_Text: remove zero-width characters, turn control characters into
 * spaces, collapse whitespace runs to one space and trim.
 */
export function cleanFreeText(raw: string): string {
  return raw
    .replace(ZERO_WIDTH, '')
    .replace(CONTROL, ' ')
    .replace(WHITESPACE_RUN, ' ')
    .trim();
}

/**
 * Shorten text to at most `maxUnits` UTF-16 units without splitting a code
 * point, then trim trailing whitespace.
 */
export function truncateUtf16(text: string, maxUnits: number): string {
  if (maxUnits <= 0) return '';
  if (text.length <= maxUnits) return text;
  let used = 0;
  let out = '';
  for (const ch of text) {
    if (used + ch.length > maxUnits) break;
    out += ch;
    used += ch.length;
  }
  return out.trimEnd();
}

/** Longest Exact_Place_Text that still fits in `location` for this label. */
export function exactPlaceLimit(location: LocationOption | null): number {
  const labelLength = location ? location.length : 0;
  return Math.max(0, MAX_ANSWER_LENGTH - (labelLength + LOCATION_SEPARATOR_LENGTH));
}

function withFullStop(part: string): string {
  return SENTENCE_END.test(part) ? part : `${part}.`;
}

/** The fixed part of recentChanges: Safety_Wording first, then Extras labels. */
function fixedPrefix(choices: IntakeChoices): string {
  const safety = SAFETY_CHIPS.filter((c) => choices.safety.includes(c.id)).map((c) => c.wording);
  const extras = EXTRAS_OPTIONS.filter(
    (o) => o !== SOMETHING_ELSE && choices.extras.includes(o),
  ).map(withFullStop);
  return [...safety, ...extras].join(' ');
}

/** Longest Something_Else_Text that still fits in `recentChanges`. */
export function somethingElseLimit(choices: IntakeChoices): number {
  const prefix = fixedPrefix(choices);
  // Room for a separator (when there is a prefix) and a final full stop.
  return Math.max(0, MAX_ANSWER_LENGTH - prefix.length - (prefix ? 1 : 0) - 1);
}

/** Convert the chip choices and Free_Text into the three request answers. */
export function mapAnswers(choices: IntakeChoices): ContextAnswers {
  const label = choices.location ?? '';
  const place = truncateUtf16(cleanFreeText(choices.placeText), exactPlaceLimit(choices.location));
  const location = label && place ? `${label}: ${place}` : label;

  const duration = choices.duration ?? '';

  const prefix = fixedPrefix(choices);
  const wantsFree = choices.extras.includes(SOMETHING_ELSE);
  const free = wantsFree
    ? truncateUtf16(cleanFreeText(choices.somethingElseText), somethingElseLimit(choices))
    : '';
  const freePart = free ? withFullStop(free) : '';
  const recentChanges = [prefix, freePart].filter((p) => p !== '').join(' ');

  return { location, duration, recentChanges };
}
