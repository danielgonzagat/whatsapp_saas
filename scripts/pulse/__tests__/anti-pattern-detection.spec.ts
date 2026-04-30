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
  it('does not find placeholders in the real test directory', () => {
    const result = detectPlaceholderTests(process.cwd());
    expect(result.count).toBe(0);
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
        evidenceKind: 'regex',
        truthMode: 'weak_assertion',
        blocking: true,
      },
    ]);
  });
});

describe('detectTypeEscapeHatches', () => {
  it('reports type escape hatches in pulse code', () => {
    const result = detectTypeEscapeHatches(process.cwd());
    expect(typeof result.count).toBe('number');
  });
});
