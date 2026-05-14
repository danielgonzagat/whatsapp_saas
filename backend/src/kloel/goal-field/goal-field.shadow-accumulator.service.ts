import { Injectable, Logger } from '@nestjs/common';

export type HumanValidationDecision = 'accept' | 'reject' | 'noop';

export interface WorkspaceShadowState {
  readonly workspaceId: string;
  consecutiveAccepts: number;
  totalCycles: number;
  totalRejects: number;
  lastCycleAt: string;
  promotionEligible: boolean;
}

const PROMOTION_THRESHOLD = 20;
const MAX_REJECTS_CAP = 5;
const MAX_REJECT_RATIO = 0.1;
const DECAY_WINDOW_MS = 30 * 24 * 60 * 60 * 1000;

@Injectable()
export class GoalFieldShadowAccumulatorService {
  private readonly logger = new Logger(GoalFieldShadowAccumulatorService.name);
  private readonly states = new Map<string, WorkspaceShadowState>();

  recordDecision(
    workspaceId: string,
    decision: HumanValidationDecision,
    nowMs: number = Date.now(),
  ): WorkspaceShadowState {
    const now = new Date(nowMs).toISOString();
    const state = this.getOrCreateState(workspaceId);

    this.maybeApplyDecay(state, nowMs, now);

    switch (decision) {
      case 'accept':
        state.consecutiveAccepts++;
        state.totalCycles++;
        state.lastCycleAt = now;
        break;
      case 'reject':
        state.consecutiveAccepts = 0;
        state.totalRejects++;
        state.totalCycles++;
        state.lastCycleAt = now;
        break;
      case 'noop':
        state.lastCycleAt = now;
        break;
    }

    state.promotionEligible = this.evaluateEligibility(state);
    this.states.set(workspaceId, state);

    this.logger.debug(
      `workspace=${workspaceId} decision=${decision} consecutive=${state.consecutiveAccepts} eligible=${state.promotionEligible}`,
    );

    return { ...state };
  }

  isPromotionEligible(workspaceId: string, nowMs?: number): boolean {
    const state = this.states.get(workspaceId);
    if (!state) return false;
    if (nowMs !== undefined && state.lastCycleAt) {
      const lastMs = Date.parse(state.lastCycleAt);
      if (!isNaN(lastMs) && nowMs - lastMs > DECAY_WINDOW_MS) {
        return false;
      }
    }
    return state.promotionEligible;
  }

  getState(workspaceId: string): WorkspaceShadowState | undefined {
    const state = this.states.get(workspaceId);
    return state ? { ...state } : undefined;
  }

  resetWorkspace(workspaceId: string): void {
    this.states.delete(workspaceId);
    this.logger.log(`workspace ${workspaceId} shadow state reset`);
  }

  workspaceCount(): number {
    return this.states.size;
  }

  private getOrCreateState(workspaceId: string): WorkspaceShadowState {
    const existing = this.states.get(workspaceId);
    if (existing) return existing;
    return {
      workspaceId,
      consecutiveAccepts: 0,
      totalCycles: 0,
      totalRejects: 0,
      lastCycleAt: '',
      promotionEligible: false,
    };
  }

  private maybeApplyDecay(
    state: WorkspaceShadowState,
    nowMs: number,
    now: string,
  ): void {
    if (!state.lastCycleAt) return;
    const lastMs = Date.parse(state.lastCycleAt);
    if (isNaN(lastMs)) return;
    if (nowMs - lastMs <= DECAY_WINDOW_MS) return;
    state.consecutiveAccepts = 0;
    state.totalCycles = 0;
    state.totalRejects = 0;
    state.lastCycleAt = now;
    state.promotionEligible = false;
    this.logger.log(
      `workspace ${state.workspaceId} shadow state decayed — reset to cold start`,
    );
  }

  private evaluateEligibility(state: WorkspaceShadowState): boolean {
    if (state.consecutiveAccepts < PROMOTION_THRESHOLD) return false;
    if (state.totalRejects >= MAX_REJECTS_CAP) return false;
    const ratio =
      state.totalCycles > 0 ? state.totalRejects / state.totalCycles : 0;
    return ratio < MAX_REJECT_RATIO;
  }
}
