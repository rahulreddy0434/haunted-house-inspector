export type Rgb = readonly [number, number, number];
export type ContrastRole = 'body' | 'large' | 'non-text';

/** Parse `#rgb` or `#rrggbb` into 0-255 channels. */
export function parseHex(hex: string): Rgb {
  const m = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) throw new Error(`Invalid hex colour: ${hex}`);
  let h = m[1];
  if (h.length === 3) h = h.split('').map((c) => c + c).join('');
  return [
    parseInt(h.slice(0, 2), 16),
    parseInt(h.slice(2, 4), 16),
    parseInt(h.slice(4, 6), 16),
  ];
}

export function toHex(rgb: Rgb): string {
  return (
    '#' +
    rgb
      .map((c) => Math.round(Math.min(255, Math.max(0, c))).toString(16).padStart(2, '0'))
      .join('')
  );
}

function linearise(channel: number): number {
  const s = channel / 255;
  return s <= 0.04045 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
}

/** WCAG 2.x relative luminance of a hex colour. */
export function relativeLuminance(hex: string): number {
  const [r, g, b] = parseHex(hex);
  return 0.2126 * linearise(r) + 0.7152 * linearise(g) + 0.0722 * linearise(b);
}

/** WCAG 2.x contrast ratio, always >= 1 regardless of argument order. */
export function contrastRatio(fgHex: string, bgHex: string): number {
  const a = relativeLuminance(fgHex);
  const b = relativeLuminance(bgHex);
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
}

/** Blend `overlayHex` at `alpha` (0..1) over `baseHex`. Returns a hex colour. */
export function blend(baseHex: string, overlayHex: string, alpha: number): string {
  const base = parseHex(baseHex);
  const over = parseHex(overlayHex);
  return toHex([
    base[0] * (1 - alpha) + over[0] * alpha,
    base[1] * (1 - alpha) + over[1] * alpha,
    base[2] * (1 - alpha) + over[2] * alpha,
  ]);
}

/** Minimum contrast: body text 4.5; large text and non-text 3. */
export function minimumFor(role: ContrastRole): 3 | 4.5 {
  return role === 'body' ? 4.5 : 3;
}
