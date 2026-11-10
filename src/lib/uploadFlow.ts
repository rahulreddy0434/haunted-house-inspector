import type { ContextAnswers, InspectionResult } from '@/types/inspection';
import type { AcceptedFiles } from '@/lib/validation/mediaValidation';
import { inspectionResultSchema } from '@/lib/validation/inspectionSchema';
import { buildInspectRequestBody } from '@/lib/utils/contextAnswers';

export const ANALYSIS_TIMEOUT_MS = 60_000;
export const MAX_UPLOAD_CONCURRENCY = 3;

export const MESSAGES = {
  prepare: "We couldn't prepare your upload. Please try again.",
  upload: 'The upload failed. Please try again.',
  timeout: 'This is taking longer than expected. Please try again.',
  unreadable: "We couldn't read the result. Please try again.",
  analysis: "We couldn't analyse your photos. Please try again.",
  rateLimit: "You've reached today's inspection limit. Please come back tomorrow.",
  network: 'Something went wrong with the connection. Please try again.',
} as const;

export type UploadFlowErrorKind = 'rate_limit' | 'timeout' | 'upload' | 'analysis';

export type UploadFlowResult =
  | { ok: true; result: InspectionResult; inspectionId: string }
  | { ok: false; kind: UploadFlowErrorKind; message: string; resetAt?: string }
  | { ok: false; kind: 'cancelled'; message: string };

export type FileProgressStatus = 'pending' | 'uploading' | 'done' | 'error';

export interface FileProgressUpdate {
  index: number;
  progress: number;
  status: FileProgressStatus;
}

export type PutFile = (
  url: string,
  file: File,
  contentType: string,
  onProgress: (percent: number) => void,
  signal: AbortSignal,
) => Promise<boolean>;

export interface RunUploadFlowOptions {
  files: AcceptedFiles;
  answers: ContextAnswers;
  fetchImpl?: typeof fetch;
  putFile?: PutFile;
  onProgress?: (update: FileProgressUpdate) => void;
  onAnalysing?: () => void;
  signal?: AbortSignal;
  inspectionId?: string;
  timeoutMs?: number;
}

/** Default PUT using XMLHttpRequest so we get real upload progress events. */
export const xhrPutFile: PutFile = (url, file, contentType, onProgress, signal) =>
  new Promise<boolean>((resolve) => {
    const xhr = new XMLHttpRequest();
    const onAbort = () => xhr.abort();
    xhr.open('PUT', url);
    xhr.setRequestHeader('Content-Type', contentType);
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable && e.total > 0) onProgress((e.loaded / e.total) * 100);
    };
    xhr.onload = () => {
      signal.removeEventListener('abort', onAbort);
      resolve(xhr.status >= 200 && xhr.status < 300);
    };
    xhr.onerror = xhr.onabort = () => {
      signal.removeEventListener('abort', onAbort);
      resolve(false);
    };
    if (signal.aborted) {
      resolve(false);
      return;
    }
    signal.addEventListener('abort', onAbort, { once: true });
    xhr.send(file);
  });

async function readErrorBody(res: Response): Promise<{ message?: string; resetAt?: string }> {
  try {
    const body: unknown = await res.json();
    if (typeof body !== 'object' || body === null) return {};
    const rec = body as Record<string, unknown>;
    return {
      message: typeof rec.message === 'string' && rec.message ? rec.message : undefined,
      resetAt: typeof rec.resetAt === 'string' ? rec.resetAt : undefined,
    };
  } catch {
    return {};
  }
}

function fail(kind: UploadFlowErrorKind, message: string, resetAt?: string): UploadFlowResult {
  return resetAt ? { ok: false, kind, message, resetAt } : { ok: false, kind, message };
}

const CANCELLED: UploadFlowResult = { ok: false, kind: 'cancelled', message: '' };

