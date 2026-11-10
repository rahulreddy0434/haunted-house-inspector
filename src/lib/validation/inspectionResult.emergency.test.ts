import { describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

import { applyOverrides, checkEmergency } from '@/lib/safety/safetyLayer';
import { inspectionResultSchema } from '@/lib/validation/inspectionSchema';
import type { BedrockInspectionResponse } from '@/types/bedrock';
import type { ContextAnswers, InspectionResult } from '@/types/inspection';

// Copy of the placeholder in src/app/api/inspect/route.ts
const EMERGENCY_PLACEHOLDER: BedrockInspectionResponse = {
  likelyIssue: 'Possible emergency',
  trade: 'Emergency services',
  urgency: 'urgent',
  confidence: 0,
  costRangeLow: 0,
  costRangeHigh: 0,
  jobBrief: '',
  followUpQuestions: [
    'Is everyone out of the affected area?',
    'Have you contacted emergency services or your utility?',
  ],
  diySteps: [],
};

function buildEmergencyResult(): InspectionResult {
  const answers: ContextAnswers = {
    location: 'Kitchen',
    duration: 'Since this morning',
    recentChanges: 'I can smell gas',
  };
  const check = checkEmergency({ contextAnswers: answers, bedrockOutput: undefined });
  expect(check.isEmergency).toBe(true);
  return applyOverrides(EMERGENCY_PLACEHOLDER, check, EMERGENCY_PLACEHOLDER.trade, {
    id: crypto.randomUUID(),
    createdAt: new Date().toISOString(),
    s3Keys: ['uploads/a.jpg', 'uploads/b.jpg'],
    answers,
  });
}

describe('inspectionResultSchema with emergency results', () => {
  it('round-trips an emergency result through JSON', () => {
    const result = buildEmergencyResult();
    expect(result.costRangeLow).toBe(0);
    expect(result.costRangeHigh).toBe(0);
    expect(result.jobBrief).toBe('');
    expect(result.diySteps).toEqual([]);
    expect(result.urgency).toBe('emergency');
    expect(result.isEmergency).toBe(true);

    const parsed = inspectionResultSchema.safeParse(JSON.parse(JSON.stringify(result)));
    expect(parsed.success).toBe(true);
    if (parsed.success) expect(parsed.data).toEqual(result);
  });

  it('rejects costRangeHigh < costRangeLow', () => {
    const r = { ...buildEmergencyResult(), costRangeLow: 100, costRangeHigh: 50 };
    expect(inspectionResultSchema.safeParse(r).success).toBe(false);
  });

  it('rejects an unknown urgency', () => {
    const r = { ...buildEmergencyResult(), urgency: 'panic' };
    expect(inspectionResultSchema.safeParse(r).success).toBe(false);
  });

  it('rejects three followUpQuestions', () => {
    const r = { ...buildEmergencyResult(), followUpQuestions: ['a', 'b', 'c'] };
    expect(inspectionResultSchema.safeParse(r).success).toBe(false);
  });

  it('rejects a missing id', () => {
    const { id: _id, ...rest } = buildEmergencyResult();
    void _id;
    expect(inspectionResultSchema.safeParse(rest).success).toBe(false);
  });
});
