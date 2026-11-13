// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { JOB_STATUSES } from '@/types/job';
import type { JobStatus } from '@/types/job';
import { FIXTURE_NOW_MS, makeJobItem, makeLegacyJobItem } from '@/test/jobFixtures';
import {
  acceptBodySchema,
  apiErrorSchema,
  askInfoBodySchema,
  bookBodySchema,
  declineBodySchema,
  homeownerStatusViewSchema,
  jobIdSchema,
  loginBodySchema,
  proJobDetailSchema,
  replyBodySchema,
  storedJobSchema,
} from '@/lib/validation/jobSchema';

const SLOT = '2026-03-06T12:00:00.000Z';
const iso = (ms: number): string => new Date(ms).toISOString();

describe('jobIdSchema', () => {
  it('accepts a v4 UUID', () => {
    expect(jobIdSchema.safeParse('3f2b8c1e-5a4d-4e6f-9a7b-1c2d3e4f5a6b').success).toBe(true);
  });
  it.each(['', 'abc', '3f2b8c1e5a4d4e6f9a7b1c2d3e4f5a6b', '../etc/passwd', 'JOB#3f2b8c1e-5a4d-4e6f-9a7b-1c2d3e4f5a6b'])(
    'rejects %j',
    (v) => {
      expect(jobIdSchema.safeParse(v).success).toBe(false);
    },
  );
  it('rejects non-strings', () => {
    expect(jobIdSchema.safeParse(42).success).toBe(false);
  });
});

describe('loginBodySchema', () => {
  it('keeps the code untrimmed', () => {
    const r = loginBodySchema.parse({ code: ' code ' });
    expect(r.code).toBe(' code ');
  });
  it('accepts 1 and 200 characters', () => {
    expect(loginBodySchema.safeParse({ code: 'a' }).success).toBe(true);
    expect(loginBodySchema.safeParse({ code: 'a'.repeat(200) }).success).toBe(true);
  });
  it('rejects 0 and 201 characters, and a missing code', () => {
    expect(loginBodySchema.safeParse({ code: '' }).success).toBe(false);
    expect(loginBodySchema.safeParse({ code: 'a'.repeat(201) }).success).toBe(false);
    expect(loginBodySchema.safeParse({}).success).toBe(false);
  });
});

