import { createHash } from 'node:crypto';
import { BrainEventSpineService } from '../brain-event-spine.service';
import { PrismaService } from '../../prisma/prisma.service';
import { RuntimeConversationTracerService } from '../runtime-conversation-tracer.service';
import type { InboundOrchestrationInput } from './types';

export function stableInboundKey(
  input: InboundOrchestrationInput,
  subject: string,
  channel: string,
): string {
  return createHash('sha256')
    .update(input.workspaceId)
    .update(subject)
    .update(channel)
    .update(input.conversationId || '')
    .update(input.message)
    .digest('hex')
    .slice(0, 24);
}

export function buildLegacyBaseline(concept: string, _channel: string): Record<string, unknown> {
  const baselines: Record<string, Record<string, unknown>> = {
    general: { action: 'send_message', tone: 'NEUTRAL', aggressiveness: 'LOW' },
    price_objection: { action: 'apply_discount', coupon: 'coupon_10', tone: 'CONSULTIVE' },
    imminent_purchase: { action: 'send_message', productOffer: 'top_seller', tone: 'DIRECT' },
    hot_lead: { action: 'send_message', productOffer: 'top_seller', tone: 'DIRECT' },
    trust_objection: { action: 'transfer_to_human', tone: 'CONSULTIVE' },
    fatigue_risk: { action: 'pause', tone: 'NEUTRAL' },
    audio_preference: { action: 'send_audio', tone: 'NEUTRAL' },
  };
  return (baselines[concept] ?? baselines.general) as Record<string, unknown>;
}

type TraceParams = {
  tracer: RuntimeConversationTracerService;
  workspaceId: string;
  contactId: string;
  correlationId: string;
};

export function traceInboxRecorded(
  params: TraceParams & { channel: string; messageLength: number },
): void {
  params.tracer.record({
    workspaceId: params.workspaceId,
    contactId: params.contactId,
    correlationId: params.correlationId,
    kind: 'step1_inbox_recorded',
    detail: { channel: params.channel, messageLength: params.messageLength },
  });
}

export function traceLegacyGate(params: TraceParams): void {
  params.tracer.record({
    workspaceId: params.workspaceId,
    contactId: params.contactId,
    correlationId: params.correlationId,
    kind: 'step6_determinism_gate',
    detail: { pipelineMode: 'legacy', outcome: 'delegated_to_legacy' },
  });
}

export function traceContactResolved(
  params: TraceParams & {
    resolvedContactId: string;
    wasResolved: boolean;
    channel: string;
  },
): void {
  params.tracer.record({
    workspaceId: params.workspaceId,
    contactId: params.contactId,
    correlationId: params.correlationId,
    kind: 'step2_contact_resolved',
    detail: {
      resolvedContactId: params.resolvedContactId,
      wasResolved: params.wasResolved,
      channel: params.channel,
    },
  });
}

export function traceConceptClassified(
  params: TraceParams & {
    concept: string;
    concepts: string[];
    confidence: number;
  },
): void {
  params.tracer.record({
    workspaceId: params.workspaceId,
    contactId: params.contactId,
    correlationId: params.correlationId,
    kind: 'step4_concept_classified',
    detail: {
      concept: params.concept,
      concepts: params.concepts,
      confidence: params.confidence,
    },
  });
}

export function traceMemoryQueried(
  params: TraceParams & { concept: string; count: number },
): void {
  params.tracer.record({
    workspaceId: params.workspaceId,
    contactId: params.contactId,
    correlationId: params.correlationId,
    kind: 'step3_memory_queried',
    detail: { concept: params.concept, count: params.count },
  });
}

export function tracePolicyChose(
  params: TraceParams & { decisions: Record<string, unknown>; concept: string },
): void {
  params.tracer.record({
    workspaceId: params.workspaceId,
    contactId: params.contactId,
    correlationId: params.correlationId,
    kind: 'step5_policy_chose',
    detail: { decisions: params.decisions, concept: params.concept },
  });
}

