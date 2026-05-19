/**
 * UTP-DELEG-005 — Area-by-Area Graduation Service.
 *
 * Evaluates graduation independently for each operational area within
 * a workspace. Orchestrates the delegation state tracker, graduation
 * detector, autonomy suggestion builder, and rollback policy.
 *
 * Service class (stateful: delegates to tracker, detector, and rollback policy).
 */

import { Injectable } from '@nestjs/common';
import type {
  AreaDelegationState,
  AutonomySuggestion,
  DelegationArea,
  DelegationSnapshotInput,
  GraduationVerdict,
  RollbackPolicy,
} from './delegation.types';
import { ALL_DELEGATION_AREAS } from './delegation.types';
import { DelegationStateTracker } from './delegation-state.tracker';
import { type GraduationContext, detectGraduation } from './graduation.detector';
import { buildAutonomySuggestion } from './autonomy-suggestion.builder';
import { AutonomyRollbackPolicy } from './autonomy-rollback.policy';

export interface GraduationCycleResult {
  readonly workspaceId: string;
  readonly area: DelegationArea;
  readonly state: AreaDelegationState;
  readonly verdict: GraduationVerdict;
  readonly suggestion: AutonomySuggestion | null;
  readonly rollback: RollbackPolicy | null;
  readonly executedAction: 'promoted' | 'demoted' | 'held';
}

@Injectable()
export class AreaByAreaGraduationService {
  public constructor(
    private readonly tracker: DelegationStateTracker,
    private readonly rollbackPolicy: AutonomyRollbackPolicy,
  ) {}

  public evaluateArea(
    input: DelegationSnapshotInput,
    evidenceEventIds: readonly string[],
  ): GraduationCycleResult {
    const state = this.tracker.applySnapshot(input);
    const { workspaceId, area } = input;
    const nowMs = input.nowMs;

    const cooldownActive = this.tracker.isGraduationCooldownActive(workspaceId, area, nowMs);

    const ctx: GraduationContext = { state, cooldownActive, nowMs };
    const verdict = detectGraduation(ctx);

    const rollback = this.rollbackPolicy.evaluate(state, nowMs);

    let executedAction: GraduationCycleResult['executedAction'] = 'held';

    if (rollback) {
      this.tracker.setLevel(workspaceId, area, rollback.toLevel, nowMs);
      executedAction = 'demoted';
    } else if (verdict.verdict === 'promote' && !cooldownActive) {
      this.tracker.setLevel(workspaceId, area, verdict.suggestedLevel, nowMs);
      executedAction = 'promoted';
    }

    const updatedState = this.tracker.getState(workspaceId, area);

    const suggestion =
      verdict.verdict === 'promote'
        ? buildAutonomySuggestion({
            verdict,
            currentLevel: state.currentLevel,
            evidenceEventIds,
            nowMs,
          })
        : null;

    return {
      workspaceId,
      area,
      state: updatedState,
      verdict,
      suggestion,
      rollback,
      executedAction,
    };
  }

  public evaluateAllAreas(
    workspaceId: string,
    inputs: readonly DelegationSnapshotInput[],
    evidenceEventIds: readonly string[],
  ): readonly GraduationCycleResult[] {
    const inputMap = new Map<DelegationArea, DelegationSnapshotInput>();
    for (const input of inputs) {
      inputMap.set(input.area, input);
    }

    return ALL_DELEGATION_AREAS.map((area) => {
      const input = inputMap.get(area);
      if (!input) {
        const defaultInput: DelegationSnapshotInput = {
          area,
          workspaceId,
          gatePassCount: 0,
          gateFailCount: 0,
          errorCount: 0,
          totalEvents: 0,
          consecutiveCyclesOk: 0,
          trustScore: 0.5,
          nowMs: Date.now(),
        };
        return this.evaluateArea(defaultInput, evidenceEventIds);
      }
      return this.evaluateArea(input, evidenceEventIds);
    });
  }

  public getWorkspaceReport(workspaceId: string): {
    readonly states: readonly AreaDelegationState[];
    readonly promotedAreas: readonly DelegationArea[];
    readonly demotedAreas: readonly DelegationArea[];
    readonly autonomousAreas: readonly DelegationArea[];
    readonly manualAreas: readonly DelegationArea[];
  } {
    const states = this.tracker.getAllStates(workspaceId);

    return {
      states,
      promotedAreas: states
        .filter((s) => s.currentLevel !== 'manual' && s.confidenceScore >= 0.8)
        .map((s) => s.area),
      demotedAreas: states.filter((s) => s.confidenceScore < 0.3).map((s) => s.area),
      autonomousAreas: states.filter((s) => s.currentLevel === 'autonomous').map((s) => s.area),
      manualAreas: states.filter((s) => s.currentLevel === 'manual').map((s) => s.area),
    };
  }
}
