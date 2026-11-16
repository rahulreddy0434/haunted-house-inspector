import { expect } from 'vitest';

/** Returns the class list of an element. */
export function classesOf(el: Element): string[] {
  return (el.getAttribute('class') ?? '').split(/\s+/).filter(Boolean);
}

export function expectFocusVisible(el: Element): void {
  expect(classesOf(el).some((c) => c.startsWith('focus-visible:'))).toBe(true);
}

export function expectNoMotion(el: Element): void {
  const bad = classesOf(el).filter((c) => /(^|:)(animate-|transition|duration-)/.test(c));
  expect(bad).toEqual([]);
}

/** Light check: each plain bg/border/text colour class has a `haunted:` class of the same property. */
export function expectHauntedPartners(el: Element): void {
  const classes = classesOf(el);
  const colour = /^(bg|border|text)-(slate|gray|blue|red|purple|brand|haunted)/;
  const props = new Set(
    classes.filter((c) => !c.includes(':') && colour.test(c)).map((c) => c.split('-')[0]),
  );
  for (const prop of props) {
    expect(classes.some((c) => c.startsWith(`haunted:${prop}-`))).toBe(true);
  }
}
