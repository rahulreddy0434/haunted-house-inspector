import { EMERGENCY_MESSAGE, PRO_EMERGENCY_NOTE } from '@/lib/emergency/messages';
import type { ContextAnswers } from '@/types/inspection';
import type {
  HomeownerStatusView,
  JobRecord,
  JobStatus,
  ProJobDetail,
  ProJobDetailActive,
  ProJobListItem,
} from '@/types/job';

/** The fields a list item is built from (a JobRecord also satisfies this). */
export type ProListStored = Pick<JobRecord, 'id' | 'createdAt' | 'urgency' | 'trade' | 'status' | 'isEmergency'> & {
  answers: Pick<ContextAnswers, 'location'>;
};

/** Emergency wins: status, urgency or isEmergency saying emergency makes the Job an emergency. */
export function effectiveStatus(job: Pick<JobRecord, 'status' | 'urgency' | 'isEmergency'>): JobStatus {
  if (job.status === 'emergency' || job.urgency === 'emergency' || job.isEmergency === true) {
    return 'emergency';
  }
  return job.status;
}

export function toProListItem(item: ProListStored): ProJobListItem {
  const status = effectiveStatus(item);
  return {
    id: item.id,
    createdAt: item.createdAt,
    urgency: item.urgency,
    trade: status === 'emergency' ? null : item.trade,
    location: item.answers.location,
    status,
  };
}

function copyAnswers(a: ContextAnswers): ContextAnswers {
  return { location: a.location, duration: a.duration, recentChanges: a.recentChanges };
}

export function toProDetail(job: JobRecord, photos: string[]): ProJobDetail {
  const status = effectiveStatus(job);
  if (status === 'emergency' || job.urgency === 'emergency') {
    return {
      id: job.id,
      createdAt: job.createdAt,
      status: 'emergency',
      urgency: 'emergency',
      likelyIssue: job.likelyIssue,
      answers: copyAnswers(job.answers),
      emergencyNote: PRO_EMERGENCY_NOTE,
    };
  }
  const detail: ProJobDetailActive = {
    id: job.id,
    createdAt: job.createdAt,
    status,
    urgency: job.urgency,
    likelyIssue: job.likelyIssue,
    trade: job.trade,
    confidence: job.confidence,
    costRangeLow: job.costRangeLow,
    costRangeHigh: job.costRangeHigh,
    jobBrief: job.jobBrief,
    followUpQuestions: [job.followUpQuestions[0], job.followUpQuestions[1]],
    answers: copyAnswers(job.answers),
    infoRequests: (job.infoRequests ?? []).map((r) => ({ question: r.question, askedAt: r.askedAt })),
    replies: (job.replies ?? []).map((r) => ({ text: r.text, at: r.at })),
    photos: [...photos],
  };
  if (job.offeredSlots !== undefined) detail.offeredSlots = [...job.offeredSlots];
  if (job.bookedSlot !== undefined) detail.bookedSlot = job.bookedSlot;
  if (job.declineReason !== undefined) detail.declineReason = job.declineReason;
  return detail;
}

export function toHomeownerStatusView(job: JobRecord): HomeownerStatusView {
  const status = effectiveStatus(job);
  switch (status) {
    case 'emergency':
      return { status: 'emergency', message: EMERGENCY_MESSAGE };
    case 'info_requested': {
      const requests = job.infoRequests ?? [];
      const latest = requests.length > 0 ? requests[requests.length - 1] : undefined;
      return { status: 'info_requested', question: latest ? latest.question : '' };
    }
    case 'accepted':
      return { status: 'accepted', offeredSlots: [...(job.offeredSlots ?? [])].sort() };
    case 'declined':
      return job.declineReason !== undefined
        ? { status: 'declined', reason: job.declineReason }
        : { status: 'declined' };
    case 'booked':
      return { status: 'booked', bookedSlot: job.bookedSlot ?? '' };
    case 'new':
    default:
      return { status: 'new' };
  }
}
