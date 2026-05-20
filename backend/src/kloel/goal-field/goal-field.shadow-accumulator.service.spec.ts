import {
  GoalFieldShadowAccumulatorService,
  WorkspaceShadowState,
} from './goal-field.shadow-accumulator.service';

const T0 = Date.parse('2026-01-01T00:00:00.000Z');
const THIRTY_ONE_DAYS = 31 * 24 * 60 * 60 * 1000;
const TWENTY_NINE_DAYS = 29 * 24 * 60 * 60 * 1000;

describe('GoalFieldShadowAccumulatorService — cold start', () => {
  it('workspace with 0 cycles is NOT promotion eligible', () => {
    const acc = new GoalFieldShadowAccumulatorService();
    expect(acc.isPromotionEligible('wks_cold')).toBe(false);
  });

  it('getState returns undefined for unknown workspace', () => {
    const acc = new GoalFieldShadowAccumulatorService();
    expect(acc.getState('wks_unknown')).toBeUndefined();
  });

  it('workspaceCount is 0 at construction', () => {
    const acc = new GoalFieldShadowAccumulatorService();
    expect(acc.workspaceCount()).toBe(0);
  });
});

describe('GoalFieldShadowAccumulatorService — accept streak', () => {
  it('19 consecutive accepts does NOT promote', () => {
    const acc = new GoalFieldShadowAccumulatorService();
    let state: WorkspaceShadowState | undefined;
    for (let i = 0; i < 19; i++) {
      state = acc.recordDecision('wks_a', 'accept', T0 + i * 60_000);
    }
    expect(state?.consecutiveAccepts).toBe(19);
    expect(state?.promotionEligible).toBe(false);
    expect(acc.isPromotionEligible('wks_a')).toBe(false);
  });

  it('20 consecutive accepts DOES promote (clean ratio)', () => {
    const acc = new GoalFieldShadowAccumulatorService();
    let state: WorkspaceShadowState | undefined;
    for (let i = 0; i < 20; i++) {
      state = acc.recordDecision('wks_a', 'accept', T0 + i * 60_000);
    }
    expect(state?.consecutiveAccepts).toBe(20);
    expect(state?.promotionEligible).toBe(true);
    expect(acc.isPromotionEligible('wks_a')).toBe(true);
  });

  it('30 consecutive accepts stays eligible', () => {
    const acc = new GoalFieldShadowAccumulatorService();
    let state: WorkspaceShadowState | undefined;
    for (let i = 0; i < 30; i++) {
      state = acc.recordDecision('wks_a', 'accept', T0 + i * 60_000);
    }
    expect(state?.consecutiveAccepts).toBe(30);
    expect(state?.promotionEligible).toBe(true);
  });

  it('getState returns a snapshot (not live reference)', () => {
    const acc = new GoalFieldShadowAccumulatorService();
    acc.recordDecision('wks_a', 'accept', T0);
    const snap = acc.getState('wks_a');
    expect(snap?.consecutiveAccepts).toBe(1);
    snap!.consecutiveAccepts = 999;
    expect(acc.getState('wks_a')?.consecutiveAccepts).toBe(1);
  });
});

describe('GoalFieldShadowAccumulatorService — reject blocking', () => {
  it('single reject resets consecutive streak to 0', () => {
    const acc = new GoalFieldShadowAccumulatorService();
    for (let i = 0; i < 15; i++) {
      acc.recordDecision('wks_a', 'accept', T0 + i * 60_000);
    }
    const afterReject = acc.recordDecision('wks_a', 'reject', T0 + 15 * 60_000);
    expect(afterReject.consecutiveAccepts).toBe(0);
    expect(afterReject.totalRejects).toBe(1);
    expect(afterReject.promotionEligible).toBe(false);
  });

  it('5 rejects in total blocks promotion (hard cap) even with 20+ consecutive accepts', () => {
    const acc = new GoalFieldShadowAccumulatorService();
    for (let i = 0; i < 20; i++) {
      acc.recordDecision('wks_a', 'accept', T0 + i * 60_000);
    }
    expect(acc.isPromotionEligible('wks_a')).toBe(true);

    for (let r = 0; r < 5; r++) {
      const t = T0 + (20 + r * 2) * 60_000;
      acc.recordDecision('wks_a', 'reject', t);
      acc.recordDecision('wks_a', 'accept', t + 30_000);
    }
    const final = acc.getState('wks_a');
    expect(final?.totalRejects).toBe(5);
    expect(final?.promotionEligible).toBe(false);
    expect(acc.isPromotionEligible('wks_a')).toBe(false);
  });

  it('4 rejects with many accepts and low ratio can still be eligible', () => {
    const acc = new GoalFieldShadowAccumulatorService();
    for (let i = 0; i < 20; i++) {
      acc.recordDecision('wks_a', 'accept', T0 + i * 60_000);
    }
    for (let r = 0; r < 4; r++) {
      const base = T0 + (20 + r * 6) * 60_000;
      acc.recordDecision('wks_a', 'reject', base);
      for (let a = 0; a < 5; a++) {
        acc.recordDecision('wks_a', 'accept', base + (a + 1) * 60_000);
      }
    }
    // after rebuild: need 20 consecutive
    for (let i = 0; i < 20; i++) {
      acc.recordDecision('wks_a', 'accept', T0 + (20 + 4 * 6 + 5 + i) * 60_000);
    }
    const final = acc.getState('wks_a')!;
    expect(final.consecutiveAccepts).toBeGreaterThanOrEqual(20);
    expect(final.totalRejects).toBe(4);
    const ratio = final.totalRejects / final.totalCycles;
    expect(ratio).toBeLessThan(0.1);
    expect(final.promotionEligible).toBe(true);
  });
});

