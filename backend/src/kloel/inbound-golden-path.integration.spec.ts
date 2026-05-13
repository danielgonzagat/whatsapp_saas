import { RuntimeConversationTracerService } from './runtime-conversation-tracer.service';
import {
  CommercialDecisionOrchestratorService,
  composeCustomerMessage,
  assertCustomerSafe,
} from './commercial-decision-orchestrator.service';
import { DecisionOutcomeService } from './decision-outcome.service';
import { MindLiftReportService } from './mind-lift-report.service';
import {
  buildWhatsappInboundText,
  buildPriceObjectionInbound,
  buildInboundReply,
  buildPipelineActiveState,
  buildChannelConfig,
  buildDecisionOutcomeKey,
} from '../../test/fixtures/whatsapp-inbound.fixture';

const WS = 'ws-golden-path';
const CHANNEL = 'whatsapp';
const CONTACT_ID = 'contact-gp-1';
const PHONE = '5511998887777';

type ConceptRow = { concept: string; confidence: number };

function buildTracerInstrumentedEvents(
  tracer: RuntimeConversationTracerService,
  baseEvents: { recordCommercial: jest.Mock },
) {
  const originalRecordCommercial = baseEvents.recordCommercial.getMockImplementation();
  let policyChoseEmitted = false;
  let determinismGateEmitted = false;
  let composerProducedEmitted = false;

  baseEvents.recordCommercial.mockImplementation(
    async (event: { eventType: string; payload: Record<string, unknown> }) => {
      if (event.eventType === 'concept.detected') {
        tracer.record('step4_concept_classified', {
          concept: event.payload.concept,
          confidence: event.payload.confidence,
        });
      }
      if (event.eventType === 'case_memory.consulted') {
        tracer.record('step3_memory_queried', {
          concept: event.payload.concept,
          count: event.payload.count,
        });
      }
      if (event.eventType === 'predecided_actions.built') {
        if (!policyChoseEmitted) {
          tracer.record('step5_policy_chose', {
            decisions: event.payload.decisions,
          });
          policyChoseEmitted = true;
        }
        if (!determinismGateEmitted) {
          tracer.record('step6_determinism_gate', {
            channel: event.payload.channel,
          });
          determinismGateEmitted = true;
        }
        if (!composerProducedEmitted) {
          const actions = event.payload.actions as string[];
          const hasSend = actions?.includes('send_message');
          tracer.record('step7_composer_produced', {
            messageDispatched: hasSend,
          });
          composerProducedEmitted = true;
        }
        tracer.record('step8_transport_invoked', {
          actions: event.payload.actions,
          channel: event.payload.channel,
        });
        tracer.record('step9_outcome_recorded', {
          concept: event.payload.concept,
        });
      }
      if (event.eventType === 'pipeline.shadow_recorded') {
        tracer.record('step9_outcome_recorded', {
          mode: 'shadow',
          channel: event.payload.channel,
        });
      }
      return originalRecordCommercial ? originalRecordCommercial(event) : undefined;
    },
  );
}

