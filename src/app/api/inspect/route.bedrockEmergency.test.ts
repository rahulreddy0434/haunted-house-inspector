// Integration test: emergency trigger found in the Bedrock output (not the context answers).
// MSW is not needed here: no HTTP leaves the process. Bedrock and DynamoDB are mocked at the
// module boundary; the rate limiter, safety layer and Zod schemas are the real implementations.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import type { BedrockInspectionResponse } from '@/types/bedrock';
import type { InspectionResult } from '@/types/inspection';

vi.mock('server-only', () => ({}));

vi.mock('@/lib/aws/bedrock', () => ({
  invokeInspectionModel: vi.fn(),
}));

vi.mock('@/lib/aws/dynamodb', () => ({
  persistInspection: vi.fn(),
  incrementRateLimitCounter: vi.fn(),
}));

import { POST } from '@/app/api/inspect/route';
import { invokeInspectionModel } from '@/lib/aws/bedrock';
import { incrementRateLimitCounter, persistInspection } from '@/lib/aws/dynamodb';

const invokeMock = vi.mocked(invokeInspectionModel);
const persistMock = vi.mocked(persistInspection);
const counterMock = vi.mocked(incrementRateLimitCounter);

function makeRequest(): NextRequest {
  return new NextRequest('http://localhost/api/inspect', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-forwarded-for': '203.0.113.7' },
    body: JSON.stringify({
      s3Keys: ['job-1/a.jpg'],
      answers: { location: 'Living room ceiling', duration: '1 week', recentChanges: 'none' },
    }),
  });
}

function bedrockResponse(overrides: Partial<BedrockInspectionResponse> = {}): BedrockInspectionResponse {
  return {
    likelyIssue: 'Loose ceiling light fitting',
    trade: 'Electrician',
    urgency: 'soon',
    confidence: 0.7,
    costRangeLow: 200,
    costRangeHigh: 600,
    jobBrief: 'Ceiling fitting is loose and flickers.',
    followUpQuestions: ['Does it flicker often?', 'Is the fitting warm to touch?'],
    diySteps: ['Turn off power'],
    ...overrides,
  };
}

describe('POST /api/inspect: emergency trigger in Bedrock output', () => {
  const originalSecret = process.env.SESSION_SECRET;

  beforeEach(() => {
    process.env.SESSION_SECRET = 'test-secret-for-bedrock-emergency';
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    vi.spyOn(console, 'log').mockImplementation(() => undefined);
    invokeMock.mockReset();
    persistMock.mockReset();
    counterMock.mockReset();
    persistMock.mockResolvedValue(true);
    counterMock.mockImplementation(() =>
      Promise.resolve({ allowed: true, count: 1, windowStart: Date.now() }),
    );
  });

  afterEach(() => {
    if (originalSecret === undefined) delete process.env.SESSION_SECRET;
    else process.env.SESSION_SECRET = originalSecret;
    vi.restoreAllMocks();
  });

  it('overrides to emergency when jobBrief mentions a CO alarm', async () => {
    invokeMock.mockResolvedValue(
      bedrockResponse({ jobBrief: 'Homeowner says the carbon monoxide alarm was beeping.' }),
    );

    const res = await POST(makeRequest());
    const body = (await res.json()) as InspectionResult;

    expect(res.status).toBe(200);
    expect(body.urgency).toBe('emergency');
    expect(body.isEmergency).toBe(true);
    expect(body.costRangeLow).toBe(0);
    expect(body.costRangeHigh).toBe(0);
    expect(body.jobBrief).toBe('');
    expect(body.diySteps).toEqual([]);

    expect(invokeMock).toHaveBeenCalledTimes(1);
    expect(persistMock).toHaveBeenCalledTimes(1);
    expect(persistMock).toHaveBeenCalledWith(
      expect.objectContaining({ id: body.id, urgency: 'emergency', isEmergency: true, jobBrief: '' }),
    );
    expect(res.cookies.get('hhi_session')?.value).toBeTruthy();
  });

  it('overrides to emergency when likelyIssue mentions a rotten egg smell', async () => {
    invokeMock.mockResolvedValue(
      bedrockResponse({ likelyIssue: 'Smell of rotten egg near the furnace' }),
    );

    const res = await POST(makeRequest());
    const body = (await res.json()) as InspectionResult;

    expect(res.status).toBe(200);
    expect(body.urgency).toBe('emergency');
    expect(body.isEmergency).toBe(true);
    expect(body.costRangeLow).toBe(0);
    expect(body.costRangeHigh).toBe(0);
    expect(body.jobBrief).toBe('');
    expect(body.diySteps).toEqual([]);
    expect(invokeMock).toHaveBeenCalledTimes(1);
    expect(persistMock).toHaveBeenCalledWith(
      expect.objectContaining({ urgency: 'emergency', isEmergency: true }),
    );
    expect(res.cookies.get('hhi_session')?.value).toBeTruthy();
  });

  it('control: clean plumber result keeps urgency, costs and brief', async () => {
    invokeMock.mockResolvedValue(
      bedrockResponse({
        likelyIssue: 'Slow drip from a pipe joint',
        trade: 'Plumber',
        jobBrief: 'Slow drip under the sink.',
        diySteps: ['Place a bucket under the drip'],
      }),
    );

    const res = await POST(makeRequest());
    const body = (await res.json()) as InspectionResult;

    expect(res.status).toBe(200);
    expect(body.isEmergency).toBe(false);
    expect(body.urgency).toBe('soon');
    expect(body.costRangeLow).toBe(200);
    expect(body.costRangeHigh).toBe(600);
    expect(body.jobBrief).toBe('Slow drip under the sink.');
    expect(body.diySteps).toEqual(['Place a bucket under the drip']);
  });

  it('control: electrical trade empties diySteps but keeps urgency', async () => {
    invokeMock.mockResolvedValue(
      bedrockResponse({ trade: 'Licensed Electrician', diySteps: ['Turn off power'] }),
    );

    const res = await POST(makeRequest());
    const body = (await res.json()) as InspectionResult;

    expect(res.status).toBe(200);
    expect(body.isEmergency).toBe(false);
    expect(body.urgency).toBe('soon');
    expect(body.costRangeLow).toBe(200);
    expect(body.costRangeHigh).toBe(600);
    expect(body.diySteps).toEqual([]);
  });
});
