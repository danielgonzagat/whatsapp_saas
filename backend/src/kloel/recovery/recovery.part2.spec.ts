import type { SpineEventRef } from '../mind/mind.types';
import { detectErrors } from './self-error-detector';
import { buildAcknowledgment } from './error-acknowledgment.builder';
import { buildExplanation } from './error-explanation.builder';
import { ErrorNonRepeatGuard } from './error-non-repeat.guard';
import { proposeRecoveryTactic } from './error-damage-recovery.tactics';
import { buildErrorNarrative } from './error-narrative.builder';
import { TrustAfterErrorTracker } from './trust-after-error.tracker';
import { buildRecoveryProofPackage } from './recovery-proof-package.builder';
import type {
  DetectedError,
  ErrorDetectorInput,
  RecoveryTactic,
} from './recovery.types';
import type { GuardStatus } from './recovery-proof-package.builder';

const NOW = Date.parse('2026-05-13T22:00:00.000Z');
const WKS = 'wks_recovery_test';

function ev(over?: Partial<SpineEventRef>): SpineEventRef {
  const id =
    over?.eventId ?? `e_${Math.random().toString(36).slice(2, 10)}`;
  return {
    eventId: id,
    eventName: over?.eventName ?? 'commerce.lead.replied',
    workspaceId: over?.workspaceId ?? WKS,
    occurredAt: over?.occurredAt ?? '2026-05-13T20:00:00.000Z',
    truthMode: over?.truthMode ?? ('observed' as const),
    ...(over?.entityRef !== undefined ? { entityRef: over.entityRef } : {}),
    ...(over?.valence !== undefined ? { valence: over.valence } : {}),
    ...(over?.payload !== undefined ? { payload: over.payload } : {}),
  };
}

function input(
  over?: Partial<ErrorDetectorInput>,
): ErrorDetectorInput {
  return {
    events: over?.events ?? ([] as readonly SpineEventRef[]),
    workspaceId: over?.workspaceId ?? WKS,
    nowMs: over?.nowMs ?? NOW,
    windowDays: over?.windowDays ?? 30,
  };
}

// =========================================================================
// UTP-RECOVERY-001 — Self Error Detector
// =========================================================================
describe('UTP-RECOVERY-007 — TrustAfterErrorTracker', () => {
  let tracker: TrustAfterErrorTracker;

  beforeEach(() => {
    tracker = new TrustAfterErrorTracker();
  });

  it('nonRepetitionRate is 1 when no errors recorded', () => {
    expect(tracker.nonRepetitionRate(WKS)).toBe(1);
  });

  it('autoDetectionRate is 1 when no errors recorded', () => {
    expect(tracker.autoDetectionRate(WKS)).toBe(1);
  });

  it('tracks errors and reports snapshot with R18 score', () => {
    const de1 = dummyError('handoff', 'low');
    const de2 = dummyError('handoff', 'low');

    tracker.recordError(de1);
    tracker.recordError(de2);

    const snap = tracker.snapshot(WKS, NOW);
    expect(snap.workspaceId).toBe(WKS);
    expect(snap.totalErrors).toBe(2);
    expect(snap.r18Score).toBeGreaterThanOrEqual(0);
    expect(snap.r18Score).toBeLessThanOrEqual(1);
    expect(snap.trustTrend).toBeDefined();
  });

  it('markRecovered updates recovery status', () => {
    const de = dummyError('handoff', 'low');
    tracker.recordError(de);
    expect(tracker.markRecovered(WKS, de.errorId)).toBe(true);
    expect(tracker.markRecovered(WKS, 'nonexistent')).toBe(false);
  });

  it('nonRepetitionRate drops with repeated errors', () => {
    const de = dummyError('handoff', 'low');
    tracker.recordError(de);
    tracker.recordError(dummyError('handoff', 'low'));
    tracker.recordError(dummyError('decline', 'medium'));
    const rate = tracker.nonRepetitionRate(WKS);
    expect(rate).toBeLessThan(1);
  });

  it('clear resets all tracking state', () => {
    tracker.recordError(dummyError('handoff', 'low'));
    tracker.recordError(dummyError('decline', 'medium'));
    tracker.clear();
    expect(tracker.workspaceIds()).toHaveLength(0);
  });

  it('trustTrend is up when R18 score >= 0.8', () => {
    const de = dummyError('handoff', 'low');
    tracker.recordError(de);
    const snap = tracker.snapshot(WKS, NOW);
    expect(snap.trustTrend).toBe('up');
  });
});

