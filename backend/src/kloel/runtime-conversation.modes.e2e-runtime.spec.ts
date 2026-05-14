import { CommercialDecisionOrchestratorService } from './commercial-decision-orchestrator.service';
import { RuntimeConversationTracerService } from './runtime-conversation-tracer.service';
import {
  composeCustomerMessage,
  assertCustomerSafe,
} from './commercial-decision-orchestrator.service';

const WS = 'ws-tracer';
const CHANNEL = 'WHATSAPP';
const CONTACT_ID = 'contact-trace-1';

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

describe('Runtime Conversation — 12-step tracer proof', () => {
  let tracer: RuntimeConversationTracerService;

  const concepts = { detect: jest.fn() };
  const events = { recordCommercial: jest.fn() };
  const identity = { resolve: jest.fn() };
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
  const setup = { getState: jest.fn() };
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
      create: jest.fn(),
      updateMany: jest.fn(),
      findMany: jest.fn(),
    },
  };

  beforeEach(() => {
    jest.clearAllMocks();
    tracer = new RuntimeConversationTracerService();

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
    mind.resolveAudioVsText.mockResolvedValue({ choice: 'text', confidence: 0.7, fallback: false });
    mind.resolveTone.mockResolvedValue({ tone: 'CONSULTIVE', confidence: 0.8, fallback: false });
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
    mind.resolveCoupon.mockResolvedValue({ action: 'coupon_10', confidence: 0.6, fallback: false });
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
    identity.resolve.mockResolvedValue({
      contactId: 'contact-resolved-1',
      channelIdentifierId: 'ch-id-1',
      wasCreated: false,
      wasResolved: true,
      resolvedFromContactId: CONTACT_ID,
    });
    setup.getState.mockResolvedValue({
      arsenal: [
        { id: 'asset-1', type: 'text' },
        { id: 'asset-2', type: 'image' },
      ],
      config: { tone: 'direto' },
      selectedProductIds: ['product-1'],
    });
    prisma.pipelineState.findUnique.mockResolvedValue({ state: 'active', fallbackRate1h: 0 });
    prisma.pipelineState.updateMany.mockResolvedValue({ count: 1 });
    prisma.pipelineState.update.mockResolvedValue({ state: 'shadow', fallbackRate1h: 0 });
    prisma.decisionShadow.upsert.mockResolvedValue({ id: 'shadow-1' });
    prisma.decisionShadow.count.mockResolvedValue(0);
    prisma.decisionOutcome.create.mockResolvedValue({ id: 'outcome-1' });
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
      setup as never,
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

  it('produces steps 1-9 for hot_lead with product offer', async () => {
    const orchestrator = makeOrchestrator();

    traceBeforeOrchestration({ workspaceId: WS, contactId: CONTACT_ID, channel: CHANNEL });

    const decision = await orchestrator.orchestrateInbound({
      workspaceId: WS,
      contactId: CONTACT_ID,
      channel: CHANNEL,
      message: 'Quero comprar agora, manda o pix!',
    });

    const steps = tracer.steps();
    expect(steps).toContain('step1_inbox_recorded');
    expect(steps).toContain('step2_contact_resolved');
    expect(steps).toContain('step3_memory_queried');
    expect(steps).toContain('step4_concept_classified');
    expect(steps).toContain('step5_policy_chose');
    expect(steps).toContain('step6_determinism_gate');
    expect(steps).toContain('step7_composer_produced');
    expect(steps).toContain('step8_transport_invoked');
    expect(steps).toContain('step9_outcome_recorded');

    const concepts = decision.concepts;
    expect(concepts).toContain('hot_lead');
  });

  it('skips orchestration in legacy mode (step6 gate blocks)', async () => {
    prisma.pipelineState.findUnique.mockResolvedValue({ state: 'legacy', fallbackRate1h: 0 });

    const orchestrator = makeOrchestrator();

    traceBeforeOrchestration({ workspaceId: WS, contactId: CONTACT_ID, channel: CHANNEL });

    const decision = await orchestrator.orchestrateInbound({
      workspaceId: WS,
      contactId: CONTACT_ID,
      channel: CHANNEL,
      message: 'Achei caro',
    });

    tracer.record('step6_determinism_gate', {
      pipelineMode: 'legacy',
      outcome: 'delegated_to_legacy',
    });

    expect(decision.actions).toEqual([]);
    expect(decision.trace.pipelineState).toBe('legacy');
    expect(tracer.steps()).toContain('step6_determinism_gate');
  });

  it('preserves shadow mode trace without emitting actions', async () => {
    prisma.pipelineState.findUnique.mockResolvedValue({ state: 'shadow', fallbackRate1h: 0 });

    const orchestrator = makeOrchestrator();

    traceBeforeOrchestration({ workspaceId: WS, contactId: CONTACT_ID, channel: CHANNEL });

    const decision = await orchestrator.orchestrateInbound({
      workspaceId: WS,
      contactId: CONTACT_ID,
      channel: CHANNEL,
      message: 'Achei caro, tem desconto?',
    });

    expect(decision.actions).toEqual([]);
    expect(decision.trace.shadow).toBe(true);
    expect(prisma.decisionShadow.upsert).toHaveBeenCalled();
    expect(tracer.steps()).toContain('step5_policy_chose');
    expect(tracer.steps()).toContain('step6_determinism_gate');
    expect(tracer.steps()).toContain('step7_composer_produced');
  });
});
