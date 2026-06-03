import { buildMindSignals } from './build-mind-signals.helper';
import { mockLogger, mockPrisma, makeAutopilotRow } from './build-mind-signals.helper.fixtures';
import { AttentionService } from './attention.service';
import { ValenceAggregatorService } from './valence-aggregator.service';

describe('buildMindSignals — selfModel + combined services', () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('selfModel (PI-k7)', () => {
    const mockOkHealth = {
      db: 'ok' as const,
      redis: 'ok' as const,
      whatsapp: 'connected' as const,
      llm: 'ok' as const,
      lastChecked: '2026-05-28T12:00:00Z',
    };

    it('populates selfModel when selfHealthService is injected and healthy', async () => {
      const result = await buildMindSignals(
        {
          prisma: mockPrisma(),
          selfHealthService: { snapshot: jest.fn().mockResolvedValue(mockOkHealth) },
          logger: mockLogger,
        },
        'ws-1',
        'hello',
      );

      const sm = result.selfModel as Record<string, unknown> | undefined;
      expect(sm).toBeDefined();
      expect(sm!.readinessHealth).toEqual(mockOkHealth);
      expect(sm!.knownGapsCount).toBe(0);
      expect(sm!.lastFailureKind).toBeNull();
    });

    it('populates selfModel when selfGapsService is injected', async () => {
      const result = await buildMindSignals(
        {
          prisma: mockPrisma(),
          selfGapsService: {
            diffRegistryVsDispatcher: jest.fn().mockReturnValue({
              unwired: [{ id: 'cap-1' }, { id: 'cap-2' }],
              wired: ['cap-3'],
            }),
          },
          logger: mockLogger,
        },
        'ws-1',
        'hello',
      );

      const sm = result.selfModel as Record<string, unknown> | undefined;
      expect(sm).toBeDefined();
      expect(sm!.readinessHealth).toBeNull();
      expect(sm!.knownGapsCount).toBe(2);
      expect(sm!.lastFailureKind).toBeNull();
    });

    it('sets lastFailureKind db when db is down', async () => {
      const result = await buildMindSignals(
        {
          prisma: mockPrisma(),
          selfHealthService: {
            snapshot: jest.fn().mockResolvedValue({
              ...mockOkHealth,
              db: 'down' as const,
            }),
          },
          logger: mockLogger,
        },
        'ws-1',
        'hello',
      );

      const sm = result.selfModel as Record<string, unknown>;
      expect(sm.lastFailureKind).toBe('db');
    });

    it('sets lastFailureKind redis when redis is down (and db ok)', async () => {
      const result = await buildMindSignals(
        {
          prisma: mockPrisma(),
          selfHealthService: {
            snapshot: jest.fn().mockResolvedValue({
              ...mockOkHealth,
              redis: 'down' as const,
            }),
          },
          logger: mockLogger,
        },
        'ws-1',
        'hello',
      );

      const sm = result.selfModel as Record<string, unknown>;
      expect(sm.lastFailureKind).toBe('redis');
    });

    it('sets lastFailureKind whatsapp when disconnected (and db/redis ok)', async () => {
      const result = await buildMindSignals(
        {
          prisma: mockPrisma(),
          selfHealthService: {
            snapshot: jest.fn().mockResolvedValue({
              ...mockOkHealth,
              whatsapp: 'disconnected' as const,
            }),
          },
          logger: mockLogger,
        },
        'ws-1',
        'hello',
      );

      const sm = result.selfModel as Record<string, unknown>;
      expect(sm.lastFailureKind).toBe('whatsapp');
    });

    it('sets lastFailureKind llm when degraded (and others ok)', async () => {
      const result = await buildMindSignals(
        {
          prisma: mockPrisma(),
          selfHealthService: {
            snapshot: jest.fn().mockResolvedValue({
              ...mockOkHealth,
              llm: 'degraded' as const,
            }),
          },
          logger: mockLogger,
        },
        'ws-1',
        'hello',
      );

      const sm = result.selfModel as Record<string, unknown>;
      expect(sm.lastFailureKind).toBe('llm');
    });

    it('does NOT attach selfModel when neither service is injected', async () => {
      const result = await buildMindSignals(
        {
          prisma: mockPrisma(),
          logger: mockLogger,
        },
        'ws-1',
        'hello',
      );

      expect(result.selfModel).toBeUndefined();
    });

    it('tolerates health snapshot failure gracefully', async () => {
      const result = await buildMindSignals(
        {
          prisma: mockPrisma(),
          selfHealthService: {
            snapshot: jest.fn().mockRejectedValue(new Error('db down hard')),
          },
          selfGapsService: {
            diffRegistryVsDispatcher: jest.fn().mockReturnValue({
              unwired: [],
              wired: ['cap-a'],
            }),
          },
          logger: mockLogger,
        },
        'ws-1',
        'hello',
      );

      expect(mockLogger.warn).toHaveBeenCalledWith(
        'kloel_self_health_skipped',
        expect.objectContaining({}),
      );

      const sm = result.selfModel as Record<string, unknown>;
      expect(sm).toBeDefined();
      expect(sm.readinessHealth).toBeNull();
      expect(sm.knownGapsCount).toBe(0);
      expect(sm.lastFailureKind).toBeNull();
    });

    it('tolerates gaps service failure gracefully', async () => {
      const result = await buildMindSignals(
        {
          prisma: mockPrisma(),
          selfGapsService: {
            diffRegistryVsDispatcher: jest.fn().mockImplementation(() => {
              throw new Error('code access broken');
            }),
          },
          logger: mockLogger,
        },
        'ws-1',
        'hello',
      );

      expect(mockLogger.warn).toHaveBeenCalledWith(
        'kloel_self_gaps_skipped',
        expect.objectContaining({}),
      );

      const sm = result.selfModel as Record<string, unknown>;
      expect(sm).toBeDefined();
      expect(sm.knownGapsCount).toBe(0);
    });

    it('selfModel still present when only one of the two services is injected', async () => {
      const result = await buildMindSignals(
        {
          prisma: mockPrisma(),
          selfHealthService: { snapshot: jest.fn().mockResolvedValue(mockOkHealth) },
          logger: mockLogger,
        },
        'ws-1',
        'hello',
      );

      const sm = result.selfModel as Record<string, unknown> | undefined;
      expect(sm).toBeDefined();
      expect(sm!.readinessHealth).toEqual(mockOkHealth);
      expect(sm!.knownGapsCount).toBe(0);
    });
  });

  describe('all four services combined', () => {
    it('assembles attention, beliefs, and concepts in one result', async () => {
      const rows = [makeAutopilotRow({ id: 'evt-1' })];
      const mockBeliefs = [
        {
          id: 'b1',
          workspaceId: 'ws-1',
          subject: 's',
          predicate: 'p',
          context: {},
          mean: 0.5,
          variance: 0.1,
          samples: 3,
          alpha: 2,
          beta: 2,
          updatedAt: new Date(),
        },
      ];
      const mockDetections = [{ concept: 'hot_lead', confidence: 0.9 }];

      const result = await buildMindSignals(
        {
          prisma: mockPrisma(rows),
          attentionService: new AttentionService(),
          valenceAggregatorService: new ValenceAggregatorService(),
          mindBeliefService: { getActiveBeliefs: jest.fn().mockResolvedValue(mockBeliefs) },
          mindConceptService: { detect: jest.fn().mockResolvedValue(mockDetections) },
          logger: mockLogger,
        },
        'ws-1',
        'buy now',
      );

      expect(result.source).toBe('autopilot_events');
      expect(result.eventCount).toBe(1);
      expect(result.attention).toBeDefined();
      expect(result.beliefs).toBeDefined();
      expect(result.beliefs).toHaveLength(1);
      expect(result.concepts).toEqual([{ concept: 'hot_lead', confidence: 0.9 }]);
    });
  });
});
