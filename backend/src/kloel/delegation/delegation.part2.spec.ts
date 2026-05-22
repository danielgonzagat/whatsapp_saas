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