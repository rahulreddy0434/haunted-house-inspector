// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { toProEmergencyDetail, viewFromChat } from '@/lib/jobs/views';
import { PRO_EMERGENCY_NOTE } from '@/lib/emergency/messages';
import { makeJobItem } from '@/test/jobFixtures';

describe('viewFromChat', () => {
  it('maps each non-emergency status', () => {
    expect(viewFromChat('new', {})).toEqual({ status: 'new' });
    expect(viewFromChat('info_requested', {})).toEqual({ status: 'info_requested', question: '' });
    expect(viewFromChat('accepted', { offeredSlots: ['b', 'a'] })).toEqual({
      status: 'accepted',
      offeredSlots: ['a', 'b'],
    });
    expect(viewFromChat('booked', { bookedSlot: 'x' })).toEqual({ status: 'booked', bookedSlot: 'x' });
    expect(viewFromChat('declined', { declineReason: 'busy' })).toEqual({ status: 'declined', reason: 'busy' });
    expect(viewFromChat('declined', {})).toEqual({ status: 'declined' });
  });
});

describe('toProEmergencyDetail', () => {
  it('returns only the emergency fields', () => {
    const d = toProEmergencyDetail(makeJobItem('new'));
    expect(Object.keys(d).sort()).toEqual([
      'answers', 'createdAt', 'emergencyNote', 'id', 'likelyIssue', 'status', 'urgency',
    ]);
    expect(d.status).toBe('emergency');
    expect(d.emergencyNote).toBe(PRO_EMERGENCY_NOTE);
  });
});
