import { MindCuriosityService } from './mind-curiosity.service';

function makePrisma(overrides?: {
  detections?: Array<{
    id: string;
    workspaceId: string;
    concept: string;
    confidence: number;
    occurredAt: Date;
  }>;
  beliefs?: Array<{
    id: string;
    workspaceId: string;
    subject: string;
    predicate: string;
    mean: number;
    variance: number;
    samples: number;
  }>;
}) {
  const detections = overrides?.detections ?? [];
  const beliefs = overrides?.beliefs ?? [];
  return {
    mindConceptDetection: {
      findMany: jest
        .fn()
        .mockImplementation((args: { where: { workspaceId: string } }) =>
          Promise.resolve(detections.filter((d) => d.workspaceId === args.where.workspaceId)),
        ),
    },
    mindBelief: {
      findMany: jest.fn().mockImplementation(
        (args: {
          where: {
            workspaceId: string;
            variance?: { gte: number };
            samples?: { gte: number };
          };
        }) =>
          Promise.resolve(
            beliefs.filter((b) => {
              if (b.workspaceId !== args.where.workspaceId) {
                return false;
              }
              if (args.where.variance?.gte !== undefined && b.variance < args.where.variance.gte) {
                return false;
              }
              if (args.where.samples?.gte !== undefined && b.samples < args.where.samples.gte) {
                return false;
              }
              return true;
            }),
          ),
      ),
    },
  };
}

function makeSpine() {
  return { emit: jest.fn().mockResolvedValue(undefined) };
}

