import type {
  AreaDelegationState,
  DelegationSnapshotInput,
  GraduationVerdict,
} from './delegation.types';
import { ALL_DELEGATION_AREAS } from './delegation.types';
import { DelegationStateTracker } from './delegation-state.tracker';
import { detectGraduation, type GraduationContext } from './graduation.detector';
import { buildAutonomySuggestion } from './autonomy-suggestion.builder';
import { AutonomyRollbackPolicy } from './autonomy-rollback.policy';
import { AreaByAreaGraduationService } from './area-by-area-graduation.service';
import { buildDelegationEvidence, type EvidenceInput } from './delegation-evidence.builder';

const NOW = Date.parse('2026-05-14T00:00:00.000Z');
const WKS = 'wks_deleg_test';

function dummyState(over?: Partial<AreaDelegationState>): AreaDelegationState {
  return {
    area: over?.area ?? 'whatsapp',
    workspaceId: over?.workspaceId ?? WKS,
    currentLevel: over?.currentLevel ?? 'manual',
    proposedLevel: over?.proposedLevel ?? 'manual',
    confidenceScore: over?.confidenceScore ?? 0.5,
    evidenceCount: over?.evidenceCount ?? 0,
    lastGraduatedAt: over?.lastGraduatedAt ?? null,
    lastDemotedAt: over?.lastDemotedAt ?? null,
    cyclesAtCurrentLevel: over?.cyclesAtCurrentLevel ?? 0,
    gatePassRate: over?.gatePassRate ?? 0,
    errorRate: over?.errorRate ?? 0,
    updatedAt: over?.updatedAt ?? new Date(NOW).toISOString(),
  };
}

function snapshotInput(over?: Partial<DelegationSnapshotInput>): DelegationSnapshotInput {
  return {
    area: over?.area ?? 'whatsapp',
    workspaceId: over?.workspaceId ?? WKS,
    gatePassCount: over?.gatePassCount ?? 0,
    gateFailCount: over?.gateFailCount ?? 0,
    errorCount: over?.errorCount ?? 0,
    totalEvents: over?.totalEvents ?? 0,
    consecutiveCyclesOk: over?.consecutiveCyclesOk ?? 0,
    trustScore: over?.trustScore ?? 0.5,
    nowMs: over?.nowMs ?? NOW,
  };
}

function gradCtx(state: AreaDelegationState, cooldown = false): GraduationContext {
  return { state, cooldownActive: cooldown, nowMs: NOW };
}