describe('storedJobSchema', () => {
  it.each(JOB_STATUSES.map((s) => [s]))('parses a makeJobItem with status %s', (status) => {
    const r = storedJobSchema.safeParse(makeJobItem(status as JobStatus));
    expect(r.success).toBe(true);
  });

  it('strips key attributes (PK, SK, ttl, GSI1*)', () => {
    const r = storedJobSchema.parse(makeJobItem('new'));
    for (const k of ['PK', 'SK', 'ttl', 'GSI1PK', 'GSI1SK']) expect(r).not.toHaveProperty(k);
  });

  it('fails on an unknown status', () => {
    const r = storedJobSchema.safeParse({ ...makeJobItem('new'), status: 'cancelled' });
    expect(r.success).toBe(false);
  });

  it('defaults infoRequests, replies and replyCount when they are missing', () => {
    const item: Record<string, unknown> = { ...makeJobItem('new') };
    delete item.infoRequests;
    delete item.replies;
    delete item.replyCount;
    const r = storedJobSchema.parse(item);
    expect(r.infoRequests).toEqual([]);
    expect(r.replies).toEqual([]);
    expect(r.replyCount).toBe(0);
  });

  describe('legacy item (Requirement 12.14)', () => {
    // Exact behaviour: status and statusUpdatedAt have no default in storedJobSchema, so a
    // pre-feature item is rejected by the schema on exactly those two paths. Only the three new
    // attributes default. Mapping a legacy item to status "new" is the repository's job.
    it('fails only on the missing status and statusUpdatedAt', () => {
      const r = storedJobSchema.safeParse(makeLegacyJobItem());
      expect(r.success).toBe(false);
      if (!r.success) {
        const paths = r.error.issues.map((i) => i.path.join('.')).sort();
        expect(paths).toEqual(['status', 'statusUpdatedAt']);
      }
    });

    it('parses once status and statusUpdatedAt are supplied, defaulting the new attributes', () => {
      const legacy = makeLegacyJobItem();
      const r = storedJobSchema.parse({
        ...legacy,
        status: 'new',
        statusUpdatedAt: legacy.createdAt,
      });
      expect(r.infoRequests).toEqual([]);
      expect(r.replies).toEqual([]);
      expect(r.replyCount).toBe(0);
    });
  });

  it('requires replyCount to equal replies.length', () => {
    const reply = { text: 'Yes', at: iso(FIXTURE_NOW_MS) };
    expect(storedJobSchema.safeParse({ ...makeJobItem('new'), replies: [reply], replyCount: 1 }).success).toBe(true);
    expect(storedJobSchema.safeParse({ ...makeJobItem('new'), replies: [reply], replyCount: 0 }).success).toBe(false);
    expect(storedJobSchema.safeParse({ ...makeJobItem('new'), replies: [], replyCount: 2 }).success).toBe(false);
  });

  it('fails info_requested without a question', () => {
    const r = storedJobSchema.safeParse(makeJobItem('info_requested', { infoRequests: [] }));
    expect(r.success).toBe(false);
  });

  it('fails accepted without offeredSlots', () => {
    const item: Record<string, unknown> = { ...makeJobItem('accepted') };
    delete item.offeredSlots;
    expect(storedJobSchema.safeParse(item).success).toBe(false);
  });

  it('fails booked without bookedSlot', () => {
    const item: Record<string, unknown> = { ...makeJobItem('booked') };
    delete item.bookedSlot;
    expect(storedJobSchema.safeParse(item).success).toBe(false);
  });

  it('still parses an emergency Job with other inconsistencies', () => {
    const item = makeJobItem('emergency', {
      replyCount: 3,
      replies: [],
      infoRequests: [],
      bookedSlot: undefined,
    });
    expect(storedJobSchema.safeParse(item).success).toBe(true);
    const odd = { ...makeJobItem('emergency'), replyCount: 4, status: 'emergency' };
    expect(storedJobSchema.safeParse(odd).success).toBe(true);
  });
});

describe('request body schemas strip unknown fields (Requirement 7.20)', () => {
  const extra = { extra: 'x', isAdmin: true };
  it('loginBodySchema', () => {
    expect(loginBodySchema.parse({ code: 'a', ...extra })).toEqual({ code: 'a' });
  });
  it('declineBodySchema', () => {
    expect(declineBodySchema.parse({ reason: 'busy', ...extra })).toEqual({ reason: 'busy' });
  });
  it('askInfoBodySchema', () => {
    expect(askInfoBodySchema.parse({ question: 'Why?', ...extra })).toEqual({ question: 'Why?' });
  });
  it('replyBodySchema', () => {
    expect(replyBodySchema.parse({ text: 'hi', ...extra })).toEqual({ text: 'hi' });
  });
  it('bookBodySchema', () => {
    expect(bookBodySchema.parse({ slot: SLOT, ...extra })).toEqual({ slot: SLOT });
  });
  it('acceptBodySchema', () => {
    expect(acceptBodySchema(FIXTURE_NOW_MS).parse({ slots: [SLOT], ...extra })).toEqual({ slots: [SLOT] });
  });
});

describe('declineBodySchema', () => {
  it('trims the reason', () => {
    expect(declineBodySchema.parse({ reason: '  Too far  ' })).toEqual({ reason: 'Too far' });
  });
  it.each([[{}], [{ reason: '' }], [{ reason: '   ' }]])('treats %j as no reason', (body) => {
    const r = declineBodySchema.parse(body);
    expect(r).toEqual({});
    expect('reason' in r).toBe(false);
  });
  it('accepts 200 characters and rejects 201', () => {
    expect(declineBodySchema.safeParse({ reason: 'a'.repeat(200) }).success).toBe(true);
    expect(declineBodySchema.safeParse({ reason: 'a'.repeat(201) }).success).toBe(false);
  });
  it('measures length after trimming', () => {
    expect(declineBodySchema.safeParse({ reason: `  ${'a'.repeat(200)}  ` }).success).toBe(true);
  });
  it('rejects a non-string reason', () => {
    expect(declineBodySchema.safeParse({ reason: 5 }).success).toBe(false);
  });
});

