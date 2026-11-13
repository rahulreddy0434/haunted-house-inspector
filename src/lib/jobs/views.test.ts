// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { effectiveStatus, toHomeownerStatusView, toProDetail, toProListItem } from '@/lib/jobs/views';
import { EMERGENCY_MESSAGE, PRO_EMERGENCY_NOTE } from '@/lib/emergency/messages';
import { makeJobItem } from '@/test/jobFixtures';
import type { JobStatus } from '@/types/job';

const EMERGENCY_LITERAL =
  'This may be dangerous. Get everyone to safety and call 911. For a gas smell, leave the home first, then call 911 or your gas utility from outside.';
const NOTE_LITERAL = 'Emergency: the homeowner was told to call 911';

const FORBIDDEN = ['diySteps', 's3Keys', 'isEmergency', 'ttl', 'GSI1PK', 'GSI1SK', 'replyCount', 'statusUpdatedAt', 'bookedAt'];
const OTHER_STATUSES: JobStatus[] = ['new', 'info_requested', 'accepted', 'declined', 'booked'];
const ALL_STATUSES: JobStatus[] = [...OTHER_STATUSES, 'emergency'];

const keys = (o: object): string[] => Object.keys(o).sort();

const LIST_KEYS = ['createdAt', 'id', 'location', 'status', 'trade', 'urgency'];
const ACTIVE_BASE_KEYS = [
  'answers', 'confidence', 'costRangeHigh', 'costRangeLow', 'createdAt', 'followUpQuestions', 'id', 'infoRequests',
  'jobBrief', 'likelyIssue', 'photos', 'replies', 'status', 'trade', 'urgency',
];
const EMERGENCY_DETAIL_KEYS = ['answers', 'createdAt', 'emergencyNote', 'id', 'likelyIssue', 'status', 'urgency'];

const ID = '11111111-1111-4111-8111-111111111111';
const CREATED = new Date(Date.UTC(2026, 2, 5, 11, 0, 0)).toISOString();
const SLOTS = [1, 2, 3].map((d) => new Date(Date.UTC(2026, 2, 5, 12, 0, 0) + d * 86400000).toISOString());
const PHOTOS = ['https://example.test/a.jpg', 'https://example.test/b.jpg'];

function expectNoForbidden(value: unknown): void {
  const json = JSON.stringify(value);
  for (const k of FORBIDDEN) expect(json).not.toContain(`"${k}"`);
}

describe('toProListItem', () => {
  it.each(OTHER_STATUSES)('maps a %s job to exactly the list fields', (status) => {
    const item = makeJobItem(status);
    const out = toProListItem(item);
    expect(keys(out)).toEqual(LIST_KEYS);
    expect(out).toEqual({
      id: ID,
      createdAt: CREATED,
      urgency: 'soon',
      trade: 'plumber',
      location: 'Kitchen',
      status,
    });
    expectNoForbidden(out);
  });

  it('maps an emergency job with trade null', () => {
    const out = toProListItem(makeJobItem('emergency'));
    expect(keys(out)).toEqual(LIST_KEYS);
    expect(out).toEqual({
      id: ID,
      createdAt: CREATED,
      urgency: 'emergency',
      trade: null,
      location: 'Kitchen',
      status: 'emergency',
    });
    expectNoForbidden(out);
  });
});

