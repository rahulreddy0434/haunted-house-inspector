// @vitest-environment node
/**
 * Source-scan test (pro-dashboard-and-booking Requirements 15.1, 15.5, 15.10, 14.9, 16.13).
 *
 * Parses the component files added or changed by the feature with the TypeScript compiler API
 * and fails on hard-coded colours, `dangerouslySetInnerHTML`, interactive elements without an
 * accessible name or a `focus-visible:` ring, and animation classes.
 */
import { describe, expect, it } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import ts from 'typescript';

// ---------------------------------------------------------------------------
// Checker
// ---------------------------------------------------------------------------

export type RuleId =
  | 'hex-colour'
  | 'colour-function'
  | 'arbitrary-colour-class'
  | 'colour-name'
  | 'style-colour'
  | 'dangerously-set-inner-html'
  | 'accessible-name'
  | 'focus-visible'
  | 'motion-class';

export interface Violation {
  file: string;
  line: number;
  rule: RuleId;
  message: string;
}

/** Local import name -> string fragments of the shared recipe it refers to. */
type ImportedFragments = ReadonlyMap<string, readonly string[]>;

const CSS_COLOUR_NAMES: ReadonlySet<string> = new Set(
  (
    'aliceblue antiquewhite aqua aquamarine azure beige bisque black blanchedalmond blue blueviolet ' +
    'brown burlywood cadetblue chartreuse chocolate coral cornflowerblue cornsilk crimson cyan ' +
    'darkblue darkcyan darkgoldenrod darkgray darkgreen darkgrey darkkhaki darkmagenta ' +
    'darkolivegreen darkorange darkorchid darkred darksalmon darkseagreen darkslateblue ' +
    'darkslategray darkslategrey darkturquoise darkviolet deeppink deepskyblue dimgray dimgrey ' +
    'dodgerblue firebrick floralwhite forestgreen fuchsia gainsboro ghostwhite gold goldenrod gray ' +
    'green greenyellow grey honeydew hotpink indianred indigo ivory khaki lavender lavenderblush ' +
    'lawngreen lemonchiffon lightblue lightcoral lightcyan lightgoldenrodyellow lightgray ' +
    'lightgreen lightgrey lightpink lightsalmon lightseagreen lightskyblue lightslategray ' +
    'lightslategrey lightsteelblue lightyellow lime limegreen linen magenta maroon ' +
    'mediumaquamarine mediumblue mediumorchid mediumpurple mediumseagreen mediumslateblue ' +
    'mediumspringgreen mediumturquoise mediumvioletred midnightblue mintcream mistyrose moccasin ' +
    'navajowhite navy oldlace olive olivedrab orange orangered orchid palegoldenrod palegreen ' +
    'paleturquoise palevioletred papayawhip peachpuff peru pink plum powderblue purple ' +
    'rebeccapurple red rosybrown royalblue saddlebrown salmon sandybrown seagreen seashell sienna ' +
    'silver skyblue slateblue slategray slategrey snow springgreen steelblue tan teal thistle ' +
    'tomato turquoise violet wheat white whitesmoke yellow yellowgreen'
  ).split(' '),
);

const STYLE_COLOUR_PROPERTIES: ReadonlySet<string> = new Set([
  'color',
  'background',
  'backgroundColor',
  'borderColor',
  'fill',
  'stroke',
  'outlineColor',
]);

