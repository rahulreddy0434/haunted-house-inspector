import { NextResponse } from 'next/server';
import type { ApiErrorBody, ApiErrorCode } from '@/types/job';

/** JSON response that always carries `Cache-Control: no-store`; other headers are merged. */
export function noStoreJson(
  status: number,
  body: unknown,
  headers: Record<string, string> = {},
): NextResponse {
  const merged = new Headers(headers);
  merged.set('Cache-Control', 'no-store');
  return NextResponse.json(body, { status, headers: merged });
}

/** Builds the standard `{ error, message, ... }` error body. */
export function errorBody(
  code: ApiErrorCode,
  message: string,
  extra: Record<string, unknown> = {},
): ApiErrorBody {
  return { ...extra, error: code, message } as ApiErrorBody;
}