describe('askInfoBodySchema', () => {
  it('trims the question', () => {
    expect(askInfoBodySchema.parse({ question: '  Is it wet?  ' })).toEqual({ question: 'Is it wet?' });
  });
  it('rejects empty and whitespace-only questions', () => {
    expect(askInfoBodySchema.safeParse({ question: '' }).success).toBe(false);
    expect(askInfoBodySchema.safeParse({ question: '   ' }).success).toBe(false);
    expect(askInfoBodySchema.safeParse({}).success).toBe(false);
  });
  it('accepts 1 and 300 characters after trim, rejects 301', () => {
    expect(askInfoBodySchema.safeParse({ question: 'a' }).success).toBe(true);
    expect(askInfoBodySchema.safeParse({ question: ` ${'a'.repeat(300)} ` }).success).toBe(true);
    expect(askInfoBodySchema.safeParse({ question: 'a'.repeat(301) }).success).toBe(false);
  });
});

describe('replyBodySchema', () => {
  it.each(['', 'a', '   ', 'a'.repeat(5000)])('accepts a string of length %#', (text) => {
    expect(replyBodySchema.safeParse({ text }).success).toBe(true);
  });
  it.each([[undefined], [null], [5], [['a']], [{}]])('rejects non-string %j', (text) => {
    expect(replyBodySchema.safeParse({ text }).success).toBe(false);
  });
  it('rejects a missing text', () => {
    expect(replyBodySchema.safeParse({}).success).toBe(false);
  });
});

describe('bookBodySchema', () => {
  it('requires a string slot', () => {
    expect(bookBodySchema.safeParse({ slot: SLOT }).success).toBe(true);
    expect(bookBodySchema.safeParse({}).success).toBe(false);
    expect(bookBodySchema.safeParse({ slot: 123 }).success).toBe(false);
    expect(bookBodySchema.safeParse({ slot: null }).success).toBe(false);
  });
});

describe('acceptBodySchema', () => {
  const schema = acceptBodySchema(FIXTURE_NOW_MS);
  it('accepts 1 to 3 valid future slots', () => {
    expect(schema.safeParse({ slots: [SLOT] }).success).toBe(true);
    expect(schema.safeParse({ slots: [SLOT, iso(FIXTURE_NOW_MS + 2 * 86400000)] }).success).toBe(true);
  });
  it('rejects no slots, too many slots, past slots, bad format and a missing field', () => {
    expect(schema.safeParse({ slots: [] }).success).toBe(false);
    const four = [1, 2, 3, 4].map((d) => iso(FIXTURE_NOW_MS + d * 86400000));
    expect(schema.safeParse({ slots: four }).success).toBe(false);
    expect(schema.safeParse({ slots: [iso(FIXTURE_NOW_MS - 1000)] }).success).toBe(false);
    expect(schema.safeParse({ slots: ['tomorrow'] }).success).toBe(false);
    expect(schema.safeParse({}).success).toBe(false);
  });
  it('uses the injected clock', () => {
    const later = acceptBodySchema(FIXTURE_NOW_MS + 10 * 86400000);
    expect(later.safeParse({ slots: [SLOT] }).success).toBe(false);
  });
});

