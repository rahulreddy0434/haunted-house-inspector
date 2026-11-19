export type TradeCategory =
  | 'Plumbing'
  | 'Electrical'
  | 'Heating and cooling'
  | 'Moisture and mould'
  | 'Other';

export interface GhostTrade {
  /** Only selects the ghost name. */
  category: TradeCategory;
  ghostName: string;
  /** Trimmed trade text, first letter upper-cased (leading "hvac" word shown as "HVAC"). */
  tradeDisplayText: string;
  /** `${ghostName} (${tradeDisplayText})`, e.g. "Poltergeist (Plumber)". */
  label: string;
}

interface TradeRule {
  readonly category: TradeCategory;
  readonly ghostName: string;
  readonly needles: readonly string[];
}

/** First match wins, in this order. Adding a trade means adding one row. */
const TRADE_RULES: readonly TradeRule[] = Object.freeze([
  Object.freeze({
    category: 'Plumbing',
    ghostName: 'Poltergeist',
    needles: Object.freeze(['plumb']),
  }),
  Object.freeze({
    category: 'Electrical',
    ghostName: 'Wraith',
    needles: Object.freeze(['electric']),
  }),
  Object.freeze({
    category: 'Heating and cooling',
    ghostName: 'Banshee',
    needles: Object.freeze(['hvac', 'heating', 'cooling', 'furnace', 'boiler', 'air condition']),
  }),
  Object.freeze({
    category: 'Moisture and mould',
    ghostName: 'Ghoul',
    needles: Object.freeze(['mould', 'mold', 'damp', 'moisture']),
  }),
] as TradeRule[]);

const OTHER_GHOST_NAME = 'Restless spirit';

/** A leading whole word "hvac" (case-insensitive). */
const LEADING_HVAC = /^hvac(?![\p{L}\p{N}_])/iu;

function capitaliseFirst(text: string): string {
  const first = String.fromCodePoint(text.codePointAt(0) ?? 0);
  const upper = first.toUpperCase();
  // Only change the letter when the lower-case form stays the same.
  if (upper !== first && upper.toLowerCase() === first.toLowerCase()) {
    return upper + text.slice(first.length);
  }
  return text;
}

function toDisplayText(trimmed: string): string {
  if (LEADING_HVAC.test(trimmed)) {
    return 'HVAC' + trimmed.slice(4);
  }
  return capitaliseFirst(trimmed);
}

export function mapTrade(tradeText: string): GhostTrade | null {
  if (typeof tradeText !== 'string') return null;
  const trimmed = tradeText.trim();
  if (trimmed === '') return null;

  const lower = trimmed.toLowerCase();
  const rule = TRADE_RULES.find((r) => r.needles.some((needle) => lower.includes(needle)));
  const category: TradeCategory = rule ? rule.category : 'Other';
  const ghostName = rule ? rule.ghostName : OTHER_GHOST_NAME;
  const tradeDisplayText = toDisplayText(trimmed);

  return {
    category,
    ghostName,
    tradeDisplayText,
    label: `${ghostName} (${tradeDisplayText})`,
  };
}
