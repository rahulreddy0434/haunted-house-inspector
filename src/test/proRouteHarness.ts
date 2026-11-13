import { afterEach, expect, vi, type MockInstance } from 'vitest';
import { NextRequest } from 'next/server';
import { PRO_COOKIE_NAME, issueProCookie } from '@/lib/pro/proCookie';
import { TRUSTED_PROXY_HOPS } from '@/lib/net/getTrustedClientIp';

/** Obviously fake values for tests only. */
export const TEST_SECRET = 'test-only-session-secret-not-real';
export const TEST_ACCESS_CODE = 'test-only-access-code-not-real';

export interface MakeRequestOptions {
  method?: string;
  /** Object -> JSON, string as-is, ReadableStream passed through. */
  body?: unknown;
  /** A Pro cookie value, or a raw Cookie header (anything containing `=`). */
  cookie?: string;
  headers?: Record<string, string>;
}

export function makeRequest(path: string, options: MakeRequestOptions = {}): NextRequest {
  const { method = options.body === undefined ? 'GET' : 'POST', body, cookie, headers = {} } = options;
  const finalHeaders = new Headers(headers);

  let requestBody: BodyInit | undefined;
  let duplex = false;
  if (body !== undefined) {
    if (typeof body === 'string') {
      requestBody = body;
    } else if (typeof ReadableStream !== 'undefined' && body instanceof ReadableStream) {
      requestBody = body as ReadableStream;
      duplex = true;
    } else {
      requestBody = JSON.stringify(body);
      if (!finalHeaders.has('content-type')) {
        finalHeaders.set('content-type', 'application/json');
      }
    }
  }

  if (cookie !== undefined) {
    finalHeaders.set('cookie', cookie.includes('=') ? cookie : `${PRO_COOKIE_NAME}=${cookie}`);
  }

  const init: RequestInit & { duplex?: 'half' } = { method, headers: finalHeaders };
  if (requestBody !== undefined) {
    init.body = requestBody;
    if (duplex) init.duplex = 'half';
  }
  return new NextRequest(new URL(path, 'http://localhost'), init as ConstructorParameters<typeof NextRequest>[1]);
}

/** A validly signed Pro cookie value, good for 12 hours after `nowMs`. */
export function validProCookie(nowMs: number, secret: string = TEST_SECRET): string {
  return issueProCookie(secret, nowMs);
}

/** Sets env vars (undefined deletes). Returns a function that restores the previous values. */
export function withEnv(vars: Record<string, string | undefined>): () => void {
  const previous: Record<string, string | undefined> = {};
  for (const [key, value] of Object.entries(vars)) {
    previous[key] = process.env[key];
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }
  return () => {
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
  };
}

/** Like withEnv, but restores automatically in afterEach. Call inside a describe or at top level. */
export function useEnv(vars: Record<string, string | undefined>): void {
  let restore: (() => void) | undefined;
  // Applied immediately so it is visible to beforeEach setup; restored after each test.
  restore = withEnv(vars);
  afterEach(() => {
    restore?.();
    restore = withEnv(vars);
  });
}

export function expectNoStore(response: Response): void {
  const value = response.headers.get('cache-control') ?? '';
  expect(value.toLowerCase()).toContain('no-store');
}

export interface ConsoleSpies {
  error: MockInstance;
  warn: MockInstance;
  /** All logged arguments from error and warn, stringified and joined. */
  loggedText: () => string;
  restore: () => void;
}

export function consoleSpies(): ConsoleSpies {
  const error = vi.spyOn(console, 'error').mockImplementation(() => {});
  const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
  const stringify = (arg: unknown): string => {
    if (typeof arg === 'string') return arg;
    if (arg instanceof Error) return `${arg.name}: ${arg.message}\n${arg.stack ?? ''}`;
    try {
      return JSON.stringify(arg) ?? String(arg);
    } catch {
      return String(arg);
    }
  };
  return {
    error,
    warn,
    loggedText: () =>
      [...error.mock.calls, ...warn.mock.calls]
        .map((args) => (args as unknown[]).map(stringify).join(' '))
        .join('\n'),
    restore: () => {
      error.mockRestore();
      warn.mockRestore();
    },
  };
}

/**
 * Builds an x-forwarded-for value: spoofed prefix, the trusted viewer, then
 * TRUSTED_PROXY_HOPS - 1 trailing proxy entries.
 */
export function forwardedFor(trustedIp: string, options: { spoofed?: string[] } = {}): string {
  const trailing = Array.from({ length: Math.max(0, TRUSTED_PROXY_HOPS - 1) }, () => '10.0.0.1');
  return [...(options.spoofed ?? []), trustedIp, ...trailing].join(', ');
}

type RouteHandler<P> = (request: NextRequest, context: { params: Promise<P> }) => Promise<Response> | Response;

/** Calls a Next 15 route handler with `{ params: Promise.resolve(params) }`. */
export async function callWithParams<P extends Record<string, string>>(
  handler: RouteHandler<P>,
  request: NextRequest,
  params: P,
): Promise<Response> {
  return handler(request, { params: Promise.resolve(params) });
}

/** Shorthand for the common `[id]` route. */
export function callWithId(
  handler: RouteHandler<{ id: string }>,
  request: NextRequest,
  id: string,
): Promise<Response> {
  return callWithParams(handler, request, { id });
}
