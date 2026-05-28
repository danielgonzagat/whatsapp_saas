import { buildMindSignals } from './build-mind-signals.helper';
import {
  mockLogger,
  mockPrisma,
  makeAutopilotRow,
} from './build-mind-signals.helper.fixtures';
import { AttentionService } from './attention.service';
import { ValenceAggregatorService } from './valence-aggregator.service';

describe('buildMindSignals', () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('attention + valence', () => {
    it('builds attention when both services are present and events exist', async () => {
      const rows = [
        makeAutopilotRow({
          id: 'evt-1',
          intent: 'commerce.lead.replied',
          createdAt: new Date('2026-05-28T11:55:00Z'),
        }),
        makeAutopilotRow({
          id: 'evt-2',
          intent: 'commerce.cart.abandoned',
          action: '',
          createdAt: new Date('2026-05-28T11:50:00Z'),
        }),
      ];

      const result = await buildMindSignals(
        {
          prisma: mockPrisma(rows),
          attentionService: new AttentionService(),
          valenceAggregatorService: new ValenceAggregatorService(),
          logger: mockLogger,
        },
        'ws-1',
        'hello',
      );

      expect(result.source).toBe('autopilot_events');
      expect(result.eventCount).toBe(2);
      expect(result.attention).toBeDefined();
      const att = result.attention as Record<string, unknown>;
      expect(att.candidates).toBeInstanceOf(Array);
      expect(result.concepts).toEqual([]);
    });

    it('returns empty attention when no events exist', async () => {
      const result = await buildMindSignals(
        {
          prisma: mockPrisma([]),
          attentionService: new AttentionService(),
          valenceAggregatorService: new ValenceAggregatorService(),
          logger: mockLogger,
        },
        'ws-1',
        'hello',
      );

      expect(result.source).toBe('autopilot_events');
      expect(result.eventCount).toBe(0);
      expect(result.attention).toBeDefined();
      const att = result.attention as Record<string, unknown>;
      expect(att.candidates).toEqual([]);
    });

    it('recovers gracefully on prisma timeout', async () => {
      const prisma = mockPrisma();
      prisma.autopilotEvent.findMany.mockRejectedValue(new Error('timeout'));

      const result = await buildMindSignals(
        {
          prisma,
          attentionService: new AttentionService(),
          valenceAggregatorService: new ValenceAggregatorService(),
          logger: mockLogger,
        },
        'ws-1',
        'hello',
      );

      expect(mockLogger.warn).toHaveBeenCalledWith(
        'kloel_event_source_timeout',
        expect.objectContaining({ reason: 'timeout' }),
      );
      expect(result.source).toBe('autopilot_events');
      expect(result.eventCount).toBe(0);
      expect(result.attention).toBeDefined();
    });

    it('sets status no_services when attentionService is absent', async () => {
      const result = await buildMindSignals(
        {
          prisma: mockPrisma(),
          valenceAggregatorService: new ValenceAggregatorService(),
          logger: mockLogger,
        },
        'ws-1',
        'hello',
      );

      expect(result.status).toBe('no_services');
      expect(result.source).toBeUndefined();
      expect(result.attention).toBeUndefined();
    });

    it('sets status no_services when valenceAggregatorService is absent', async () => {
      const result = await buildMindSignals(
        {
          prisma: mockPrisma(),
          attentionService: new AttentionService(),
          logger: mockLogger,
        },
        'ws-1',
        'hello',
      );

      expect(result.status).toBe('no_services');
      expect(result.source).toBeUndefined();
      expect(result.attention).toBeUndefined();
    });

    it('sets status no_services when both attention and valence are absent', async () => {
      const result = await buildMindSignals(
        {
          prisma: mockPrisma(),
          logger: mockLogger,
        },
        'ws-1',
        'hello',
      );

      expect(result.status).toBe('no_services');
      expect(result.concepts).toEqual([]);
    });
  });

  describe('beliefs', () => {
    it('populates beliefs when MindBeliefService returns active beliefs', async () => {
      const mockBeliefs = [
        {
          id: 'b1',
          workspaceId: 'ws-1',
          subject: 'lead-1',
          predicate: 'responds_to_offer',
          context: {},
          mean: 0.72,
          variance: 0.04,
          samples: 12,
          alpha: 9,
          beta: 3,
          updatedAt: new Date(),
        },
        {
          id: 'b2',
          workspaceId: 'ws-1',
          subject: 'lead-2',
          predicate: 'clicks_link',
          context: {},
          mean: 0.35,
          variance: 0.09,
          samples: 5,
          alpha: 2,
          beta: 5,
          updatedAt: new Date(),
        },
      ];

      const result = await buildMindSignals(
        {
          prisma: mockPrisma(),
          mindBeliefService: { getActiveBeliefs: jest.fn().mockResolvedValue(mockBeliefs) },
          logger: mockLogger,
        },
        'ws-1',
        'hello',
      );

      expect(result.beliefs).toEqual([
        {
          subject: 'lead-1',
          predicate: 'responds_to_offer',
          mean: 0.72,
          confidence: 1 / (1 + 0.04),
        },
        { subject: 'lead-2', predicate: 'clicks_link', mean: 0.35, confidence: 1 / (1 + 0.09) },
      ]);
    });

    it('populates empty beliefs when query returns []', async () => {
      const result = await buildMindSignals(
        {
          prisma: mockPrisma(),
          mindBeliefService: { getActiveBeliefs: jest.fn().mockResolvedValue([]) },
          logger: mockLogger,
        },
        'ws-1',
        'hello',
      );

      expect(result.beliefs).toEqual([]);
    });

    it('does not include beliefs when MindBeliefService is absent', async () => {
      const result = await buildMindSignals(
        {
          prisma: mockPrisma(),
          logger: mockLogger,
        },
        'ws-1',
        'hello',
      );

      expect(result.beliefs).toBeUndefined();
    });

    it('handles belief service timeout gracefully', async () => {
      const result = await buildMindSignals(
        {
          prisma: mockPrisma(),
          mindBeliefService: {
            getActiveBeliefs: jest.fn().mockRejectedValue(new Error('kloel_mind_belief_timeout')),
          },
          logger: mockLogger,
        },
        'ws-1',
        'hello',
      );

      expect(mockLogger.warn).toHaveBeenCalledWith(
        'kloel_mind_belief_skipped',
        expect.objectContaining({}),
      );
      expect(result.beliefs).toBeUndefined();
    });
  });

  describe('concepts', () => {
    it('populates concepts when MindConceptService detects concepts', async () => {
      const result = await buildMindSignals(
        {
          prisma: mockPrisma(),
          mindConceptService: {
            detect: jest.fn().mockResolvedValue([
              { concept: 'price_objection', confidence: 0.8 },
              { concept: 'hot_lead', confidence: 0.7 },
            ]),
          },
          logger: mockLogger,
        },
        'ws-1',
        'caro demais',
      );

      expect(result.concepts).toEqual([
        { concept: 'price_objection', confidence: 0.8 },
        { concept: 'hot_lead', confidence: 0.7 },
      ]);
    });

    it('sets concepts to [] when MindConceptService returns empty array', async () => {
      const result = await buildMindSignals(
        {
          prisma: mockPrisma(),
          mindConceptService: { detect: jest.fn().mockResolvedValue([]) },
          logger: mockLogger,
        },
        'ws-1',
        'hello',
      );

      expect(result.concepts).toEqual([]);
    });

    it('sets concepts to [] when MindConceptService is absent', async () => {
      const result = await buildMindSignals(
        {
          prisma: mockPrisma(),
          logger: mockLogger,
        },
        'ws-1',
        'hello',
      );

      expect(result.concepts).toEqual([]);
    });

    it('sets concepts to [] when detect throws', async () => {
      const result = await buildMindSignals(
        {
          prisma: mockPrisma(),
          mindConceptService: { detect: jest.fn().mockRejectedValue(new Error('db down')) },
          logger: mockLogger,
        },
        'ws-1',
        'caro demais',
      );

      expect(mockLogger.warn).toHaveBeenCalledWith(
        'kloel_mind_concept_skipped',
        expect.objectContaining({}),
      );
      expect(result.concepts).toEqual([]);
    });

    it('slices detections to at most 5 concepts', async () => {
      const result = await buildMindSignals(
        {
          prisma: mockPrisma(),
          mindConceptService: {
            detect: jest.fn().mockResolvedValue([
              { concept: 'a', confidence: 0.9 },
              { concept: 'b', confidence: 0.8 },
              { concept: 'c', confidence: 0.7 },
              { concept: 'd', confidence: 0.6 },
              { concept: 'e', confidence: 0.5 },
              { concept: 'f', confidence: 0.4 },
              { concept: 'g', confidence: 0.3 },
            ]),
          },
          logger: mockLogger,
        },
        'ws-1',
        'test',
      );

      const concepts = result.concepts as Array<{ concept: string; confidence: number }>;
      expect(concepts).toHaveLength(5);
      expect(concepts.map((c) => c.concept)).toEqual(['a', 'b', 'c', 'd', 'e']);
    });
  });
});
