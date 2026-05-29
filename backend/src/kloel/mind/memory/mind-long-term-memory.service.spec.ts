import { MindLongTermMemoryService } from './mind-long-term-memory.service';

function makeMindCase(overrides: Record<string, unknown> = {}) {
  return {
    id: 'case-1',
    workspaceId: 'ws-1',
    subject: 'lead-1',
    caseType: 'price_objection',
    text: 'O preço está muito alto, dá desconto?',
    tokens: ['preço', 'muito', 'alto', 'desconto'],
    features: { channel: 'whatsapp' },
    action: 'sent_price_objection_response',
    outcome: 0.7,
    occurredAt: new Date(),
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

function makePrisma(overrides?: {
  mindCases?: Array<ReturnType<typeof makeMindCase>>;
  mindConceptDetections?: Array<{
    id: string;
    workspaceId: string;
    subject: string;
    concept: string;
    confidence: number;
    evidence: string;
    features: Record<string, unknown>;
    occurredAt: Date;
  }>;
  workspaceState?: { health?: Record<string, unknown>; id?: string } | null;
  deleteCount?: number;
  groupByResult?: Array<{ concept: string; _count: { id: number } }>;
}) {
  const mindCases = overrides?.mindCases ?? [];
  const detections = overrides?.mindConceptDetections ?? [];
  const wsState = overrides?.workspaceState;
  const deleteCount = overrides?.deleteCount ?? 0;
  const groupByResult = overrides?.groupByResult ?? [];

  return {
    mindCase: {
      findMany: jest.fn().mockImplementation((args: { where: { workspaceId: string; occurredAt?: { lt?: Date; gte?: Date } } }) => {
        const cases = mindCases.filter((c) => {
          if (c.workspaceId !== args.where.workspaceId) return false;
          if (args.where.occurredAt?.lt && c.occurredAt >= args.where.occurredAt.lt) return false;
          if (args.where.occurredAt?.gte && c.occurredAt < args.where.occurredAt.gte) return false;
          return true;
        });
        return Promise.resolve(cases);
      }),
    },
    mindConceptDetection: {
      create: jest.fn().mockResolvedValue({ id: 'det-1' }),
      deleteMany: jest.fn().mockResolvedValue({ count: deleteCount }),
      groupBy: jest.fn().mockResolvedValue(groupByResult),
      updateMany: jest.fn().mockResolvedValue({ count: 0 }),
    },
    mindWorkspaceState: {
      findUnique: jest.fn().mockResolvedValue(wsState !== undefined ? wsState : null),
      update: jest.fn().mockResolvedValue(undefined),
      create: jest.fn().mockResolvedValue(undefined),
    },
    $executeRaw: jest.fn().mockResolvedValue(undefined),
  };
}

function makeSpine() {
  return { emit: jest.fn().mockResolvedValue(undefined) };
}

describe('MindLongTermMemoryService', () => {
  describe('consolidate', () => {
    it('returns zeroes when consolidation ran recently (idempotent)', async () => {
      const prisma = makePrisma({
        workspaceState: { health: { lastConsolidationAt: new Date().toISOString() } },
      });
      const spine = makeSpine();
      const svc = new MindLongTermMemoryService(prisma as never, spine as never);

      const result = await svc.consolidate('ws-1');

      expect(result).toEqual({ consolidated: 0, pruned: 0 });
      expect(spine.emit).not.toHaveBeenCalled();
      expect(prisma.mindCase.findMany).not.toHaveBeenCalled();
    });

    it('runs consolidation when no watermark exists (first run)', async () => {
      const now = Date.now();
      const oldCase = makeMindCase({
        id: 'old-1',
        text: 'Preço muito alto quero desconto agora',
        caseType: 'price_objection',
        occurredAt: new Date(now - 10 * 24 * 3600 * 1000),
      });
      const recentCase = makeMindCase({
        id: 'recent-1',
        text: 'Preço alto desconto quero favor',
        caseType: 'price_objection',
        occurredAt: new Date(now - 1 * 3600 * 1000),
      });
      const prisma = makePrisma({
        mindCases: [oldCase, recentCase],
        workspaceState: null,
      });
      const spine = makeSpine();
      const svc = new MindLongTermMemoryService(prisma as never, spine as never);

      const result = await svc.consolidate('ws-1');

      expect(result.consolidated).toBeGreaterThanOrEqual(1);
      expect(prisma.mindConceptDetection.create).toHaveBeenCalled();
      expect(spine.emit).toHaveBeenCalledWith(
        expect.objectContaining({
          eventName: 'cognition.memory.consolidated',
          workspaceId: 'ws-1',
        }),
      );
    });

    it('handles empty case memory (no data)', async () => {
      const prisma = makePrisma({ mindCases: [], workspaceState: null });
      const spine = makeSpine();
      const svc = new MindLongTermMemoryService(prisma as never, spine as never);

      const result = await svc.consolidate('ws-1');

      expect(result).toEqual({ consolidated: 0, pruned: 0 });
    });

    it('prunes low-confidence detections', async () => {
      const now = Date.now();
      const oldCase = makeMindCase({
        id: 'old-1',
        text: 'Velho e irrelevante',
        caseType: 'dead_lead',
        occurredAt: new Date(now - 10 * 24 * 3600 * 1000),
      });
      const prisma = makePrisma({
        mindCases: [oldCase],
        workspaceState: null,
        deleteCount: 3,
      });
      const spine = makeSpine();
      const svc = new MindLongTermMemoryService(prisma as never, spine as never);

      const result = await svc.consolidate('ws-1');

      expect(result.pruned).toBe(3);
      expect(prisma.mindConceptDetection.deleteMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            workspaceId: 'ws-1',
            confidence: { lt: 0.3 },
          }),
        }),
      );
    });

    it('respects workspace isolation', async () => {
      const now = Date.now();
      const ws1Case = makeMindCase({
        id: 'ws1-1',
        workspaceId: 'ws-1',
        text: 'Test case ws1',
        occurredAt: new Date(now - 10 * 24 * 3600 * 1000),
      });
      const ws2Case = makeMindCase({
        id: 'ws2-1',
        workspaceId: 'ws-2',
        text: 'Test case ws2',
        occurredAt: new Date(now - 10 * 24 * 3600 * 1000),
      });
      const prisma = makePrisma({ mindCases: [ws1Case, ws2Case], workspaceState: null });
      const svc = new MindLongTermMemoryService(prisma as never);

      const result = await svc.consolidate('ws-1');

      // Only ws-1 cases were considered — findMany received workspaceId filter
      expect(result.consolidated).toBe(0); // No recent cases to match with
    });

    it('promotes high-frequency concept patterns', async () => {
      const now = Date.now();
      const oldCase = makeMindCase({
        id: 'old-1',
        text: 'Quero comprar agora mesmo, me manda o link',
        caseType: 'hot_lead',
        occurredAt: new Date(now - 10 * 24 * 3600 * 1000),
      });
      const recentCase = makeMindCase({
        id: 'recent-1',
        text: 'Quero comprar hoje, manda o link',
        caseType: 'hot_lead',
        occurredAt: new Date(now - 1 * 3600 * 1000),
      });
      const prisma = makePrisma({
        mindCases: [oldCase, recentCase],
        workspaceState: null,
        groupByResult: [{ concept: 'hot_lead', _count: { id: 15 } }],
      });
      const svc = new MindLongTermMemoryService(prisma as never);

      const result = await svc.consolidate('ws-1');

      expect(result.consolidated).toBeGreaterThanOrEqual(1);
      expect(prisma.mindConceptDetection.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ workspaceId: 'ws-1', concept: 'hot_lead' }),
          data: { confidence: { multiply: 1.1 } },
        }),
      );
    });

    it('works without spine (optional)', async () => {
      const prisma = makePrisma({ mindCases: [], workspaceState: null });
      const svc = new MindLongTermMemoryService(prisma as never);

      const result = await svc.consolidate('ws-1');

      expect(result).toEqual({ consolidated: 0, pruned: 0 });
    });

    it('returns zeroes on prisma failure (never throws)', async () => {
      const prisma = {
        mindWorkspaceState: {
          findUnique: jest.fn().mockRejectedValue(new Error('db down')),
        },
      };
      const svc = new MindLongTermMemoryService(prisma as never);

      const result = await svc.consolidate('ws-1');

      expect(result).toEqual({ consolidated: 0, pruned: 0 });
    });

    it('records watermark after successful consolidation', async () => {
      const now = Date.now();
      const oldCase = makeMindCase({
        text: 'Quero comprar o produto, manda o link de pagamento',
        occurredAt: new Date(now - 10 * 24 * 3600 * 1000),
      });
      const recentCase = makeMindCase({
        text: 'Quero comprar esse produto, qual o link do pix?',
        occurredAt: new Date(now - 1 * 3600 * 1000),
      });
      const prisma = makePrisma({ mindCases: [oldCase, recentCase], workspaceState: null });
      const svc = new MindLongTermMemoryService(prisma as never);

      await svc.consolidate('ws-1');

      // Watermark should have been recorded
      expect(prisma.mindWorkspaceState.create).toHaveBeenCalled();
      const createCall = prisma.mindWorkspaceState.create.mock.calls[0]?.[0];
      expect(createCall?.data?.health?.lastConsolidationAt).toBeDefined();
    });
  });
});
