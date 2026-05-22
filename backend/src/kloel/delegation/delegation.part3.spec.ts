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
