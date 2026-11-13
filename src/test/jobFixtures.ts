import fc from 'fast-check';
import { emergencyResult, normalResult } from '@/test/inspectionFixtures';
import type { InspectionResult } from '@/types/inspection';
import type { InfoRequest, JobRecord, JobStatus, ReplyEntry } from '@/types/job';
import { JOB_STATUSES } from '@/types/job';

/** Fixed "now" for fixtures: 2026-03-05T12:00:00.000Z. Offered slots are relative to this. */
export const FIXTURE_NOW_MS = Date.UTC(2026, 2, 5, 12, 0, 0);

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;
const TTL_SECONDS = 30 * 24 * 60 * 60;

/** A stored DynamoDB item for a Job (what the table holds, before storedJobSchema strips key attributes). */
export interface StoredJobItem extends JobRecord {
  PK: string;
  SK: string;
  ttl: number;
  GSI1PK: 'JOBS';
  GSI1SK: string;
}

const iso = (ms: number): string => new Date(ms).toISOString();

function ttlFor(createdAt: string): number {
  return Math.floor(Date.parse(createdAt) / 1000) + TTL_SECONDS;
}

/** Three canonical future slots, ascending, within 30 days of FIXTURE_NOW_MS. */
function fixtureSlots(count: number): string[] {
  return [1, 2, 3].slice(0, count).map((d) => iso(FIXTURE_NOW_MS + d * DAY_MS));
}

function keyAttributes(result: InspectionResult): Pick<StoredJobItem, 'PK' | 'SK' | 'ttl' | 'GSI1PK' | 'GSI1SK'> {
  return {
    PK: `JOB#${result.id}`,
    SK: `JOB#${result.id}`,
    ttl: ttlFor(result.createdAt),
    GSI1PK: 'JOBS',
    GSI1SK: result.createdAt,
  };
}

/** Builds a consistent stored Job item for a status. Overrides are applied last; PK/SK follow an overridden `id`. */
export function makeJobItem(status: JobStatus, overrides: Partial<StoredJobItem> = {}): StoredJobItem {
  const base = status === 'emergency' ? emergencyResult : normalResult;
  const createdAt = iso(FIXTURE_NOW_MS - HOUR_MS);
  const result: InspectionResult = { ...base, createdAt };

  const infoRequests: InfoRequest[] = [];
  const replies: ReplyEntry[] = [];
  const extra: Partial<StoredJobItem> = {};

  if (status === 'info_requested') {
    infoRequests.push({ question: 'Is the leak constant?', askedAt: iso(FIXTURE_NOW_MS - 30 * 60 * 1000) });
  }
  if (status === 'accepted' || status === 'booked') {
    extra.offeredSlots = fixtureSlots(3);
  }
  if (status === 'booked') {
    extra.bookedSlot = fixtureSlots(3)[1];
    extra.bookedAt = iso(FIXTURE_NOW_MS - 5 * 60 * 1000);
  }
  if (status === 'declined') {
    extra.declineReason = 'Outside my service area.';
  }

  const item: StoredJobItem = {
    ...keyAttributes(result),
    ...result,
    status,
    statusUpdatedAt: status === 'new' || status === 'emergency' ? createdAt : iso(FIXTURE_NOW_MS - 20 * 60 * 1000),
    infoRequests,
    replies,
    replyCount: replies.length,
    ...extra,
    ...overrides,
  };

  if (overrides.id !== undefined) {
    if (overrides.PK === undefined) item.PK = `JOB#${overrides.id}`;
    if (overrides.SK === undefined) item.SK = `JOB#${overrides.id}`;
  }
  if (overrides.createdAt !== undefined) {
    if (overrides.GSI1SK === undefined) item.GSI1SK = overrides.createdAt;
    if (overrides.ttl === undefined) item.ttl = ttlFor(overrides.createdAt);
    if (overrides.statusUpdatedAt === undefined && (status === 'new' || status === 'emergency')) {
      item.statusUpdatedAt = overrides.createdAt;
    }
  }
  return item;
}

/** A Job stored before this feature: key attributes, ttl and result fields only (no status, no index keys, no new attributes). */
export function makeLegacyJobItem(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  const result: InspectionResult = { ...normalResult, createdAt: iso(FIXTURE_NOW_MS - HOUR_MS) };
  return {
    PK: `JOB#${result.id}`,
    SK: `JOB#${result.id}`,
    ttl: ttlFor(result.createdAt),
    ...result,
    ...overrides,
  };
}

// ── fast-check arbitraries ──────────────────────────────────────────────────

const WORD_CHARS = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';

/** Non-empty, already-trimmed text (letters and digits only) up to `max` characters. */
function text(max: number): fc.Arbitrary<string> {
  return fc.string({ unit: fc.constantFrom(...WORD_CHARS.split('')), minLength: 1, maxLength: max });
}

/** Optional answer: empty or up to 500 characters. */
const optionalAnswer = fc.oneof(fc.constant(''), text(500));

