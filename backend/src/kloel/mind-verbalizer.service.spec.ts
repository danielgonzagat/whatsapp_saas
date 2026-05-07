import { MindVerbalizerService } from './mind-verbalizer.service';

function buildBelief(
  overrides: Partial<{
    subject: string;
    predicate: string;
    context: Record<string, unknown>;
    mean: number;
    samples: number;
  }> = {},
) {
  return {
    id: 'id',
    workspaceId: 'ws-1',
    subject: overrides.subject ?? 'contact:1',
    predicate: overrides.predicate ?? 'P(reply|template,hour,channel)',
    context: overrides.context ?? { channel: 'whatsapp', hour: 14 },
    mean: overrides.mean ?? 0.65,
    variance: 0.01,
    samples: overrides.samples ?? 42,
    alpha: 10,
    beta: 5,
  };
}

function harnessZero() {
  return { lift: 0, baselineMean: 0, mindMean: 0, n: 0, pZScore: 0 };
}

describe('MindVerbalizerService', () => {
  describe('narrate (rules-based fallback when no OpenAI client)', () => {
    const config = { get: jest.fn().mockReturnValue(undefined) };
    const budget = {
      assertBudget: jest.fn().mockResolvedValue(undefined),
      recordSpend: jest.fn().mockResolvedValue(undefined),
    };

    it('says empty state when no beliefs exist', async () => {
      const beliefs = { list: jest.fn().mockResolvedValue([]) };
      const policy = { harness: jest.fn().mockResolvedValue(harnessZero()) };

      const service = new MindVerbalizerService(
        beliefs as never,
        policy as never,
        config as never,
        budget as never,
      );
      const result = await service.narrate('ws-1');

      expect(result).toContain('A MIND ainda está formando');
      expect(result).toContain('não há dados suficientes');
    });

    it('produces structured briefing with belief phrases and lift metrics', async () => {
      const beliefs = {
        list: jest
          .fn()
          .mockResolvedValueOnce([
            buildBelief({
              subject: 'contact:1',
              predicate: 'P(reply|template,hour,channel)',
              context: { channel: 'whatsapp', hour: 14 },
              mean: 0.648,
              samples: 42,
            }),
            buildBelief({
              subject: 'contact:2',
              predicate: 'P(reply|template,hour,channel)',
              context: { channel: 'whatsapp', hour: 10 },
              mean: 0.312,
              samples: 15,
            }),
          ])
          .mockResolvedValueOnce([
            buildBelief({
              subject: 'workspace:1',
              predicate: 'P(conversion|segment,price_band,channel,hour)',
              context: { channel: 'whatsapp', hour: 14, segment: 'premium' },
              mean: 0.312,
              samples: 20,
            }),
          ])
          .mockResolvedValueOnce([]),
      };
      const policy = {
        harness: jest.fn().mockResolvedValue({
          lift: 0.12,
          baselineMean: 0.3,
          mindMean: 0.34,
          n: 10,
          pZScore: 1.2,
        }),
      };

      const service = new MindVerbalizerService(
        beliefs as never,
        policy as never,
        config as never,
        budget as never,
      );
      const result = await service.narrate('ws-1');

      expect(result).toContain('Estado atual da MIND');
      expect(result).toContain('Probabilidade de resposta');
      expect(result).toContain('Probabilidade de conversão');
      expect(result).toContain('77 observações totais');
    });

    it('includes lift metrics when lifts are meaningful', async () => {
      const beliefs = {
        list: jest
          .fn()
          .mockResolvedValueOnce([buildBelief()])
          .mockResolvedValueOnce([])
          .mockResolvedValueOnce([]),
      };
      const policy = {
        harness: jest.fn().mockResolvedValue({
          lift: 0.12,
          baselineMean: 0.3,
          mindMean: 0.34,
          n: 10,
          pZScore: 1.2,
        }),
      };

      const service = new MindVerbalizerService(
        beliefs as never,
        policy as never,
        config as never,
        budget as never,
      );
      const result = await service.narrate('ws-1');

      expect(result).toContain('Métricas de decisão');
      expect(result).toContain('melhoria');
      expect(result).toMatch(/\d+%/);
    });

    it('does not include lift section when lifts are below 5% threshold', async () => {
      const beliefs = {
        list: jest
          .fn()
          .mockResolvedValueOnce([buildBelief()])
          .mockResolvedValueOnce([])
          .mockResolvedValueOnce([]),
      };
      const policy = {
        harness: jest
          .fn()
          .mockResolvedValue({ lift: 0.02, baselineMean: 0.3, mindMean: 0.31, n: 8, pZScore: 0.5 }),
      };

      const service = new MindVerbalizerService(
        beliefs as never,
        policy as never,
        config as never,
        budget as never,
      );
      const result = await service.narrate('ws-1');

      expect(result).not.toContain('Métricas de decisão');
    });

    it('describes negative lifts correctly', async () => {
      const beliefs = {
        list: jest
          .fn()
          .mockResolvedValueOnce([buildBelief()])
          .mockResolvedValueOnce([])
          .mockResolvedValueOnce([]),
      };
      const policy = {
        harness: jest.fn().mockResolvedValue({
          lift: -0.15,
          baselineMean: 0.4,
          mindMean: 0.34,
          n: 12,
          pZScore: -1.8,
        }),
      };

      const service = new MindVerbalizerService(
        beliefs as never,
        policy as never,
        config as never,
        budget as never,
      );
      const result = await service.narrate('ws-1');

      expect(result).toContain('queda');
      expect(result).toContain('15%');
    });

    it('describes belief means with correct qualitative labels', async () => {
      const beliefs = {
        list: jest
          .fn()
          .mockResolvedValueOnce([
            buildBelief({ mean: 0.1, samples: 30 }),
            buildBelief({ mean: 0.9, samples: 30 }),
          ])
          .mockResolvedValueOnce([])
          .mockResolvedValueOnce([]),
      };
      const policy = { harness: jest.fn().mockResolvedValue(harnessZero()) };

      const service = new MindVerbalizerService(
        beliefs as never,
        policy as never,
        config as never,
        budget as never,
      );
      const result = await service.narrate('ws-1');

      expect(result).toContain('muito baixa');
      expect(result).toContain('muito alta');
    });
  });

  describe('narrate (LLM unavailable — falls back to rules-based)', () => {
    it('falls back when LLM key is empty string', async () => {
      const beliefs = {
        list: jest
          .fn()
          .mockResolvedValueOnce([buildBelief()])
          .mockResolvedValueOnce([])
          .mockResolvedValueOnce([]),
      };
      const policy = { harness: jest.fn().mockResolvedValue(harnessZero()) };
      const config = { get: jest.fn().mockReturnValue('') };
      const budget = {
        assertBudget: jest.fn().mockResolvedValue(undefined),
        recordSpend: jest.fn().mockResolvedValue(undefined),
      };

      const service = new MindVerbalizerService(
        beliefs as never,
        policy as never,
        config as never,
        budget as never,
      );
      const result = await service.narrate('ws-1');

      expect(result).toContain('Estado atual da MIND');
    });
  });

  describe('buildLlmPrompt (via indirect coverage)', () => {
    it('includes new decision types in lift query', async () => {
      const beliefs = {
        list: jest
          .fn()
          .mockResolvedValueOnce([buildBelief()])
          .mockResolvedValueOnce([])
          .mockResolvedValueOnce([]),
      };
      const policy = { harness: jest.fn().mockResolvedValue(harnessZero()) };
      const config = { get: jest.fn().mockReturnValue(undefined) };
      const budget = {
        assertBudget: jest.fn().mockResolvedValue(undefined),
        recordSpend: jest.fn().mockResolvedValue(undefined),
      };

      const service = new MindVerbalizerService(
        beliefs as never,
        policy as never,
        config as never,
        budget as never,
      );
      await service.narrate('ws-1');

      const harnessCalls = policy.harness.mock.calls.map((call: string[]) => call[1]);
      expect(harnessCalls).toContain('followup_timing');
      expect(harnessCalls).toContain('message_format');
      expect(harnessCalls).toContain('objection_response');
      expect(harnessCalls).toContain('coupon_offer');
      expect(harnessCalls).toContain('cart_recovery');
    });
  });
});
