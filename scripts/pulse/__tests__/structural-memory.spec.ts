import { describe, expect, it } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

import { fingerprintStrategy, loadAttemptHistory, recordAttempt } from '../structural-memory';

function makeTempRoot(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'pulse-structural-memory-'));
}

describe('structural memory strategy fingerprints', () => {
  it('persists repeated strategy fingerprints so the same failed tactic is not retried blindly', () => {
    const rootDir = makeTempRoot();
    const firstFingerprint = fingerprintStrategy('Patch parser timeout check');
    const secondFingerprint = fingerprintStrategy('patch-parser-timeout-check');

    expect(secondFingerprint).toBe(firstFingerprint);

    recordAttempt(
      'parser-timeout-unit',
      'Patch parser timeout check',
      'failed',
      'validation still timed out',
      rootDir,
    );
    const memory = recordAttempt(
      'parser-timeout-unit',
      'patch-parser-timeout-check',
      'failed',
      'same timeout after equivalent patch',
      rootDir,
    );

    const unit = memory.units.find((entry) => entry.unitId === 'parser-timeout-unit');

    expect(unit?.strategyFingerprints).toEqual([firstFingerprint]);
    expect(unit?.strategyFingerprintCounts[firstFingerprint]).toBe(2);
    expect(unit?.lastStrategyFingerprint).toBe(firstFingerprint);
    expect(unit?.repeatedStrategyAttempts).toBe(2);
    expect(unit?.avoidStrategyFingerprint).toBe(firstFingerprint);
    expect(unit?.recommendedStrategy).toBe(`avoid_strategy_fingerprint:${firstFingerprint}`);

    const history = loadAttemptHistory(rootDir);
    expect(history.map((entry) => entry.strategyFingerprint)).toEqual([
      firstFingerprint,
      firstFingerprint,
    ]);
  });
});