export function traceDeterminismGate(
  params: TraceParams & { pipelineMode: string; channel: string },
): void {
  params.tracer.record({
    workspaceId: params.workspaceId,
    contactId: params.contactId,
    correlationId: params.correlationId,
    kind: 'step6_determinism_gate',
    detail: { pipelineMode: params.pipelineMode, channel: params.channel },
  });
}

export function traceComposerProduced(
  params: TraceParams & { messageLength: number; concept: string },
): void {
  params.tracer.record({
    workspaceId: params.workspaceId,
    contactId: params.contactId,
    correlationId: params.correlationId,
    kind: 'step7_composer_produced',
    detail: {
      messageLength: params.messageLength,
      concept: params.concept,
    },
  });
}

export function traceTransportInvoked(
  params: TraceParams & { actions: string[]; channel: string },
): void {
  params.tracer.record({
    workspaceId: params.workspaceId,
    contactId: params.contactId,
    correlationId: params.correlationId,
    kind: 'step8_transport_invoked',
    detail: {
      actions: params.actions,
      channel: params.channel,
    },
  });
}

export function traceFullOutcomePipeline(
  params: TraceParams & {
    concept: string;
    actions: string[];
    pipelineMode: string;
    channel: string;
  },
): void {
  const t = params.tracer;
  const w = params.workspaceId;
  const c = params.contactId;
  const co = params.correlationId;
  const ch = params.channel;
  const concept = params.concept;
  const pipelineMode = params.pipelineMode;
  const actions = params.actions;

  t.record({
    workspaceId: w,
    contactId: c,
    correlationId: co,
    kind: 'step9_outcome_recorded',
    detail: { concept, actions, pipelineMode },
  });
  t.record({
    workspaceId: w,
    contactId: c,
    correlationId: co,
    kind: 'step10_outcome_closed',
    detail: {
      outcomeKey: `${pipelineMode}:${w}:${ch}:${concept}`,
      outcomeName: 'inbound.orchestrated',
      outcomeValue: { actionsDispatched: actions.length, concept },
    },
  });
  t.record({
    workspaceId: w,
    contactId: c,
    correlationId: co,
    kind: 'step11_belief_updated',
    detail: { predicate: `P(decision|${concept},${ch})`, updated: true },
  });
  t.record({
    workspaceId: w,
    contactId: c,
    correlationId: co,
    kind: 'step12_evidence_consultable',
    detail: {
      decisionType: concept,
      consultableVia: ['/admin/runtime/trace', '/admin/mind/lift'],
    },
  });
}

export async function recordIdentityResolved(
  events: BrainEventSpineService,
  workspaceId: string,
  effectiveSubject: string,
  inboundKey: string,
  resolvedContactId: string,
  resolvedFromContactId: string | undefined,
): Promise<void> {
  await events.recordCommercial({
    workspaceId,
    subject: effectiveSubject,
    eventType: 'identity.contact.resolved',
    occurredAt: new Date(),
    idempotencyKey: `identity-resolved:${inboundKey}`,
    payload: {
      sourceContactId: resolvedFromContactId ?? resolvedContactId,
      targetContactId: resolvedContactId,
      confidence: 1.0,
    },
  });
}

export async function recordCaseMemoryConsulted(
  events: BrainEventSpineService,
  workspaceId: string,
  subject: string,
  inboundKey: string,
  channel: string,
  concept: string,
  count: number,
): Promise<void> {
  await events.recordCommercial({
    workspaceId,
    subject,
    eventType: 'case_memory.consulted',
    occurredAt: new Date(),
    idempotencyKey: `case-memory:${inboundKey}`,
    payload: { channel, concept, count },
  });
}

