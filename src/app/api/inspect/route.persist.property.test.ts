// @vitest-environment node
// Property test: every job is persisted exactly once, whatever the visitor identity.
// Bedrock and DynamoDB are mocked at the module boundary; the route, rate limiter,
// safety layer and Zod schemas are the real implementations.
import { NextRequest } from 'next/server';
import fc from 'fast-check';
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
import type { BedrockInspectionResponse } from '@/types/bedrock';
import type { InspectionResult } from '@/types/inspection';

const invokeMock = vi.mocked(invokeInspectionModel);
const persistMock = vi.mocked(persistInspection);
const counterMock = vi.mocked(incrementRateLimitCounter);

const NUM_RUNS = 50;

// --- Generators -----------------------------------------------------------

const s3KeyArb = fc
  .tuple(
    fc.stringMatching(/^[a-z0-9]{4,12}$/),
    fc.stringMatching(/^[a-z0-9]{3,10}$/),
    fc.constantFrom('jpg', 'png', 'webp'),
  )
  .map(([job, name, ext]) => `${job}/${name}.${ext}`);

const s3KeysArb = fc.array(s3KeyArb, { minLength: 1, maxLength: 5 });

const locationWordArb = fc.constantFrom(
  'Kitchen', 'Bathroom', 'Ceiling', 'Basement', 'Attic', 'Garage', 'Hallway', 'Roof', 'Window',
);

// Characters chosen so no emergency trigger phrase can appear.
const harmlessTextArb = fc.stringMatching(/^[xyz 12]{0,500}$/);

const cleanAnswersArb = fc.record({
  location: fc.tuple(locationWordArb, fc.stringMatching(/^[xyz 12]{0,40}$/)).map(([w, s]) => `${w} ${s}`),
  duration: harmlessTextArb,
  recentChanges: harmlessTextArb,
});

const emergencyPhraseArb = fc.constantFrom(
  'smell of rotten egg',
  'rotten eggs near the boiler',
  'the carbon monoxide alarm is going off',
  'CO alarm beeping',
  'I can smell gas',
  'sparks from the outlet',
  'water flooding near the electrical panel',
);

const emergencyAnswersArb = fc
  .tuple(cleanAnswersArb, emergencyPhraseArb, fc.constantFrom('location', 'duration', 'recentChanges'))
  .map(([answers, phrase, field]) => ({
    ...answers,
    [field]: `Kitchen ${phrase}`,
  }));

const bedrockArb: fc.Arbitrary<BedrockInspectionResponse> = fc
  .record({
    urgency: fc.constantFrom<BedrockInspectionResponse['urgency']>('soon', 'urgent', 'monitor'),
    trade: fc.constantFrom('Plumber', 'Electrician', 'Roofer', 'Carpenter', 'General contractor'),
    confidence: fc.double({ min: 0, max: 1, noNaN: true }),
    low: fc.integer({ min: 0, max: 5000 }),
    spread: fc.integer({ min: 0, max: 5000 }),
  })
  .map(({ urgency, trade, confidence, low, spread }) => ({
    likelyIssue: 'Slow drip from a worn seal',
    trade,
    urgency,
    confidence,
    costRangeLow: low,
    costRangeHigh: low + spread,
    jobBrief: 'Slow drip observed and a worn seal is suspected.',
    followUpQuestions: ['Is the area damp?', 'Has it got worse?'] as [string, string],
    diySteps: ['Place a bucket underneath'],
  }));

interface Identity {
  ip: string | undefined;
  cookie: string | undefined;
  secret: string | undefined;
}

const identityArb: fc.Arbitrary<Identity> = fc.record({
  ip: fc.option(
    fc.tuple(fc.nat(255), fc.nat(255), fc.nat(255), fc.nat(255)).map((p) => p.join('.')),
    { nil: undefined },
  ),
  cookie: fc.option(fc.stringMatching(/^[A-Za-z0-9._-]{0,80}$/), { nil: undefined }),
  secret: fc.option(fc.stringMatching(/^[A-Za-z0-9]{16,40}$/), { nil: undefined }),
});

// --- Helpers --------------------------------------------------------------

function makeRequest(payload: unknown, identity: Identity, raw?: string): NextRequest {
  const headers: Record<string, string> = { 'content-type': 'application/json' };
  if (identity.ip !== undefined) headers['x-forwarded-for'] = identity.ip;
  if (identity.cookie !== undefined) headers.cookie = `hhi_session=${identity.cookie}`;
  return new NextRequest('http://localhost/api/inspect', {
    method: 'POST',
    headers,
    body: raw ?? JSON.stringify(payload),
  });
}

function applyIdentity(identity: Identity): void {
  if (identity.secret === undefined) delete process.env.SESSION_SECRET;
  else process.env.SESSION_SECRET = identity.secret;
}

function resetMocks(): void {
  invokeMock.mockReset();
  persistMock.mockReset();
  counterMock.mockReset();
  persistMock.mockResolvedValue(true);
  counterMock.mockImplementation(() =>
    Promise.resolve({ allowed: true, count: 1, windowStart: Date.now() }),
  );
}

// --- Tests ----------------------------------------------------------------

