import { MindReplayService } from './mind-replay.service';

describe('MindReplayService', () => {
  let service: MindReplayService;

  beforeEach(() => {
    service = new MindReplayService();
  });

  describe('replayDecision', () => {
    it('selects the action with the lowest EFE (best expected free energy)', () => {
      const result = service.replayDecision({
        workspaceId: 'ws-1',
        decisionType: 'followup_timing',
        candidates: [
          { action: 'aggressive', beliefMean: 0.4, beliefVariance: 0.3 },
          { action: 'safe', beliefMean: 0.8, beliefVariance: 0.02 },
        ],
        baseline: 'safe',
      });

      expect(result.chosen).toBe('safe');
      expect(result.steps).toHaveLength(2);
      expect(result.steps[0].action).toBe('safe');
      expect(result.steps[0].efe).toBeLessThan(result.steps[1].efe);
    });

    it('selects the best option even when all beliefs are low', () => {
      const result = service.replayDecision({
        workspaceId: 'ws-1',
        decisionType: 'cart_recovery',
        candidates: [
          { action: 'proof', beliefMean: 0.1, beliefVariance: 0.5 },
          { action: 'discount', beliefMean: 0.15, beliefVariance: 0.4 },
          { action: 'help', beliefMean: 0.12, beliefVariance: 0.35 },
        ],
        baseline: 'help',
      });

      expect(result.chosen).toBe('discount');
      expect(result.steps).toHaveLength(3);
    });

    it('falls back to baseline when it differs from chosen', () => {
      const result = service.replayDecision({
        workspaceId: 'ws-1',
        decisionType: 'coupon_offer',
        candidates: [
          { action: 'coupon_20', beliefMean: 0.9, beliefVariance: 0.01 },
          { action: 'no_coupon', beliefMean: 1.0, beliefVariance: 0.0 },
        ],
        baseline: 'no_coupon',
      });

      expect(result.chosen).toBe('no_coupon');
      expect(result.baselineAction).toBe('no_coupon');
    });

    it('returns pass when no candidates are provided', () => {
      const result = service.replayDecision({
        workspaceId: 'ws-1',
        decisionType: 'human_transfer',
        candidates: [],
        baseline: 'transfer_now',
      });

      expect(result.chosen).toBe('pass');
    });
  });

  describe('replayScenario', () => {
    it('replays a multi-decision scenario and computes baseline match rate', () => {
      const report = service.replayScenario({
        workspaceId: 'ws-1',
        decisions: [
          {
            workspaceId: 'ws-1',
            decisionType: 'followup_timing',
            candidates: [
              { action: '5m', beliefMean: 0.3, beliefVariance: 0.2 },
              { action: '30m', beliefMean: 0.7, beliefVariance: 0.1 },
            ],
            baseline: '30m',
          },
          {
            workspaceId: 'ws-1',
            decisionType: 'cart_recovery',
            candidates: [
              { action: 'proof', beliefMean: 0.9, beliefVariance: 0.01 },
              { action: 'help', beliefMean: 0.1, beliefVariance: 0.5 },
            ],
            baseline: 'proof',
          },
          {
            workspaceId: 'ws-1',
            decisionType: 'coupon_offer',
            candidates: [
              { action: 'coupon_10', beliefMean: 0.6, beliefVariance: 0.15 },
              { action: 'no_coupon', beliefMean: 0.8, beliefVariance: 0.05 },
            ],
            baseline: 'coupon_10',
          },
        ],
      });

      expect(report.workspaceId).toBe('ws-1');
      expect(report.totalDecisions).toBe(3);
      expect(report.baselineMatches).toBe(2);
      expect(report.baselineMatchRate).toBeCloseTo(2 / 3);
    });

    it('returns zero match rate for an empty scenario', () => {
      const report = service.replayScenario({
        workspaceId: 'ws-1',
        decisions: [],
      });

      expect(report.totalDecisions).toBe(0);
      expect(report.baselineMatchRate).toBe(0);
    });
  });

  describe('compareLift', () => {
    it('computes positive lift when MIND outperforms baseline', () => {
      const lift = service.compareLift({
        mindMean: 0.8,
        baselineMean: 0.5,
        mindSamples: 100,
        baselineSamples: 50,
      });

      expect(lift).toBeCloseTo(0.6);
    });

    it('computes negative lift when MIND underperforms baseline', () => {
      const lift = service.compareLift({
        mindMean: 0.3,
        baselineMean: 0.5,
        mindSamples: 100,
        baselineSamples: 50,
      });

      expect(lift).toBeCloseTo(-0.4);
    });

    it('returns zero lift when baseline mean is zero', () => {
      const lift = service.compareLift({
        mindMean: 0.8,
        baselineMean: 0,
        mindSamples: 100,
        baselineSamples: 50,
      });

      expect(lift).toBe(0);
    });
  });
});
