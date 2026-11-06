import 'server-only';

import type { BedrockInspectionResponse } from '@/types/bedrock';
import type { ContextAnswers, InspectionResult } from '@/types/inspection';

export interface SafetyCheckInput {
  contextAnswers: ContextAnswers;
  /** undefined when called before/without a Bedrock response */
  bedrockOutput?: string;
}

export type EmergencyConditionCode =
  | 'GAS_SMELL'
  | 'ELECTRICAL_FIRE'
  | 'WATER_ELECTRICAL'
  | 'CO_ALARM';

export interface SafetyCheckResult {
  isEmergency: boolean;
  triggeredCondition?: EmergencyConditionCode;
}

/**
 * Fields of InspectionResult that are not produced by Bedrock. The caller
 * (route handler) supplies them; all are optional so the 3-argument form of
 * `applyOverrides` keeps working. Defaults: id '', createdAt the Unix epoch
 * (ISO 8601), s3Keys [], answers with empty strings. Defaults are constants so
 * the function stays pure and deterministic.
 */
export interface OverrideContext {
  id?: string;
  createdAt?: string;
  s3Keys?: string[];
  answers?: ContextAnswers;
}

/** Max characters allowed between the end of one term and the start of the other. */
const PROXIMITY = 200;

/** Terms matched as whole words only (not adjacent to a letter or digit). */
const WHOLE_WORD_TERMS = new Set(['gas', 'co']);

const GAS_NEAR = ['smell', 'odor', 'odour', 'leak', 'hiss'];
const FIRE_HEAT = ['spark', 'burning', 'scorch', 'smoke', 'melt'];
const FIRE_ELECTRIC = [
  'outlet',
  'socket',
  'plug',
  'panel',
  'breaker',
  'wire',
  'wiring',
  'switch',
  'appliance',
  'electrical',
];
const WATER_TERMS = ['water', 'flood', 'leak', 'wet'];
const WATER_ELECTRIC = ['outlet', 'socket', 'panel', 'breaker', 'wiring', 'electrical'];

const CO_PHRASES = ['carbon monoxide', 'co alarm', 'co detector'];

interface Span {
  start: number;
  end: number; // exclusive
}

function isAlnum(ch: string | undefined): boolean {
  return ch !== undefined && /[a-z0-9]/i.test(ch);
}

/** All (possibly overlapping) occurrences of `term` in lowercase `text`. */
function findAll(text: string, term: string): Span[] {
  const spans: Span[] = [];
  // Whole-word check applies to the leading 'co'/'gas' token of the term.
  const wholeWord = WHOLE_WORD_TERMS.has(term) || term.startsWith('co ');
  const wholeWordTrailing = WHOLE_WORD_TERMS.has(term);
  let from = 0;
  while (from <= text.length - term.length) {
    const idx = text.indexOf(term, from);
    if (idx === -1) break;
    const end = idx + term.length;
    const okBefore = !wholeWord || !isAlnum(text[idx - 1]);
    const okAfter = !wholeWordTrailing || !isAlnum(text[end]);
    if (okBefore && okAfter) spans.push({ start: idx, end });
    from = idx + 1;
  }
  return spans;
}

function findAny(text: string, terms: string[]): Span[] {
  return terms.flatMap((t) => findAll(text, t));
}

/** True if any span in `a` is within PROXIMITY chars of any span in `b` (either order). */
function anyNear(a: Span[], b: Span[]): boolean {
  for (const x of a) {
    for (const y of b) {
      const gap = y.start >= x.end ? y.start - x.end : x.start >= y.end ? x.start - y.end : -1;
      if (gap >= 0 && gap <= PROXIMITY) return true;
    }
  }
  return false;
}

function detect(rawText: string): EmergencyConditionCode | undefined {
  const text = rawText.toLowerCase();

  if (text.includes('rotten egg') || anyNear(findAll(text, 'gas'), findAny(text, GAS_NEAR))) {
    return 'GAS_SMELL';
  }
  if (CO_PHRASES.some((p) => findAll(text, p).length > 0)) {
    return 'CO_ALARM';
  }
  if (anyNear(findAny(text, FIRE_HEAT), findAny(text, FIRE_ELECTRIC))) {
    return 'ELECTRICAL_FIRE';
  }
  if (anyNear(findAny(text, WATER_TERMS), findAny(text, WATER_ELECTRIC))) {
    return 'WATER_ELECTRICAL';
  }
  return undefined;
}

/**
 * Detects emergency conditions. Each context answer (location, duration,
 * recentChanges) and the Bedrock output (when provided) is evaluated
 * individually, so a trigger pair cannot be formed across separate fields.
 */
export function checkEmergency(input: SafetyCheckInput): SafetyCheckResult {
  const { contextAnswers, bedrockOutput } = input;
  const texts: string[] = [
    contextAnswers.location,
    contextAnswers.duration,
    contextAnswers.recentChanges,
  ];
  if (bedrockOutput !== undefined) texts.push(bedrockOutput);

  for (const t of texts) {
    if (typeof t !== 'string' || t.length === 0) continue;
    const code = detect(t);
    if (code) return { isEmergency: true, triggeredCondition: code };
  }
  return { isEmergency: false };
}

const NO_DIY_TRADE_KEYWORDS = ['electric', 'gas', 'hvac', 'furnace'];

/**
 * Merges the Bedrock result with the safety result. Emergency always wins:
 * urgency 'emergency', zeroed costs, empty job brief, no DIY steps.
 * DIY steps are also removed for electrical/gas/HVAC/furnace trades.
 *
 * `context` carries the non-Bedrock fields (id, createdAt, s3Keys, answers);
 * see {@link OverrideContext} for defaults.
 */
export function applyOverrides(
  bedrockResult: BedrockInspectionResponse,
  safetyResult: SafetyCheckResult,
  trade: string,
  context: OverrideContext = {},
): InspectionResult {
  const tradeLower = trade.toLowerCase();
  const dangerousTrade = NO_DIY_TRADE_KEYWORDS.some((k) => tradeLower.includes(k));
  const emergency = safetyResult.isEmergency;

  return {
    id: context.id ?? '',
    createdAt: context.createdAt ?? new Date(0).toISOString(),
    s3Keys: context.s3Keys ?? [],
    likelyIssue: bedrockResult.likelyIssue,
    trade,
    urgency: emergency ? 'emergency' : bedrockResult.urgency,
    confidence: bedrockResult.confidence,
    costRangeLow: emergency ? 0 : bedrockResult.costRangeLow,
    costRangeHigh: emergency ? 0 : bedrockResult.costRangeHigh,
    jobBrief: emergency ? '' : bedrockResult.jobBrief,
    followUpQuestions: bedrockResult.followUpQuestions,
    diySteps: emergency || dangerousTrade ? [] : [...bedrockResult.diySteps],
    isEmergency: emergency,
    answers: context.answers ?? { location: '', duration: '', recentChanges: '' },
  };
}