describe('GoalFieldShadowAccumulatorService — reject ratio gate', () => {
  it('ratio >= 10% blocks even with 20+ consecutive accepts', () => {
    const acc = new GoalFieldShadowAccumulatorService();
    for (let i = 0; i < 9; i++) {
      acc.recordDecision('wks_a', 'reject', T0 + i * 60_000);
    }
    for (let i = 0; i < 20; i++) {
      acc.recordDecision('wks_a', 'accept', T0 + (9 + i) * 60_000);
    }
    const final = acc.getState('wks_a')!;
    expect(final.consecutiveAccepts).toBe(20);
    expect(final.totalRejects).toBe(9);
    expect(final.totalRejects / final.totalCycles).toBeGreaterThanOrEqual(0.1);
    expect(final.promotionEligible).toBe(false);
  });

  it('ratio just under 10% with 20+ accepts is eligible', () => {
    const acc = new GoalFieldShadowAccumulatorService();
    for (let i = 0; i < 2; i++) {
      acc.recordDecision('wks_a', 'reject', T0 + i * 60_000);
    }
    for (let i = 0; i < 20; i++) {
      acc.recordDecision('wks_a', 'accept', T0 + (2 + i) * 60_000);
    }
    const final = acc.getState('wks_a')!;
    expect(final.totalRejects / final.totalCycles).toBeLessThan(0.1);
    expect(final.promotionEligible).toBe(true);
  });
});

describe('GoalFieldShadowAccumulatorService — temporal decay', () => {
  it('state resets after decay window (31 days idle)', () => {
    const acc = new GoalFieldShadowAccumulatorService();
    for (let i = 0; i < 25; i++) {
      acc.recordDecision('wks_a', 'accept', T0 + i * 60_000);
    }
    expect(acc.isPromotionEligible('wks_a')).toBe(true);

    const afterDecay = acc.recordDecision('wks_a', 'accept', T0 + THIRTY_ONE_DAYS);
    expect(afterDecay.consecutiveAccepts).toBe(1);
    expect(afterDecay.totalRejects).toBe(0);
    expect(afterDecay.promotionEligible).toBe(false);
  });

  it('isPromotionEligible with nowMs detects decay on read', () => {
    const acc = new GoalFieldShadowAccumulatorService();
    for (let i = 0; i < 20; i++) {
      acc.recordDecision('wks_a', 'accept', T0 + i * 60_000);
    }
    expect(acc.isPromotionEligible('wks_a', T0 + THIRTY_ONE_DAYS)).toBe(false);
  });

  it('no decay when within window (< 30 days)', () => {
    const acc = new GoalFieldShadowAccumulatorService();
    acc.recordDecision('wks_a', 'accept', T0);
    acc.recordDecision('wks_a', 'accept', T0 + TWENTY_NINE_DAYS);
    expect(acc.getState('wks_a')?.consecutiveAccepts).toBe(2);
  });

  it('decay resets consecutiveAccepts to 0 after first post-decay decision', () => {
    const acc = new GoalFieldShadowAccumulatorService();
    for (let i = 0; i < 20; i++) {
      acc.recordDecision('wks_a', 'accept', T0 + i * 60_000);
    }
    expect(acc.isPromotionEligible('wks_a')).toBe(true);
    // After decay window, next decision resets
    const state = acc.recordDecision('wks_a', 'noop', T0 + THIRTY_ONE_DAYS);
    expect(state.consecutiveAccepts).toBe(0);
    expect(state.totalCycles).toBe(0);
    expect(state.promotionEligible).toBe(false);
  });
});

