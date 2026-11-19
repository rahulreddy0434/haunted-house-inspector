import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { EmergencyBanner } from '@/components/results/EmergencyBanner';
import { UrgencyBadge } from '@/components/results/UrgencyBadge';
import { ProEmergencyView } from '@/components/pro/ProEmergencyView';

/** Validates: Requirements 10.1, 10.2, 10.4, 10.5, 10.6, 10.7, 10.8, 10.10, 17.6, 17.16 */

const SRC = path.resolve(__dirname, '..');
const ROOT = path.resolve(SRC, '..');
const MOTION_CSS = readFileSync(path.join(__dirname, 'haunted-motion.css'), 'utf8');

/** Strip comments so words in comments never count. */
function stripComments(text: string): string {
  return text.replace(/\/\*[\s\S]*?\*\//g, '');
}

/** Return the body of the block that opens at the first "{" at or after `from`. */
function blockBody(css: string, from: number): { body: string; end: number } {
  const open = css.indexOf('{', from);
  let depth = 0;
  for (let i = open; i < css.length; i++) {
    if (css[i] === '{') depth++;
    else if (css[i] === '}') {
      depth--;
      if (depth === 0) return { body: css.slice(open + 1, i), end: i + 1 };
    }
  }
  throw new Error('Unbalanced braces');
}

function parseKeyframes(css: string): Record<string, string> {
  const result: Record<string, string> = {};
  const re = /@keyframes\s+([\w-]+)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(css)) !== null) {
    result[m[1]] = blockBody(css, m.index).body;
  }
  return result;
}

function listFiles(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) listFiles(full, out);
    else out.push(full);
  }
  return out;
}

const CSS = stripComments(MOTION_CSS);
const KEYFRAMES = parseKeyframes(CSS);

function toSeconds(value: string, unit: string): number {
  return unit === 'ms' ? Number(value) / 1000 : Number(value);
}

describe('Motion_Stylesheet keyframes', () => {
  it('defines exactly hhi-flicker and hhi-fog-drift', () => {
    expect(Object.keys(KEYFRAMES).sort()).toEqual(['hhi-flicker', 'hhi-fog-drift']);
  });

  it('flicker opacity stays within 0.85 to 1.0 with a spread of at most 0.15', () => {
    const values = [...KEYFRAMES['hhi-flicker'].matchAll(/opacity\s*:\s*([\d.]+)/g)].map((m) => Number(m[1]));
    expect(values.length).toBeGreaterThan(0);
    for (const v of values) {
      expect(v).toBeGreaterThanOrEqual(0.85);
      expect(v).toBeLessThanOrEqual(1);
    }
    expect(Math.max(...values) - Math.min(...values)).toBeLessThanOrEqual(0.15 + 1e-9);
  });

  it('fog drift animates transform only, with no opacity', () => {
    const body = KEYFRAMES['hhi-fog-drift'];
    expect(body).toMatch(/transform\s*:/);
    expect(body).not.toMatch(/opacity/);
    const props = [...body.matchAll(/([a-z-]+)\s*:/g)].map((m) => m[1]);
    expect(new Set(props)).toEqual(new Set(['transform']));
  });
});

