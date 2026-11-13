export const MAX_ACTION_BODY_BYTES = 4096;

/** True when a numeric Content-Length header already exceeds the limit. */
export function declaredLengthExceeds(request: Request, maxBytes: number): boolean {
  const declared = request.headers.get('content-length');
  if (declared === null || !/^\d+$/.test(declared.trim())) return false;
  const length = Number(declared.trim());
  return Number.isFinite(length) && length > maxBytes;
}

/**
 * Reads the body as a stream with a running byte count, aborting once the limit
 * is exceeded. Returns null when the body is too large.
 */
export async function readBodyWithLimit(request: Request, maxBytes: number): Promise<string | null> {
  if (!request.body) return '';
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maxBytes) {
      await reader.cancel().catch(() => {});
      return null;
    }
    chunks.push(value);
  }
  const merged = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    merged.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new TextDecoder().decode(merged);
}

export type JsonBodyResult =
  | { ok: true; value: unknown }
  | { ok: false; kind: 'too_large' | 'invalid_json' };

/** Pre-check, stream read, JSON.parse. A read error counts as invalid_json (as in the inspect route). */
export async function readJsonBody(request: Request, maxBytes: number): Promise<JsonBodyResult> {
  if (declaredLengthExceeds(request, maxBytes)) return { ok: false, kind: 'too_large' };
  let text: string | null;
  try {
    text = await readBodyWithLimit(request, maxBytes);
  } catch {
    return { ok: false, kind: 'invalid_json' };
  }
  if (text === null) return { ok: false, kind: 'too_large' };
  try {
    return { ok: true, value: JSON.parse(text) as unknown };
  } catch {
    return { ok: false, kind: 'invalid_json' };
  }
}