describe('homeownerStatusViewSchema', () => {
  const views = [
    { status: 'new' },
    { status: 'info_requested', question: 'Is it wet?' },
    { status: 'accepted', offeredSlots: [SLOT] },
    { status: 'declined', reason: 'Too far' },
    { status: 'declined' },
    { status: 'booked', bookedSlot: SLOT },
    { status: 'emergency', message: 'Call 911.' },
  ];
  it.each(views.map((v) => [v.status, v]))('accepts the %s view', (_s, view) => {
    expect(homeownerStatusViewSchema.safeParse(view).success).toBe(true);
  });
  it('covers all six statuses', () => {
    expect(new Set(views.map((v) => v.status))).toEqual(new Set(JOB_STATUSES));
  });

  it.each([
    ['accepted without slots', { status: 'accepted' }],
    ['accepted with empty slots', { status: 'accepted', offeredSlots: [] }],
    ['accepted with four slots', { status: 'accepted', offeredSlots: [SLOT, SLOT, SLOT, SLOT] }],
    ['accepted with a non-array', { status: 'accepted', offeredSlots: SLOT }],
    ['info_requested without question', { status: 'info_requested' }],
    ['info_requested with non-string question', { status: 'info_requested', question: 5 }],
    ['booked without slot', { status: 'booked' }],
    ['booked with bad slot', { status: 'booked', bookedSlot: 'soon' }],
    ['emergency without message', { status: 'emergency' }],
    ['declined with non-string reason', { status: 'declined', reason: 5 }],
    ['unknown status', { status: 'cancelled' }],
    ['no status', {}],
  ])('rejects %s', (_n, view) => {
    expect(homeownerStatusViewSchema.safeParse(view).success).toBe(false);
  });

  it('strips fields that belong to another status (non-strict object)', () => {
    const r = homeownerStatusViewSchema.parse({ status: 'new', offeredSlots: [SLOT] });
    expect(r).toEqual({ status: 'new' });
    const e = homeownerStatusViewSchema.parse({ status: 'emergency', message: 'm', extra: 1 });
    expect(e).toEqual({ status: 'emergency', message: 'm' });
  });
});

describe('proJobDetailSchema', () => {
  const answers = { location: 'Kitchen', duration: '', recentChanges: '' };
  const createdAt = iso(FIXTURE_NOW_MS - 3600000);
  const active = {
    id: 'job-1',
    createdAt,
    status: 'accepted',
    urgency: 'soon',
    likelyIssue: 'Leaky tap',
    trade: 'Plumber',
    confidence: 0.6,
    costRangeLow: 50,
    costRangeHigh: 150,
    jobBrief: 'Brief',
    followUpQuestions: ['a?', 'b?'],
    answers,
    infoRequests: [],
    replies: [],
    offeredSlots: [SLOT],
    photos: ['https://example.com/p.jpg'],
  };
  const emergency = {
    id: 'job-2',
    createdAt,
    status: 'emergency',
    urgency: 'emergency',
    likelyIssue: 'Gas smell',
    answers,
    emergencyNote: 'Call 911.',
  };

  it('accepts the active shape', () => {
    expect(proJobDetailSchema.safeParse(active).success).toBe(true);
  });
  it('accepts the emergency shape', () => {
    expect(proJobDetailSchema.safeParse(emergency).success).toBe(true);
  });
  it('rejects an emergency status in the active shape', () => {
    expect(proJobDetailSchema.safeParse({ ...active, status: 'emergency' }).success).toBe(false);
    expect(proJobDetailSchema.safeParse({ ...active, urgency: 'emergency' }).success).toBe(false);
  });
  it('rejects an emergency without a note', () => {
    const { emergencyNote: _omit, ...rest } = emergency;
    void _omit;
    expect(proJobDetailSchema.safeParse(rest).success).toBe(false);
  });
});

describe('apiErrorSchema', () => {
  it('accepts error and message, with an optional status', () => {
    expect(apiErrorSchema.safeParse({ error: 'conflict', message: 'Already booked.' }).success).toBe(true);
    expect(apiErrorSchema.safeParse({ error: 'conflict', message: 'x', status: 'booked' }).success).toBe(true);
  });
  it('rejects a missing message or an unknown status', () => {
    expect(apiErrorSchema.safeParse({ error: 'x' }).success).toBe(false);
    expect(apiErrorSchema.safeParse({ error: 'x', message: 'y', status: 'nope' }).success).toBe(false);
  });
});
