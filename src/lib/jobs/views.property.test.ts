// @vitest-environment node
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { effectiveStatus, toHomeownerStatusView, toProDetail, toProListItem } from '@/lib/jobs/views';
import {
  homeownerStatusViewSchema,
  proJobDetailSchema,
  proJobsResponseSchema,
} from '@/lib/validation/jobSchema';
import { arbitraryJobRecord } from '@/test/jobFixtures';
import type { JobRecord } from '@/types/job';

// Feature: pro-dashboard-and-booking, Property 10: Views expose exactly the allowed fields
// **Validates: Requirements 4.5, 4.7, 5.3, 5.4, 5.10, 8.4, 8.5, 11.13, 11.14, 14.11, 16.15**

const NUM_RUNS = 100;

const FORBIDDEN_KEYS = [
  'diySteps',
  's3Keys',
  'GSI1PK',
  'GSI1SK',
  'ttl',
  'isEmergency',
  'replyCount',
  'statusUpdatedAt',
  'bookedAt',
] as const;

const EMERGENCY_DETAIL_KEYS = ['id', 'createdAt', 'status', 'urgency', 'likelyIssue', 'answers', 'emergencyNote'];
const EMERGENCY_DETAIL_FORBIDDEN = [
  'photos',
  'costRangeLow',
  'costRangeHigh',
  'jobBrief',
  'trade',
  'confidence',
  'followUpQuestions',
  'infoRequests',
  'replies',
  'offeredSlots',
  'bookedSlot',
  'declineReason',
];
const ACTIVE_DETAIL_REQUIRED = [
  'id',
  'createdAt',
  'status',
  'urgency',
  'likelyIssue',
  'trade',
  'confidence',
  'costRangeLow',
  'costRangeHigh',
  'jobBrief',
  'followUpQuestions',
  'answers',
  'infoRequests',
  'replies',
  'photos',
];
const ACTIVE_DETAIL_OPTIONAL = ['offeredSlots', 'bookedSlot', 'declineReason'] as const;

const sorted = (o: object): string[] => Object.keys(o).sort();

/** All object keys at any depth. */
function deepKeys(value: unknown, out: Set<string> = new Set()): Set<string> {
  if (Array.isArray(value)) {
    for (const v of value) deepKeys(v, out);
  } else if (value !== null && typeof value === 'object') {
    for (const [k, v] of Object.entries(value)) {
      out.add(k);
      deepKeys(v, out);
    }
  }
  return out;
}

interface Generated {
  job: JobRecord;
  extraKeys: string[];
  photos: string[];
}

/** A JobRecord with stray extra keys, random photo URLs and sometimes a forced emergency marker. */
const arbitraryGenerated: fc.Arbitrary<Generated> = fc
  .record({
    base: arbitraryJobRecord,
    strays: fc.record({
      diySteps: fc.array(fc.string(), { maxLength: 3 }),
      s3Keys: fc.array(fc.string(), { maxLength: 3 }),
      GSI1PK: fc.constant('JOBS'),
      GSI1SK: fc.string(),
      ttl: fc.nat(),
      isEmergency: fc.boolean(),
      replyCount: fc.nat(),
      statusUpdatedAt: fc.string(),
      bookedAt: fc.string(),
    }),
    randomExtras: fc.uniqueArray(
      fc.tuple(fc.stringMatching(/^[a-z]{3,10}$/).map((s) => `zz_${s}`), fc.jsonValue()),
      { selector: ([k]) => k, maxLength: 4 },
    ),
    force: fc.constantFrom('none', 'none', 'urgency', 'flag', 'both'),
    photos: fc.array(fc.webUrl(), { maxLength: 6 }),
  })
  .map(({ base, strays, randomExtras, force, photos }): Generated => {
    const job: Record<string, unknown> = { ...base, ...strays };
    // Keep the base record's own isEmergency unless a force asks for it (strays may flip it).
    job.isEmergency = base.isEmergency;
    // Strays that overlap real fields must not corrupt the record; restore real ones.
    for (const k of ['statusUpdatedAt', 'replyCount', 'bookedAt'] as const) {
      if (base[k] !== undefined) job[k] = base[k];
    }
    if (base.bookedAt === undefined) job.bookedAt = strays.bookedAt;
    for (const [k, v] of randomExtras) job[k] = v;
    if (force === 'urgency' || force === 'both') job.urgency = 'emergency';
    if (force === 'flag' || force === 'both') job.isEmergency = true;
    return { job: job as unknown as JobRecord, extraKeys: randomExtras.map(([k]) => k), photos };
  });

