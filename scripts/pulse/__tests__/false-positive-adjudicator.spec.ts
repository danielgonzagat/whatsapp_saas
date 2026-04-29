import { describe, expect, it } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

import { adjudicateFinding, checkExpiredSuppressions } from '../false-positive-adjudicator';
import type { AdjudicatedFinding } from '../types.false-positive-adjudicator';

function makeTempRoot(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'pulse-fp-adjudicator-'));
}

function writeFile(rootDir: string, relativePath: string, content: string): void {
  const filePath = path.join(rootDir, relativePath);
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, content, 'utf8');
}

function makeFinding(overrides: Partial<AdjudicatedFinding> = {}): AdjudicatedFinding {
  return {
    findingId: overrides.findingId ?? 'finding-1',
    title: overrides.title ?? 'Opaque scanner finding',
    source: overrides.source ?? 'pulse',
    status: overrides.status ?? 'open',
    severity: overrides.severity ?? 'high',
    filePath: overrides.filePath ?? 'backend/src/opaque.ts',
    line: overrides.line ?? 1,
    capabilityId: overrides.capabilityId ?? null,
    proof: overrides.proof ?? null,
    expiresOnFileChange: overrides.expiresOnFileChange ?? false,
    fileHashAtSuppression: overrides.fileHashAtSuppression ?? null,
    suppressedAt: overrides.suppressedAt ?? null,
    lastChecked: overrides.lastChecked ?? '2026-04-29T00:00:00.000Z',
  };
}

describe('false positive adjudicator suppression expiry', () => {
  it('records suppression hashes from the repo root and expires after file content changes', () => {
    const rootDir = makeTempRoot();
    writeFile(rootDir, 'backend/src/opaque.ts', 'export const value = 1;\n');

    const suppressed = adjudicateFinding(
      makeFinding(),
      'false_positive',
      'Scanner matched generated structure, not a runtime issue.',
      rootDir,
    );

    expect(suppressed.status).toBe('false_positive');
    expect(suppressed.expiresOnFileChange).toBe(true);
    expect(suppressed.fileHashAtSuppression).toEqual(expect.any(String));

    const unchanged = checkExpiredSuppressions([suppressed], rootDir)[0];
    expect(unchanged.status).toBe('false_positive');
    expect(unchanged.fileHashAtSuppression).toBe(suppressed.fileHashAtSuppression);

    writeFile(rootDir, 'backend/src/opaque.ts', 'export const value = 2;\n');
    const expired = checkExpiredSuppressions([suppressed], rootDir)[0];

    expect(expired.status).toBe('open');
    expect(expired.expiresOnFileChange).toBe(false);
    expect(expired.fileHashAtSuppression).toBeNull();
    expect(expired.suppressedAt).toBeNull();
  });

  it('expires accepted risk when the suppressed file disappears', () => {
    const rootDir = makeTempRoot();
    writeFile(rootDir, 'backend/src/risk.ts', 'export const risk = true;\n');

    const suppressed = adjudicateFinding(
      makeFinding({ filePath: 'backend/src/risk.ts' }),
      'accepted_risk',
      'Risk accepted until the exact file changes.',
      rootDir,
    );

    fs.unlinkSync(path.join(rootDir, 'backend/src/risk.ts'));
    const expired = checkExpiredSuppressions([suppressed], rootDir)[0];

    expect(expired.status).toBe('stale');
  });
});