describe('toProDetail', () => {
  it('new: exact keys and values, no optional fields', () => {
    const out = toProDetail(makeJobItem('new'), PHOTOS);
    expect(keys(out)).toEqual(ACTIVE_BASE_KEYS);
    expect(out).toEqual({
      id: ID,
      createdAt: CREATED,
      status: 'new',
      urgency: 'soon',
      likelyIssue: 'A dripping pipe under the sink.',
      trade: 'plumber',
      confidence: 0.7,
      costRangeLow: 100,
      costRangeHigh: 300,
      jobBrief: 'Pipe is dripping.',
      followUpQuestions: ['Is it constant?', 'Any damp?'],
      answers: { location: 'Kitchen', duration: '', recentChanges: '' },
      infoRequests: [],
      replies: [],
      photos: PHOTOS,
    });
    expectNoForbidden(out);
  });

  it('info_requested: includes infoRequests entries', () => {
    const item = makeJobItem('info_requested');
    const out = toProDetail(item, PHOTOS);
    expect(keys(out)).toEqual(ACTIVE_BASE_KEYS);
    expect(out.status).toBe('info_requested');
    expect((out as { infoRequests: unknown }).infoRequests).toEqual([
      { question: 'Is the leak constant?', askedAt: item.infoRequests?.[0].askedAt },
    ]);
    expectNoForbidden(out);
  });

  it('accepted: includes offeredSlots only', () => {
    const out = toProDetail(makeJobItem('accepted'), PHOTOS);
    expect(keys(out)).toEqual([...ACTIVE_BASE_KEYS, 'offeredSlots'].sort());
    expect(out).toMatchObject({ status: 'accepted', offeredSlots: SLOTS });
    expectNoForbidden(out);
  });

  it('declined: includes declineReason when stored', () => {
    const out = toProDetail(makeJobItem('declined'), PHOTOS);
    expect(keys(out)).toEqual([...ACTIVE_BASE_KEYS, 'declineReason'].sort());
    expect(out).toMatchObject({ status: 'declined', declineReason: 'Outside my service area.' });
    expectNoForbidden(out);
  });

  it('declined without a stored reason has no declineReason key', () => {
    const out = toProDetail(makeJobItem('declined', { declineReason: undefined }), PHOTOS);
    expect(keys(out)).toEqual(ACTIVE_BASE_KEYS);
    expect('declineReason' in out).toBe(false);
  });

  it('booked: includes offeredSlots and bookedSlot', () => {
    const out = toProDetail(makeJobItem('booked'), PHOTOS);
    expect(keys(out)).toEqual([...ACTIVE_BASE_KEYS, 'bookedSlot', 'offeredSlots'].sort());
    expect(out).toMatchObject({ status: 'booked', offeredSlots: SLOTS, bookedSlot: SLOTS[1] });
    expectNoForbidden(out);
  });

  it('emergency: exact keys, fixed note, no photos', () => {
    const out = toProDetail(makeJobItem('emergency'), PHOTOS);
    expect(keys(out)).toEqual(EMERGENCY_DETAIL_KEYS);
    expect(out).toEqual({
      id: ID,
      createdAt: CREATED,
      status: 'emergency',
      urgency: 'emergency',
      likelyIssue: 'A dripping pipe under the sink.',
      answers: { location: 'Kitchen', duration: '', recentChanges: '' },
      emergencyNote: NOTE_LITERAL,
    });
    expect((out as { emergencyNote: string }).emergencyNote).toBe(PRO_EMERGENCY_NOTE);
    expect('photos' in out).toBe(false);
    expectNoForbidden(out);
  });

  it('copies replies and keeps infoRequests order', () => {
    const item = makeJobItem('accepted', {
      infoRequests: [
        { question: 'Q1?', askedAt: '2026-03-05T11:10:00.000Z' },
        { question: 'Q2?', askedAt: '2026-03-05T11:20:00.000Z' },
      ],
      replies: [{ text: 'R1', at: '2026-03-05T11:15:00.000Z' }],
      replyCount: 1,
    });
    const out = toProDetail(item, []) as { infoRequests: unknown; replies: unknown; photos: unknown };
    expect(out.infoRequests).toEqual(item.infoRequests);
    expect(out.replies).toEqual([{ text: 'R1', at: '2026-03-05T11:15:00.000Z' }]);
    expect(out.photos).toEqual([]);
  });
});

describe('toHomeownerStatusView', () => {
  it('new', () => {
    const out = toHomeownerStatusView(makeJobItem('new'));
    expect(keys(out)).toEqual(['status']);
    expect(out).toEqual({ status: 'new' });
  });

  it('info_requested uses the question', () => {
    const out = toHomeownerStatusView(makeJobItem('info_requested'));
    expect(keys(out)).toEqual(['question', 'status']);
    expect(out).toEqual({ status: 'info_requested', question: 'Is the leak constant?' });
  });

  it('info_requested uses the LATEST question of two', () => {
    const item = makeJobItem('info_requested', {
      infoRequests: [
        { question: 'First?', askedAt: '2026-03-05T11:10:00.000Z' },
        { question: 'Second?', askedAt: '2026-03-05T11:30:00.000Z' },
      ],
    });
    expect(toHomeownerStatusView(item)).toEqual({ status: 'info_requested', question: 'Second?' });
  });

  it('accepted sorts offered slots ascending', () => {
    const item = makeJobItem('accepted', { offeredSlots: [SLOTS[2], SLOTS[0], SLOTS[1]] });
    const out = toHomeownerStatusView(item);
    expect(keys(out)).toEqual(['offeredSlots', 'status']);
    expect(out).toEqual({ status: 'accepted', offeredSlots: SLOTS });
  });

  it('declined with a stored reason', () => {
    const out = toHomeownerStatusView(makeJobItem('declined'));
    expect(keys(out)).toEqual(['reason', 'status']);
    expect(out).toEqual({ status: 'declined', reason: 'Outside my service area.' });
  });

  it('declined without a stored reason has no reason key', () => {
    const out = toHomeownerStatusView(makeJobItem('declined', { declineReason: undefined }));
    expect(keys(out)).toEqual(['status']);
    expect(out).toEqual({ status: 'declined' });
  });

  it('booked', () => {
    const out = toHomeownerStatusView(makeJobItem('booked'));
    expect(keys(out)).toEqual(['bookedSlot', 'status']);
    expect(out).toEqual({ status: 'booked', bookedSlot: SLOTS[1] });
  });

  it('emergency is exactly { status, message }', () => {
    const out = toHomeownerStatusView(makeJobItem('emergency'));
    expect(keys(out)).toEqual(['message', 'status']);
    expect(out).toEqual({ status: 'emergency', message: EMERGENCY_LITERAL });
    expect(EMERGENCY_MESSAGE).toBe(EMERGENCY_LITERAL);
  });

  it.each(ALL_STATUSES)('never exposes internal fields (%s)', (status) => {
    expectNoForbidden(toHomeownerStatusView(makeJobItem(status)));
  });
});