// =========================================================================
// UTP-DELEG-001 — Delegation State Tracker
// =========================================================================
describe('UTP-DELEG-001 — DelegationStateTracker', () => {
  let tracker: DelegationStateTracker;

  beforeEach(() => {
    tracker = new DelegationStateTracker();
  });

  it('initializes with default state per area', () => {
    const state = tracker.getState(WKS, 'whatsapp');
    expect(state.area).toBe('whatsapp');
    expect(state.workspaceId).toBe(WKS);
    expect(state.currentLevel).toBe('manual');
    expect(state.confidenceScore).toBeGreaterThan(0);
  });

  it('maintains per-workspace isolation', () => {
    tracker.applySnapshot(
      snapshotInput({
        workspaceId: 'wks_a',
        area: 'whatsapp',
        totalEvents: 50,
        gatePassCount: 45,
        trustScore: 0.9,
      }),
    );
    const stateB = tracker.getState('wks_b', 'whatsapp');
    expect(stateB.evidenceCount).toBe(0);
    expect(stateB.confidenceScore).toBeLessThan(0.9);
  });

  it('updates confidence from snapshot', () => {
    tracker.applySnapshot(
      snapshotInput({
        totalEvents: 100,
        gatePassCount: 95,
        gateFailCount: 5,
        errorCount: 2,
        trustScore: 0.85,
        consecutiveCyclesOk: 5,
      }),
    );
    const state = tracker.getState(WKS, 'whatsapp');
    expect(state.confidenceScore).toBeGreaterThan(0.7);
    expect(state.evidenceCount).toBe(100);
    expect(state.cyclesAtCurrentLevel).toBe(5);
  });

  it('setLevel promotes and tracks graduation', () => {
    tracker.setLevel(WKS, 'whatsapp', 'supervised', NOW);
    const state = tracker.getState(WKS, 'whatsapp');
    expect(state.currentLevel).toBe('supervised');
    expect(state.cyclesAtCurrentLevel).toBe(0);
  });

  it('setLevel to autonomous records graduation timestamp', () => {
    tracker.setLevel(WKS, 'whatsapp', 'autonomous', NOW);
    const state = tracker.getState(WKS, 'whatsapp');
    expect(state.currentLevel).toBe('autonomous');
    expect(state.lastGraduatedAt).toBeTruthy();
  });

  it('setLevel to manual records demotion', () => {
    tracker.setLevel(WKS, 'whatsapp', 'supervised', NOW);
    tracker.setLevel(WKS, 'whatsapp', 'manual', NOW);
    const state = tracker.getState(WKS, 'whatsapp');
    expect(state.currentLevel).toBe('manual');
    expect(state.lastDemotedAt).toBeTruthy();
  });

  it('getAllStates returns all delegation areas', () => {
    const states = tracker.getAllStates(WKS);
    expect(states).toHaveLength(ALL_DELEGATION_AREAS.length);
    for (const state of states) {
      expect(state.workspaceId).toBe(WKS);
    }
  });

  it('proposeLevel updates proposed level without changing current', () => {
    tracker.proposeLevel(WKS, 'whatsapp', 'semi_autonomous', NOW);
    const state = tracker.getState(WKS, 'whatsapp');
    expect(state.proposedLevel).toBe('semi_autonomous');
    expect(state.currentLevel).toBe('manual');
  });

  it('cooldown is active within 7 days of graduation', () => {
    tracker.setLevel(WKS, 'whatsapp', 'supervised', NOW);
    const active = tracker.isGraduationCooldownActive(
      WKS,
      'whatsapp',
      NOW + 3 * 24 * 60 * 60 * 1000,
    );
    expect(active).toBe(true);
  });

  it('cooldown expires after 7 days', () => {
    tracker.setLevel(WKS, 'whatsapp', 'supervised', NOW);
    const active = tracker.isGraduationCooldownActive(
      WKS,
      'whatsapp',
      NOW + 8 * 24 * 60 * 60 * 1000,
    );
    expect(active).toBe(false);
  });

  it('clear resets all state', () => {
    tracker.applySnapshot(snapshotInput({ totalEvents: 50 }));
    tracker.clear();
    expect(tracker.areaCount()).toBe(0);
  });
});

