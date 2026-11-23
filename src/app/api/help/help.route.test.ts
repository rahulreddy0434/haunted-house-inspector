// @vitest-environment node
// Feature: chat-and-help, task 5.12. Example tests for POST /api/help.
// Route, pipeline, rate counter, safety layer and Zod are real; DynamoDB is the in-memory
// fake and the SES client is a recording stub.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createFakeDynamoTable, type FakeDynamoTable } from '@/test/fakeDynamoTable';
import { forwardedFor, makeRequest, withEnv } from '@/test/proRouteHarness';
import { EMERGENCY_MESSAGE } from '@/lib/emergency/messages';
import { HELP_SUBJECT, HELP_SUBJECT_EMERGENCY } from '@/lib/help/email';

vi.mock('server-only', () => ({}));

const holder = vi.hoisted(() => ({ fake: null as unknown as FakeDynamoTable }));
vi.mock('@aws-sdk/lib-dynamodb', async (importOriginal) => {
  const { fakeDynamoMockFactory } = await import('@/test/fakeDynamoTable');
  return fakeDynamoMockFactory(() => holder.fake)(
    importOriginal as () => Promise<typeof import('@aws-sdk/lib-dynamodb')>,
  );
});

const ses = vi.hoisted(() => ({
  configs: [] as unknown[],
  sent: [] as Record<string, unknown>[],
  fail: false,
}));

vi.mock('@aws-sdk/client-sesv2', () => {
  class SESv2Client {
    constructor(config: unknown) {
      ses.configs.push(config);
    }
    async send(command: { input: Record<string, unknown> }): Promise<Record<string, unknown>> {
      if (ses.fail) throw Object.assign(new Error('ses down'), { name: 'SesDown' });
      ses.sent.push(command.input);
      return {};
    }
  }
  class SendEmailCommand {
    constructor(public input: Record<string, unknown>) {}
  }
  return { SESv2Client, SendEmailCommand };
});

import { POST } from './route';

const FROM = 'noreply@sender.example';
const TO = 'inbox@receiver.example';
const IP = '203.0.113.77';
const COOKIE_VALUE = 'cookie-secret-value-123';
const JOB_ID = '3f2b8c1e-5d4a-4e6f-9a7b-1c2d3e4f5a6b';

const VALID = {
  name: 'Sam Visitor',
  email: 'sam@example.com',
  message: 'My heating is making a rattling noise.',
  page: '/inspect',
  side: 'homeowner',
  jobId: JOB_ID,
};

function post(body: Record<string, unknown>) {
  return POST(
    makeRequest('/api/help', {
      method: 'POST',
      body,
      headers: { 'x-forwarded-for': forwardedFor(IP) },
      cookie: `hhi_session=${COOKIE_VALUE}`,
    }),
  );
}

function helpRecords(): Record<string, unknown>[] {
  return [...holder.fake.items.values()].filter((i) => String(i.PK).startsWith('HELP#'));
}

function counterItems(): Record<string, unknown>[] {
  return [...holder.fake.items.values()].filter((i) => String(i.PK).startsWith('RATELIMIT#'));
}

let restoreEnv: () => void;

beforeEach(() => {
  restoreEnv = withEnv({
    DYNAMODB_TABLE_NAME: 'test-table',
    SESSION_SECRET: 'test-secret',
    APP_AWS_REGION: 'us-east-2',
    CONTACT_FROM_EMAIL: FROM,
    CONTACT_TO_EMAIL: TO,
  });
  holder.fake = createFakeDynamoTable({ allowRateLimitWrites: true });
  ses.sent.length = 0;
  ses.fail = false;
  vi.spyOn(console, 'error').mockImplementation(() => {});
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});

afterEach(() => {
  restoreEnv();
  vi.restoreAllMocks();
});

describe('POST /api/help honeypot', () => {
  it('a filled honeypot gets the normal success with nothing saved, sent or counted', async () => {
    const response = await post({ ...VALID, website: 'http://spam.example' });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ status: 'sent' });
    expect(helpRecords()).toHaveLength(0);
    expect(ses.sent).toHaveLength(0);
    expect(counterItems()).toHaveLength(0);
  });

  it('a filled honeypot with a Trigger gets the Emergency_Message and nothing saved, sent or counted', async () => {
    const response = await post({ ...VALID, message: 'I can smell gas in the kitchen', website: 'x' });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ status: 'emergency', message: EMERGENCY_MESSAGE });
    expect(helpRecords()).toHaveLength(0);
    expect(ses.sent).toHaveLength(0);
    expect(counterItems()).toHaveLength(0);
  });
});

