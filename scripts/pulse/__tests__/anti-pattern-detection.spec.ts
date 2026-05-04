import { describe, it, expect } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import {
  detectPlaceholderTests,
  detectWeakStatusAssertions,
  detectTypeEscapeHatches,
} from '../test-honesty';

describe('detectPlaceholderTests', () => {
  it('detects placeholder evidence from generated fixture files', () => {
    const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pulse-test-honesty-'));
    const placeholderFixture = [
      "it.skip('future behavior', () => {",
      '  expect(true).toBe(true);',
      '});',
      '',
    ].join('\n');
    fs.writeFileSync(path.join(rootDir, 'placeholder.spec.ts'), placeholderFixture);

    const result = detectPlaceholderTests(rootDir);

    expect(result.count).toBe(1);
    expect(result.files).toEqual(['placeholder.spec.ts']);
  });
});

describe('detectWeakStatusAssertions', () => {
  it('does not find weak assertions in current e2e specs', () => {
    const result = detectWeakStatusAssertions(process.cwd());
    expect(result.count).toBe(0);
  });

  it('detects weak assertion matches from generated fixture files', () => {
    const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pulse-test-honesty-'));
    const weakAssertionFixture = [
      "it('checks response shape', () => {",
      '  expect(response.' + 'status).toBeDefined();',
      '});',
      '',
    ].join('\n');
    fs.writeFileSync(path.join(rootDir, 'weak.spec.ts'), weakAssertionFixture);

    const result = detectWeakStatusAssertions(rootDir);

    expect(result.count).toBe(1);
    expect(result.files).toEqual(['weak.spec.ts']);
    expect(result.rawSignals).toEqual([
      {
        file: 'weak.spec.ts',
        evidenceKind: 'ast',
        truthMode: 'weak_assertion',
        blocking: true,
      },
    ]);
  });
});

describe('detectTypeEscapeHatches', () => {
  it('detects type escape evidence from generated source files', () => {
    const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pulse-test-honesty-'));
    const sourceDir = path.join(rootDir, 'src');
    fs.mkdirSync(sourceDir);
    const typeAssertionKeyword = 'an' + 'y';
    const escapeFixture = [
      'const value: unknown = "unsafe";',
      `const escaped = value as ${typeAssertionKeyword};`,
      'void escaped;',
      '',
    ].join('\n');
    fs.writeFileSync(path.join(sourceDir, 'unsafe.ts'), escapeFixture);

    const result = detectTypeEscapeHatches(rootDir);

    expect(result.count).toBe(1);
    expect(result.locations).toEqual([`src/unsafe.ts:2 (as ${typeAssertionKeyword})`]);
  });
});