// =========================================================================
// UTP-DELEG-002 — Graduation Detector
// =========================================================================
describe('UTP-DELEG-002 — detectGraduation', () => {
  it('promotes when confidence is high and cycles enough', () => {
    const state = dummyState({
      currentLevel: 'supervised',
      confidenceScore: 0.85,
      evidenceCount: 20,
      cyclesAtCurrentLevel: 5,
      gatePassRate: 0.9,
      errorRate: 0.05,
    });
    const verdict = detectGraduation(gradCtx(state));
    expect(verdict.verdict).toBe('promote');
    expect(verdict.suggestedLevel).toBe('semi_autonomous');
  });

  it('holds when confidence is medium', () => {
    const state = dummyState({
      currentLevel: 'supervised',
      confidenceScore: 0.6,
      evidenceCount: 15,
      cyclesAtCurrentLevel: 3,
      gatePassRate: 0.7,
      errorRate: 0.1,
    });
    const verdict = detectGraduation(gradCtx(state));
    expect(verdict.verdict).toBe('hold');
  });

  it('demotes when confidence below demotion threshold', () => {
    const state = dummyState({
      currentLevel: 'semi_autonomous',
      confidenceScore: 0.2,
      evidenceCount: 10,
      cyclesAtCurrentLevel: 2,
      gatePassRate: 0.4,
      errorRate: 0.35,
    });
    const verdict = detectGraduation(gradCtx(state));
    expect(verdict.verdict).toBe('demote');
    expect(verdict.suggestedLevel).toBe('supervised');
  });

  it('holds when cooldown is active', () => {
    const state = dummyState({
      currentLevel: 'supervised',
      confidenceScore: 0.9,
      evidenceCount: 20,
      cyclesAtCurrentLevel: 5,
      gatePassRate: 0.95,
      errorRate: 0.02,
    });
    const verdict = detectGraduation(gradCtx(state, true));
    expect(verdict.verdict).toBe('hold');
    expect(verdict.reasons).toContain('graduation cooldown window active');
  });

  it('holds at autonomous level', () => {
    const state = dummyState({
      currentLevel: 'autonomous',
      confidenceScore: 0.95,
      evidenceCount: 50,
      cyclesAtCurrentLevel: 10,
      gatePassRate: 0.99,
      errorRate: 0.01,
    });
    const verdict = detectGraduation(gradCtx(state));
    expect(verdict.verdict).toBe('hold');
    expect(verdict.reasons).toContain('area already at maximum autonomy level');
  });

  it('holds when cycles insufficient even with high confidence', () => {
    const state = dummyState({
      currentLevel: 'supervised',
      confidenceScore: 0.9,
      evidenceCount: 20,
      cyclesAtCurrentLevel: 1,
      gatePassRate: 0.95,
      errorRate: 0.02,
    });
    const verdict = detectGraduation(gradCtx(state));
    expect(verdict.verdict).toBe('hold');
  });

  it('demotes when error rate exceeds 0.3', () => {
    const state = dummyState({
      currentLevel: 'semi_autonomous',
      confidenceScore: 0.5,
      evidenceCount: 10,
      cyclesAtCurrentLevel: 3,
      gatePassRate: 0.6,
      errorRate: 0.35,
    });
    const verdict = detectGraduation(gradCtx(state));
    expect(verdict.verdict).toBe('demote');
  });

  it('does not demote when already at manual level', () => {
    const state = dummyState({
      currentLevel: 'manual',
      confidenceScore: 0.2,
      evidenceCount: 5,
      cyclesAtCurrentLevel: 0,
      gatePassRate: 0.3,
      errorRate: 0.4,
    });
    const verdict = detectGraduation(gradCtx(state));
    expect(verdict.verdict).not.toBe('demote');
  });

  it('reasons array contains specific metrics', () => {
    const state = dummyState({
      currentLevel: 'supervised',
      confidenceScore: 0.88,
      evidenceCount: 25,
      cyclesAtCurrentLevel: 4,
      gatePassRate: 0.92,
      errorRate: 0.03,
    });
    const verdict = detectGraduation(gradCtx(state));
    expect(verdict.reasons.length).toBeGreaterThan(0);
    expect(verdict.generatedAt).toBeTruthy();
  });
});

// =========================================================================
// UTP-DELEG-003 — Autonomy Suggestion Builder
// =========================================================================
describe('UTP-DELEG-003 — buildAutonomySuggestion', () => {
  it('builds suggestion from promote verdict', () => {
    const verdict: GraduationVerdict = {
      area: 'whatsapp',
      workspaceId: WKS,
      verdict: 'promote',
      confidence: 0.88,
      reasons: ['confidence above threshold'],
      suggestedLevel: 'semi_autonomous',
      generatedAt: new Date(NOW).toISOString(),
    };
    const evidenceIds = ['evt_001', 'evt_002'];
    const suggestion = buildAutonomySuggestion({
      verdict,
      currentLevel: 'supervised',
      evidenceEventIds: evidenceIds,
      nowMs: NOW,
    });
    expect(suggestion.suggestionId).toBeTruthy();
    expect(suggestion.area).toBe('whatsapp');
    expect(suggestion.currentLevel).toBe('supervised');
    expect(suggestion.proposedLevel).toBe('semi_autonomous');
    expect(suggestion.confidence).toBe(0.88);
    expect(suggestion.evidenceEventIds).toEqual(evidenceIds);
    expect(suggestion.businessImpact).toBeTruthy();
    expect(suggestion.riskAssessment).toBeTruthy();
  });

  it('includes business impact and risk assessment', () => {
    const verdict: GraduationVerdict = {
      area: 'checkout',
      workspaceId: WKS,
      verdict: 'promote',
      confidence: 0.85,
      reasons: ['ready for autonomy'],
      suggestedLevel: 'semi_autonomous',
      generatedAt: new Date(NOW).toISOString(),
    };
    const suggestion = buildAutonomySuggestion({
      verdict,
      currentLevel: 'supervised',
      evidenceEventIds: [],
      nowMs: NOW,
    });
    expect(suggestion.businessImpact).not.toContain('Nível de autonomia mantido');
    expect(suggestion.riskAssessment).toContain('Confiança');
    expect(suggestion.riskAssessment).toContain('85%');
  });

  it('generatedAt uses provided nowMs', () => {
    const verdict: GraduationVerdict = {
      area: 'crm',
      workspaceId: WKS,
      verdict: 'hold',
      confidence: 0.5,
      reasons: ['needs more evidence'],
      suggestedLevel: 'manual',
      generatedAt: new Date(NOW).toISOString(),
    };
    const suggestion = buildAutonomySuggestion({
      verdict,
      currentLevel: 'manual',
      evidenceEventIds: [],
      nowMs: NOW,
    });
    expect(suggestion.generatedAt).toBe(new Date(NOW).toISOString());
  });
});

