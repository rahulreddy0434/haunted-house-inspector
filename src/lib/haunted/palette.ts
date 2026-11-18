// Imported only by tests. Resolves token names to hex via tailwind.config.ts.
import resolveConfig from 'tailwindcss/resolveConfig';
import config from '../../../tailwind.config';
import { blend } from './contrast';

export type ColourRef = string | { base: string; overlay: string; alpha: number };

const resolved = resolveConfig(config);

function lookup(path: string): string {
  const colors = resolved.theme.colors as unknown;
  if (path === 'white') return '#ffffff';
  if (path === 'black') return '#000000';
  let node: unknown = colors;
  for (const part of path.split('.')) {
    if (typeof node !== 'object' || node === null) throw new Error(`Unknown colour token: ${path}`);
    node = (node as Record<string, unknown>)[part];
  }
  if (typeof node !== 'string') throw new Error(`Unknown colour token: ${path}`);
  return node;
}

/** Resolve a token path (e.g. 'haunted.text', 'slate.900') or a blend spec to a hex string. */
export function resolveColour(ref: ColourRef): string {
  if (typeof ref === 'string') return lookup(ref);
  return blend(resolveColour(ref.base), resolveColour(ref.overlay), ref.alpha);
}
