// @vitest-environment node
/**
 * Integration test: Safety_Wording built by mapAnswers while the visitor is over
 * the daily limit (Requirements 1.4, 13.2). The real route, rate limiter and
 * safety layer run unmodified; only the AWS boundary modules are mocked.
 */
import { NextRequest } from 'next/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));
vi.mock('@/lib/aws/bedrock', () => ({ invokeInspectionModel: vi.fn() }));
vi.mock('@/lib/aws/dynamodb', () => ({
  persistInspection: vi.fn(),
  incrementRateLimitCounter: vi.fn(),
}));

import { POST } from '@/app/api/inspect/route';
import { invokeInspectionModel } from '@/lib/aws/bedrock';
import { incrementRateLimitCounter, persistInspection } from '@/lib/aws/dynamodb';
import { mapAnswers } from '@/lib/intake/answerMapper';
import { SAFETY_CHIPS } from '@/lib/intake/safetyChips';
import type { IntakeChoices, SafetyChipId } from '@/types/intake';
import type { ContextAnswers } from '@/types/inspection';

const invokeMock = vi.mocked(invokeInspectionModel);
const persistMock = vi.mocked(persistInspection);
const counterMock = vi.mocked(incrementRateLimitCounter);

const S3_KEYS = ['job-1/a.jpg'];

function choicesWith(safety: SafetyChipId[]): IntakeChoices {
  return {
    safety,
    location: 'Kitchen',
    placeText: 'under the sink',
    duration: 'A few days',
    extras: [],
    somethingElseText: '',
  };
}

function makeRequest(answers: ContextAnswers): NextRequest {
  return new NextRequest('http://localhost/api/inspect', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-forwarded-for': '203.0.113.7' },
    body: JSON.stringify({ s3Keys: S3_KEYS, answers }),
  });
}

describe('POST /api/inspect: guided-intake Safety_Wording over the daily limit', () => {
  const originalSecret = process.env.SESSION_SECRET;

  beforeEach(() => {
    process.env.SESSION_SECRET = 'test-secret-for-guided-intake';
    invokeMock.mockReset();
    persistMock.mockReset().mockResolvedValue(true);
    counterMock.mockReset().mockResolvedValue({
      allowed: false,
      count: 15,
      windowStart: Date.now() - 1000,
    });
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.spyOn(console, 'log').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
    if (originalSecret === undefined) delete process.env.SESSION_SECRET;
    else process.env.SESSION_SECRET = originalSecret;
  });

  async function expectEmergency(safety: SafetyChipId[]): Promise<void> {
    const answers = mapAnswers(choicesWith(safety));
    const response = await POST(makeRequest(answers));
    expect(response.status).toBe(200);

    const body = await response.json();
    expect(body.urgency).toBe('emergency');
    expect(body.isEmergency).toBe(true);
    expect(body.diySteps).toEqual([]);
    expect(body.answers).toEqual(answers);

    expect(response.headers.get('Retry-After')).toBeNull();
    expect(counterMock).not.toHaveBeenCalled();
    expect(invokeMock).not.toHaveBeenCalled();
  }

  for (const chip of SAFETY_CHIPS) {
    it(`returns an emergency (not 429) for the "${chip.id}" chip alone`, async () => {
      await expectEmergency([chip.id]);
    });
  }

  it('returns an emergency (not 429) for all four chips together', async () => {
    await expectEmergency(SAFETY_CHIPS.map((c) => c.id));
  });

  it('control: clean chip answers over the limit return 429', async () => {
    const response = await POST(makeRequest(mapAnswers(choicesWith([]))));
    const body = await response.json();

    expect(response.status).toBe(429);
    expect(body.error).toBe('RATE_LIMIT_EXCEEDED');
    expect(counterMock).toHaveBeenCalledTimes(1);
    expect(invokeMock).not.toHaveBeenCalled();
    expect(persistMock).not.toHaveBeenCalled();
  });
});