// =========================================================================
// UTP-DELEG-004 — Autonomy Rollback Policy
// =========================================================================
describe('UTP-DELEG-004 — AutonomyRollbackPolicy', () => {
  let policy: AutonomyRollbackPolicy;

  beforeEach(() => {
    policy = new AutonomyRollbackPolicy();
  });

  it('triggers rollback when confidence below threshold', () => {
    const state = dummyState({
      area: 'whatsapp',
      currentLevel: 'semi_autonomous',
      confidenceScore: 0.2,
      errorRate: 0.1,
      gatePassRate: 0.3,
    });
    const rollback = policy.evaluate(state, NOW);
    expect(rollback).not.toBeNull();
    expect(rollback?.fromLevel).toBe('semi_autonomous');
    expect(rollback?.toLevel).toBe('supervised');
    expect(rollback?.triggerEvent).toBe('confidence_below_demotion_threshold');
  });

  it('does not trigger rollback when confidence is healthy', () => {
    const state = dummyState({
      area: 'whatsapp',
      currentLevel: 'semi_autonomous',
      confidenceScore: 0.85,
      errorRate: 0.05,
      gatePassRate: 0.9,
    });
    const rollback = policy.evaluate(state, NOW);
    expect(rollback).toBeNull();
  });

  it('does not rollback manual level', () => {
    const state = dummyState({
      area: 'whatsapp',
      currentLevel: 'manual',
      confidenceScore: 0.1,
      errorRate: 0.5,
      gatePassRate: 0.2,
    });
    const rollback = policy.evaluate(state, NOW);
    expect(rollback).toBeNull();
  });

  it('tracks rollback history', () => {
    const state = dummyState({
      area: 'whatsapp',
      currentLevel: 'semi_autonomous',
      confidenceScore: 0.2,
      errorRate: 0.1,
      gatePassRate: 0.3,
    });
    policy.evaluate(state, NOW);
    const history = policy.rollbackHistory(WKS, 'whatsapp');
    expect(history).toHaveLength(1);
    expect(history[0]?.fromLevel).toBe('semi_autonomous');
  });

  it('tracks consecutive failures', () => {
    const state = dummyState({
      currentLevel: 'supervised',
      confidenceScore: 0.2,
      errorRate: 0.1,
      gatePassRate: 0.3,
    });
    policy.evaluate(state, NOW);
    policy.evaluate(state, NOW);
    const count = policy.consecutiveFailureCount(WKS, 'whatsapp');
    expect(count).toBe(2);
  });

  it('isRecoveryReady returns true when confidence exceeds threshold', () => {
    expect(policy.isRecoveryReady(WKS, 'whatsapp', 0.7)).toBe(true);
    expect(policy.isRecoveryReady(WKS, 'whatsapp', 0.5)).toBe(false);
  });

  it('resolveRollback marks rollback as resolved', () => {
    const state = dummyState({
      currentLevel: 'semi_autonomous',
      confidenceScore: 0.2,
      errorRate: 0.1,
      gatePassRate: 0.3,
    });
    policy.evaluate(state, NOW);
    expect(policy.resolveRollback(WKS, 'whatsapp', NOW)).toBe(true);
  });

  it('trigger on error rate triggers different reason', () => {
    const state = dummyState({
      currentLevel: 'supervised',
      confidenceScore: 0.5,
      errorRate: 0.35,
      gatePassRate: 0.9,
    });
    const rollback = policy.evaluate(state, NOW);
    expect(rollback?.triggerEvent).toBe('error_rate_exceeded');
  });

  it('clear resets all state', () => {
    const state = dummyState({
      currentLevel: 'supervised',
      confidenceScore: 0.2,
      errorRate: 0.1,
      gatePassRate: 0.3,
    });
    policy.evaluate(state, NOW);
    policy.clear();
    expect(policy.activeRollbackCount()).toBe(0);
    expect(policy.consecutiveFailureCount(WKS, 'whatsapp')).toBe(0);
  });
});