describe('POST /api/inspect persistence properties', () => {
  const originalSecret = process.env.SESSION_SECRET;

  beforeEach(() => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    vi.spyOn(console, 'log').mockImplementation(() => undefined);
    resetMocks();
  });

  afterEach(() => {
    if (originalSecret === undefined) delete process.env.SESSION_SECRET;
    else process.env.SESSION_SECRET = originalSecret;
    vi.restoreAllMocks();
  });

  // Feature: intake-and-triage, Property 17: Every job is always persisted
  // **Validates: Requirements 14.1**
  it('persists exactly once, with the returned body, on the clean (Bedrock) path', async () => {
    await fc.assert(
      fc.asyncProperty(s3KeysArb, cleanAnswersArb, bedrockArb, identityArb, async (s3Keys, answers, bedrock, identity) => {
        resetMocks();
        applyIdentity(identity);
        invokeMock.mockResolvedValue(bedrock);

        const res = await POST(makeRequest({ s3Keys, answers }, identity));
        const body = (await res.json()) as InspectionResult;

        expect(res.status).toBe(200);
        expect(invokeMock).toHaveBeenCalledTimes(1);
        expect(persistMock).toHaveBeenCalledTimes(1);
        expect(persistMock.mock.calls[0][0]).toEqual(body);
        expect(persistMock.mock.calls[0][0].id).toBe(body.id);
      }),
      { numRuns: NUM_RUNS },
    );
  });

  // Feature: intake-and-triage, Property 17: Every job is always persisted
  // **Validates: Requirements 14.1**
  it('persists exactly once, with the returned body, on the emergency path', async () => {
    await fc.assert(
      fc.asyncProperty(s3KeysArb, emergencyAnswersArb, identityArb, async (s3Keys, answers, identity) => {
        resetMocks();
        applyIdentity(identity);

        const res = await POST(makeRequest({ s3Keys, answers }, identity));
        const body = (await res.json()) as InspectionResult;

        expect(res.status).toBe(200);
        expect(body.isEmergency).toBe(true);
        expect(invokeMock).not.toHaveBeenCalled();
        expect(persistMock).toHaveBeenCalledTimes(1);
        expect(persistMock.mock.calls[0][0]).toEqual(body);
        expect(persistMock.mock.calls[0][0].id).toBe(body.id);
      }),
      { numRuns: NUM_RUNS },
    );
  });

  // Feature: intake-and-triage, Property 17: Every job is always persisted
  // **Validates: Requirements 14.1**
  it('still returns 200 with the result when persistence fails (resolves false)', async () => {
    await fc.assert(
      fc.asyncProperty(
        s3KeysArb,
        fc.boolean(),
        cleanAnswersArb,
        emergencyAnswersArb,
        bedrockArb,
        identityArb,
        async (s3Keys, emergency, clean, emergencyAnswers, bedrock, identity) => {
          resetMocks();
          applyIdentity(identity);
          persistMock.mockResolvedValue(false);
          invokeMock.mockResolvedValue(bedrock);

          const res = await POST(
            makeRequest({ s3Keys, answers: emergency ? emergencyAnswers : clean }, identity),
          );
          const body = (await res.json()) as InspectionResult;

          expect(res.status).toBe(200);
          expect(body.id).toBeTruthy();
          expect(persistMock).toHaveBeenCalledTimes(1);
          expect(persistMock.mock.calls[0][0]).toEqual(body);
        },
      ),
      { numRuns: NUM_RUNS },
    );
  });

  // Negative controls: no result is produced, so nothing is persisted.
  it('does not persist invalid bodies (400)', async () => {
    const invalidArb = fc.oneof(
      fc.constant({ raw: 'not json{' }),
      fc.constant({ payload: { s3Keys: [], answers: { location: 'Kitchen' } } }),
      fc.constant({ payload: { s3Keys: ['a/b.jpg'], answers: { location: '   ' } } }),
      fc.constant({ payload: { s3Keys: ['a/b.jpg'], answers: {} } }),
      fc.constant({ payload: { s3Keys: ['../x.jpg'], answers: { location: 'Kitchen' } } }),
      fc.constant({ payload: { s3Keys: ['/x.jpg'], answers: { location: 'Kitchen' } } }),
      fc.constant({
        payload: { s3Keys: ['a', 'b', 'c', 'd', 'e', 'f'], answers: { location: 'Kitchen' } },
      }),
    );
    await fc.assert(
      fc.asyncProperty(invalidArb, identityArb, async (invalid, identity) => {
        resetMocks();
        applyIdentity(identity);
        const res = await POST(
          makeRequest('payload' in invalid ? invalid.payload : undefined, identity, 'raw' in invalid ? invalid.raw : undefined),
        );
        expect(res.status).toBe(400);
        expect(persistMock).toHaveBeenCalledTimes(0);
      }),
      { numRuns: NUM_RUNS },
    );
  });

  it('does not persist rate-limited requests (429)', async () => {
    await fc.assert(
      fc.asyncProperty(s3KeysArb, cleanAnswersArb, identityArb, async (s3Keys, answers, identity) => {
        resetMocks();
        applyIdentity(identity);
        counterMock.mockImplementation(() =>
          Promise.resolve({ allowed: false, count: 15, windowStart: Date.now() - 1000 }),
        );

        const res = await POST(makeRequest({ s3Keys, answers }, identity));

        expect(res.status).toBe(429);
        expect(invokeMock).not.toHaveBeenCalled();
        expect(persistMock).toHaveBeenCalledTimes(0);
      }),
      { numRuns: NUM_RUNS },
    );
  });

  it('does not persist when Bedrock fails (502)', async () => {
    await fc.assert(
      fc.asyncProperty(s3KeysArb, cleanAnswersArb, identityArb, async (s3Keys, answers, identity) => {
        resetMocks();
        applyIdentity(identity);
        invokeMock.mockRejectedValue(new Error('bedrock down'));

        const res = await POST(makeRequest({ s3Keys, answers }, identity));

        expect(res.status).toBe(502);
        expect(persistMock).toHaveBeenCalledTimes(0);
      }),
      { numRuns: NUM_RUNS },
    );
  });
});
