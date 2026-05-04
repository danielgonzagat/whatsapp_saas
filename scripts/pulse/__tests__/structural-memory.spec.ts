import { describe, expect, it } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

import {
  fingerprintStrategy,
  loadAttemptHistory,
  markAcceptedRisk,
  markStaleEvidence,
  recordAttempt,
} from '../structural-memory';

type UnitMemoryRuntimeFields = {
  adjudicationStatus?: string | null;
  adjudicationProof?: string | null;
  failedStrategyFingerprints?: string[];
  failedStrategyFingerprintCounts?: Record<string, number>;
  lastFailedStrategyFingerprint?: string | null;
  repeatedFailedStrategyAttempts?: number;
  avoidFailedStrategyFingerprint?: string | null;
};

type AuditRuntimeFields = {
  adjudicationStatus?: string | null;
};

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
    expect((unit as UnitMemoryRuntimeFields | undefined)?.failedStrategyFingerprints).toEqual([
      firstFingerprint,
    ]);
    expect(
      (unit as UnitMemoryRuntimeFields | undefined)?.failedStrategyFingerprintCounts?.[
        firstFingerprint
      ],
    ).toBe(2);
    expect((unit as UnitMemoryRuntimeFields | undefined)?.lastFailedStrategyFingerprint).toBe(
      firstFingerprint,
    );
    expect((unit as UnitMemoryRuntimeFields | undefined)?.repeatedFailedStrategyAttempts).toBe(2);
    expect((unit as UnitMemoryRuntimeFields | undefined)?.avoidFailedStrategyFingerprint).toBe(
      firstFingerprint,
    );
    expect(unit?.recommendedStrategy).toBe(`avoid_strategy_fingerprint:${firstFingerprint}`);

    const history = loadAttemptHistory(rootDir);
    expect(history.map((entry) => entry.strategyFingerprint)).toEqual([
      firstFingerprint,
      firstFingerprint,
    ]);
  });

  it('classifies false positives, accepted risks, and stale evidence without domain allowlists', () => {
    const rootDir = makeTempRoot();

    const falsePositiveMemory = recordAttempt(
      'opaque-false-positive-unit',
      'Inspect reported finding',
      'failed',
      'classification=false_positive proof=checker matched generated proof but runtime path is absent',
      rootDir,
    );
    const falsePositiveUnit = falsePositiveMemory.units.find(
      (entry) => entry.unitId === 'opaque-false-positive-unit',
    ) as ((typeof falsePositiveMemory.units)[number] & UnitMemoryRuntimeFields) | undefined;

    expect(falsePositiveUnit?.status).toBe('resolved');
    expect(falsePositiveUnit?.falsePositive).toBe(true);
    expect(falsePositiveUnit?.adjudicationStatus).toBe('false_positive');
    expect(falsePositiveUnit?.recommendedStrategy).toBe('false_positive:do_not_retry');

    recordAttempt(
      'opaque-accepted-risk-unit',
      'Inspect reported finding',
      'failed',
      'verdict=accepted_risk proof=bounded operational risk documented by current evidence',
      rootDir,
    );
    const acceptedRiskMemory = markAcceptedRisk(
      'opaque-accepted-risk-unit',
      'status=accepted_risk proof=risk remains intentionally tracked until evidence changes',
      rootDir,
    );
    const acceptedRiskUnit = acceptedRiskMemory.units.find(
      (entry) => entry.unitId === 'opaque-accepted-risk-unit',
    ) as ((typeof acceptedRiskMemory.units)[number] & UnitMemoryRuntimeFields) | undefined;

    expect(acceptedRiskUnit?.status).toBe('archived');
    expect(acceptedRiskUnit?.falsePositive).toBe(false);
    expect(acceptedRiskUnit?.adjudicationStatus).toBe('accepted_risk');
    expect(acceptedRiskUnit?.recommendedStrategy).toBe(
      'accepted_risk:do_not_retry_until_evidence_changes',
    );

    recordAttempt(
      'opaque-stale-unit',
      'Refresh evidence',
      'failed',
      'outcome=stale proof=artifact digest does not match current run',
      rootDir,
    );
    const staleMemory = markStaleEvidence(
      'opaque-stale-unit',
      'status=stale proof=current evidence must be refreshed before retrying the fix',
      rootDir,
    );
    const staleUnit = staleMemory.units.find((entry) => entry.unitId === 'opaque-stale-unit') as
      | ((typeof staleMemory.units)[number] & UnitMemoryRuntimeFields)
      | undefined;

    expect(staleUnit?.status).toBe('active');
    expect(staleUnit?.falsePositive).toBe(false);
    expect(staleUnit?.adjudicationStatus).toBe('stale');
    expect(staleUnit?.recommendedStrategy).toBe('observation_only');

    const history = loadAttemptHistory(rootDir) as (ReturnType<typeof loadAttemptHistory>[number] &
      AuditRuntimeFields)[];
    expect(history.map((entry) => entry.adjudicationStatus).filter(Boolean)).toEqual([
      'false_positive',
      'accepted_risk',
      'accepted_risk',
      'stale',
      'stale',
    ]);
  });

  it('does not escalate stale evidence as repeated implementation failure', () => {
    const rootDir = makeTempRoot();

    recordAttempt(
      'stale-loop-unit',
      'Retry current proof refresh',
      'failed',
      'status=stale proof=first evidence was from an older artifact',
      rootDir,
    );
    recordAttempt(
      'stale-loop-unit',
      'Retry current proof refresh',
      'failed',
      'status=stale proof=second evidence was still from an older artifact',
      rootDir,
    );
    const memory = recordAttempt(
      'stale-loop-unit',
      'Retry current proof refresh',
      'failed',
      'status=stale proof=third evidence was still from an older artifact',
      rootDir,
    );

    const unit = memory.units.find((entry) => entry.unitId === 'stale-loop-unit') as
      | ((typeof memory.units)[number] & UnitMemoryRuntimeFields)
      | undefined;

    expect(unit?.status).toBe('active');
    expect(unit?.repeatedFailures).toBe(0);
    expect(unit?.failedStrategies).toEqual([]);
    expect(unit?.repeatedFailedStrategyAttempts).toBe(0);
    expect(unit?.recommendedStrategy).toBe('observation_only');
  });
});
