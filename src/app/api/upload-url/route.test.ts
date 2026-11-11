// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

const getSignedUrlMock = vi.hoisted(() => vi.fn());

vi.mock('@aws-sdk/s3-request-presigner', () => ({
  getSignedUrl: getSignedUrlMock,
}));

import { PutObjectCommand } from '@aws-sdk/client-s3';
import { GET } from './route';

const ID = '123e4567-e89b-42d3-a456-426614174000';

const call = (params: Record<string, string | undefined>) => {
  const url = new URL('http://localhost/api/upload-url');
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined) url.searchParams.set(k, v);
  }
  return GET(new Request(url));
};

describe('GET /api/upload-url', () => {
  const originalBucket = process.env.S3_BUCKET_NAME;
  const originalRegion = process.env.APP_AWS_REGION;
  let errorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    process.env.APP_AWS_REGION = 'us-east-2';
    process.env.S3_BUCKET_NAME = 'test-bucket';
    getSignedUrlMock.mockReset();
    getSignedUrlMock.mockImplementation(async (_client: unknown, command: PutObjectCommand) =>
      `https://test-bucket.s3.us-east-2.amazonaws.com/${command.input.Key}?X-Amz-Signature=sig`,
    );
    errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    errorSpy.mockRestore();
    if (originalBucket === undefined) delete process.env.S3_BUCKET_NAME;
    else process.env.S3_BUCKET_NAME = originalBucket;
    if (originalRegion === undefined) delete process.env.APP_AWS_REGION;
    else process.env.APP_AWS_REGION = originalRegion;
  });

  it('returns url and key with no-store for valid params', async () => {
    const res = await call({ filename: 'photo 1.jpg', contentType: 'image/jpeg', inspectionId: ID });
    expect(res.status).toBe(200);
    expect(res.headers.get('Cache-Control')).toBe('no-store');
    const key = `${ID}/photo_1.jpg`;
    expect(await res.json()).toEqual({
      url: `https://test-bucket.s3.us-east-2.amazonaws.com/${key}?X-Amz-Signature=sig`,
      key,
    });

    expect(getSignedUrlMock).toHaveBeenCalledTimes(1);
    const [, command, options] = getSignedUrlMock.mock.calls[0] as [unknown, PutObjectCommand, unknown];
    expect(command).toBeInstanceOf(PutObjectCommand);
    expect(command.input).toMatchObject({
      Bucket: 'test-bucket',
      Key: key,
      ContentType: 'image/jpeg',
    });
    expect(options).toEqual({ expiresIn: 900 });
  });

  it.each(['image/jpeg', 'image/png', 'image/webp', 'video/mp4', 'video/webm'])(
    'accepts content type %s',
    async (contentType) => {
      const res = await call({ filename: 'file.bin', contentType, inspectionId: ID });
      expect(res.status).toBe(200);
    },
  );

  it.each(['application/pdf', 'image/gif'])('rejects content type %s with 400', async (contentType) => {
    const res = await call({ filename: 'file.bin', contentType, inspectionId: ID });
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe('INVALID_REQUEST');
    expect(getSignedUrlMock).not.toHaveBeenCalled();
  });

  it('rejects a missing contentType with 400', async () => {
    const res = await call({ filename: 'a.jpg', inspectionId: ID });
    expect(res.status).toBe(400);
    expect(getSignedUrlMock).not.toHaveBeenCalled();
  });

  it.each([
    ['missing filename', { contentType: 'image/jpeg', inspectionId: ID }],
    ['missing inspectionId', { filename: 'a.jpg', contentType: 'image/jpeg' }],
    ['non-UUID inspectionId', { filename: 'a.jpg', contentType: 'image/jpeg', inspectionId: 'not-a-uuid' }],
  ])('returns 400 for %s', async (_name, params) => {
    const res = await call(params);
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe('INVALID_REQUEST');
    expect(getSignedUrlMock).not.toHaveBeenCalled();
  });

  it('neutralises path traversal in the filename', async () => {
    const res = await call({ filename: '../../etc/passwd', contentType: 'image/png', inspectionId: ID });
    expect(res.status).toBe(200);
    const { key } = (await res.json()) as { key: string };
    expect(key).toBe(`${ID}/passwd`);
    expect(key).not.toContain('..');
    expect(key.startsWith('/')).toBe(false);
  });

  it('returns 500 UPLOAD_URL_FAILED without leaking the error message', async () => {
    const secret = 'AKIAEXAMPLESECRET credentials expired';
    getSignedUrlMock.mockRejectedValue(new Error(secret));
    const res = await call({ filename: 'a.jpg', contentType: 'image/jpeg', inspectionId: ID });
    expect(res.status).toBe(500);
    const text = await res.text();
    const body = JSON.parse(text) as { error: string; message: string };
    expect(body.error).toBe('UPLOAD_URL_FAILED');
    expect(body.message).toBe("We couldn't prepare your upload. Please try again.");
    expect(text).not.toContain(secret);
    expect(text).not.toContain('AKIA');
  });

  it('returns 500 UPLOAD_URL_FAILED when S3_BUCKET_NAME is missing', async () => {
    delete process.env.S3_BUCKET_NAME;
    const res = await call({ filename: 'a.jpg', contentType: 'image/jpeg', inspectionId: ID });
    expect(res.status).toBe(500);
    expect((await res.json()).error).toBe('UPLOAD_URL_FAILED');
    expect(getSignedUrlMock).not.toHaveBeenCalled();
  });

  describe('error logging hygiene', () => {
    const FILE = 'my-private-kitchen-photo.jpg';
    const FRIENDLY = "We couldn't prepare your upload. Please try again.";
    let spies: ReturnType<typeof vi.spyOn>[];

    beforeEach(() => {
      spies = [
        errorSpy,
        vi.spyOn(console, 'log').mockImplementation(() => {}),
        vi.spyOn(console, 'warn').mockImplementation(() => {}),
        vi.spyOn(console, 'info').mockImplementation(() => {}),
      ];
    });

    afterEach(() => {
      for (const s of spies.slice(1)) s.mockRestore();
    });

    const logged = () => JSON.stringify(spies.map((s) => s.mock.calls));

    it('logs only the error name when presigning rejects with an Error', async () => {
      const err = new Error('SECRET-MSG-123 arn:aws:iam::123456789012:role/x');
      err.name = 'CredentialsProviderError';
      getSignedUrlMock.mockRejectedValue(err);
      const res = await call({ filename: FILE, contentType: 'image/jpeg', inspectionId: ID });
      expect(res.status).toBe(500);
      const body = (await res.json()) as { error: string; message: string };
      expect(body.error).toBe('UPLOAD_URL_FAILED');
      expect(body.message).toBe(FRIENDLY);
      const out = logged();
      expect(out).toContain('CredentialsProviderError');
      expect(out).not.toContain('SECRET-MSG-123');
      expect(out).not.toContain('arn:aws');
      expect(out).not.toContain('my-private-kitchen-photo');
      expect(out).not.toContain(ID);
    });

    it('logs UnknownError for a non-Error rejection', async () => {
      getSignedUrlMock.mockRejectedValue('SECRET-MSG-123 string rejection');
      const res = await call({ filename: FILE, contentType: 'image/jpeg', inspectionId: ID });
      expect(res.status).toBe(500);
      const body = (await res.json()) as { error: string; message: string };
      expect(body.error).toBe('UPLOAD_URL_FAILED');
      expect(body.message).toBe(FRIENDLY);
      const out = logged();
      expect(out).toContain('UnknownError');
      expect(out).not.toContain('SECRET-MSG-123');
      expect(out).not.toContain('my-private-kitchen-photo');
      expect(out).not.toContain(ID);
    });

    it('does not log the missing-bucket message, only the error name', async () => {
      delete process.env.S3_BUCKET_NAME;
      const res = await call({ filename: FILE, contentType: 'image/jpeg', inspectionId: ID });
      expect(res.status).toBe(500);
      const body = (await res.json()) as { error: string; message: string };
      expect(body.error).toBe('UPLOAD_URL_FAILED');
      expect(body.message).toBe(FRIENDLY);
      const out = logged();
      expect(out).toContain('"Error"');
      expect(out).not.toContain('Missing required environment variable');
      expect(out).not.toContain('S3_BUCKET_NAME');
      expect(out).not.toContain('my-private-kitchen-photo');
      expect(out).not.toContain(ID);
    });
  });
});