describe('MindCuriosityService', () => {
  describe('identifyKnowledgeGap', () => {
    it('returns null when all concepts have sufficient coverage and no high-variance beliefs', async () => {
      const now = new Date();
      const detections = [
        'price_objection',
        'trust_objection',
        'deadline_objection',
        'competitor_comparison',
        'hot_lead',
        'reheatable_cold_lead',
        'dead_lead',
        'imminent_purchase',
        'fatigue_risk',
        'audio_preference',
        'night_preference',
        'high_ticket_product',
        'tight_margin_product',
      ].flatMap((concept, ci) =>
        Array.from({ length: 6 }, (_, i) => ({
          id: `d-${ci}-${i}`,
          workspaceId: 'ws-1',
          concept,
          confidence: 0.7,
          occurredAt: new Date(now.getTime() - i * 3600_000),
        })),
      );
      const prisma = makePrisma({ detections });
      const spine = makeSpine();
      const svc = new MindCuriosityService(prisma as never, spine as never);

      const result = await svc.identifyKnowledgeGap('ws-1');

      expect(result).toBeNull();
      expect(spine.emit).not.toHaveBeenCalled();
    });

    it('returns a gap for a concept with zero detections', async () => {
      const prisma = makePrisma({ detections: [] });
      const spine = makeSpine();
      const svc = new MindCuriosityService(prisma as never, spine as never);

      const result = await svc.identifyKnowledgeGap('ws-1');

      expect(result).not.toBeNull();
      expect(result.topic).toContain('concept:');
      expect(result.reason).toContain('0 detections');
      expect(spine.emit).toHaveBeenCalledWith(
        expect.objectContaining({
          eventName: 'cognition.curiosity.gap_identified',
          workspaceId: 'ws-1',
        }),
      );
    });

    it('returns null when all concepts are well-covered', async () => {
      const now = new Date();
      const detections = [
        'price_objection',
        'trust_objection',
        'deadline_objection',
        'competitor_comparison',
        'hot_lead',
        'reheatable_cold_lead',
        'dead_lead',
        'imminent_purchase',
        'fatigue_risk',
        'audio_preference',
        'night_preference',
        'high_ticket_product',
        'tight_margin_product',
      ].flatMap((concept, ci) =>
        Array.from({ length: 5 }, (_, i) => ({
          id: `d-${ci}-${i}`,
          workspaceId: 'ws-1',
          concept,
          confidence: 0.7,
          occurredAt: new Date(now.getTime() - i * 3600_000),
        })),
      );
      const prisma = makePrisma({ detections });
      const spine = makeSpine();
      const svc = new MindCuriosityService(prisma as never, spine as never);

      const result = await svc.identifyKnowledgeGap('ws-1');

      expect(result).toBeNull();
      expect(spine.emit).not.toHaveBeenCalled();
    });

    it('falls back to high-variance beliefs when concept coverage is fine', async () => {
      const now = new Date();
      const detections = [
        'price_objection',
        'trust_objection',
        'deadline_objection',
        'competitor_comparison',
        'hot_lead',
        'reheatable_cold_lead',
        'dead_lead',
        'imminent_purchase',
        'fatigue_risk',
        'audio_preference',
        'night_preference',
        'high_ticket_product',
        'tight_margin_product',
      ].flatMap((concept, ci) =>
        Array.from({ length: 5 }, (_, i) => ({
          id: `d-${ci}-${i}`,
          workspaceId: 'ws-1',
          concept,
          confidence: 0.7,
          occurredAt: new Date(now.getTime() - i * 3600_000),
        })),
      );
      const beliefs = [
        {
          id: 'b-1',
          workspaceId: 'ws-1',
          subject: 'contact:lead-99',
          predicate: 'P(reply|night)',
          mean: 0.4,
          variance: 0.6,
          samples: 10,
        },
      ];
      const prisma = makePrisma({ detections, beliefs });
      const spine = makeSpine();
      const svc = new MindCuriosityService(prisma as never, spine as never);

      const result = await svc.identifyKnowledgeGap('ws-1');

      expect(result).not.toBeNull();
      expect(result.topic).toContain('belief:');
      expect(spine.emit).toHaveBeenCalled();
    });

    it('respects workspace isolation', async () => {
      const now = new Date();
      const detections = Array.from({ length: 10 }, (_, i) => ({
        id: `d-${i}`,
        workspaceId: 'ws-1',
        concept: 'hot_lead',
        confidence: 0.7,
        occurredAt: new Date(now.getTime() - i * 3600_000),
      }));
      const prisma = makePrisma({ detections });
      const spine = makeSpine();
      const svc = new MindCuriosityService(prisma as never, spine as never);

      // ws-2 has zero detections — should find gaps
      const result = await svc.identifyKnowledgeGap('ws-2');

      expect(result).not.toBeNull();
      expect(result.topic).toContain('concept:');
    });

    it('returns null on prisma failure', async () => {
      const prisma = {
        mindConceptDetection: {
          findMany: jest.fn().mockRejectedValue(new Error('db down')),
        },
        mindBelief: {
          findMany: jest.fn().mockRejectedValue(new Error('db down')),
        },
      };
      const svc = new MindCuriosityService(prisma as never);

      const result = await svc.identifyKnowledgeGap('ws-1');

      expect(result).toBeNull();
    });

    it('works without spine (optional)', async () => {
      const prisma = makePrisma({ detections: [] });
      const svc = new MindCuriosityService(prisma as never);

      const result = await svc.identifyKnowledgeGap('ws-1');

      expect(result).not.toBeNull();
      expect(result.topic).toContain('concept:');
    });

    it('skips high-variance beliefs with too few samples', async () => {
      const now = new Date();
      const detections = [
        'price_objection',
        'trust_objection',
        'deadline_objection',
        'competitor_comparison',
        'hot_lead',
        'reheatable_cold_lead',
        'dead_lead',
        'imminent_purchase',
        'fatigue_risk',
        'audio_preference',
        'night_preference',
        'high_ticket_product',
        'tight_margin_product',
      ].flatMap((concept, ci) =>
        Array.from({ length: 5 }, (_, i) => ({
          id: `d-${ci}-${i}`,
          workspaceId: 'ws-1',
          concept,
          confidence: 0.7,
          occurredAt: new Date(now.getTime() - i * 3600_000),
        })),
      );
      const beliefs = [
        {
          id: 'b-1',
          workspaceId: 'ws-1',
          subject: 'contact:x',
          predicate: 'P(reply)',
          mean: 0.4,
          variance: 0.8,
          samples: 1,
        },
      ];
      const prisma = makePrisma({ detections, beliefs });
      const svc = new MindCuriosityService(prisma as never);

      // All concepts covered, belief has too few samples → null
      const result = await svc.identifyKnowledgeGap('ws-1');
      expect(result).toBeNull();
    });
  });
});
