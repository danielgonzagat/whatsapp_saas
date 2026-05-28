import { buildMindSignals } from './build-mind-signals.helper';
import { AttentionService } from './attention.service';
import { ValenceAggregatorService } from './valence-aggregator.service';
const mockLogger = { warn: jest.fn() };

const makeAutopilotRow = (
  overrides: Partial<{ id: string; intent: string; action: string; createdAt: Date }> = {},
) => ({
  id: overrides.id ?? 'evt-001',
  intent: overrides.intent ?? 'commerce.lead.replied',
  action: overrides.action ?? '',
  createdAt: overrides.createdAt ?? new Date(),
});

const mockPrisma = (rows: ReturnType<typeof makeAutopilotRow>[] = []) => ({
  autopilotEvent: { findMany: jest.fn().mockResolvedValue(rows) },
});
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
      expect(sm!.pulseHealth).toEqual(mockOkHealth);
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
      expect(sm!.pulseHealth).toBeNull();
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
      expect(sm.pulseHealth).toBeNull();
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
      expect(sm!.pulseHealth).toEqual(mockOkHealth);
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

  describe('riskClass (PI-k8)', () => {
    it('attaches riskClass when riskClassService is injected (routine message → R1)', async () => {
      const mockClassify = jest.fn().mockReturnValue({
        class: 'R1' as const,
        autonomyMode: 'allowed_alone' as const,
        requiredEvidenceLevel: 'N1' as const,
        rollback: ['revert_locally', 'notify_operator'],
      });

      const result = await buildMindSignals(
        {
          prisma: mockPrisma(),
          riskClassService: { classify: mockClassify },
          logger: mockLogger,
        },
        'ws-1',
        'olá, tudo bem?',
      );

      expect(mockClassify).toHaveBeenCalledWith({
        kind: 'message_send',
        target: 'lead',
        reversible: true,
      });
      expect(result.riskClass).toEqual({
        tier: 'R1',
        reasons: ['revert_locally', 'notify_operator'],
        recommendedAction: 'allowed_alone',
      });
    });

    it('infers payment_action from payment keywords in message', async () => {
      const mockClassify = jest.fn().mockReturnValue({
        class: 'R2' as const,
        autonomyMode: 'requires_approval' as const,
        requiredEvidenceLevel: 'N2' as const,
        rollback: ['request_approval_reversal', 'audit_log_entry', 'notify_owner'],
      });

      const result = await buildMindSignals(
        {
          prisma: mockPrisma(),
          riskClassService: { classify: mockClassify },
          logger: mockLogger,
        },
        'ws-1',
        'quero pagar com pix no valor de 500 reais',
      );

      expect(mockClassify).toHaveBeenCalledWith({
        kind: 'payment_action',
        target: 'lead',
        reversible: true,
        financialImpactCents: 0,
      });
      expect(result.riskClass).toEqual({
        tier: 'R2',
        reasons: ['request_approval_reversal', 'audit_log_entry', 'notify_owner'],
        recommendedAction: 'requires_approval',
      });
    });

    it('infers payment_action from financial concepts', async () => {
      const mockClassify = jest.fn().mockReturnValue({
        class: 'R1' as const,
        autonomyMode: 'allowed_alone' as const,
        requiredEvidenceLevel: 'N1' as const,
        rollback: ['revert_locally', 'notify_operator'],
      });

      void (await buildMindSignals(
        {
          prisma: mockPrisma(),
          mindConceptService: {
            detect: jest.fn().mockResolvedValue([{ concept: 'payment_intent', confidence: 0.9 }]),
          },
          riskClassService: { classify: mockClassify },
          logger: mockLogger,
        },
        'ws-1',
        'hello',
      ));

      expect(mockClassify).toHaveBeenCalledWith({
        kind: 'payment_action',
        target: 'lead',
        reversible: true,
        financialImpactCents: 0,
      });
    });

    it('infers lead_block from block keywords', async () => {
      const mockClassify = jest.fn().mockReturnValue({
        class: 'R2' as const,
        autonomyMode: 'requires_approval' as const,
        requiredEvidenceLevel: 'N2' as const,
        rollback: ['request_approval_reversal', 'audit_log_entry', 'notify_owner'],
      });

      void (await buildMindSignals(
        {
          prisma: mockPrisma(),
          riskClassService: { classify: mockClassify },
          logger: mockLogger,
        },
        'ws-1',
        'preciso bloquear esse lead suspeito',
      ));

      expect(mockClassify).toHaveBeenCalledWith({
        kind: 'lead_block',
        target: 'lead',
        reversible: true,
      });
    });

    it('infers public_response from public keywords', async () => {
      const mockClassify = jest.fn().mockReturnValue({
        class: 'R3' as const,
        autonomyMode: 'must_escalate' as const,
        requiredEvidenceLevel: 'N4' as const,
        rollback: [
          'escalate_to_human',
          'freeze_action',
          'audit_trail_full',
          'notify_owner_manager',
        ],
      });

      const result = await buildMindSignals(
        {
          prisma: mockPrisma(),
          riskClassService: { classify: mockClassify },
          logger: mockLogger,
        },
        'ws-1',
        'vou publicar esse anúncio no site',
      );

      expect(mockClassify).toHaveBeenCalledWith({
        kind: 'public_response',
        target: 'public',
        reversible: true,
      });
      expect(result.riskClass!.reasons).toHaveLength(3);
    });

    it('does NOT attach riskClass when riskClassService is absent', async () => {
      const result = await buildMindSignals(
        {
          prisma: mockPrisma(),
          logger: mockLogger,
        },
        'ws-1',
        'hello',
      );

      expect(result.riskClass).toBeUndefined();
    });

    it('tolerates classify failure gracefully (logs and skips)', async () => {
      const mockClassify = jest.fn().mockImplementation(() => {
        throw new Error('classification engine offline');
      });

      const result = await buildMindSignals(
        {
          prisma: mockPrisma(),
          riskClassService: { classify: mockClassify },
          logger: mockLogger,
        },
        'ws-1',
        'hello',
      );

      expect(mockLogger.warn).toHaveBeenCalledWith(
        'kloel_risk_class_skipped',
        expect.objectContaining({ reason: 'classification engine offline' }),
      );
      expect(result.riskClass).toBeUndefined();
    });

    it('slices rollback reasons to at most 3', async () => {
      const longRollback = ['a', 'b', 'c', 'd', 'e'];
      const mockClassify = jest.fn().mockReturnValue({
        class: 'R4' as const,
        autonomyMode: 'forbidden' as const,
        requiredEvidenceLevel: 'N6' as const,
        rollback: longRollback,
      });

      const result = await buildMindSignals(
        {
          prisma: mockPrisma(),
          riskClassService: { classify: mockClassify },
          logger: mockLogger,
        },
        'ws-1',
        'hello',
      );

      expect(result.riskClass!.reasons).toHaveLength(3);
      expect(result.riskClass!.reasons).toEqual(['a', 'b', 'c']);
      expect(result.riskClass!.tier).toBe('R4');
      expect(result.riskClass!.recommendedAction).toBe('forbidden');
    });
  });
});
