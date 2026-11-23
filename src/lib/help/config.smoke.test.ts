// @vitest-environment node
// Feature: chat-and-help, task 5.12. Smoke tests for configuration and dependencies.
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const ROOT = process.cwd();
const read = (file: string): string => readFileSync(join(ROOT, file), 'utf8');

type Deps = Record<string, string>;
interface PackageJson {
  dependencies: Deps;
  devDependencies: Deps;
}

describe('amplify.yml and .env.example', () => {
  it('the env line passes CONTACT_FROM_EMAIL and CONTACT_TO_EMAIL through', () => {
    const line = read('amplify.yml')
      .split('\n')
      .find((l) => l.includes('env | grep'));
    expect(line).toBeDefined();
    expect(line).toMatch(/-e CONTACT_FROM_EMAIL(\s|$)/);
    expect(line).toMatch(/-e CONTACT_TO_EMAIL(\s|$)/);
  });

  it('.env.example names both variables with no value', () => {
    const lines = read('.env.example').split(/\r?\n/);
    for (const name of ['CONTACT_FROM_EMAIL', 'CONTACT_TO_EMAIL']) {
      const matches = lines.filter((l) => l.startsWith(`${name}=`));
      expect(matches).toEqual([`${name}=`]);
    }
  });
});

describe('package.json', () => {
  const pkg = JSON.parse(read('package.json')) as PackageJson;

  it('pins @aws-sdk/client-sesv2 to the same version as the other @aws-sdk packages', () => {
    const awsVersions = Object.entries(pkg.dependencies)
      .filter(([name]) => name.startsWith('@aws-sdk/'))
      .map(([, version]) => version);
    expect(pkg.dependencies['@aws-sdk/client-sesv2']).toMatch(/^\d+\.\d+\.\d+$/);
    expect(new Set(awsVersions).size).toBe(1);
  });

  it('adds no dependency other than @aws-sdk/client-sesv2 compared with git HEAD', () => {
    let head: PackageJson;
    try {
      head = JSON.parse(
        execFileSync('git', ['show', 'HEAD:package.json'], { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }),
      ) as PackageJson;
    } catch {
      // No git history available (for example a build without .git): nothing to compare.
      return;
    }
    const names = (p: PackageJson): string[] => [
      ...Object.keys(p.dependencies ?? {}),
      ...Object.keys(p.devDependencies ?? {}),
    ];
    const before = new Set(names(head));
    const added = names(pkg).filter((n) => !before.has(n));
    expect(added.filter((n) => n !== '@aws-sdk/client-sesv2')).toEqual([]);
  });
});
