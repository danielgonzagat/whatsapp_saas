import { MindCausalModelService } from './mind-causal-model.service';

function makeMindCase(overrides: Record<string, unknown> = {}) {
  return {
    id: 'case-1',
    workspaceId: 'ws-1',
    subject: 'lead-1',
    caseType: 'sale_closed',
    text: 'Lead comprou o produto após oferecer desconto',
    tokens: ['lead', 'comprou', 'produto', 'após', 'oferecer', 'desconto'],
    features: { channel: 'whatsapp' },
    action: 'offered_discount',
    outcome: 0.85,
    occurredAt: new Date(),
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

function makePrisma(mindCases: Array<ReturnType<typeof makeMindCase>> = []) {
  return {
    mindCase: {
      findMany: jest
        .fn()
        .mockImplementation((args: { where: { workspaceId: string; action?: string } }) => {
          const cases = mindCases.filter((c) => {
            if (c.workspaceId !== args.where.workspaceId) {
              return false;
            }
            if (args.where.action !== undefined && c.action !== args.where.action) {
              return false;
            }
            return true;
          });
          return Promise.resolve(cases);
        }),
    },
  };
}

function makeSpine() {
  return { emit: jest.fn().mockResolvedValue(undefined) };
}

function makeSurprise() {
  return { computeSurprise: jest.fn().mockReturnValue(0.5) };
}

describe('MindCausalModelService', () => {
  describe('inferCausality', () => {
    it('returns empty effects when no historical data exists', async () => {
      const prisma = makePrisma([]);
      const spine = makeSpine();
      const svc = new MindCausalModelService(prisma as never, undefined, spine as never);

      const result = await svc.inferCausality('ws-1', 'sent_promo');

      expect(result.likelyEffects).toEqual([]);
      expect(result.basis).toBe('no_historical_data');
      expect(spine.emit).toHaveBeenCalledWith(
        expect.objectContaining({
          eventName: 'cognition.causal.inferred',
          workspaceId: 'ws-1',
        }),
      );
    });

    it('infers likely effects from historical cases', async () => {
      const now = Date.now();
      const cases = [
        makeMindCase({
          id: 'c1',
          caseType: 'sale_closed',
          outcome: 0.9,
          occurredAt: new Date(now - 3600_000),
        }),
        makeMindCase({
          id: 'c2',
          caseType: 'sale_closed',
          outcome: 0.8,
          occurredAt: new Date(now - 7200_000),
        }),
        makeMindCase({
          id: 'c3',
          caseType: 'sale_closed',
          outcome: 0.85,
          occurredAt: new Date(now - 10800_000),
        }),
        makeMindCase({
          id: 'c4',
          caseType: 'sale_closed',
          outcome: 0.7,
          occurredAt: new Date(now - 14400_000),
        }),
        makeMindCase({
          id: 'c5',
          caseType: 'no_reply',
          outcome: 0.1,
          occurredAt: new Date(now - 3600_000),
        }),
      ];
      const prisma = makePrisma(cases);
      const spine = makeSpine();
      const surprise = makeSurprise();
      const svc = new MindCausalModelService(prisma as never, surprise as never, spine as never);

      const result = await svc.inferCausality('ws-1', 'offered_discount');

      expect(result.likelyEffects.length).toBeGreaterThan(0);
      expect(result.likelyEffects[0]!.effect).toBe('sale_closed');
      expect(result.likelyEffects[0]!.confidence).toBeGreaterThan(0);
      expect(result.basis).toBe('moderate_historical_pattern');
    });

    it('returns weak signal basis for few cases', async () => {
      const now = Date.now();
      const cases = [
        makeMindCase({
          id: 'c1',
          caseType: 'sale_closed',
          outcome: 0.9,
          occurredAt: new Date(now - 3600_000),
        }),
      ];
      const prisma = makePrisma(cases);
      const spine = makeSpine();
      const svc = new MindCausalModelService(prisma as never, undefined, spine as never);

      const result = await svc.inferCausality('ws-1', 'offered_discount');

      expect(result.likelyEffects).toHaveLength(1);
      expect(result.basis).toBe('weak_historical_signal');
    });

    it('returns strong basis for many cases', async () => {
      const now = Date.now();
      const cases = Array.from({ length: 12 }, (_, i) =>
        makeMindCase({
          id: `c${i}`,
          caseType: 'sale_closed',
          outcome: 0.8,
          occurredAt: new Date(now - i * 3600_000),
        }),
      );
      const prisma = makePrisma(cases);
      const svc = new MindCausalModelService(prisma as never);

      const result = await svc.inferCausality('ws-1', 'offered_discount');

      expect(result.basis).toBe('strong_historical_pattern');
    });

    it('respects workspace isolation', async () => {
      const now = Date.now();
      const ws1Case = makeMindCase({
        id: 'ws1-1',
        workspaceId: 'ws-1',
        caseType: 'sale_closed',
        occurredAt: new Date(now - 3600_000),
      });
      const ws2Case = makeMindCase({
        id: 'ws2-1',
        workspaceId: 'ws-2',
        caseType: 'lost_lead',
        occurredAt: new Date(now - 3600_000),
      });
      const prisma = makePrisma([ws1Case, ws2Case]);
      const svc = new MindCausalModelService(prisma as never);

      const result = await svc.inferCausality('ws-1', 'offered_discount');

      // Only ws-1 case should be considered
      expect(result.likelyEffects).toHaveLength(1);
      expect(result.likelyEffects[0]!.effect).toBe('sale_closed');
    });

    it('returns zero effects on prisma failure (never throws)', async () => {
      const prisma = {
        mindCase: {
          findMany: jest.fn().mockRejectedValue(new Error('db down')),
        },
      };
      const svc = new MindCausalModelService(prisma as never);

      const result = await svc.inferCausality('ws-1', 'any_action');

      expect(result.likelyEffects).toEqual([]);
      expect(result.basis).toBe('error');
    });

    it('works without spine (optional)', async () => {
      const prisma = makePrisma([]);
      const svc = new MindCausalModelService(prisma as never);

      const result = await svc.inferCausality('ws-1', 'any_action');

      expect(result.likelyEffects).toEqual([]);
      expect(result.basis).toBe('no_historical_data');
    });
  });

  describe('simulateScenario', () => {
    it('returns unknown when no historical data exists', async () => {
      const prisma = makePrisma([]);
      const spine = makeSpine();
      const svc = new MindCausalModelService(prisma as never, undefined, spine as never);

      const result = await svc.simulateScenario('ws-1', 'offer_premium_plan');

      expect(result.expectedOutcome).toBe('unknown');
      expect(result.uncertainty).toBe(1.0);
      expect(spine.emit).toHaveBeenCalledWith(
        expect.objectContaining({ eventName: 'cognition.causal.simulated' }),
      );
    });

    it('simulates outcome from similar past actions', async () => {
      const now = Date.now();
      const cases = [
        makeMindCase({
          id: 'c1',
          action: 'offered_premium_discount',
          caseType: 'sale_closed',
          outcome: 0.9,
          occurredAt: new Date(now - 3600_000),
        }),
        makeMindCase({
          id: 'c2',
          action: 'offered_premium_bonus',
          caseType: 'sale_closed',
          outcome: 0.85,
          occurredAt: new Date(now - 7200_000),
        }),
        makeMindCase({
          id: 'c3',
          action: 'sent_low_quality_template',
          caseType: 'no_reply',
          outcome: 0.1,
          occurredAt: new Date(now - 3600_000),
        }),
      ];
      const prisma = makePrisma(cases);
      const spine = makeSpine();
      const svc = new MindCausalModelService(prisma as never, undefined, spine as never);

      const result = await svc.simulateScenario('ws-1', 'offer_premium_discount');

      expect(result.expectedOutcome).not.toBe('unknown');
      expect(result.uncertainty).toBeLessThan(1.0);
    });

    it('returns high uncertainty for few similar cases', async () => {
      const now = Date.now();
      const cases = [
        makeMindCase({
          id: 'c1',
          action: 'offer_premium_plan',
          outcome: 0.9,
          occurredAt: new Date(now - 3600_000),
        }),
      ];
      const prisma = makePrisma(cases);
      const svc = new MindCausalModelService(prisma as never);

      const result = await svc.simulateScenario('ws-1', 'offer premium plan');

      expect(result.uncertainty).toBe(0.7);
    });

    it('returns unknown for empty hypothetical action text', async () => {
      const now = Date.now();
      const cases = [makeMindCase({ occurredAt: new Date(now - 3600_000) })];
      const prisma = makePrisma(cases);
      const svc = new MindCausalModelService(prisma as never);

      const result = await svc.simulateScenario('ws-1', '...');

      // '...' tokenizes to empty after filtering tokens <= 2 chars
      expect(result.expectedOutcome).toBe('unknown');
    });

    it('returns unknown on prisma failure (never throws)', async () => {
      const prisma = {
        mindCase: {
          findMany: jest.fn().mockRejectedValue(new Error('db down')),
        },
      };
      const svc = new MindCausalModelService(prisma as never);

      const result = await svc.simulateScenario('ws-1', 'test action');

      expect(result.expectedOutcome).toBe('unknown');
      expect(result.uncertainty).toBe(1.0);
    });

    it('works without spine (optional)', async () => {
      const now = Date.now();
      const cases = [
        makeMindCase({
          id: 'c1',
          action: 'offer_discount',
          outcome: 0.8,
          occurredAt: new Date(now - 3600_000),
        }),
      ];
      const prisma = makePrisma(cases);
      const svc = new MindCausalModelService(prisma as never);

      const result = await svc.simulateScenario('ws-1', 'offer discount');

      expect(result.expectedOutcome).not.toBe('unknown');
    });
  });
});