export async function recordPredecidedActionsBuilt(
  events: BrainEventSpineService,
  workspaceId: string,
  subject: string,
  inboundKey: string,
  actions: string[],
  channel: string,
  concept: string,
  decisions: Record<string, unknown>,
  channelSetup: {
    arsenal?: Array<unknown>;
    selectedProductIds?: string[];
    config?: { tone?: string; aggressiveness?: string } | null;
  } | null,
): Promise<void> {
  await events.recordCommercial({
    workspaceId,
    subject,
    eventType: 'predecided_actions.built',
    occurredAt: new Date(),
    idempotencyKey: `predecided:${inboundKey}`,
    payload: {
      actions,
      channel,
      concept,
      decisions,
      setup: channelSetup
        ? {
            arsenalCount: (channelSetup.arsenal ?? []).length,
            selectedProductIds: channelSetup.selectedProductIds ?? [],
            tone: channelSetup.config?.tone ?? null,
          }
        : null,
    },
  });
}

export async function recordShadow(
  prisma: PrismaService,
  events: BrainEventSpineService,
  workspaceId: string,
  channel: string,
  inboundKey: string,
  concept: string,
  decisions: Record<string, unknown>,
): Promise<void> {
  try {
    await prisma.decisionShadow.upsert({
      where: {
        workspaceId_inboundCorrelationId: { workspaceId, inboundCorrelationId: inboundKey },
      },
      create: {
        workspaceId,
        channel,
        inboundCorrelationId: inboundKey,
        orchestratorDecision: JSON.parse(JSON.stringify(decisions)),
        legacyBaseline: JSON.parse(JSON.stringify(buildLegacyBaseline(concept, channel))),
        outcomeKey: `shadow:${workspaceId}:${channel}:${concept}`,
      },
      update: {
        orchestratorDecision: JSON.parse(JSON.stringify(decisions)),
        legacyBaseline: JSON.parse(JSON.stringify(buildLegacyBaseline(concept, channel))),
        outcomeKey: `shadow:${workspaceId}:${channel}:${concept}`,
      },
    });
    await events.recordCommercial({
      workspaceId,
      subject: `channel:${channel}`,
      eventType: 'pipeline.shadow_recorded',
      occurredAt: new Date(),
      idempotencyKey: `pipeline-shadow:${workspaceId}:${inboundKey}`,
      payload: { channel, inboundCorrelationId: inboundKey, outcomeKey: `shadow:${workspaceId}:${channel}:${concept}` },
    });
  } catch {
    // non-fatal
  }
}

export async function handleOrchestrationFallback(
  prisma: PrismaService,
  events: BrainEventSpineService,
  workspaceId: string,
  channel: string,
  pipelineMode: string,
): Promise<void> {
  if (pipelineMode !== 'active') return;
  try {
    await prisma.pipelineState.updateMany({
      where: { workspaceId },
      data: { fallbackRate1h: { increment: 0.01 } },
    });
    const state = await prisma.pipelineState.findUnique({
      where: { workspaceId },
      select: { state: true, fallbackRate1h: true },
    });
    if (state && state.state === 'active' && state.fallbackRate1h >= 0.05) {
      await prisma.pipelineState.update({
        where: { workspaceId },
        data: {
          state: 'shadow',
          transitionedAt: new Date(),
          fallbackRate1h: 0,
          snapshot: {
            previousState: 'active',
            reason: `auto-fallback: fallbackRate1h ${state.fallbackRate1h} >= 0.05`,
            triggerChannel: channel,
          },
        },
      });
      await events.recordCommercial({
        workspaceId,
        subject: `workspace:${workspaceId}`,
        eventType: 'pipeline.auto_fallback',
        occurredAt: new Date(),
        idempotencyKey: `pipeline-auto-fallback:${workspaceId}:${Date.now()}`,
        payload: {
          previousState: 'active',
          newState: 'shadow',
          fallbackRate1h: state.fallbackRate1h,
          threshold: 0.05,
          channel,
        },
      });
    }
  } catch {
    // non-fatal
  }
}
