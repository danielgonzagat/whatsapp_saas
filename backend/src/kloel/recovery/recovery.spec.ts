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
describe('UTP-RECOVERY-001 — detectErrors', () => {
  it('detects handoffs as errors', () => {
    const events: SpineEventRef[] = [
      ev({ eventName: 'commerce.whatsapp.handoff_to_human' }),
      ev({ eventName: 'commerce.whatsapp.handoff_to_human' }),
      ev({ eventName: 'commerce.whatsapp.handoff_to_human' }),
    ];
    const errors = detectErrors(input({ events }));
    const handoffErrors = errors.filter((e) => e.category === 'handoff');
    expect(handoffErrors.length).toBe(1);
    expect(handoffErrors[0]?.description).toContain('3');
  });

  it('detects payment declines', () => {
    const events: SpineEventRef[] = [
      ev({ eventName: 'commerce.payment.declined' }),
      ev({ eventName: 'commerce.payment.declined' }),
      ev({ eventName: 'commerce.payment.declined' }),
      ev({ eventName: 'commerce.payment.declined' }),
    ];
    const errors = detectErrors(input({ events }));
    const declineErrors = errors.filter((e) => e.category === 'decline');
    expect(declineErrors.length).toBe(1);
    expect(declineErrors[0]?.severity).toBe('high');
  });

  it('returns empty array when no errors detected', () => {
    const events: SpineEventRef[] = [
      ev({ eventName: 'commerce.lead.created' }),
      ev({ eventName: 'commerce.payment.approved', valence: 'positive' }),
    ];
    const errors = detectErrors(input({ events }));
    expect(errors).toHaveLength(0);
  });

  it('handoff severity scales with count', () => {
    const lowEvents: SpineEventRef[] = [
      ev({ eventName: 'commerce.whatsapp.handoff_to_human' }),
    ];
    const low = detectErrors(input({ events: lowEvents }));
    expect(low[0]?.severity).toBe('low');

    const highEvents: SpineEventRef[] = Array.from(
      { length: 6 },
      () => ev({ eventName: 'commerce.whatsapp.handoff_to_human' }),
    );
    const high = detectErrors(input({ events: highEvents }));
    expect(high[0]?.severity).toBe('high');
  });
});

// =========================================================================
// UTP-RECOVERY-002 — Error Acknowledgment Builder
// =========================================================================
describe('UTP-RECOVERY-002 — buildAcknowledgment', () => {
  it('generates acknowledgment for handoff error', () => {
    const de = dummyError('handoff', 'medium');
    const ack = buildAcknowledgment(de);
    expect(ack.errorId).toBe(de.errorId);
    expect(ack.channel).toBe('whatsapp');
    expect(ack.message).toBeTruthy();
    expect(ack.generatedAt).toBeTruthy();
  });

  it('generates acknowledgment for decline error', () => {
    const de = dummyError('decline', 'high');
    const ack = buildAcknowledgment(de);
    expect(ack.channel).toBe('whatsapp');
  });

  it('misclassification errors go to dashboard', () => {
    const de = dummyError('misclassification', 'medium');
    const ack = buildAcknowledgment(de);
    expect(ack.channel).toBe('dashboard');
  });

  it('unknown errors go to silent channel', () => {
    const de = dummyError('unknown', 'low');
    const ack = buildAcknowledgment(de);
    expect(ack.channel).toBe('silent');
  });
});

// =========================================================================
// UTP-RECOVERY-003 — Error Explanation Builder
// =========================================================================
describe('UTP-RECOVERY-003 — buildExplanation', () => {
  it('generates explanation with whatHappened and why fields', () => {
    const de = dummyError('handoff', 'medium');
    const expl = buildExplanation(de);
    expect(expl.errorId).toBe(de.errorId);
    expect(expl.whatHappened).toBeTruthy();
    expect(expl.why).toBeTruthy();
    expect(expl.summary).toBeTruthy();
  });

  it('high severity reflects in summary', () => {
    const de = dummyError('missed_opportunity', 'high');
    const expl = buildExplanation(de);
    expect(expl.summary).toContain('Alto impacto');
  });

  it('unknown category falls back to generic explanation', () => {
    const de = dummyError('unknown', 'low');
    const expl = buildExplanation(de);
    expect(expl.whatHappened).toBeTruthy();
    expect(expl.why).toBeTruthy();
  });
});