/** Upload one file; returns the S3 key or a failure result. */
async function uploadOne(
  file: File,
  index: number,
  inspectionId: string,
  fetchImpl: typeof fetch,
  putFile: PutFile,
  onProgress: (u: FileProgressUpdate) => void,
  signal: AbortSignal,
): Promise<{ key: string } | { failure: UploadFlowResult }> {
  const contentType = file.type;
  const qs =
    `filename=${encodeURIComponent(file.name)}` +
    `&contentType=${encodeURIComponent(contentType)}` +
    `&inspectionId=${encodeURIComponent(inspectionId)}`;

  onProgress({ index, progress: 0, status: 'uploading' });

  let urlRes: Response;
  try {
    urlRes = await fetchImpl(`/api/upload-url?${qs}`, { signal });
  } catch {
    onProgress({ index, progress: 0, status: 'error' });
    return { failure: signal.aborted ? CANCELLED : fail('upload', MESSAGES.prepare) };
  }
  if (!urlRes.ok) {
    const { message } = await readErrorBody(urlRes);
    onProgress({ index, progress: 0, status: 'error' });
    return { failure: fail('upload', message ?? MESSAGES.prepare) };
  }

  let url: unknown;
  let key: unknown;
  try {
    const body = (await urlRes.json()) as Record<string, unknown>;
    url = body.url;
    key = body.key;
  } catch {
    // fall through
  }
  if (typeof url !== 'string' || typeof key !== 'string' || !url || !key) {
    onProgress({ index, progress: 0, status: 'error' });
    return { failure: fail('upload', MESSAGES.prepare) };
  }

  const ok = await putFile(
    url,
    file,
    contentType,
    (p) => onProgress({ index, progress: p, status: 'uploading' }),
    signal,
  );
  if (!ok) {
    onProgress({ index, progress: 0, status: 'error' });
    return { failure: signal.aborted ? CANCELLED : fail('upload', MESSAGES.upload) };
  }
  onProgress({ index, progress: 100, status: 'done' });
  return { key };
}

export async function runUploadFlow(opts: RunUploadFlowOptions): Promise<UploadFlowResult> {
  const fetchImpl = opts.fetchImpl ?? ((...args: Parameters<typeof fetch>) => fetch(...args));
  const putFile = opts.putFile ?? xhrPutFile;
  const onProgress = opts.onProgress ?? (() => undefined);
  const outer = opts.signal ?? new AbortController().signal;
  const inspectionId = opts.inspectionId ?? crypto.randomUUID();
  const files = opts.files.files;

  // Upload with limited concurrency; stop starting new uploads after a failure.
  const keys: string[] = new Array<string>(files.length);
  let next = 0;
  let failure: UploadFlowResult | null = null;
  const worker = async () => {
    while (failure === null && !outer.aborted) {
      const i = next++;
      if (i >= files.length) return;
      const r = await uploadOne(files[i], i, inspectionId, fetchImpl, putFile, onProgress, outer);
      if ('failure' in r) {
        failure ??= r.failure;
        return;
      }
      keys[i] = r.key;
    }
  };
  await Promise.all(
    Array.from({ length: Math.min(MAX_UPLOAD_CONCURRENCY, files.length) }, () => worker()),
  );
  if (outer.aborted) return CANCELLED;
  if (failure) return failure;

  opts.onAnalysing?.();

  // Analysis, bounded by the timeout.
  const controller = new AbortController();
  let timedOut = false;
  const onOuterAbort = () => controller.abort();
  outer.addEventListener('abort', onOuterAbort, { once: true });
  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, opts.timeoutMs ?? ANALYSIS_TIMEOUT_MS);

  try {
    let res: Response;
    try {
      res = await fetchImpl('/api/inspect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(buildInspectRequestBody(keys, opts.answers)),
        signal: controller.signal,
      });

      if (res.status === 200) {
        let body: unknown;
        try {
          body = await res.json();
        } catch {
          if (timedOut) return fail('timeout', MESSAGES.timeout);
          if (outer.aborted) return CANCELLED;
          return fail('analysis', MESSAGES.unreadable);
        }
        const parsed = inspectionResultSchema.safeParse(body);
        if (!parsed.success) return fail('analysis', MESSAGES.unreadable);
        const result = parsed.data as InspectionResult;
        return { ok: true, result, inspectionId: result.id };
      }

      const { message, resetAt } = await readErrorBody(res);
      if (res.status === 429) return fail('rate_limit', message ?? MESSAGES.rateLimit, resetAt);
      return fail('analysis', message ?? MESSAGES.analysis);
    } catch {
      if (timedOut) return fail('timeout', MESSAGES.timeout);
      if (outer.aborted) return CANCELLED;
      return fail('analysis', MESSAGES.network);
    }
  } finally {
    clearTimeout(timer);
    outer.removeEventListener('abort', onOuterAbort);
  }
}
