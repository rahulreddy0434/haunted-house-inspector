import { readdirSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

// Chips are native radio and checkbox inputs. The browser provides the
// keyboard behaviour, so no custom key handlers or ARIA roles are allowed.
// Requirements 6.2, 6.3.

const dir = path.join(process.cwd(), 'src', 'components', 'intake')

const files = readdirSync(dir).filter(
  (name) => name.endsWith('.tsx') && !/\.test\.tsx$/.test(name),
)

const forbidden: ReadonlyArray<{ label: string; pattern: RegExp }> = [
  { label: 'onKeyDown', pattern: /onKeyDown/ },
  { label: 'onKeyUp', pattern: /onKeyUp/ },
  { label: 'onKeyPress', pattern: /onKeyPress/ },
  { label: 'role="radio"', pattern: /role\s*=\s*(?:"radio"|'radio'|\{\s*["']radio["']\s*\})/ },
  {
    label: 'role="checkbox"',
    pattern: /role\s*=\s*(?:"checkbox"|'checkbox'|\{\s*["']checkbox["']\s*\})/,
  },
]

describe('intake component source guard', () => {
  it('finds the intake component files', () => {
    expect(files.length).toBeGreaterThan(0)
  })

  for (const file of files) {
    describe(file, () => {
      const source = readFileSync(path.join(dir, file), 'utf8')
      for (const { label, pattern } of forbidden) {
        it(`does not use ${label}`, () => {
          expect(source).not.toMatch(pattern)
        })
      }
    })
  }
})
