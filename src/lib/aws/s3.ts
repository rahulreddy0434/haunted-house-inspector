import "server-only";

import { GetObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

/** Pre-signed PUT URL lifetime in seconds (15 minutes). */
const UPLOAD_URL_EXPIRY_SECONDS = 900;
/** Pre-signed GET URL default lifetime in seconds (15 minutes). */
const DOWNLOAD_URL_EXPIRY_SECONDS = 900;

function requireEnv(name: "S3_BUCKET_NAME" | "APP_AWS_REGION"): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

let client: S3Client | undefined;

function getClient(): S3Client {
  if (!client) {
    // Credentials come from the default provider chain (IAM role / CLI profile).
    client = new S3Client({ region: requireEnv("APP_AWS_REGION") });
  }
  return client;
}

/** Lazily-created S3 client singleton (one per server instance). */
export const s3Client: S3Client = new Proxy({} as S3Client, {
  get(_target, prop) {
    const real = getClient();
    const value = Reflect.get(real, prop, real) as unknown;
    return typeof value === "function" ? value.bind(real) : value;
  },
});

/** Returns a pre-signed PUT URL for uploading an object (expires in 15 minutes). */
export async function getUploadPresignedUrl(
  key: string,
  contentType: string,
): Promise<string> {
  const command = new PutObjectCommand({
    Bucket: requireEnv("S3_BUCKET_NAME"),
    Key: key,
    ContentType: contentType,
  });
  return getSignedUrl(getClient(), command, {
    expiresIn: UPLOAD_URL_EXPIRY_SECONDS,
  });
}

/** Returns a pre-signed GET URL for reading an object. */
export async function getDownloadPresignedUrl(
  key: string,
  expiresIn: number = DOWNLOAD_URL_EXPIRY_SECONDS,
): Promise<string> {
  const command = new GetObjectCommand({
    Bucket: requireEnv("S3_BUCKET_NAME"),
    Key: key,
  });
  return getSignedUrl(getClient(), command, { expiresIn });
}
