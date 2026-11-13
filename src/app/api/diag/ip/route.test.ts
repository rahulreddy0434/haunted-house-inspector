// TEMPORARY: delete together with route.ts.
// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { GET } from '@/app/api/diag/ip/route';

function call(headers: Record<string, string>) {
  return GET(new Request('http://localhost/api/diag/ip', { headers }));
}

describe('GET /api/diag/ip (temporary)', () => {
  it('labels the entry equal to the viewer address and suggests hops', async () => {
    const res = await call({
      'x-forwarded-for': '6.6.6.6, 203.0.113.9',
      'cloudfront-viewer-address': '203.0.113.9:46532',
    });
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(res.headers.get('cache-control')).toBe('no-store');
    expect(body).toEqual({
      entryCount: 2,
      labels: ['other', 'you'],
      cloudfrontViewerAddressPresent: true,
      suggestedHops: 1,
    });
    expect(JSON.stringify(body)).not.toContain('203.0.113.9');
    expect(JSON.stringify(body)).not.toContain('6.6.6.6');
  });

  it('suggests 2 when one more proxy address follows the viewer', async () => {
    const body = await (
      await call({
        'x-forwarded-for': '6.6.6.6, 203.0.113.9, 10.0.0.1',
        'cloudfront-viewer-address': '203.0.113.9:1',
      })
    ).json();
    expect(body.labels).toEqual(['other', 'you', 'other']);
    expect(body.suggestedHops).toBe(2);
  });

  it('uses the rightmost match when a client spoofs the viewer address on the left', async () => {
    const body = await (
      await call({
        'x-forwarded-for': '203.0.113.9, 203.0.113.9',
        'cloudfront-viewer-address': '203.0.113.9:1',
      })
    ).json();
    expect(body.suggestedHops).toBe(1);
  });

  it('matches IPv6 in bracket and plain forms', async () => {
    const a = await (
      await call({
        'x-forwarded-for': '2001:0db8:0:0:0:0:0:1',
        'cloudfront-viewer-address': '[2001:db8::1]:5000',
      })
    ).json();
    expect(a.labels).toEqual(['you']);
    expect(a.suggestedHops).toBe(1);
    const b = await (
      await call({
        'x-forwarded-for': '2001:db8::1',
        'cloudfront-viewer-address': '2001:db8::1:5000',
      })
    ).json();
    expect(b.labels).toEqual(['you']);
  });

  it('returns null when nothing matches', async () => {
    const body = await (
      await call({
        'x-forwarded-for': '1.1.1.1, 2.2.2.2',
        'cloudfront-viewer-address': '203.0.113.9:1',
      })
    ).json();
    expect(body.labels).toEqual(['other', 'other']);
    expect(body.suggestedHops).toBeNull();
    expect(body.rawEntries).toBeUndefined();
  });

  it('returns the raw entries when cloudfront-viewer-address is missing', async () => {
    const body = await (await call({ 'x-forwarded-for': '1.1.1.1, 2.2.2.2' })).json();
    expect(body).toEqual({
      entryCount: 2,
      labels: ['other', 'other'],
      cloudfrontViewerAddressPresent: false,
      suggestedHops: null,
      rawEntries: ['1.1.1.1', '2.2.2.2'],
    });
  });

  it('handles no x-forwarded-for at all', async () => {
    const body = await (await call({})).json();
    expect(body.entryCount).toBe(0);
    expect(body.labels).toEqual([]);
    expect(body.rawEntries).toEqual([]);
    expect(body.suggestedHops).toBeNull();
  });
});