function expectNoForbidden(view: unknown, extraKeys: string[]): void {
  const keys = deepKeys(view);
  for (const k of [...FORBIDDEN_KEYS, ...extraKeys]) expect(keys.has(k)).toBe(false);
}

const isEmergencyJob = (job: JobRecord): boolean => job.urgency === 'emergency' || job.isEmergency === true;

describe('Property 10: Views expose exactly the allowed fields', () => {
  it('list item has exactly {id, createdAt, urgency, trade, location, status} and passes the list schema', () => {
    fc.assert(
      fc.property(arbitraryGenerated, ({ job, extraKeys }) => {
        const item = toProListItem(job);
        expect(sorted(item)).toEqual(['createdAt', 'id', 'location', 'status', 'trade', 'urgency']);
        expectNoForbidden(item, extraKeys);
        expect(proJobsResponseSchema.safeParse({ jobs: [item] }).success).toBe(true);
      }),
      { numRuns: NUM_RUNS },
    );
  });

  it('detail has exactly the allowed keys for its shape and passes proJobDetailSchema', () => {
    fc.assert(
      fc.property(arbitraryGenerated, ({ job, extraKeys, photos }) => {
        const detail = toProDetail(job, photos);
        expectNoForbidden(detail, extraKeys);
        expect(proJobDetailSchema.safeParse(detail).success).toBe(true);

        if (effectiveStatus(job) === 'emergency') {
          expect(sorted(detail)).toEqual([...EMERGENCY_DETAIL_KEYS].sort());
          for (const k of EMERGENCY_DETAIL_FORBIDDEN) expect(k in detail).toBe(false);
          expect(detail.status).toBe('emergency');
          expect(detail.urgency).toBe('emergency');
        } else {
          const expected = [...ACTIVE_DETAIL_REQUIRED];
          for (const k of ACTIVE_DETAIL_OPTIONAL) if (job[k] !== undefined) expected.push(k);
          expect(sorted(detail)).toEqual(expected.sort());
          expect(sorted((detail as { answers: object }).answers)).toEqual(['duration', 'location', 'recentChanges']);
        }
      }),
      { numRuns: NUM_RUNS },
    );
  });

  it('homeowner status view has exactly the per-status keys and passes homeownerStatusViewSchema', () => {
    fc.assert(
      fc.property(arbitraryGenerated, ({ job, extraKeys }) => {
        const view = toHomeownerStatusView(job);
        expectNoForbidden(view, extraKeys);
        expect(homeownerStatusViewSchema.safeParse(view).success).toBe(true);

        const status = effectiveStatus(job);
        expect(view.status).toBe(status);
        switch (status) {
          case 'emergency':
            expect(sorted(view)).toEqual(['message', 'status']);
            break;
          case 'new':
            expect(sorted(view)).toEqual(['status']);
            break;
          case 'info_requested':
            expect(sorted(view)).toEqual(['question', 'status']);
            break;
          case 'accepted':
            expect(sorted(view)).toEqual(['offeredSlots', 'status']);
            break;
          case 'declined':
            expect(sorted(view)).toEqual(job.declineReason !== undefined ? ['reason', 'status'] : ['status']);
            break;
          case 'booked':
            expect(sorted(view)).toEqual(['bookedSlot', 'status']);
            break;
        }
      }),
      { numRuns: NUM_RUNS },
    );
  });

  it('any job with urgency emergency or isEmergency true gets emergency-shaped views whatever its stored status', () => {
    fc.assert(
      fc.property(
        arbitraryGenerated.filter(({ job }) => isEmergencyJob(job)),
        ({ job, photos }) => {
          expect(toProListItem(job).status).toBe('emergency');
          expect(toProListItem(job).trade).toBeNull();

          const detail = toProDetail(job, photos);
          expect(sorted(detail)).toEqual([...EMERGENCY_DETAIL_KEYS].sort());

          expect(sorted(toHomeownerStatusView(job))).toEqual(['message', 'status']);
          expect(toHomeownerStatusView(job).status).toBe('emergency');
        },
      ),
      { numRuns: NUM_RUNS },
    );
  });
});
