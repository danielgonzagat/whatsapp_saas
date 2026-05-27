import { MindVerbalizerService } from './mind-verbalizer.service';

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
  });

  describe('narrate (LLM unavailable — falls back to rules-based)', () => {});

  describe('buildLlmPrompt (via indirect coverage)', () => {});
});