// =========================================================================
// UTP-DELEG-005 — Area-by-Area Graduation
// =========================================================================
describe('UTP-DELEG-005 — AreaByAreaGraduationService', () => {
  let service: AreaByAreaGraduationService;
  let tracker: DelegationStateTracker;
  let rollbackPolicy: AutonomyRollbackPolicy;

  beforeEach(() => {
    tracker = new DelegationStateTracker();
    rollbackPolicy = new AutonomyRollbackPolicy();
    service = new AreaByAreaGraduationService(tracker, rollbackPolicy);
  });

  it('promotes area when ready for graduation', () => {
    const input = snapshotInput({
      area: 'whatsapp',
      totalEvents: 50,
      gatePassCount: 48,
      gateFailCount: 2,
      errorCount: 1,
      trustScore: 0.9,
      consecutiveCyclesOk: 5,
    });
    const result = service.evaluateArea(input, ['evt_001']);
    expect(result.executedAction).toBe('promoted');
    expect(result.suggestion).not.toBeNull();
    expect(result.suggestion?.proposedLevel).toBe('supervised');
  });

  it('holds area when not enough evidence', () => {
    const input = snapshotInput({
      area: 'whatsapp',
      totalEvents: 3,
      gatePassCount: 2,
      gateFailCount: 1,
      errorCount: 1,
      trustScore: 0.5,
      consecutiveCyclesOk: 1,
    });
    const result = service.evaluateArea(input, []);
    expect(result.executedAction).toBe('held');
    expect(result.suggestion).toBeNull();
  });

  it('demotes when rollback triggered', () => {
    const input = snapshotInput({
      area: 'whatsapp',
      totalEvents: 10,
      gatePassCount: 2,
      gateFailCount: 8,
      errorCount: 5,
      trustScore: 0.2,
      consecutiveCyclesOk: 0,
    });
    tracker.setLevel(WKS, 'whatsapp', 'semi_autonomous', NOW);
    const result = service.evaluateArea(input, []);
    expect(result.executedAction).toBe('demoted');
    expect(result.rollback).not.toBeNull();
  });

  it('evaluates all areas independently', () => {
    const inputs: DelegationSnapshotInput[] = [
      snapshotInput({
        area: 'whatsapp',
        totalEvents: 50,
        gatePassCount: 48,
        gateFailCount: 2,
        trustScore: 0.9,
        consecutiveCyclesOk: 5,
      }),
      snapshotInput({
        area: 'crm',
        totalEvents: 5,
        gatePassCount: 3,
        gateFailCount: 2,
        trustScore: 0.4,
        consecutiveCyclesOk: 0,
      }),
    ];
    const results = service.evaluateAllAreas(WKS, inputs, []);
    expect(results).toHaveLength(ALL_DELEGATION_AREAS.length);

    const whatsapp = results.find((r) => r.area === 'whatsapp');
    const crm = results.find((r) => r.area === 'crm');
    expect(whatsapp?.executedAction).toBeDefined();
    expect(crm?.executedAction).toBeDefined();
    expect(whatsapp?.executedAction).not.toEqual(crm?.executedAction);
  });

  it('getWorkspaceReport compiles area states', () => {
    const input = snapshotInput({
      area: 'whatsapp',
      totalEvents: 50,
      gatePassCount: 48,
      gateFailCount: 2,
      trustScore: 0.9,
      consecutiveCyclesOk: 5,
    });
    service.evaluateArea(input, []);
    const report = service.getWorkspaceReport(WKS);
    expect(report.states.length).toBeGreaterThan(0);
    expect(report.manualAreas.length).toBeGreaterThan(0);
  });
});

