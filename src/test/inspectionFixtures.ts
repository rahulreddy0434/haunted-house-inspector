import type { InspectionResult } from '@/types/inspection';

export const normalResult: InspectionResult = {
  id: '11111111-1111-4111-8111-111111111111',
  createdAt: '2025-01-01T00:00:00.000Z',
  s3Keys: ['frames/a.jpg'],
  likelyIssue: 'A dripping pipe under the sink.',
  trade: 'plumber',
  urgency: 'soon',
  confidence: 0.7,
  costRangeLow: 100,
  costRangeHigh: 300,
  jobBrief: 'Pipe is dripping.',
  followUpQuestions: ['Is it constant?', 'Any damp?'],
  diySteps: ['Place a bucket.'],
  isEmergency: false,
  answers: { location: 'Kitchen', duration: '', recentChanges: '' },
};

export const emergencyResult: InspectionResult = {
  ...normalResult,
  urgency: 'emergency',
  isEmergency: true,
  costRangeLow: 0,
  costRangeHigh: 0,
  jobBrief: '',
  diySteps: [],
};
