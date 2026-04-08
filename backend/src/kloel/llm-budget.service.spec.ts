import { ForbiddenException } from '@nestjs/common';
import { LLMBudgetService, estimateChatCostCents } from './llm-budget.service';

function makeFakeRedis(initial: Record<string, string> = {}) {
  const store = new Map(Object.entries(initial));
  return {
    async get(key: string) {
      return store.get(key) ?? null;
    },
    async set(key: string, value: string) {
      store.set(key, value);
      return 'OK';
    },
    async incrby(key: string, delta: number) {
      const current = Number(store.get(key) ?? '0');
      const next = current + delta;
      store.set(key, String(next));
      return next;
    },
    async expire(_key: string, _ttl: number) {
      return 1;
    },
    _breakNext() {
      const origGet = this.get.bind(this);
      this.get = async () => {
        this.get = origGet;
        throw new Error('redis down');
      };
    },
  };
}

describe('LLMBudgetService — I16 fail-closed cost enforcement', () => {
  let redis: ReturnType<typeof makeFakeRedis>;
  let service: LLMBudgetService;

  beforeEach(() => {
    delete process.env.LLM_BUDGET_DEFAULT_CENTS;
    redis = makeFakeRedis();
    service = new LLMBudgetService(redis as any);
  });

  describe('assertBudget', () => {
    it('allows a call that fits within the default budget', async () => {
      // Default is 10_000 cents; a 100 cent estimate is safe.
      await expect(service.assertBudget('ws-1', 100)).resolves.toBeUndefined();
    });

    it('rejects when estimated cost alone exceeds the budget (I16)', async () => {
      process.env.LLM_BUDGET_DEFAULT_CENTS = '1000';
      service = new LLMBudgetService(redis as any);
      await expect(service.assertBudget('ws-1', 2000)).rejects.toThrow(ForbiddenException);
    });

    it('rejects when spent + estimated would exceed the budget', async () => {
      process.env.LLM_BUDGET_DEFAULT_CENTS = '1000';
      service = new LLMBudgetService(redis as any);
      await service.recordSpend('ws-1', 900);
      await expect(service.assertBudget('ws-1', 200)).rejects.toThrow(ForbiddenException);
    });

    it('allows when spent + estimated exactly equals the budget', async () => {
      process.env.LLM_BUDGET_DEFAULT_CENTS = '1000';
      service = new LLMBudgetService(redis as any);
      await service.recordSpend('ws-1', 500);
      // 500 + 500 = 1000, which is NOT greater than 1000.
      await expect(service.assertBudget('ws-1', 500)).resolves.toBeUndefined();
    });

    it('fails closed when Redis throws — does NOT degrade to pass-through', async () => {
      redis._breakNext();
      await expect(service.assertBudget('ws-1', 100)).rejects.toThrow(ForbiddenException);
    });

    it('rejects a negative estimate as a caller bug', async () => {
      await expect(service.assertBudget('ws-1', -1)).rejects.toThrow();
    });

    it("scopes by workspace — one workspace cannot burn another's budget", async () => {
      process.env.LLM_BUDGET_DEFAULT_CENTS = '1000';
      service = new LLMBudgetService(redis as any);
      await service.recordSpend('ws-A', 900);
      // ws-B still has a full budget available.
      await expect(service.assertBudget('ws-B', 900)).resolves.toBeUndefined();
    });
  });

  describe('recordSpend', () => {
    it('accumulates across multiple calls', async () => {
      await service.recordSpend('ws-1', 100);
      await service.recordSpend('ws-1', 200);
      await service.recordSpend('ws-1', 300);
      expect(await service.getCurrentSpendCents('ws-1')).toBe(600);
    });

    it('silently ignores negative or NaN amounts', async () => {
      await service.recordSpend('ws-1', -500);
      await service.recordSpend('ws-1', NaN);
      expect(await service.getCurrentSpendCents('ws-1')).toBe(0);
    });

    it('degrades gracefully on Redis failure — does NOT throw', async () => {
      // Swap incrby to throw; the method should swallow and log.
      (redis as any).incrby = jest.fn().mockRejectedValue(new Error('redis down'));
      await expect(service.recordSpend('ws-1', 100)).resolves.toBeUndefined();
    });
  });

  describe('getCurrentSpendCents', () => {
    it('returns 0 for a workspace with no history', async () => {
      expect(await service.getCurrentSpendCents('ws-unknown')).toBe(0);
    });

    it('returns 0 on Redis failure (best-effort)', async () => {
      redis._breakNext();
      expect(await service.getCurrentSpendCents('ws-1')).toBe(0);
    });
  });
});

describe('estimateChatCostCents', () => {
  it('returns an integer non-negative value', () => {
    const cost = estimateChatCostCents({ inputChars: 500, maxOutputTokens: 100 });
    expect(Number.isInteger(cost)).toBe(true);
    expect(cost).toBeGreaterThanOrEqual(0);
  });

  it('scales with input size', () => {
    const small = estimateChatCostCents({ inputChars: 100, maxOutputTokens: 100 });
    const big = estimateChatCostCents({ inputChars: 10_000, maxOutputTokens: 100 });
    expect(big).toBeGreaterThan(small);
  });

  it('scales with output size', () => {
    const small = estimateChatCostCents({ inputChars: 100, maxOutputTokens: 50 });
    const big = estimateChatCostCents({ inputChars: 100, maxOutputTokens: 5000 });
    expect(big).toBeGreaterThan(small);
  });

  it('honors explicit rate overrides', () => {
    const expensive = estimateChatCostCents({
      inputChars: 1000,
      maxOutputTokens: 500,
      inputRateCentsPer1k: 1000,
      outputRateCentsPer1k: 2000,
    });
    const cheap = estimateChatCostCents({
      inputChars: 1000,
      maxOutputTokens: 500,
      inputRateCentsPer1k: 1,
      outputRateCentsPer1k: 2,
    });
    expect(expensive).toBeGreaterThan(cheap);
  });
});
