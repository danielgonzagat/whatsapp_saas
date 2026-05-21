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