// =========================================================================
// UTP-RECOVERY-004 — Error Non-Repeat Guard
// =========================================================================
describe('UTP-RECOVERY-004 — ErrorNonRepeatGuard', () => {
  let guard: ErrorNonRepeatGuard;

  beforeEach(() => {
    guard = new ErrorNonRepeatGuard();
  });

  it('registers error fingerprint', () => {
    const de = dummyError('handoff', 'low');
    const fp = guard.register(de);
    expect(fp.kind).toBe('handoff');
    expect(guard.ledgerSize()).toBeGreaterThanOrEqual(1);
  });

  it('blocks repeated error within cooldown', () => {
    const de = dummyError('handoff', 'low');
    guard.register(de);
    expect(guard.isBlocked(de)).toBe(true);
  });

  it('tracks repeat count on re-registration', () => {
    const de = dummyError('handoff', 'low');
    guard.register(de);
    const fp = guard.register(de);
    expect(fp.repeatCount).toBe(2);
    expect(guard.repeatCount(de)).toBe(2);
  });

  it('cooldownRemainingMs returns positive value when blocked', () => {
    const de = dummyError('handoff', 'low');
    guard.register(de);
    expect(guard.cooldownRemainingMs(de)).toBeGreaterThan(0);
  });

  it('clear resets the ledger', () => {
    guard.register(dummyError('handoff', 'low'));
    guard.clear();
    expect(guard.ledgerSize()).toBe(0);
  });
});

// =========================================================================
// UTP-RECOVERY-005 — Error Damage Recovery Tactics
// =========================================================================
describe('UTP-RECOVERY-005 — proposeRecoveryTactic', () => {
  it('proposes expedited handling for high severity handoff', () => {
    const de = dummyError('handoff', 'high');
    const tactic = proposeRecoveryTactic(de);
    expect(tactic.action).toBe('expedited_handling');
    expect(tactic.errorId).toBe(de.errorId);
    expect(tactic.tacticId).toBeTruthy();
  });

  it('proposes follow_up_personal for decline', () => {
    const de = dummyError('decline', 'high');
    const tactic = proposeRecoveryTactic(de);
    expect(tactic.action).toBe('follow_up_personal');
  });

  it('proposes small_concession for medium decline', () => {
    const de = dummyError('decline', 'medium');
    const tactic = proposeRecoveryTactic(de);
    expect(tactic.action).toBe('small_concession');
  });

  it('proposes silence for inappropriate_timing', () => {
    const de = dummyError('inappropriate_timing', 'low');
    const tactic = proposeRecoveryTactic(de);
    expect(tactic.action).toBe('silence');
  });

  it('includes estimated cost in cents', () => {
    const de = dummyError('decline', 'medium');
    const tactic = proposeRecoveryTactic(de);
    expect(typeof tactic.estimatedCostCents).toBe('number');
    expect(tactic.estimatedCostCents).toBeGreaterThanOrEqual(0);
  });
});

// =========================================================================
// UTP-RECOVERY-006 — Error Narrative Builder
// =========================================================================
describe('UTP-RECOVERY-006 — buildErrorNarrative', () => {
  it('builds narrative with error entries', () => {
    const errors = [dummyError('handoff', 'medium'), dummyError('decline', 'high')];
    const tactics = new Map<string, RecoveryTactic>();
    for (const err of errors) {
      tactics.set(err.errorId, proposeRecoveryTactic(err));
    }
    const narrative = buildErrorNarrative(errors, tactics, WKS, NOW);
    expect(narrative.narrativeId).toBeTruthy();
    expect(narrative.workspaceId).toBe(WKS);
    expect(narrative.errors).toHaveLength(2);
    expect(narrative.recoverySummary).toBeTruthy();
    expect(narrative.weekStart).toBeTruthy();
  });

  it('trustImpact is improving when all recovered', () => {
    const errors = [dummyError('handoff', 'low')];
    const tactics = new Map<string, RecoveryTactic>();
    for (const err of errors) {
      tactics.set(err.errorId, proposeRecoveryTactic(err));
    }
    const narrative = buildErrorNarrative(errors, tactics, WKS, NOW);
    expect(narrative.trustImpact).toBe('improving');
  });

  it('empty error list produces empty narrative', () => {
    const narrative = buildErrorNarrative(
      [],
      new Map(),
      WKS,
      NOW,
    );
    expect(narrative.errors).toHaveLength(0);
    expect(narrative.recoverySummary).toContain('Nenhum erro');
    expect(narrative.trustImpact).toBe('stable');
  });

  it('declining when more unresolved than recovered', () => {
    const errors = [
      dummyError('handoff', 'high'),
      dummyError('decline', 'high'),
      dummyError('missed_opportunity', 'high'),
    ];
    const tactics = new Map<string, RecoveryTactic>();
    for (const err of errors) {
      const tactic = proposeRecoveryTactic(err);
      tactics.set(err.errorId, {
        ...tactic,
        action: 'silence',
      });
    }
    const narrative = buildErrorNarrative(errors, tactics, WKS, NOW);
    expect(narrative.trustImpact).toBe('declining');
  });
});

// =========================================================================
// UTP-RECOVERY-007 — Trust-After-Error Tracker
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