const HEX_COLOUR = /(?<![\w&])#(?:[0-9a-fA-F]{8}|[0-9a-fA-F]{6}|[0-9a-fA-F]{3,4})(?![\w])/;
const COLOUR_FUNCTION = /\b(?:rgba?|hsla?)\(/i;
const COLOUR_UTILITIES =
  '(?:bg|text|border|border-[trblxyse]|ring|ring-offset|outline|fill|stroke|from|via|to|accent|caret|decoration|divide|shadow|placeholder)';
const ARBITRARY_COLOUR_CLASS = new RegExp(
  `(?:^|:)-?${COLOUR_UTILITIES}-\\[(?:#|(?:rgba?|hsla?|hwb|lab|lch|oklab|oklch|color)\\(|color:|(?:${[...CSS_COLOUR_NAMES].join('|')})\\])`,
  'i',
);
const MOTION_CLASS = /(?:^|:)(?:animate-|transition|duration-)/;

const STYLES_MODULES: ReadonlySet<string> = new Set(['@/components/ui/styles', './styles']);

interface FileContext {
  consts: Map<string, ts.Expression[]>;
  imported: ImportedFragments;
}

function createSource(fileName: string, text: string): ts.SourceFile {
  const kind = fileName.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS;
  return ts.createSourceFile(fileName, text, ts.ScriptTarget.Latest, true, kind);
}

function collectConsts(sf: ts.SourceFile): Map<string, ts.Expression[]> {
  const consts = new Map<string, ts.Expression[]>();
  const visit = (node: ts.Node): void => {
    if (
      ts.isVariableDeclaration(node) &&
      ts.isIdentifier(node.name) &&
      node.initializer &&
      (ts.getCombinedNodeFlags(node) & ts.NodeFlags.Const) !== 0
    ) {
      const list = consts.get(node.name.text) ?? [];
      list.push(node.initializer);
      consts.set(node.name.text, list);
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);
  return consts;
}

/** Every string fragment an expression can contribute to a class string. */
function fragments(expr: ts.Node, ctx: FileContext, seen: Set<string>): string[] {
  if (ts.isStringLiteral(expr) || ts.isNoSubstitutionTemplateLiteral(expr)) return [expr.text];
  if (ts.isTemplateExpression(expr)) {
    const out = [expr.head.text];
    for (const span of expr.templateSpans) {
      out.push(...fragments(span.expression, ctx, seen), span.literal.text);
    }
    return out;
  }
  if (ts.isIdentifier(expr)) {
    const imp = ctx.imported.get(expr.text);
    if (imp) return [...imp];
    if (seen.has(expr.text)) return [];
    const inits = ctx.consts.get(expr.text);
    if (!inits) return [];
    const next = new Set(seen).add(expr.text);
    return inits.flatMap((init) => fragments(init, ctx, next));
  }
  if (ts.isConditionalExpression(expr)) {
    return [...fragments(expr.whenTrue, ctx, seen), ...fragments(expr.whenFalse, ctx, seen)];
  }
  if (ts.isBinaryExpression(expr)) {
    return [...fragments(expr.left, ctx, seen), ...fragments(expr.right, ctx, seen)];
  }
  if (ts.isArrayLiteralExpression(expr)) {
    return expr.elements.flatMap((e) => fragments(e, ctx, seen));
  }
  if (ts.isObjectLiteralExpression(expr)) {
    return expr.properties.flatMap((p) =>
      ts.isPropertyAssignment(p) ? fragments(p.initializer, ctx, seen) : [],
    );
  }
  if (ts.isCallExpression(expr)) {
    const callee = ts.isPropertyAccessExpression(expr.expression)
      ? fragments(expr.expression.expression, ctx, seen)
      : [];
    return [...callee, ...expr.arguments.flatMap((a) => fragments(a, ctx, seen))];
  }
  if (ts.isElementAccessExpression(expr) || ts.isPropertyAccessExpression(expr)) {
    return fragments(expr.expression, ctx, seen);
  }
  if (
    ts.isParenthesizedExpression(expr) ||
    ts.isAsExpression(expr) ||
    ts.isNonNullExpression(expr) ||
    ts.isSpreadElement(expr) ||
    ts.isSatisfiesExpression(expr)
  ) {
    return fragments(expr.expression, ctx, seen);
  }
  return [];
}

/** Resolve the top-level string constants of the shared styles module. */
export function loadSharedFragments(text: string): Map<string, string[]> {
  const sf = createSource('styles.ts', text);
  const ctx: FileContext = { consts: collectConsts(sf), imported: new Map() };
  const out = new Map<string, string[]>();
  for (const name of ctx.consts.keys()) {
    out.set(name, fragments(ts.factory.createIdentifier(name), ctx, new Set()));
  }
  return out;
}

function collectImports(sf: ts.SourceFile, shared: ReadonlyMap<string, string[]>): ImportedFragments {
  const imported = new Map<string, readonly string[]>();
  for (const stmt of sf.statements) {
    if (
      ts.isImportDeclaration(stmt) &&
      ts.isStringLiteral(stmt.moduleSpecifier) &&
      STYLES_MODULES.has(stmt.moduleSpecifier.text) &&
      stmt.importClause?.namedBindings &&
      ts.isNamedImports(stmt.importClause.namedBindings)
    ) {
      for (const el of stmt.importClause.namedBindings.elements) {
        const exported = (el.propertyName ?? el.name).text;
        const frags = shared.get(exported);
        if (frags) imported.set(el.name.text, frags);
      }
    }
  }
  return imported;
}

function tagName(el: ts.JsxOpeningLikeElement): string {
  return el.tagName.getText();
}

function attrOf(el: ts.JsxOpeningLikeElement, name: string): ts.JsxAttribute | undefined {
  for (const a of el.attributes.properties) {
    if (ts.isJsxAttribute(a) && a.name.getText() === name) return a;
  }
  return undefined;
}

function hasSpread(el: ts.JsxOpeningLikeElement): boolean {
  return el.attributes.properties.some((a) => ts.isJsxSpreadAttribute(a));
}

function staticAttrString(attr: ts.JsxAttribute | undefined): string | undefined {
  const init = attr?.initializer;
  if (!init) return undefined;
  if (ts.isStringLiteral(init)) return init.text;
  if (ts.isJsxExpression(init) && init.expression) {
    const e = init.expression;
    if (ts.isStringLiteral(e) || ts.isNoSubstitutionTemplateLiteral(e)) return e.text;
  }
  return undefined;
}

/** Key used to match `id` with `htmlFor`: literal text or the source text of the expression. */
function attrKey(attr: ts.JsxAttribute | undefined): string | undefined {
  const init = attr?.initializer;
  if (!init) return undefined;
  if (ts.isStringLiteral(init)) return init.text;
  if (ts.isJsxExpression(init) && init.expression) {
    const e = init.expression;
    if (ts.isStringLiteral(e) || ts.isNoSubstitutionTemplateLiteral(e)) return e.text;
    return e.getText().replace(/\s+/g, '');
  }
  return undefined;
}

function hasContent(children: ts.NodeArray<ts.JsxChild>): boolean {
  return children.some((child) => {
    if (ts.isJsxText(child)) return !child.containsOnlyTriviaWhiteSpaces && child.text.trim() !== '';
    if (ts.isJsxExpression(child)) return child.expression !== undefined;
    if (ts.isJsxSelfClosingElement(child)) {
      // A component, or an <img> with alt text, names its parent.
      return /^[A-Z]/.test(tagName(child)) || (tagName(child) === 'img' && attrOf(child, 'alt') !== undefined);
    }
    if (ts.isJsxElement(child)) {
      return /^[A-Z]/.test(tagName(child.openingElement)) || hasContent(child.children);
    }
    if (ts.isJsxFragment(child)) return hasContent(child.children);
    return false;
  });
}

function hasWrappingLabel(node: ts.Node): boolean {
  for (let p: ts.Node | undefined = node.parent; p; p = p.parent) {
    if (ts.isJsxElement(p) && tagName(p.openingElement) === 'label') return true;
  }
  return false;
}

const NATIVE_INTERACTIVE: ReadonlySet<string> = new Set(['button', 'a', 'input', 'textarea']);

export function scanSource(
  fileName: string,
  text: string,
  shared: ReadonlyMap<string, string[]> = new Map(),
): Violation[] {
  const sf = createSource(fileName, text);
  const ctx: FileContext = { consts: collectConsts(sf), imported: collectImports(sf, shared) };
  const violations: Violation[] = [];

  const add = (node: ts.Node, rule: RuleId, message: string): void => {
    const line = sf.getLineAndCharacterOfPosition(node.getStart(sf)).line + 1;
    violations.push({ file: fileName, line, rule, message });
  };

  // First pass: labels' htmlFor keys.
  const labelTargets = new Set<string>();
  const findLabels = (node: ts.Node): void => {
    if (ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) {
      if (tagName(node) === 'label') {
        const key = attrKey(attrOf(node, 'htmlFor'));
        if (key !== undefined) labelTargets.add(key);
      }
    }
    ts.forEachChild(node, findLabels);
  };
  findLabels(sf);

  const checkText = (node: ts.Node, value: string, isLiteral: boolean): void => {
    if (HEX_COLOUR.test(value)) add(node, 'hex-colour', `hex colour in ${JSON.stringify(value)}`);
    if (COLOUR_FUNCTION.test(value)) {
      add(node, 'colour-function', `rgb/rgba/hsl/hsla colour in ${JSON.stringify(value)}`);
    }
    if (!isLiteral) return;
    if (CSS_COLOUR_NAMES.has(value.trim().toLowerCase())) {
      add(node, 'colour-name', `CSS colour name ${JSON.stringify(value)} as a string literal`);
    }
    if (value.includes('dangerouslySetInnerHTML')) {
      add(node, 'dangerously-set-inner-html', 'dangerouslySetInnerHTML in a string');
    }
    for (const token of value.split(/\s+/)) {
      if (!token) continue;
      if (ARBITRARY_COLOUR_CLASS.test(token)) {
        add(node, 'arbitrary-colour-class', `arbitrary colour class "${token}"`);
      }
      if (MOTION_CLASS.test(token)) {
        add(node, 'motion-class', `animation or transition class "${token}"`);
      }
    }
  };

  const checkInteractive = (el: ts.JsxOpeningLikeElement): void => {
    const tag = tagName(el);
    if (!NATIVE_INTERACTIVE.has(tag)) return;
    const type = staticAttrString(attrOf(el, 'type'));
    if (tag === 'input' && type === 'hidden') return;

    // Accessible name.
    let named =
      attrOf(el, 'aria-label') !== undefined ||
      attrOf(el, 'aria-labelledby') !== undefined ||
      hasSpread(el);
    if (!named && (tag === 'button' || tag === 'a')) {
      const parent = el.parent;
      named = ts.isJsxElement(parent) && hasContent(parent.children);
    }
    if (!named && (tag === 'input' || tag === 'textarea')) {
      const id = attrKey(attrOf(el, 'id'));
      named = (id !== undefined && labelTargets.has(id)) || hasWrappingLabel(el);
      if (!named && tag === 'input' && (type === 'submit' || type === 'button')) {
        named = attrOf(el, 'value') !== undefined;
      }
    }
    if (!named) add(el, 'accessible-name', `<${tag}> has no accessible name`);

    // Focus ring.
    const cls = attrOf(el, 'className');
    let classText = '';
    if (cls?.initializer) {
      const init = cls.initializer;
      const expr = ts.isJsxExpression(init) ? init.expression : init;
      if (expr) classText = fragments(expr, ctx, new Set()).join(' ');
    }
    if (!classText.includes('focus-visible:')) {
      add(el, 'focus-visible', `<${tag}> className has no focus-visible: class`);
    }
  };

  const visit = (node: ts.Node): void => {
    if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) {
      checkText(node, node.text, true);
    } else if (ts.isTemplateHead(node) || ts.isTemplateMiddle(node) || ts.isTemplateTail(node)) {
      checkText(node, node.text, true);
    } else if (ts.isJsxText(node)) {
      checkText(node, node.text, false);
    } else if (ts.isIdentifier(node) && node.text === 'dangerouslySetInnerHTML') {
      add(node, 'dangerously-set-inner-html', 'dangerouslySetInnerHTML is not allowed');
    }

    if (ts.isJsxAttribute(node) && node.name.getText() === 'style') {
      const init = node.initializer;
      if (init && ts.isJsxExpression(init) && init.expression) {
        const obj = init.expression;
        if (ts.isObjectLiteralExpression(obj)) {
          for (const prop of obj.properties) {
            if (!ts.isPropertyAssignment(prop) && !ts.isShorthandPropertyAssignment(prop)) continue;
            const n = prop.name;
            const key = ts.isIdentifier(n) || ts.isStringLiteral(n) ? n.text : undefined;
            if (key !== undefined && STYLE_COLOUR_PROPERTIES.has(key)) {
              add(prop, 'style-colour', `style attribute sets "${key}"`);
            }
          }
        }
      }
    }

    if (ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) checkInteractive(node);

    ts.forEachChild(node, visit);
  };
  visit(sf);

  return violations;
}

function format(v: Violation): string {
  return `${v.file}:${v.line} [${v.rule}] ${v.message}`;
}

// ---------------------------------------------------------------------------
// File selection
// ---------------------------------------------------------------------------

const ROOT = path.resolve(__dirname, '..', '..');

function isScannable(name: string): boolean {
  if (!/\.tsx?$/.test(name)) return false;
  if (/\.test\.tsx?$/.test(name)) return false;
  if (name === 'testHelpers.ts') return false;
  return true;
}

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walk(full));
    else if (entry.isFile() && isScannable(entry.name)) out.push(full);
  }
  return out;
}