describe('POST /api/help success path', () => {
  it('saves one record, sends one email, and counts under the help: key space only', async () => {
    const response = await post(VALID);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ status: 'sent' });
    expect(helpRecords()).toHaveLength(1);
    expect(ses.sent).toHaveLength(1);

    const counters = counterItems();
    expect(counters).toHaveLength(1);
    expect(String(counters[0].PK).startsWith('RATELIMIT#help:')).toBe(true);
  });

  it('the help counter is independent of the inspection counter', async () => {
    // Exhaust a (hypothetical) inspection counter for every key shape: it must not block Help.
    const { resolveVisitorId } = await import('@/lib/rateLimiter');
    const visitorId = resolveVisitorId(
      makeRequest('/api/help', {
        method: 'POST',
        body: {},
        headers: { 'x-forwarded-for': forwardedFor(IP) },
        cookie: `hhi_session=${COOKIE_VALUE}`,
      }),
    );
    holder.fake.seed({
      PK: `RATELIMIT#${visitorId}`,
      SK: `RATELIMIT#${visitorId}`,
      count: 15,
      windowStart: Date.now(),
    });
    const before = counterItems().map((i) => JSON.stringify(i));

    for (let i = 0; i < 5; i += 1) {
      expect((await post(VALID)).status).toBe(200);
    }
    expect(helpRecords()).toHaveLength(5);

    // The seeded inspection items are untouched; only help: items were added.
    const after = counterItems();
    for (const item of before) expect(after.map((i) => JSON.stringify(i))).toContain(item);
    const added = after.filter((i) => !before.includes(JSON.stringify(i)));
    expect(added).toHaveLength(1);
    expect(String(added[0].PK).startsWith('RATELIMIT#help:')).toBe(true);
    expect(added[0].count).toBe(5);

    const sixth = await post(VALID);
    expect(sixth.status).toBe(429);
    expect(Number(sixth.headers.get('Retry-After'))).toBeGreaterThanOrEqual(1);
    expect(helpRecords()).toHaveLength(5);
  });
});

describe('POST /api/help failures', () => {
  it('SES failure still confirms when the record was saved', async () => {
    ses.fail = true;
    const response = await post(VALID);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ status: 'sent' });
    expect(helpRecords()).toHaveLength(1);
  });

  it('both save and send failing gives 500 ACTION_FAILED', async () => {
    ses.fail = true;
    const realSend = holder.fake.send;
    holder.fake.send = async (command: unknown) => {
      if ((command as { constructor: { name: string } }).constructor.name === 'PutCommand') {
        throw Object.assign(new Error('table down'), { name: 'TableDown' });
      }
      return realSend(command);
    };
    const response = await post(VALID);
    expect(response.status).toBe(500);
    expect(((await response.json()) as { error: string }).error).toBe('ACTION_FAILED');
  });

  it('missing CONTACT_* env keeps the record and still confirms', async () => {
    const restore = withEnv({ CONTACT_FROM_EMAIL: undefined, CONTACT_TO_EMAIL: undefined });
    try {
      const response = await post(VALID);
      expect(response.status).toBe(200);
      expect(helpRecords()).toHaveLength(1);
      expect(ses.sent).toHaveLength(0);
      // The error name is logged, never an address.
      const logged = JSON.stringify(vi.mocked(console.error).mock.calls);
      expect(logged).toContain('MissingConfigError');
    } finally {
      restore();
    }
  });
});

describe('POST /api/help SES command and privacy', () => {
  it('uses APP_AWS_REGION and sets From, To and Reply-To', async () => {
    await post({ ...VALID, email: 'visitor@example.com' });
    // The client is a module singleton, so it may have been created by an earlier test.
    expect(ses.configs.length).toBeGreaterThanOrEqual(1);
    expect(ses.configs.every((c) => (c as { region?: string }).region === 'us-east-2')).toBe(true);
    expect(ses.sent).toHaveLength(1);
    const input = ses.sent[0] as {
      FromEmailAddress: string;
      Destination: { ToAddresses: string[] };
      ReplyToAddresses: string[];
      Content: { Simple: { Subject: { Data: string } } };
    };
    expect(input.FromEmailAddress).toBe(FROM);
    expect(input.Destination.ToAddresses).toEqual([TO]);
    expect(input.ReplyToAddresses).toEqual(['visitor@example.com']);
    expect(input.Content.Simple.Subject.Data).toBe(HELP_SUBJECT);
  });

  it('marks a Trigger email with the emergency subject and still answers with the Emergency_Message', async () => {
    const response = await post({ ...VALID, message: 'There are sparks coming from the outlet' });
    expect(await response.json()).toEqual({ status: 'emergency', message: EMERGENCY_MESSAGE });
    const input = ses.sent[0] as { Content: { Simple: { Subject: { Data: string } } } };
    expect(input.Content.Simple.Subject.Data).toBe(HELP_SUBJECT_EMERGENCY);
    expect(helpRecords()[0].emergency).toBe(true);
  });

  it('puts no IP address or cookie value in the record or the email', async () => {
    await post(VALID);
    const record = JSON.stringify(helpRecords());
    const email = JSON.stringify(ses.sent);
    for (const secret of [IP, COOKIE_VALUE, 'hhi_session']) {
      expect(record).not.toContain(secret);
      expect(email).not.toContain(secret);
    }
    const stored = helpRecords()[0];
    expect(stored.GSI1PK).toBeUndefined();
    expect(stored.GSI1SK).toBeUndefined();
  });
});