describe('Motion_Stylesheet animation declarations', () => {
  // Rules outside @media / @keyframes: "selector { declarations }"
  const declarations = [...CSS.matchAll(/([^{}]+)\{([^{}]*\banimation\s*:[^{}]*)\}/g)].map((m) => ({
    selector: m[1].trim(),
    body: m[2],
  }));

  it('has animation declarations for both classes', () => {
    expect(declarations.length).toBeGreaterThanOrEqual(2);
  });

  it('every animation selector starts with .theme-haunted', () => {
    for (const d of declarations) {
      expect(d.selector.startsWith('.theme-haunted')).toBe(true);
    }
  });

  it('every non-none animation lasts at least 2 s, and fog at least 40 s', () => {
    const active = [...CSS.matchAll(/animation\s*:\s*([\w-]+)\s+([\d.]+)(ms|s)\b[^;]*;/g)];
    expect(active.map((m) => m[1]).sort()).toEqual(['hhi-flicker', 'hhi-fog-drift']);
    for (const m of active) {
      const seconds = toSeconds(m[2], m[3]);
      expect(seconds).toBeGreaterThanOrEqual(2);
      if (m[1] === 'hhi-fog-drift') expect(seconds).toBeGreaterThanOrEqual(40);
    }
  });

  it('reduced-motion block sets animation: none, with the required resets', () => {
    const start = CSS.indexOf('@media (prefers-reduced-motion: reduce)');
    expect(start).toBeGreaterThanOrEqual(0);
    const { body } = blockBody(CSS, start);

    const rules = [...body.matchAll(/([^{}]+)\{([^{}]*)\}/g)].map((m) => ({
      selector: m[1].trim(),
      body: m[2],
    }));
    const flicker = rules.find((r) => r.selector.endsWith('.hhi-flicker'));
    const fog = rules.find((r) => r.selector.endsWith('.hhi-fog-drift'));
    expect(flicker).toBeDefined();
    expect(fog).toBeDefined();

    for (const rule of [flicker!, fog!]) {
      expect(rule.selector.startsWith('.theme-haunted')).toBe(true);
      expect(rule.body).toMatch(/animation\s*:\s*none\b/);
      expect(rule.body).toMatch(/transform\s*:\s*none\b/);
    }
    expect(flicker!.body).toMatch(/opacity\s*:\s*1\b/);
  });
});

describe('No other motion definitions', () => {
  const files = listFiles(SRC).filter(
    (f) =>
      /\.(css|ts|tsx)$/.test(f) &&
      !/\.test\.(ts|tsx)$/.test(f) &&
      path.resolve(f) !== path.join(__dirname, 'haunted-motion.css'),
  );

  it('finds source files to scan', () => {
    expect(files.length).toBeGreaterThan(10);
  });

  it('no @keyframes or animation: declaration outside haunted-motion.css', () => {
    const offenders: string[] = [];
    for (const f of files) {
      const text = stripComments(readFileSync(f, 'utf8'));
      // "animation:" but not animation-duration etc.; allow the globals.css reduced-motion rule.
      if (/@keyframes/.test(text) || /(^|[^-\w])animation\s*:/.test(text)) {
        offenders.push(path.relative(ROOT, f));
      }
    }
    expect(offenders).toEqual([]);
  });

  it('tailwind.config.ts has no animation or keyframes key and no flicker', () => {
    const text = stripComments(readFileSync(path.join(ROOT, 'tailwind.config.ts'), 'utf8'));
    expect(text).not.toMatch(/\banimation\b/);
    expect(text).not.toMatch(/\bkeyframes\b/i);
    expect(text).not.toMatch(/flicker/i);
  });
});

describe('Emergency fixtures carry no motion classes', () => {
  const fixtures: Array<[string, string]> = [
    ['EmergencyBanner', renderToStaticMarkup(createElement(EmergencyBanner, { urgency: 'emergency' }))],
    ['emergency UrgencyBadge', renderToStaticMarkup(createElement(UrgencyBadge, { urgency: 'emergency' }))],
    [
      'Pro note',
      renderToStaticMarkup(
        createElement(ProEmergencyView, {
          job: { likelyIssue: 'Possible gas leak', answers: { location: 'Kitchen', duration: '1 day', recentChanges: '' } },
        }),
      ),
    ],
  ];

  it.each(fixtures)('%s has no hhi- motion class and no animate-, transition or duration- class', (_name, html) => {
    expect(html.length).toBeGreaterThan(0);
    expect(html).not.toMatch(/hhi-flicker|hhi-fog-drift/);
    const classes = [...html.matchAll(/class="([^"]*)"/g)].flatMap((m) => m[1].split(/\s+/));
    for (const c of classes) {
      expect(c).not.toMatch(/(^|:)(animate-|transition|duration-)/);
    }
  });
});