describe('GoalFieldShadowAccumulatorService — noop', () => {
  it('noop updates timestamp but does NOT affect counters', () => {
    const acc = new GoalFieldShadowAccumulatorService();
    acc.recordDecision('wks_a', 'accept', T0);
    acc.recordDecision('wks_a', 'noop', T0 + 60_000);
    const state = acc.getState('wks_a')!;
    expect(state.consecutiveAccepts).toBe(1);
    expect(state.totalCycles).toBe(1);
    expect(state.totalRejects).toBe(0);
    expect(state.lastCycleAt).toBe(new Date(T0 + 60_000).toISOString());
  });

  it('noop keeps eligible state if already eligible', () => {
    const acc = new GoalFieldShadowAccumulatorService();
    for (let i = 0; i < 20; i++) {
      acc.recordDecision('wks_a', 'accept', T0 + i * 60_000);
    }
    expect(acc.isPromotionEligible('wks_a')).toBe(true);
    acc.recordDecision('wks_a', 'noop', T0 + 20 * 60_000);
    expect(acc.isPromotionEligible('wks_a')).toBe(true);
  });

  it('noop after reject keeps ineligible state', () => {
    const acc = new GoalFieldShadowAccumulatorService();
    acc.recordDecision('wks_a', 'reject', T0);
    acc.recordDecision('wks_a', 'noop', T0 + 60_000);
    const state = acc.getState('wks_a')!;
    expect(state.consecutiveAccepts).toBe(0);
    expect(state.promotionEligible).toBe(false);
  });
});

describe('GoalFieldShadowAccumulatorService — resetWorkspace', () => {
  it('resetWorkspace clears all state', () => {
    const acc = new GoalFieldShadowAccumulatorService();
    for (let i = 0; i < 20; i++) {
      acc.recordDecision('wks_a', 'accept', T0 + i * 60_000);
    }
    expect(acc.isPromotionEligible('wks_a')).toBe(true);
    acc.resetWorkspace('wks_a');
    expect(acc.isPromotionEligible('wks_a')).toBe(false);
    expect(acc.getState('wks_a')).toBeUndefined();
  });

  it('resetWorkspace affects workspaceCount', () => {
    const acc = new GoalFieldShadowAccumulatorService();
    acc.recordDecision('wks_a', 'accept', T0);
    acc.recordDecision('wks_b', 'accept', T0);
    expect(acc.workspaceCount()).toBe(2);
    acc.resetWorkspace('wks_a');
    expect(acc.workspaceCount()).toBe(1);
  });

  it('resetting unknown workspace is a no-op', () => {
    const acc = new GoalFieldShadowAccumulatorService();
    acc.recordDecision('wks_a', 'accept', T0);
    acc.resetWorkspace('wks_nonexistent');
    expect(acc.workspaceCount()).toBe(1);
  });
});

describe('GoalFieldShadowAccumulatorService — multi-workspace isolation', () => {
  it('each workspace tracks independent state', () => {
    const acc = new GoalFieldShadowAccumulatorService();
    for (let i = 0; i < 20; i++) {
      acc.recordDecision('wks_a', 'accept', T0 + i * 60_000);
    }
    acc.recordDecision('wks_b', 'reject', T0);

    expect(acc.isPromotionEligible('wks_a')).toBe(true);
    expect(acc.isPromotionEligible('wks_b')).toBe(false);
    expect(acc.workspaceCount()).toBe(2);
  });

  it('workspaceCount reflects unique workspaces', () => {
    const acc = new GoalFieldShadowAccumulatorService();
    acc.recordDecision('wks_a', 'accept', T0);
    acc.recordDecision('wks_b', 'accept', T0);
    acc.recordDecision('wks_c', 'accept', T0);
    acc.recordDecision('wks_a', 'accept', T0 + 60_000);
    expect(acc.workspaceCount()).toBe(3);
  });
});

describe('GoalFieldShadowAccumulatorService — edge cases', () => {
  it('recordDecision with default nowMs works', () => {
    const acc = new GoalFieldShadowAccumulatorService();
    const state = acc.recordDecision('wks_a', 'accept');
    expect(state.consecutiveAccepts).toBe(1);
    expect(state.lastCycleAt).toBeTruthy();
  });

  it('isPromotionEligible returns false for unknown workspace even with nowMs', () => {
    const acc = new GoalFieldShadowAccumulatorService();
    expect(acc.isPromotionEligible('wks_nonexistent', T0)).toBe(false);
  });

  it('same-decision repeated many times counts correctly', () => {
    const acc = new GoalFieldShadowAccumulatorService();
    for (let i = 0; i < 50; i++) {
      acc.recordDecision('wks_a', 'accept', T0 + i * 60_000);
    }
    const state = acc.getState('wks_a')!;
    expect(state.consecutiveAccepts).toBe(50);
    expect(state.totalCycles).toBe(50);
    expect(state.totalRejects).toBe(0);
    expect(state.promotionEligible).toBe(true);
  });

  it('reject with 0 preceding accepts creates ineligible state', () => {
    const acc = new GoalFieldShadowAccumulatorService();
    const state = acc.recordDecision('wks_a', 'reject', T0);
    expect(state.consecutiveAccepts).toBe(0);
    expect(state.totalRejects).toBe(1);
    expect(state.promotionEligible).toBe(false);
  });
});