// =========================================================================
// UTP-DELEG-006 — Delegation Evidence Builder
// =========================================================================
describe('UTP-DELEG-006 — buildDelegationEvidence', () => {
  it('packages evidence with R17 score', () => {
    const state = dummyState({
      area: 'whatsapp',
      confidenceScore: 0.85,
    });
    const input: EvidenceInput = {
      state,
      gatePassCount: 95,
      gateFailCount: 5,
      errorCount: 3,
      eventsAnalyzed: 100,
      trustScore: 0.88,
      consecutiveCyclesOk: 5,
      nowMs: NOW,
    };
    const evidence = buildDelegationEvidence(input);
    expect(evidence.evidenceId).toBeTruthy();
    expect(evidence.area).toBe('whatsapp');
    expect(evidence.r17Score).toBeGreaterThan(0);
    expect(evidence.r17Score).toBeLessThanOrEqual(1);
    expect(evidence.recommendationConfidence).toBeGreaterThan(0);
    expect(evidence.eventsAnalyzed).toBe(100);
  });

  it('applies evidence penalty for low event counts', () => {
    const state = dummyState();
    const lowInput: EvidenceInput = {
      state,
      gatePassCount: 5,
      gateFailCount: 0,
      errorCount: 0,
      eventsAnalyzed: 5,
      trustScore: 0.9,
      consecutiveCyclesOk: 0,
      nowMs: NOW,
    };
    const lowEvidence = buildDelegationEvidence(lowInput);

    const highInput: EvidenceInput = {
      state,
      gatePassCount: 95,
      gateFailCount: 5,
      errorCount: 3,
      eventsAnalyzed: 100,
      trustScore: 0.9,
      consecutiveCyclesOk: 0,
      nowMs: NOW,
    };
    const highEvidence = buildDelegationEvidence(highInput);

    expect(highEvidence.recommendationConfidence).toBeGreaterThan(
      lowEvidence.recommendationConfidence,
    );
  });

  it('R17 score includes consecutive bonus', () => {
    const state = dummyState();
    const noBonus: EvidenceInput = {
      state,
      gatePassCount: 90,
      gateFailCount: 10,
      errorCount: 5,
      eventsAnalyzed: 100,
      trustScore: 0.8,
      consecutiveCyclesOk: 0,
      nowMs: NOW,
    };
    const withBonus: EvidenceInput = {
      state,
      gatePassCount: 90,
      gateFailCount: 10,
      errorCount: 5,
      eventsAnalyzed: 100,
      trustScore: 0.8,
      consecutiveCyclesOk: 10,
      nowMs: NOW,
    };

    const noBonusEvidence = buildDelegationEvidence(noBonus);
    const withBonusEvidence = buildDelegationEvidence(withBonus);
    expect(withBonusEvidence.r17Score).toBeGreaterThan(noBonusEvidence.r17Score);
  });

  it('evidenceId is unique', () => {
    const state = dummyState();
    const input: EvidenceInput = {
      state,
      gatePassCount: 10,
      gateFailCount: 0,
      errorCount: 0,
      eventsAnalyzed: 10,
      trustScore: 0.8,
      consecutiveCyclesOk: 0,
      nowMs: NOW,
    };
    const a = buildDelegationEvidence(input);
    const b = buildDelegationEvidence(input);
    expect(a.evidenceId).not.toBe(b.evidenceId);
  });
});
