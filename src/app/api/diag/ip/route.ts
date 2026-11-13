// TEMPORARY diagnostic route. Delete it after TRUSTED_PROXY_HOPS is set
// (pro-dashboard-and-booking, task "Set TRUSTED_PROXY_HOPS and delete the diagnostic route").
// No token, logs nothing, calls no AWS service, never returns a raw address
// unless cloudfront-viewer-address is missing (then it returns the raw entries so you can read them).
import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

const NO_STORE = { 'Cache-Control': 'no-store' };

/** Canonical form so IPv6 spelling differences do not hide a match. */
function normalise(address: string): string {
  const value = address.trim().toLowerCase();
  if (!value.includes(':')) return value; // IPv4
  try {
    return new URL('http://[' + value.replace(/^\[|\]$/g, '') + ']').hostname.replace(/^\[|\]$/g, '');
  } catch {
    return value;
  }
}

/** cloudfront-viewer-address looks like "198.51.100.10:46532" or "[2001:db8::1]:46532" or "2001:db8::1:46532". */
function viewerIp(header: string): string {
  const withoutPort = header.trim().replace(/:\d+$/, '');
  return normalise(withoutPort.replace(/^\[|\]$/g, ''));
}

export async function GET(request: Request): Promise<NextResponse> {
  const forwarded = request.headers.get('x-forwarded-for') ?? '';
  const entries = forwarded
    .split(',')
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);
  const viewerHeader = request.headers.get('cloudfront-viewer-address');
  const viewerPresent = viewerHeader !== null && viewerHeader.trim().length > 0;

  const viewer = viewerPresent ? viewerIp(viewerHeader as string) : null;
  const labels = entries.map((entry) => (viewer !== null && normalise(entry) === viewer ? 'you' : 'other'));

  // Counting positions from the left starting at 0, the real viewer is the rightmost "you" entry
  // (a client can only add entries on the left). hops = entryCount - position.
  const position = labels.lastIndexOf('you');
  const suggestedHops = position === -1 ? null : entries.length - position;

  const body: Record<string, unknown> = {
    entryCount: entries.length,
    labels,
    cloudfrontViewerAddressPresent: viewerPresent,
    suggestedHops,
  };
  if (!viewerPresent) {
    body.rawEntries = entries;
  }
  return NextResponse.json(body, { status: 200, headers: NO_STORE });
}