const EXTRA_FILES = [
  'src/components/results/StatusPanel.tsx',
  'src/components/results/ReplyBox.tsx',
  'src/components/results/SlotPicker.tsx',
  'src/components/results/ResultsView.tsx',
  'src/components/results/EmergencyBanner.tsx',
  'src/components/upload/DataRetentionNotice.tsx',
];

function scannedFiles(): string[] {
  const dirs = ['src/components/pro', 'src/components/ui', 'src/app/pro'].map((d) =>
    path.join(ROOT, d),
  );
  const files = [...dirs.flatMap(walk), ...EXTRA_FILES.map((f) => path.join(ROOT, f))];
  return [...new Set(files)].sort();
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('source scan of Pro dashboard and booking components', () => {
  const sharedStyles = loadSharedFragments(
    fs.readFileSync(path.join(ROOT, 'src/components/ui/styles.ts'), 'utf8'),
  );

  it('covers the expected files', () => {
    const rel = scannedFiles().map((f) => path.relative(ROOT, f).split(path.sep).join('/'));
    expect(rel.length).toBeGreaterThan(20);
    for (const f of EXTRA_FILES) expect(rel).toContain(f);
    expect(rel).toContain('src/components/pro/JobDetail.tsx');
    expect(rel).toContain('src/components/ui/styles.ts');
    expect(rel).toContain('src/app/pro/page.tsx');
    expect(rel.some((f) => /\.test\.tsx?$/.test(f) || f.endsWith('testHelpers.ts'))).toBe(false);
  });

  it('finds no violations in the real files', () => {
    const violations: Violation[] = [];
    for (const file of scannedFiles()) {
      const rel = path.relative(ROOT, file).split(path.sep).join('/');
      violations.push(...scanSource(rel, fs.readFileSync(file, 'utf8'), sharedStyles));
    }
    expect(violations.map(format)).toEqual([]);
  });
});

describe('source scan self-tests (each rule fires on bad input)', () => {
  const rules = (src: string, name = 'x.tsx'): RuleId[] =>
    scanSource(name, src, new Map([['RING', ['focus-visible:ring-2']]])).map((v) => v.rule);
  const FOCUS = 'focus-visible:ring-2';
  const wrap = (body: string): string =>
    `export function X() { return (${body}); }`;

  it('flags hex colours', () => {
    expect(rules(`export const a = '#fff';`)).toContain('hex-colour');
    expect(rules(`export const a = '#aabbccdd';`)).toContain('hex-colour');
    expect(rules(wrap(`<p>#abcdef</p>`))).toContain('hex-colour');
  });

  it('flags rgb, rgba, hsl and hsla', () => {
    for (const fn of ['rgb(0,0,0)', 'rgba(0,0,0,1)', 'hsl(0,0%,0%)', 'hsla(0,0%,0%,1)']) {
      expect(rules(`export const a = \`x \${1} ${fn}\`;`)).toContain('colour-function');
    }
  });

  it('flags arbitrary colour classes', () => {
    expect(rules(`export const a = 'bg-[#fff]';`)).toContain('arbitrary-colour-class');
    expect(rules(`export const a = 'haunted:text-[rgb(0,0,0)]';`)).toContain('arbitrary-colour-class');
    expect(rules(`export const a = 'border-[color:var(--x)]';`)).toContain('arbitrary-colour-class');
    expect(rules(`export const a = 'p-[13px] text-[14px]';`)).not.toContain('arbitrary-colour-class');
  });

  it('flags CSS colour names as whole literals but not Tailwind classes', () => {
    expect(rules(`export const a = 'red';`)).toContain('colour-name');
    expect(rules(`export const a = 'White';`)).toContain('colour-name');
    expect(rules(wrap(`<div style={{ outline: 'black' }} />`))).toContain('colour-name');
    expect(rules(`export const a = 'text-white bg-red-800';`)).toEqual([]);
    expect(rules(`export const a = 'Red alert';`)).toEqual([]);
  });

  it('flags style attributes that set colour properties', () => {
    for (const prop of ['color', 'background', 'backgroundColor', 'borderColor', 'fill', 'stroke', 'outlineColor']) {
      expect(rules(wrap(`<div style={{ ${prop}: v }} />`))).toContain('style-colour');
    }
    expect(rules(wrap(`<div style={{ width: 3 }} />`))).not.toContain('style-colour');
  });

  it('flags dangerouslySetInnerHTML', () => {
    expect(rules(wrap(`<div dangerouslySetInnerHTML={{ __html: h }} />`))).toContain(
      'dangerously-set-inner-html',
    );
  });

  it('flags animation and transition classes', () => {
    for (const cls of ['animate-spin', 'transition', 'transition-colors', 'duration-200', 'haunted:animate-pulse', 'motion-safe:transition-all']) {
      expect(rules(`export const a = 'p-2 ${cls}';`)).toContain('motion-class');
    }
  });

  it('flags a native element with no accessible name', () => {
    expect(rules(wrap(`<button className="${FOCUS}" />`))).toContain('accessible-name');
    expect(rules(wrap(`<button className="${FOCUS}">  </button>`))).toContain('accessible-name');
    expect(rules(wrap(`<a href="/x" className="${FOCUS}"></a>`))).toContain('accessible-name');
    expect(rules(wrap(`<input className="${FOCUS}" />`))).toContain('accessible-name');
    expect(rules(wrap(`<textarea id="t" className="${FOCUS}" />`))).toContain('accessible-name');
  });

  it('accepts accessible names from text, expressions, aria, labels, wrappers and spreads', () => {
    expect(rules(wrap(`<button className="${FOCUS}">Go</button>`))).toEqual([]);
    expect(rules(wrap(`<button className="${FOCUS}">{label}</button>`))).toEqual([]);
    expect(rules(wrap(`<a href="/x" className="${FOCUS}" aria-label="Home" />`))).toEqual([]);
    expect(rules(wrap(`<input className="${FOCUS}" aria-labelledby="h" />`))).toEqual([]);
    expect(rules(wrap(`<button {...rest} className="${FOCUS}" />`))).toEqual([]);
    expect(
      rules(wrap(`<div><label htmlFor="n">Name</label><input id="n" className="${FOCUS}" /></div>`)),
    ).toEqual([]);
    expect(
      rules(wrap(`<div><label htmlFor={fid}>Name</label><input id={fid} className="${FOCUS}" /></div>`)),
    ).toEqual([]);
    expect(
      rules(wrap(`<label><input type="radio" className="${FOCUS}" /> Yes</label>`)),
    ).toEqual([]);
    expect(rules(wrap(`<input type="hidden" name="a" />`))).toEqual([]);
    expect(rules(wrap(`<a href="/x" className="${FOCUS}"><img src={u} alt="Photo" /></a>`))).toEqual([]);
  });

  it('flags an input whose id has no matching label', () => {
    expect(
      rules(wrap(`<div><label htmlFor="a">A</label><input id="b" className="${FOCUS}" /></div>`)),
    ).toContain('accessible-name');
  });

  it('flags a missing focus-visible class and resolves same-file and shared constants', () => {
    expect(rules(wrap(`<button>Go</button>`))).toContain('focus-visible');
    expect(rules(wrap(`<button className="p-2">Go</button>`))).toContain('focus-visible');
    expect(
      rules(`const C = 'p-2'; export function X() { return <button className={C}>Go</button>; }`),
    ).toContain('focus-visible');
    expect(
      rules(
        `const C = 'p-2 ${FOCUS}'; export function X() { return <button className={\`\${C} mt-1\`}>Go</button>; }`,
      ),
    ).toEqual([]);
    expect(
      rules(
        `import { RING } from '@/components/ui/styles';\nexport function X() { return <button className={['a', RING].join(' ')}>Go</button>; }`,
      ),
    ).toEqual([]);
  });

  it('reports file, line and rule', () => {
    const [v] = scanSource('a/b.tsx', `export const ok = 1;\nexport const a = '#fff';\n`);
    expect(v).toMatchObject({ file: 'a/b.tsx', line: 2, rule: 'hex-colour' });
  });
});
