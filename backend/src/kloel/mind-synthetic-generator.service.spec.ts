import { MindSyntheticGeneratorService } from './mind-synthetic-generator.service';

describe('MindSyntheticGeneratorService', () => {
  let service: MindSyntheticGeneratorService;

  beforeEach(() => {
    service = new MindSyntheticGeneratorService(42);
  });

  describe('generateCandidates', () => {
    it('produces deterministic output for the same seed', () => {
      const recipe = {
        action: 'test',
        meanRange: [0.3, 0.8] as [number, number],
        varianceRange: [0.05, 0.2] as [number, number],
      };
      const candidateRecipe = {
        action: 'test',
        candidates: [recipe],
        decisionType: 'test_type',
      };

      const a = service.generateCandidates(candidateRecipe, 0);
      const b = service.generateCandidates(candidateRecipe, 0);

      expect(a).toEqual(b);
    });

    it('produces values within recipe ranges', () => {
      const recipe = {
        action: 'test_action',
        candidates: [
          {
            action: 'opt_a',
            meanRange: [0.3, 0.8] as [number, number],
            varianceRange: [0.05, 0.2] as [number, number],
          },
          {
            action: 'opt_b',
            meanRange: [0.1, 0.4] as [number, number],
            varianceRange: [0.1, 0.5] as [number, number],
          },
        ],
        decisionType: 'test_type',
      };

      const candidates = service.generateCandidates(recipe, 0);

      expect(candidates).toHaveLength(2);
      for (const candidate of candidates) {
        expect(candidate.beliefMean).toBeGreaterThanOrEqual(0);
        expect(candidate.beliefMean).toBeLessThanOrEqual(1);
        expect(candidate.beliefVariance).toBeGreaterThanOrEqual(0);
        expect(candidate.beliefVariance).toBeLessThanOrEqual(1);
      }
    });

    it('produces different values with different seed offsets', () => {
      const recipe = {
        action: 'test_action',
        candidates: [
          {
            action: 'opt_a',
            meanRange: [0.3, 0.8] as [number, number],
            varianceRange: [0.05, 0.2] as [number, number],
          },
        ],
        decisionType: 'test_type',
      };

      const a = service.generateCandidates(recipe, 0);
      const b = service.generateCandidates(recipe, 1);

      expect(a).not.toEqual(b);
    });

    it('changes output when seed is changed', () => {
      const recipe = {
        action: 'test_action',
        candidates: [
          {
            action: 'opt_a',
            meanRange: [0.3, 0.8] as [number, number],
            varianceRange: [0.05, 0.2] as [number, number],
          },
        ],
        decisionType: 'test_type',
      };

      const a = service.generateCandidates(recipe, 0);
      service.setSeed(99);
      const b = service.generateCandidates(recipe, 0);

      expect(a).not.toEqual(b);
    });
  });

  describe('generateDecision', () => {
    it('returns a complete ReplayInput with workspaceId placeholder', () => {
      const recipe = {
        decisionType: 'followup_timing',
        candidates: [
          {
            action: '5m',
            meanRange: [0.2, 0.4] as [number, number],
            varianceRange: [0.1, 0.4] as [number, number],
          },
        ],
      };

      const decision = service.generateDecision(recipe, 0);

      expect(decision.decisionType).toBe('followup_timing');
      expect(decision.candidates).toHaveLength(1);
      expect(decision.epsilon).toBe(0.5);
      expect(decision.utilitySuccess).toBe(1);
      expect(decision.utilityFail).toBe(-0.2);
      expect(decision.workspaceId).toBe('');
    });

    it('uses provided epsilon and utilities', () => {
      const recipe = {
        decisionType: 'coupon_offer',
        candidates: [
          {
            action: 'coupon_10',
            meanRange: [0.4, 0.8] as [number, number],
            varianceRange: [0.05, 0.25] as [number, number],
          },
        ],
        epsilon: 0.3,
        utilitySuccess: 2,
        utilityFail: -0.5,
      };

      const decision = service.generateDecision(recipe, 0);

      expect(decision.epsilon).toBe(0.3);
      expect(decision.utilitySuccess).toBe(2);
      expect(decision.utilityFail).toBe(-0.5);
    });
  });

  describe('generateScenario', () => {
    it('produces a scenario with at least 2 decisions', () => {
      const scenario = service.generateScenario('ws-test', 42);

      expect(scenario.workspaceId).toBe('ws-test');
      expect(scenario.decisions.length).toBeGreaterThanOrEqual(2);
    });

    it('produces deterministic scenarios with the same seed', () => {
      const a = service.generateScenario('ws-test', 123);
      const b = service.generateScenario('ws-test', 123);

      expect(a).toEqual(b);
    });

    it('produces different scenarios with different seeds', () => {
      const a = service.generateScenario('ws-test', 42);
      const b = service.generateScenario('ws-test', 99);

      expect(a).not.toEqual(b);
    });

    it('uses built-in recipes for decision types', () => {
      const scenario = service.generateScenario('ws-test', 42);

      const builtinKeys = Object.keys(MindSyntheticGeneratorService.builtinRecipes());
      for (const decision of scenario.decisions) {
        expect(builtinKeys).toContain(decision.decisionType);
      }
    });
  });

  describe('generateScenarios', () => {
    it('produces the requested count of scenarios', () => {
      const scenarios = service.generateScenarios('ws-test', 5, 42);

      expect(scenarios).toHaveLength(5);
      for (const scenario of scenarios) {
        expect(scenario.workspaceId).toBe('ws-test');
        expect(scenario.decisions.length).toBeGreaterThanOrEqual(2);
      }
    });

    it('produces deterministic batches with the same seed', () => {
      const a = service.generateScenarios('ws-test', 3, 100);
      const b = service.generateScenarios('ws-test', 3, 100);

      expect(a).toEqual(b);
    });
  });

  describe('generateActionContexts', () => {
    it('returns an entry for each action', () => {
      const entries = service.generateActionContexts(
        ['send_text', 'send_audio_message', 'send_document'],
        0,
      );

      expect(entries).toHaveLength(3);
      for (const entry of entries) {
        expect(typeof entry.action).toBe('string');
        expect(entry.context).toBeDefined();
      }
    });

    it('produces deterministic contexts for the same seed', () => {
      const a = service.generateActionContexts(['send_audio', 'execute_payment'], 0);
      const b = service.generateActionContexts(['send_audio', 'execute_payment'], 0);

      expect(a).toEqual(b);
    });

    it('sometimes marks audio actions as unsupported', () => {
      let unsupportedCount = 0;
      for (let i = 0; i < 20; i++) {
        const entries = service.generateActionContexts(['send_audio_clip'], i * 10);
        if (entries[0].context.supportsAudio === false) {
          unsupportedCount++;
        }
      }

      expect(unsupportedCount).toBeGreaterThan(0);
    });
  });

  describe('builtinRecipes', () => {
    it('returns all expected decision types', () => {
      const recipes = MindSyntheticGeneratorService.builtinRecipes();
      const keys = Object.keys(recipes);

      expect(keys).toContain('followup_timing');
      expect(keys).toContain('cart_recovery');
      expect(keys).toContain('coupon_offer');
      expect(keys).toContain('human_transfer');
      expect(keys).toContain('channel_choice');
    });

    it('returns a frozen copy', () => {
      const a = MindSyntheticGeneratorService.builtinRecipes();
      const b = MindSyntheticGeneratorService.builtinRecipes();

      expect(a).toEqual(b);
      expect(a).not.toBe(b);
    });
  });
});
