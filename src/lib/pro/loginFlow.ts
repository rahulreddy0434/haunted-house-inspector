import { isAccessCodeValid } from '@/lib/pro/accessCode';
import { issueProCookie } from '@/lib/pro/proCookie';

export type ReserveResult =
  | { allowed: true; windowStart: number; count?: number }
  /** `retryAfterSeconds` is an integer in 1..900. */
  | { allowed: false; retryAfterSeconds: number };

export interface LockoutStore {
  /** May throw: the caller fails closed. */
  reserve(ipHash: string, nowMs: number): Promise<ReserveResult>;
  /** May throw: the caller logs the error name and ignores it. */
  release(ipHash: string, windowStart: number): Promise<void>;
}

export interface LoginDeps {
  store: LockoutStore;
  accessCode: string;
  secret: string;
  nowMs: number;
  /** Receives a fixed message and only the error name. Defaults to console.error. */
  log?: (message: string, errorName: string) => void;
}

export type LoginOutcome =
  | { kind: 'ok'; cookieValue: string }
  | { kind: 'invalid_code' }
  | { kind: 'locked'; retryAfterSeconds: number }
  | { kind: 'failed' };

function errorName(e: unknown): string {
  return e instanceof Error && typeof e.name === 'string' && e.name ? e.name : 'UnknownError';
}

/**
 * Reserves one attempt BEFORE comparing the code. Refused means locked, even for a
 * correct code. A wrong code keeps its attempt counted; a correct code releases it.
 */
export async function attemptLogin(
  code: string,
  ipHash: string,
  deps: LoginDeps,
): Promise<LoginOutcome> {
  const log = deps.log ?? ((message: string, name: string) => console.error(message, name));

  let reserved: ReserveResult;
  try {
    reserved = await deps.store.reserve(ipHash, deps.nowMs);
  } catch (e) {
    log('Lockout counter error', errorName(e));
    return { kind: 'failed' };
  }

  if (!reserved.allowed) {
    return { kind: 'locked', retryAfterSeconds: reserved.retryAfterSeconds };
  }

  if (!isAccessCodeValid(code, deps.accessCode)) {
    return { kind: 'invalid_code' };
  }

  try {
    await deps.store.release(ipHash, reserved.windowStart);
  } catch (e) {
    log('Lockout release error', errorName(e));
  }

  return { kind: 'ok', cookieValue: issueProCookie(deps.secret, deps.nowMs) };
}
