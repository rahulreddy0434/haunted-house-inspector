// @vitest-environment node
/**
 * Integration test: POST /api/inspect when Bedrock output fails Zod validation.
 * Requirements 8.4, 8.5.
 *
 * MSW is not needed: no HTTP leaves the process. Bedrock and DynamoDB are mocked
 * at the module boundary; the rateLimiter, safety layer and Zod schemas are real.
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

const ANALYSIS_FAILED = {
  error: 'ANALYSIS_FAILED',
  message: "We couldn't analyse your photos. Please try again.",
};

const MARKER = 'RAW-MODEL-OUTPUT-MARKER';

const validBedrock = {
  likelyIssue: 'Small leak under the kitchen sink',
  trade: 'Plumber',
  urgency: 'soon',
  confidence: 0.7,
  costRangeLow: 100,
  costRangeHigh: 300,
  jobBrief: 'Water is dripping under the sink.',
  followUpQuestions: ['Is the leak constant?', 'Is the cupboard floor damp?'],
  diySteps: [],
};

const cleanAnswers = {
  location: 'Kitchen under the sink',
  duration: 'A few days',
  recentChanges: 'None',
};

function makeRequest(body: unknown, rawBody?: string): NextRequest {
  return new NextRequest('http://localhost/api/inspect', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-forwarded-for': '203.0.113.7' },
    body: rawBody ?? JSON.stringify(body),
  });
}

function validBody(answers: Record<string, unknown> = cleanAnswers) {
  return { s3Keys: ['job-1/a.jpg'], answers };
}

const invalidPayloads: Array<[string, unknown]> = [
  ['empty object', {}],
  ['null', null],
  ['non-JSON string', 'not json'],
  ['urgency "emergency"', { ...validBedrock, urgency: 'emergency' }],
  ['confidence 1.5', { ...validBedrock, confidence: 1.5 }],
  ['costRangeHigh < costRangeLow', { ...validBedrock, costRangeLow: 500, costRangeHigh: 100 }],
  [
    '3 followUpQuestions',
    { ...validBedrock, followUpQuestions: ['one?', 'two?', 'three?'] },
  ],
  ['likelyIssue over 500 chars', { ...validBedrock, likelyIssue: 'x'.repeat(501) }],
  [
    'missing diySteps',
    (() => {
      const { diySteps: _omit, ...rest } = validBedrock;
      void _omit;
      return rest;
    })(),
  ],
];

describe('POST /api/inspect: Bedrock validation failure', () => {
  const originalSecret = process.env.SESSION_SECRET;
  let errorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    process.env.SESSION_SECRET = 'test-secret';
    vi.mocked(invokeInspectionModel).mockReset();
    vi.mocked(persistInspection).mockReset().mockResolvedValue(true);
    vi.mocked(incrementRateLimitCounter)
      .mockReset()
      .mockResolvedValue({ allowed: true, count: 1, windowStart: Date.now() });
    errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.spyOn(console, 'log').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
    if (originalSecret === undefined) delete process.env.SESSION_SECRET;
    else process.env.SESSION_SECRET = originalSecret;
  });

  it.each(invalidPayloads)(
    'returns 502 ANALYSIS_FAILED and does not persist for %s',
    async (_label, payload) => {
      vi.mocked(invokeInspectionModel).mockResolvedValue(payload as never);

      const response = await POST(makeRequest(validBody()));

      expect(response.status).toBe(502);
      const json = (await response.json()) as Record<string, unknown>;
      expect(json).toEqual(ANALYSIS_FAILED);
      expect(json).not.toHaveProperty('likelyIssue');
      expect(json).not.toHaveProperty('id');
      expect(persistInspection).not.toHaveBeenCalled();
    },
  );

  it('does not log the raw model output', async () => {
    vi.mocked(invokeInspectionModel).mockResolvedValue({
      ...validBedrock,
      likelyIssue: MARKER,
      confidence: 1.5,
    } as never);

    const response = await POST(makeRequest(validBody()));

    expect(response.status).toBe(502);
    expect(errorSpy).toHaveBeenCalled();
    const logged = JSON.stringify(errorSpy.mock.calls);
    expect(logged).not.toContain(MARKER);
  });

  it('returns 400 INVALID_REQUEST for whitespace-only location without calling Bedrock', async () => {
    const response = await POST(makeRequest(validBody({ ...cleanAnswers, location: '   ' })));

    expect(response.status).toBe(400);
    const json = (await response.json()) as { error: string };
    expect(json.error).toBe('INVALID_REQUEST');
    expect(invokeInspectionModel).not.toHaveBeenCalled();
    expect(persistInspection).not.toHaveBeenCalled();
  });

  it('returns 400 for an invalid JSON body without calling Bedrock', async () => {
    const response = await POST(makeRequest(undefined, '{not valid json'));

    expect(response.status).toBe(400);
    const json = (await response.json()) as { error: string };
    expect(json.error).toBe('INVALID_REQUEST');
    expect(invokeInspectionModel).not.toHaveBeenCalled();
  });
});