describe('UTP-RECOVERY-008 — buildRecoveryProofPackage', () => {
  it('produces a proof object with all required top-level fields', () => {
    const de = dummyError('handoff', 'medium');
    const proof = buildRecoveryProofPackage(de);

    expect(proof.proofId).toMatch(/^prf_/);
    expect(proof.errorId).toBe(de.errorId);
    expect(proof.workspaceId).toBe(WKS);
    expect(proof.generatedAt).toBeTruthy();
    expect(proof.acknowledgment).toBeDefined();
    expect(proof.explanation).toBeDefined();
    expect(proof.tactic).toBeDefined();
    expect(proof.nonRepeatCommitment).toBeDefined();
    expect(proof.whatKloelKnows).toBeTruthy();
    expect(proof.whatKloelDoesNotKnow).toBeTruthy();
    expect(proof.safeNextStep).toBeTruthy();
    expect(proof.repairStance).toBeDefined();
    expect(proof.riskClass).toBeDefined();
    expect(proof.delegationMode).toBeDefined();
    expect(Array.isArray(proof.rollback)).toBe(true);
  });

  it('autonomyRaised, messageSent, and concessionOffered are always false', () => {
    const categories: DetectedError['category'][] = [
      'handoff', 'decline', 'missed_opportunity', 'unknown',
    ];

    for (const category of categories) {
      const de = dummyError(category, 'high');
      const proof = buildRecoveryProofPackage(de);
      expect(proof.autonomyRaised).toBe(false);
      expect(proof.messageSent).toBe(false);
      expect(proof.concessionOffered).toBe(false);
    }
  });

  it('non-repeat commitment has learnedFrom, preventiveChange, and commitmentStatement for every category', () => {
    const categories: DetectedError['category'][] = [
      'handoff', 'decline', 'misclassification', 'missed_opportunity',
      'wrong_action', 'double_send', 'delay', 'inappropriate_timing',
      'unknown',
    ];

    for (const category of categories) {
      const de = dummyError(category, 'medium');
      const proof = buildRecoveryProofPackage(de);
      const nrc = proof.nonRepeatCommitment;

      expect(nrc.learnedFrom).toBeTruthy();
      expect(nrc.preventiveChange).toBeTruthy();
      expect(nrc.commitmentStatement).toBeTruthy();
      expect(nrc.commitmentStatement).toContain('Kloel');
    }
  });

  it('guard status integration: blocked error reflects guard state', () => {
    const de = dummyError('double_send', 'medium');
    const guardStatus: GuardStatus = {
      isBlocked: true,
      blockedUntil: '2026-05-15T00:00:00.000Z',
    };
    const proof = buildRecoveryProofPackage(de, guardStatus);

    expect(proof.nonRepeatCommitment.guardActive).toBe(true);
    expect(proof.nonRepeatCommitment.repeatBlockedUntil).toBe(
      '2026-05-15T00:00:00.000Z',
    );
  });

  it('guard status integration: unblocked error has guardActive=false and null blockedUntil', () => {
    const de = dummyError('double_send', 'low');
    const guardStatus: GuardStatus = {
      isBlocked: false,
      blockedUntil: null,
    };
    const proof = buildRecoveryProofPackage(de, guardStatus);

    expect(proof.nonRepeatCommitment.guardActive).toBe(false);
    expect(proof.nonRepeatCommitment.repeatBlockedUntil).toBeNull();
  });

  it('no guard status defaults to guardActive=false with null blockedUntil', () => {
    const de = dummyError('handoff', 'low');
    const proof = buildRecoveryProofPackage(de);

    expect(proof.nonRepeatCommitment.guardActive).toBe(false);
    expect(proof.nonRepeatCommitment.repeatBlockedUntil).toBeNull();
  });

  it('risk class and delegation mode mirror the tactic safety contract', () => {
    const de = dummyError('decline', 'medium');
    const proof = buildRecoveryProofPackage(de);

    expect(proof.riskClass).toBe(proof.tactic.safetyContract.riskClass);
    expect(proof.delegationMode).toBe(proof.tactic.safetyContract.delegationMode);
    expect(proof.delegationMode).toBe('requires_review');
    expect(proof.rollback).toContain('do_not_offer_concession');
  });

  it('acknowledgment inside proof matches standalone builder output', () => {
    const de = dummyError('handoff', 'medium');
    const proof = buildRecoveryProofPackage(de);
    const standaloneAck = buildAcknowledgment(de);

    expect(proof.acknowledgment.message).toBe(standaloneAck.message);
    expect(proof.acknowledgment.channel).toBe(standaloneAck.channel);
    expect(proof.whatKloelKnows).toBe(standaloneAck.whatKloelKnows);
    expect(proof.whatKloelDoesNotKnow).toBe(standaloneAck.whatKloelDoesNotKnow);
  });

  it('repair stance is non_defensive or investigating, never correcting', () => {
    const categories: DetectedError['category'][] = [
      'handoff', 'decline', 'missed_opportunity', 'double_send',
    ];

    for (const category of categories) {
      const de = dummyError(category, 'medium');
      const proof = buildRecoveryProofPackage(de);
      expect(['non_defensive', 'investigating']).toContain(
        proof.repairStance,
      );
    }
  });
});

// =========================================================================
// Helpers
// =========================================================================

function dummyError(
  category: DetectedError['category'],
  severity: DetectedError['severity'],
): DetectedError {
  return {
    errorId: `err_${Math.random().toString(36).slice(2, 10)}`,
    category,
    workspaceId: WKS,
    detectedAt: new Date(NOW).toISOString(),
    evidenceEventIds: [`evt_${Math.random().toString(36).slice(2, 10)}`],
    description: `${category} error detected`,
    severity,
    fingerprint: {
      kind: category,
      workspaceId: WKS,
      eventPatternHash: '12345678',
      firstSeenAt: new Date(NOW - 3600_000).toISOString(),
      repeatCount: 1,
      lastSeenAt: new Date(NOW).toISOString(),
    },
  };
}
