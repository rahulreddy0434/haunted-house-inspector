import { noStoreJson } from '@/lib/http/responses';
import { buildLogoutCookie } from '@/lib/pro/proAuth';

export const runtime = 'nodejs';

/** POST /api/pro/logout: always clears the hhi_pro cookie. No config, cookie, body or AWS access. */
export async function POST() {
  const res = noStoreJson(200, { ok: true });
  res.cookies.set(buildLogoutCookie());
  return res;
}
