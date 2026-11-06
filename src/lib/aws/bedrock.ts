import "server-only";
import {
  BedrockRuntimeClient,
  InvokeModelCommand,
} from "@aws-sdk/client-bedrock-runtime";
import { resolveImageFormat, type ImageFormat } from "@/lib/aws/imageFormat";
import { getDownloadPresignedUrl } from "@/lib/aws/s3";
import { buildInspectPrompt } from "@/lib/prompts/inspectPrompt";
import type { BedrockInspectionResponse } from "@/types/bedrock";
import type { ContextAnswers } from "@/types/inspection";

const DEFAULT_MODEL_ID = "us.amazon.nova-lite-v1:0";
// Amplify stops server requests at 30 s; a 20 s limit leaves time to return
// the emergency message when the model call times out.
const TIMEOUT_MS = 20_000;
const MAX_OUTPUT_TOKENS = 1500;

let client: BedrockRuntimeClient | undefined;

function getClient(): BedrockRuntimeClient {
  if (!client) {
    const region = process.env.APP_AWS_REGION;
    if (!region) {
      throw new Error("Missing required environment variable: APP_AWS_REGION");
    }
    // Credentials come from the default provider chain (IAM role / CLI profile).
    client = new BedrockRuntimeClient({ region });
  }
  return client;
}

interface FetchedImage {
  bytes: string;
  format: ImageFormat;
}

async function fetchImage(key: string, signal: AbortSignal): Promise<FetchedImage> {
  const url = await getDownloadPresignedUrl(key);
  const res = await fetch(url, { signal });
  if (!res.ok) {
    throw new Error(`Failed to fetch image "${key}" from S3 (status ${res.status})`);
  }
  const format = resolveImageFormat(res.headers.get("content-type"), key);
  return { bytes: Buffer.from(await res.arrayBuffer()).toString("base64"), format };
}

function stripCodeFences(text: string): string {
  const trimmed = text.trim();
  const match = /^```(?:json)?\s*([\s\S]*?)\s*```$/i.exec(trimmed);
  return match ? match[1] : trimmed;
}

function isAbortError(err: unknown): boolean {
  return err instanceof Error && (err.name === "AbortError" || err.name === "TimeoutError");
}

interface NovaResponse {
  output?: { message?: { content?: Array<{ text?: string }> } };
}

/**
 * Sends the images and context answers to Amazon Nova Lite and returns the
 * parsed (unvalidated) JSON. Callers must validate the result with Zod.
 */
export async function invokeInspectionModel(
  s3Keys: string[],
  answers: ContextAnswers,
): Promise<BedrockInspectionResponse> {
  const modelId = process.env.BEDROCK_MODEL_ID || DEFAULT_MODEL_ID;
  const signal = AbortSignal.timeout(TIMEOUT_MS);

  try {
    const images = await Promise.all(s3Keys.map((key) => fetchImage(key, signal)));

    const prompt = buildInspectPrompt({
      location: answers.location,
      duration: answers.duration,
      recentChanges: answers.recentChanges,
      imageCount: s3Keys.length,
    });

    const body = JSON.stringify({
      schemaVersion: "messages-v1",
      messages: [
        {
          role: "user",
          content: [
            ...images.map(({ bytes, format }) => ({
              image: { format, source: { bytes } },
            })),
            { text: prompt },
          ],
        },
      ],
      inferenceConfig: { maxTokens: MAX_OUTPUT_TOKENS, temperature: 0.2 },
    });

    const response = await getClient().send(
      new InvokeModelCommand({
        modelId,
        contentType: "application/json",
        accept: "application/json",
        body,
      }),
      { abortSignal: signal },
    );

    const decoded = JSON.parse(new TextDecoder().decode(response.body)) as NovaResponse;
    const text = decoded.output?.message?.content?.find((c) => typeof c.text === "string")?.text;
    if (!text) {
      throw new Error("Bedrock returned no text output");
    }

    try {
      return JSON.parse(stripCodeFences(text)) as BedrockInspectionResponse;
    } catch {
      throw new Error("Bedrock returned invalid JSON");
    }
  } catch (err) {
    if (isAbortError(err) || signal.aborted) {
      throw new Error(`Bedrock inspection timed out after ${TIMEOUT_MS / 1000} seconds`);
    }
    throw err;
  }
}
