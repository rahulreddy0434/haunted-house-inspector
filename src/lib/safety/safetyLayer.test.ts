import { describe, it, expect } from 'vitest';
import { checkEmergency, applyOverrides } from './safetyLayer';
import type { BedrockInspectionResponse } from '@/types/bedrock';
import type { ContextAnswers } from '@/types/inspection';

const ctx = (location: string, duration = '', recentChanges = ''): ContextAnswers => ({
  location,
  duration,
  recentChanges,
});
const check = (location: string) => checkEmergency({ contextAnswers: ctx(location) });

const bedrock: BedrockInspectionResponse = {
  likelyIssue: 'Dripping pipe',
  trade: 'Plumber',
  urgency: 'soon',
  confidence: 0.7,
  costRangeLow: 100,
  costRangeHigh: 300,
  jobBrief: 'Pipe drips under sink.',
  followUpQuestions: ['Q1?', 'Q2?'],
  diySteps: ['Place a bucket'],
};

describe('checkEmergency triggers', () => {
  it.each([
    ['I smell gas', 'GAS_SMELL'],
    ['smells like gas', 'GAS_SMELL'],
    ['gas leak', 'GAS_SMELL'],
    ['Rotten Egg smell', 'GAS_SMELL'],
    ['CO detector is beeping', 'CO_ALARM'],
    ['carbon monoxide', 'CO_ALARM'],
    ['CO ALARM', 'CO_ALARM'],
    ['the outlet is sparking', 'ELECTRICAL_FIRE'],
    ['burning plastic smell from the breaker panel', 'ELECTRICAL_FIRE'],
    ['basement flooded near the breaker panel', 'WATER_ELECTRICAL'],
    ['water dripping onto the electrical outlet', 'WATER_ELECTRICAL'],
  ])('%s', (text, code) => {
    expect(check(text)).toEqual({ isEmergency: true, triggeredCondition: code });
  });

  it.each([
    'our gas bill is high',
    'the dishwasher is leaking',
    'water stain on the ceiling',
    'faucet drips all night',
    'the toilet gasket is leaking',
    'the dishwasher door gasket leaks',
    'we had tacos',
    '',
  ])('does not trigger: %s', (text) => {
    expect(check(text).isEmergency).toBe(false);
  });

  it('checks each context field individually', () => {
    expect(checkEmergency({ contextAnswers: ctx('', 'gas leak', '') }).isEmergency).toBe(true);
    expect(checkEmergency({ contextAnswers: ctx('', '', 'carbon monoxide') }).isEmergency).toBe(true);
    // pair split across fields must not combine
    expect(checkEmergency({ contextAnswers: ctx('spark', 'outlet', '') }).isEmergency).toBe(false);
  });

  it('evaluates bedrockOutput only when provided', () => {
    const clean = ctx('leaky tap');
    expect(checkEmergency({ contextAnswers: clean }).isEmergency).toBe(false);
    expect(
      checkEmergency({ contextAnswers: clean, bedrockOutput: 'carbon monoxide alarm' }).isEmergency,
    ).toBe(true);
  });
});

describe('proximity boundary', () => {
  const gap = (n: number) => `spark${'x'.repeat(n)}outlet`;
  it.each([
    [0, true],
    [199, true],
    [200, true],
    [201, false],
  ])('%i characters apart -> %s', (n, expected) => {
    expect(check(gap(n)).isEmergency).toBe(expected);
  });

  it('works in reverse order', () => {
    expect(check(`outlet${'x'.repeat(200)}spark`).isEmergency).toBe(true);
    expect(check(`outlet${'x'.repeat(201)}spark`).isEmergency).toBe(false);
  });
});

describe('applyOverrides', () => {
  it('suppresses fields on emergency', () => {
    const r = applyOverrides(bedrock, { isEmergency: true, triggeredCondition: 'GAS_SMELL' }, 'Plumber');
    expect(r.urgency).toBe('emergency');
    expect(r.isEmergency).toBe(true);
    expect(r.costRangeLow).toBe(0);
    expect(r.costRangeHigh).toBe(0);
    expect(r.jobBrief).toBe('');
    expect(r.diySteps).toEqual([]);
  });

  it('keeps Bedrock values when not an emergency and trade is safe', () => {
    const r = applyOverrides(bedrock, { isEmergency: false }, 'Plumber');
    expect(r.urgency).toBe('soon');
    expect(r.diySteps).toEqual(['Place a bucket']);
    expect(r.jobBrief).toBe(bedrock.jobBrief);
  });

  it('empties DIY steps for dangerous trades without changing urgency', () => {
    const r = applyOverrides(bedrock, { isEmergency: false }, 'Licensed ELECTRICIAN');
    expect(r.diySteps).toEqual([]);
    expect(r.urgency).toBe('soon');
  });

  it('uses supplied context and defaults', () => {
    const answers = ctx('kitchen');
    const r = applyOverrides(bedrock, { isEmergency: false }, 'Plumber', {
      id: 'abc',
      createdAt: '2025-01-01T00:00:00.000Z',
      s3Keys: ['k1'],
      answers,
    });
    expect(r).toMatchObject({ id: 'abc', s3Keys: ['k1'], answers });
    expect(applyOverrides(bedrock, { isEmergency: false }, 'Plumber').s3Keys).toEqual([]);
  });
});