describe('effectiveStatus safeguard', () => {
  it.each(OTHER_STATUSES)('urgency emergency overrides stored %s', (status) => {
    const item = makeJobItem(status, { urgency: 'emergency' });
    expect(effectiveStatus(item)).toBe('emergency');
    expect(toProListItem(item)).toMatchObject({ status: 'emergency', trade: null });
    const detail = toProDetail(item, PHOTOS);
    expect(keys(detail)).toEqual(EMERGENCY_DETAIL_KEYS);
    expect(detail).toMatchObject({ status: 'emergency', urgency: 'emergency', emergencyNote: NOTE_LITERAL });
    expect(toHomeownerStatusView(item)).toEqual({ status: 'emergency', message: EMERGENCY_LITERAL });
  });

  it.each(OTHER_STATUSES)('isEmergency true overrides stored %s', (status) => {
    const item = makeJobItem(status, { isEmergency: true });
    expect(effectiveStatus(item)).toBe('emergency');
    expect(toProListItem(item)).toMatchObject({ status: 'emergency', trade: null });
    const detail = toProDetail(item, PHOTOS);
    expect(keys(detail)).toEqual(EMERGENCY_DETAIL_KEYS);
    expect(detail).toMatchObject({ status: 'emergency', urgency: 'emergency' });
    expect(toHomeownerStatusView(item)).toEqual({ status: 'emergency', message: EMERGENCY_LITERAL });
  });

  it.each(ALL_STATUSES)('leaves a consistent %s job unchanged', (status) => {
    expect(effectiveStatus(makeJobItem(status))).toBe(status);
  });
});

describe('no shared mutable references', () => {
  it('mutating outputs does not change the job', () => {
    const item = makeJobItem('booked', {
      infoRequests: [{ question: 'Q?', askedAt: '2026-03-05T11:10:00.000Z' }],
      replies: [{ text: 'R', at: '2026-03-05T11:15:00.000Z' }],
      replyCount: 1,
    });
    const snapshot = structuredClone(item);
    const photos = [...PHOTOS];

    const detail = toProDetail(item, photos) as unknown as {
      answers: { location: string };
      followUpQuestions: string[];
      infoRequests: { question: string }[];
      replies: { text: string }[];
      offeredSlots: string[];
      photos: string[];
    };
    detail.answers.location = 'X';
    detail.followUpQuestions[0] = 'X';
    detail.infoRequests[0].question = 'X';
    detail.replies[0].text = 'X';
    detail.offeredSlots.push('X');
    detail.photos.push('X');

    const home = toHomeownerStatusView(makeJobItem('accepted')) as { offeredSlots: string[] };
    home.offeredSlots.length = 0;

    const emergency = makeJobItem('emergency');
    const emergencySnapshot = structuredClone(emergency);
    const emergencyDetail = toProDetail(emergency, []) as { answers: { location: string } };
    emergencyDetail.answers.location = 'X';

    const accepted = makeJobItem('accepted');
    const acceptedSnapshot = structuredClone(accepted);
    (toHomeownerStatusView(accepted) as { offeredSlots: string[] }).offeredSlots.reverse();

    expect(item).toEqual(snapshot);
    expect(photos).toEqual(PHOTOS);
    expect(emergency).toEqual(emergencySnapshot);
    expect(accepted).toEqual(acceptedSnapshot);
  });
});