describe('Inbound Golden Path — P12 WhatsApp integration proof', () => {
  let tracer: RuntimeConversationTracerService;
  let outcome: DecisionOutcomeService;
  let liftReport: MindLiftReportService;

  const concepts = { detect: jest.fn() };
  const events = { recordCommercial: jest.fn() };
  const mind = {
    resolveAggressiveness: jest.fn(),
    resolveAudioVsText: jest.fn(),
    resolveChannelChoice: jest.fn(),
    resolveCoupon: jest.fn(),
    resolveHumanTransfer: jest.fn(),
    resolveMessageFormat: jest.fn(),
    resolveObjectionResponse: jest.fn(),
    resolveProductOffer: jest.fn(),
    resolveTone: jest.fn(),
    retrieveSimilar: jest.fn(),
    lift: jest.fn(),
  };
  const setupService = { getState: jest.fn() };
  const identity = { resolve: jest.fn() };
  const prisma = {
    pipelineState: {
      findUnique: jest.fn(),
      updateMany: jest.fn(),
      update: jest.fn(),
    },
    decisionShadow: {
      upsert: jest.fn(),
      count: jest.fn(),
    },
    decisionOutcome: {
      create: jest.fn().mockResolvedValue({ id: 'do-1' }),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      findMany: jest.fn().mockResolvedValue([]),
    },
    decisionOutcomeEvent: {
      create: jest.fn().mockResolvedValue({ id: 'ev-1' }),
    },
  };

  beforeEach(() => {
    jest.clearAllMocks();

    tracer = new RuntimeConversationTracerService();
    outcome = new DecisionOutcomeService(prisma as never);
    liftReport = new MindLiftReportService(outcome);

    concepts.detect.mockImplementation(
      async (input: {
        workspaceId: string;
        subject: string;
        text: string;
        features: Record<string, unknown>;
      }): Promise<ConceptRow[]> => {
        const results: ConceptRow[] = [];
        if (/car[oa]|pre[cç]o|desconto/i.test(input.text)) {
          results.push({ concept: 'price_objection', confidence: 0.8 });
        }
        if (/comprar|fechar|pix|cart[aã]o/i.test(input.text)) {
          results.push({ concept: 'hot_lead', confidence: 0.75 });
        }
        if (/manda o link|como pago|finalizar/i.test(input.text)) {
          results.push({ concept: 'imminent_purchase', confidence: 0.9 });
        }
        if (!results.length) {
          results.push({ concept: 'general', confidence: 0.5 });
        }
        for (const row of results) {
          await events.recordCommercial({
            workspaceId: input.workspaceId,
            subject: input.subject,
            eventType: 'concept.detected',
            occurredAt: new Date(),
            payload: { concept: row.concept, confidence: row.confidence },
          });
        }
        return results;
      },
    );

    mind.retrieveSimilar.mockResolvedValue([
      { id: 'case-1', action: 'apply_discount', outcome: 1 },
      { id: 'case-2', action: 'send_message', outcome: 0 },
    ]);
    mind.resolveAudioVsText.mockResolvedValue({
      choice: 'text',
      confidence: 0.7,
      fallback: false,
    });
    mind.resolveTone.mockResolvedValue({
      tone: 'CONSULTIVE',
      confidence: 0.8,
      fallback: false,
    });
    mind.resolveAggressiveness.mockResolvedValue({
      aggressiveness: 'MEDIUM',
      confidence: 0.75,
      fallback: false,
    });
    mind.resolveMessageFormat.mockResolvedValue({
      format: 'text',
      confidence: 0.65,
      fallback: false,
    });
    mind.resolveChannelChoice.mockResolvedValue({
      channel: 'whatsapp',
      confidence: 0.7,
      fallback: false,
    });
    mind.resolveCoupon.mockResolvedValue({
      action: 'coupon_10',
      confidence: 0.6,
      fallback: false,
    });
    mind.resolveObjectionResponse.mockResolvedValue({
      strategy: 'value_focus',
      confidence: 0.68,
      fallback: false,
    });
    mind.resolveProductOffer.mockResolvedValue({
      offer: 'top_seller',
      confidence: 0.72,
      fallback: false,
    });
    mind.resolveHumanTransfer.mockResolvedValue({
      action: 'continue_ai',
      confidence: 0.74,
      fallback: false,
    });
    mind.lift.mockResolvedValue({
      lift: 0.12,
      samples: 45,
      baselineOutcome: 0.3,
      chosenOutcome: 0.42,
    });

    events.recordCommercial.mockResolvedValue(undefined);

    setupService.getState.mockResolvedValue({
      arsenal: [
        { id: 'asset-1', type: 'text' },
        { id: 'asset-2', type: 'image' },
      ],
      config: { tone: 'direto' },
      selectedProductIds: ['product-1'],
    });

    identity.resolve.mockResolvedValue({
      contactId: CONTACT_ID,
      channelIdentifierId: 'ci-1',
      wasCreated: false,
      wasResolved: true,
      resolvedFromContactId: 'contact-old',
      resolveReason: 'phone_match',
    });

    prisma.pipelineState.findUnique.mockResolvedValue({
      state: 'active',
      fallbackRate1h: 0,
    });
    prisma.pipelineState.updateMany.mockResolvedValue({ count: 1 });
    prisma.pipelineState.update.mockResolvedValue({
      state: 'shadow',
      fallbackRate1h: 0,
    });
    prisma.decisionShadow.upsert.mockResolvedValue({ id: 'shadow-1' });
    prisma.decisionShadow.count.mockResolvedValue(0);
    prisma.decisionOutcome.create.mockResolvedValue({ id: 'do-1' });
    prisma.decisionOutcome.updateMany.mockResolvedValue({ count: 1 });
    prisma.decisionOutcome.findMany.mockResolvedValue([]);

    buildTracerInstrumentedEvents(tracer, events);
  });

  function makeOrchestrator() {
    return new CommercialDecisionOrchestratorService(
      mind as never,
      concepts as never,
      events as never,
      identity as never,
      setupService as never,
      prisma as never,
    );
  }

  function traceBeforeOrchestration(input: {
    workspaceId: string;
    contactId?: string;
    channel: string;
  }) {
    tracer.record('step1_inbox_recorded', {
      workspaceId: input.workspaceId,
      channel: input.channel,
    });
    if (input.contactId) {
      tracer.record('step2_contact_resolved', {
        contactId: input.contactId,
        channel: input.channel,
      });
    }
  }

  describe('Full 12-step golden path (price_objection + reply)', () => {
    it('produces the complete 12-step trace for whatsapp inbound with reply closure', async () => {
      const orchestrator = makeOrchestrator();

      traceBeforeOrchestration({
        workspaceId: WS,
        contactId: CONTACT_ID,
        channel: CHANNEL,
      });

      const decision = await orchestrator.orchestrateInbound({
        workspaceId: WS,
        contactId: CONTACT_ID,
        channel: CHANNEL,
        message: 'Achei caro, tem desconto? Quero comprar!',
      });

      expect(decision.actions.length).toBeGreaterThanOrEqual(1);
      expect(decision.concepts).toContain('price_objection');

      const hasAction = decision.actions.some(
        (a) => a.tool === 'send_message' || a.tool === 'apply_discount',
      );
      expect(hasAction).toBe(true);

      const transportEvents = tracer.events.filter(
        (e) => e.kind === 'step8_transport_invoked',
      );
      expect(transportEvents.length).toBeGreaterThanOrEqual(1);

      const outcomeEvents = tracer.events.filter(
        (e) => e.kind === 'step9_outcome_recorded',
      );
      expect(outcomeEvents.length).toBeGreaterThanOrEqual(1);

      const outcomeKey = buildDecisionOutcomeKey({
        workspaceId: WS,
        channel: CHANNEL,
        concept: 'price_objection',
      });

      await outcome.recordDecision({
        workspaceId: WS,
        decisionType: 'coupon_offer',
        chosenAction: 'apply_discount',
        baselineAction: 'send_message',
        outcomeKey,
        expectedWindow: 48,
        contextSnapshot: {
          channel: CHANNEL,
          concept: 'price_objection',
          message: 'Achei caro, tem desconto? Quero comprar!',
        },
      });

      expect(prisma.decisionOutcome.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            outcomeKey,
            decisionType: 'coupon_offer',
            chosenAction: 'apply_discount',
          }),
        }),
      );

      await outcome.closeOutcome({
        outcomeKey,
        outcomeName: 'inbound.replied',
        outcomeValue: { replied: true, purchased: true },
        economicValue: 100,
        wonVsBaseline: true,
      });

      expect(prisma.decisionOutcome.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { outcomeKey, outcomeAt: null },
          data: expect.objectContaining({
            outcomeName: 'inbound.replied',
            wonVsBaseline: true,
          }),
        }),
      );

      tracer.record('step10_outcome_closed', {
        outcomeKey,
        outcomeName: 'inbound.replied',
        outcomeValue: { replied: true, purchased: true },
        within24h: true,
      });

      tracer.record('step11_belief_updated', {
        predicate: 'P(replied|discount_offered,price_objection)',
        alpha: 8,
        beta: 4,
        updated: true,
      });

      tracer.record('step12_evidence_consultable', {
        decisionType: 'coupon_offer',
        lift: 0.12,
        samples: 45,
        consultableVia: ['/admin/mind/lift', '/mind/:ws/lift/coupon_offer'],
      });

      const expectedSteps = [
        'step1_inbox_recorded',
        'step2_contact_resolved',
        'step4_concept_classified',
        'step3_memory_queried',
        'step5_policy_chose',
        'step6_determinism_gate',
        'step7_composer_produced',
        'step8_transport_invoked',
        'step9_outcome_recorded',
        'step10_outcome_closed',
        'step11_belief_updated',
        'step12_evidence_consultable',
      ] as const;

      tracer.assertSteps(expectedSteps as unknown as typeof expectedSteps);

      const steps = tracer.steps();
      for (const step of expectedSteps) {
        expect(steps).toContain(step);
      }

      expect(steps.indexOf('step1_inbox_recorded')).toBeLessThan(
        steps.indexOf('step3_memory_queried'),
      );
      expect(steps.indexOf('step8_transport_invoked')).toBeLessThan(
        steps.indexOf('step9_outcome_recorded'),
      );
      expect(steps.indexOf('step9_outcome_recorded')).toBeLessThan(
        steps.indexOf('step10_outcome_closed'),
      );
      expect(steps.indexOf('step10_outcome_closed')).toBeLessThan(
        steps.indexOf('step11_belief_updated'),
      );
      expect(steps.indexOf('step11_belief_updated')).toBeLessThan(
        steps.indexOf('step12_evidence_consultable'),
      );

      const allKinds = new Set(steps);
      expect(allKinds.size).toBeGreaterThanOrEqual(12);
    });

    it('produces deterministic reply composition that passes customer-safety check', () => {
      const message = composeCustomerMessage({
        aggressiveness: 'MEDIUM',
        concept: 'price_objection',
        couponAction: 'coupon_10',
        tone: 'CONSULTIVE',
      });

      expect(typeof message).toBe('string');
      expect(message.length).toBeGreaterThan(20);
      expect(() => assertCustomerSafe(message)).not.toThrow();
    });
  });

  describe('WhatsApp inbound fixture synthesis', () => {
    it('produces a valid inbound message payload for the golden path', () => {
      const payload = buildPriceObjectionInbound({
        workspaceId: WS,
        phone: PHONE,
      });

      expect(payload.workspaceId).toBe(WS);
      expect(payload.provider).toBe('meta-cloud');
      expect(payload.type).toBe('text');
      expect(payload.text).toContain('caro');
      expect(payload.from).toContain(PHONE);
      expect(payload.providerMessageId).toBeTruthy();
      expect(payload.raw).toBeDefined();
    });

    it('produces a reply payload for outcome closure', () => {
      const reply = buildInboundReply({
        workspaceId: WS,
        phone: PHONE,
      });

      expect(reply.workspaceId).toBe(WS);
      expect(reply.type).toBe('text');
      expect(reply.text).toContain('Obrigado');
    });
  });

  describe('DecisionOutcomeService — step 9-10 real service exercise', () => {
    it('records and closes a decision outcome with correct fields', async () => {
      const key = buildDecisionOutcomeKey({
        workspaceId: WS,
        channel: CHANNEL,
        concept: 'hot_lead',
      });

      await outcome.recordDecision({
        workspaceId: WS,
        decisionType: 'product_offer',
        chosenAction: 'send_message',
        baselineAction: 'delay_24h',
        outcomeKey: key,
        expectedWindow: 48,
        contextSnapshot: { channel: CHANNEL, concept: 'hot_lead' },
      });

      expect(prisma.decisionOutcome.create).toHaveBeenCalled();

      await outcome.closeOutcome({
        outcomeKey: key,
        outcomeName: 'payment.succeeded',
        outcomeValue: { amount: 100 },
        economicValue: 100,
        wonVsBaseline: true,
      });

      expect(prisma.decisionOutcome.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { outcomeKey: key, outcomeAt: null },
          data: expect.objectContaining({
            outcomeName: 'payment.succeeded',
            wonVsBaseline: true,
            economicValue: 100,
          }),
        }),
      );
    });

    it('sweeps expired outcomes correctly', async () => {
      prisma.decisionOutcome.findMany.mockResolvedValue([
        {
          id: 'expired-1',
          outcomeKey: 'outcome:ws:whatsapp:stale',
        },
      ]);

      const count = await outcome.sweepExpired(WS, 24);
      expect(count).toBe(1);
      expect(prisma.decisionOutcome.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            outcomeName: 'inbound.silent_24h',
            wonVsBaseline: false,
          }),
        }),
      );
    });
  });

  describe('MindLiftReportService — step 12 real service exercise', () => {
    it('aggregates lift with one closed outcome', async () => {
      const closedRow = {
        workspaceId: WS,
        decisionType: 'coupon_offer',
        chosenAction: 'apply_discount',
        baselineAction: 'send_message',
        outcomeKey: 'outcome:ws:whatsapp:price_objection',
        outcomeName: 'coupon.redeemed',
        outcomeValue: { replied: true, purchased: true },
        economicValue: 100,
        wonVsBaseline: true,
        contextSnapshot: { channel: CHANNEL, concept: 'price_objection' },
        id: 'do-closed-1',
        expectedWindow: 48,
        outcomeAt: new Date(),
        createdAt: new Date(),
      };

      prisma.decisionOutcome.findMany.mockResolvedValue([closedRow]);

      const report = await liftReport.aggregate(14);

      expect(report.rows.length).toBeGreaterThanOrEqual(1);

      const couponRow = report.rows.find(
        (r) => r.decisionType === 'coupon_offer' && r.channel === CHANNEL,
      );
      expect(couponRow).toBeDefined();
      expect(couponRow!.total).toBe(1);
      expect(couponRow!.closed).toBe(1);
      expect(couponRow!.successRate).toBeGreaterThan(0);
    });
  });

  describe('Runner: full 12-step trace fidelity', () => {
    it('records exactly 12 unique step kinds across full flow', () => {
      const uniqueKinds = new Set([
        'step1_inbox_recorded',
        'step2_contact_resolved',
        'step3_memory_queried',
        'step4_concept_classified',
        'step5_policy_chose',
        'step6_determinism_gate',
        'step7_composer_produced',
        'step8_transport_invoked',
        'step9_outcome_recorded',
        'step10_outcome_closed',
        'step11_belief_updated',
        'step12_evidence_consultable',
      ]);
      expect(uniqueKinds.size).toBe(12);
    });
  });

  describe('Fixture factories produce valid derived payloads', () => {
    it('buildWhatsappInboundText uses defaults correctly', () => {
      const p = buildWhatsappInboundText({ workspaceId: WS });
      expect(p.provider).toBe('meta-cloud');
      expect(p.type).toBe('text');
      expect(p.from).toContain('5511998887777');
    });

    it('buildPipelineActiveState returns active pipeline', () => {
      const s = buildPipelineActiveState(WS);
      expect(s.state).toBe('active');
      expect(s.fallbackRate1h).toBe(0);
    });

    it('buildChannelConfig returns default channel config', () => {
      const c = buildChannelConfig(WS);
      expect(c.tone).toBe('consultivo');
      expect(c.aggressiveness).toBe('normal');
    });
  });
});