const createdAtMs = fc.integer({ min: Date.UTC(2025, 0, 1), max: Date.UTC(2027, 0, 1) });

const arbitraryAnswers = fc.record({
  location: text(500),
  duration: optionalAnswer,
  recentChanges: optionalAnswer,
});

const arbitraryUrgencyNonEmergency = fc.constantFrom('urgent', 'soon', 'monitor') as fc.Arbitrary<
  'urgent' | 'soon' | 'monitor'
>;

const arbitraryNormalResult: fc.Arbitrary<InspectionResult> = fc
  .record({
    id: fc.uuid(),
    createdAtMs,
    s3Keys: fc.array(text(60), { minLength: 1, maxLength: 5 }),
    likelyIssue: text(500),
    trade: text(100),
    urgency: arbitraryUrgencyNonEmergency,
    confidence: fc.double({ min: 0, max: 1, noNaN: true, noDefaultInfinity: true }),
    costs: fc.tuple(fc.integer({ min: 0, max: 999999 }), fc.integer({ min: 0, max: 999999 })),
    jobBrief: text(1000),
    followUpQuestions: fc.tuple(text(200), text(200)),
    diySteps: fc.array(text(200), { maxLength: 3 }),
    answers: arbitraryAnswers,
  })
  .map(({ createdAtMs: ms, costs, ...rest }) => ({
    ...rest,
    createdAt: iso(ms),
    costRangeLow: Math.min(costs[0], costs[1]),
    costRangeHigh: Math.max(costs[0], costs[1]),
    isEmergency: false,
  }));

const arbitraryEmergencyResult: fc.Arbitrary<InspectionResult> = arbitraryNormalResult.map((r) => ({
  ...r,
  urgency: 'emergency',
  isEmergency: true,
  costRangeLow: 0,
  costRangeHigh: 0,
  jobBrief: '',
  diySteps: [],
}));

/** InspectionResult with valid field limits; includes the emergency shape. */
export const arbitraryInspectionResult: fc.Arbitrary<InspectionResult> = fc.oneof(
  { weight: 3, arbitrary: arbitraryNormalResult },
  { weight: 1, arbitrary: arbitraryEmergencyResult },
);

/** 1..3 distinct canonical future slots, ascending, within 30 days of FIXTURE_NOW_MS. */
const arbitrarySlots: fc.Arbitrary<string[]> = fc
  .uniqueArray(fc.integer({ min: 1, max: 30 * 24 }), { minLength: 1, maxLength: 3 })
  .map((hours) => hours.sort((a, b) => a - b).map((h) => iso(FIXTURE_NOW_MS + h * HOUR_MS)));

/** A JobRecord for any of the six statuses, built consistently (the emergency shape for `emergency`). */
export const arbitraryJobRecord: fc.Arbitrary<JobRecord> = fc
  .record({
    status: fc.constantFrom(...JOB_STATUSES),
    normal: arbitraryNormalResult,
    emergency: arbitraryEmergencyResult,
    slots: arbitrarySlots,
    bookedIndexSeed: fc.nat(),
    infoCount: fc.integer({ min: 0, max: 5 }),
    questions: fc.array(text(300), { minLength: 5, maxLength: 5 }),
    replyTexts: fc.array(text(500), { minLength: 5, maxLength: 5 }),
    replyCountSeed: fc.nat(),
    declineReason: fc.option(text(200), { nil: undefined }),
    updatedAfterMs: fc.integer({ min: 0, max: 10 * DAY_MS }),
  })
  .map((g): JobRecord => {
    const result = g.status === 'emergency' ? g.emergency : g.normal;
    const createdMs = Date.parse(result.createdAt);
    const statusUpdatedAt = iso(createdMs + g.updatedAfterMs);

    // info_requested needs at least one request; replies never exceed requests.
    const infoCount = g.status === 'info_requested' ? Math.max(1, g.infoCount) : g.status === 'emergency' ? 0 : g.infoCount;
    const infoRequests: InfoRequest[] = g.questions
      .slice(0, infoCount)
      .map((question, i) => ({ question, askedAt: iso(createdMs + (i + 1) * 1000) }));
    const maxReplies = g.status === 'info_requested' ? infoCount - 1 : infoCount;
    const replyCount = maxReplies > 0 ? g.replyCountSeed % (maxReplies + 1) : 0;
    const replies: ReplyEntry[] = g.replyTexts
      .slice(0, replyCount)
      .map((t, i) => ({ text: t, at: iso(createdMs + (i + 1) * 2000) }));

    const record: JobRecord = {
      ...result,
      status: g.status,
      statusUpdatedAt,
      infoRequests,
      replies,
      replyCount: replies.length,
    };
    if (g.status === 'accepted' || g.status === 'booked') record.offeredSlots = g.slots;
    if (g.status === 'booked') {
      record.bookedSlot = g.slots[g.bookedIndexSeed % g.slots.length];
      record.bookedAt = statusUpdatedAt;
    }
    if (g.status === 'declined' && g.declineReason !== undefined) record.declineReason = g.declineReason;
    return record;
  });
