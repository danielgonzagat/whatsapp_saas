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
      findFirst: jest.fn().mockResolvedValue(null),
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
      tracer as never,
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
});
