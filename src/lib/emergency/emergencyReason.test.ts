import { describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

import type { EmergencyConditionCode } from '@/lib/safety/safetyLayer';
import { emergencyResult } from '@/test/inspectionFixtures';
import { EMERGENCY_MESSAGE } from './messages';
import { emergencyResponseBody, reasonSentenceField, toEmergencyResult } from './emergencyView';
import { EMERGENCY_REASON_SENTENCES, emergencyReasonSentence } from './reasons';
import { emergencyRuleFor } from './ruleWrapper';
import type { EmergencySource } from './source';

const CASES: Array<[EmergencyConditionCode, string, string]> = [
  ['GAS_SMELL', 'I can smell gas in the kitchen', 'This may be a gas leak.'],
  ['ELECTRICAL_FIRE', 'There were sparks coming from the outlet', 'This may be an electrical fire risk.'],
  [
    'WATER_ELECTRICAL',
    'Water is flooding near the electrical panel',
    'Water near electricity can cause shocks or a fire.',
  ],
  [
    'CO_ALARM',
    'The carbon monoxide alarm is going off',
    'A carbon monoxide alarm means the air may be unsafe to breathe.',
  ],
];

describe.each(CASES)('rule %s', (rule, text, sentence) => {
  it('is the rule the wrapper supplies for its text', () => {
    expect(emergencyRuleFor(text)).toEqual({ isEmergency: true, rule });
  });

  it('has its exact fixed sentence', () => {
    expect(EMERGENCY_REASON_SENTENCES[rule]).toBe(sentence);
    expect(emergencyReasonSentence(rule)).toBe(sentence);
  });

  it('fills reasonSentence in the emergency response body', () => {
    expect(emergencyResponseBody(rule)).toEqual({
      status: 'emergency',
      message: EMERGENCY_MESSAGE,
      reasonSentence: sentence,
    });
    expect(reasonSentenceField(rule)).toEqual({ reasonSentence: sentence });
  });

  it('is carried through unchanged into the client emergency result', () => {
    const result = toEmergencyResult({ ...emergencyResult, emergencyRule: rule, emergencySource: 'precheck' });
    expect(result.emergencyRule).toBe(rule);
    expect(result.emergencySource).toBe('precheck');
  });
});

describe.each<EmergencySource>(['precheck', 'postcheck', 'override'])('source %s', (source) => {
  it('is carried through unchanged into the client emergency result', () => {
    const result = toEmergencyResult({ ...emergencyResult, emergencyRule: 'GAS_SMELL', emergencySource: source });
    expect(result.emergencySource).toBe(source);
  });
});

describe('a job with no saved rule', () => {
  it.each([undefined, '', 'NOT_A_RULE', 'toString', '__proto__'])('gives no sentence for %j', (code) => {
    expect(emergencyReasonSentence(code)).toBeUndefined();
    expect(reasonSentenceField(code)).toEqual({});
    expect(emergencyResponseBody(code)).not.toHaveProperty('reasonSentence');
  });

  it('keeps rule and source absent in the client emergency result', () => {
    const result = toEmergencyResult(emergencyResult);
    expect(result).not.toHaveProperty('emergencyRule');
    expect(result).not.toHaveProperty('emergencySource');
  });
});
