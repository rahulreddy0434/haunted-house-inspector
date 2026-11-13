import { describe, it, expect } from 'vitest';

import {
  emergencyResponseBody,
  isEmergencyResult,
  toEmergencyResult,
} from '@/lib/emergency/emergencyView';
import { EMERGENCY_MESSAGE } from '@/lib/emergency/messages';
import { inspectionResultSchema } from '@/lib/validation/inspectionSchema';
import { normalResult } from '@/test/inspectionFixtures';

describe('toEmergencyResult', () => {
  it('keeps the identifying and descriptive fields', () => {
    const out = toEmergencyResult(normalResult);
    expect(out.id).toBe(normalResult.id);
    expect(out.createdAt).toBe(normalResult.createdAt);
    expect(out.s3Keys).toEqual(normalResult.s3Keys);
    expect(out.likelyIssue).toBe(normalResult.likelyIssue);
    expect(out.trade).toBe(normalResult.trade);
    expect(out.answers).toEqual(normalResult.answers);
    expect(out.confidence).toBe(normalResult.confidence);
    expect(out.followUpQuestions).toEqual(normalResult.followUpQuestions);
  });

  it('sets the emergency fields', () => {
    const out = toEmergencyResult(normalResult);
    expect(out.urgency).toBe('emergency');
    expect(out.isEmergency).toBe(true);
    expect(out.costRangeLow).toBe(0);
    expect(out.costRangeHigh).toBe(0);
    expect(out.jobBrief).toBe('');
    expect(out.diySteps).toEqual([]);
  });

  it('does not mutate its input', () => {
    const input = structuredClone(normalResult);
    toEmergencyResult(input);
    expect(input).toEqual(normalResult);
  });

  it('produces output that passes inspectionResultSchema', () => {
    const parsed = inspectionResultSchema.safeParse(toEmergencyResult(normalResult));
    expect(parsed.success).toBe(true);
  });
});

describe('isEmergencyResult', () => {
  it('is true for urgency emergency', () => {
    expect(isEmergencyResult({ urgency: 'emergency', isEmergency: false })).toBe(true);
  });

  it('is true for isEmergency true', () => {
    expect(isEmergencyResult({ urgency: 'soon', isEmergency: true })).toBe(true);
  });

  it('is false otherwise', () => {
    expect(isEmergencyResult({ urgency: 'soon', isEmergency: false })).toBe(false);
    expect(isEmergencyResult({ urgency: 'monitor', isEmergency: false })).toBe(false);
  });
});

describe('emergencyResponseBody', () => {
  it('is exactly { status, message }', () => {
    expect(emergencyResponseBody()).toStrictEqual({
      status: 'emergency',
      message: EMERGENCY_MESSAGE,
    });
  });
});
