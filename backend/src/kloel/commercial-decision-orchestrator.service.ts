import { Injectable } from '@nestjs/common';
import { StructuredLogger } from '../logging/structured-logger';
import { MindEventSpine } from './mind/coordination';
import { ChannelSetupService } from './channel-setup.service';
import { MindConceptService } from './mind-concepts.service';
import { MindService } from './mind.service';
import { PrismaService } from '../prisma/prisma.service';
import { ContactIdentityResolverService } from '../contacts/contact-identity-resolver.service';
import { RuntimeConversationTracerService } from './runtime-conversation-tracer.service';

import {
  normalizeChannel,
  primaryConcept,
  hasConcept,
  priceBandFor,
  discountPercentFromCoupon,
  type InboundOrchestrationInput,
  type InboundDecision,
  type ConceptRow,
} from './commercial-decision-orchestrator/types';
import { checkPipelineGate } from './commercial-decision-orchestrator/gating';
import { filterArsenalFormats, intersectToneRepertoire } from './commercial-decision-orchestrator/channel-select';
import { resolveDecisions } from './commercial-decision-orchestrator/scoring';
import { assertCustomerSafe, composeCustomerMessage, buildReplyPlan, buildActions } from './commercial-decision-orchestrator/compose';
import {
  stableInboundKey,
  traceInboxRecorded,
  traceLegacyGate,
  traceContactResolved,
  traceConceptClassified,
  traceMemoryQueried,
  tracePolicyChose,
  traceDeterminismGate,
  traceComposerProduced,
  traceTransportInvoked,
  traceFullOutcomePipeline,
  recordIdentityResolved,
  recordCaseMemoryConsulted,
  recordPredecidedActionsBuilt,
  recordShadow,
  handleOrchestrationFallback as doHandleFallback,
} from './commercial-decision-orchestrator/telemetry';
import { allowedFormatsFor, allowedTonesFor, repertoireFor } from './channel-repertoire.config';

export { type InternalReplyPlan } from './commercial-decision-orchestrator/types';
export { assertCustomerSafe, composeCustomerMessage } from './commercial-decision-orchestrator/compose';

@Injectable()
export class CommercialDecisionOrchestratorService {
  private readonly logger = StructuredLogger.from(CommercialDecisionOrchestratorService.name);

  constructor(
    private readonly mind: MindService,
    private readonly concepts: MindConceptService,
    private readonly events: MindEventSpine,
    private readonly identity: ContactIdentityResolverService,
    private readonly setup: ChannelSetupService,
    private readonly prisma: PrismaService,
    private readonly tracer: RuntimeConversationTracerService,
  ) {}

  async orchestrateInbound(input: InboundOrchestrationInput): Promise<InboundDecision> {
    const channel = normalizeChannel(input.channel);
    const subject = input.contactId ? `contact:${input.contactId}` : `channel:${channel}`;
    const inboundKey = stableInboundKey(input, subject, channel);
    const contactId = input.contactId ?? '';
    const correlationId = inboundKey;
    const workspaceId = input.workspaceId;

    traceInboxRecorded({ tracer: this.tracer, workspaceId, contactId, correlationId, channel, messageLength: input.message.length });

    const gateResult = await checkPipelineGate(this.prisma, workspaceId, channel);
    if (gateResult.mode === 'legacy') {
      traceLegacyGate({ tracer: this.tracer, workspaceId, contactId, correlationId });
      this.logger.log(`Pipeline legacy path for ${workspaceId}:${channel} — returning empty actions`);
      return gateResult.decision;
    }

    const resolvedIdentity = input.contactId
      ? await this.resolveContactIdentity(input, channel)
      : null;
    const resolvedContactId = resolvedIdentity?.contactId ?? input.contactId;
    const effectiveSubject = resolvedContactId ? `contact:${resolvedContactId}` : subject;
    const effectiveContactId = resolvedContactId ?? contactId;

    traceContactResolved({
      tracer: this.tracer, workspaceId, contactId: effectiveContactId, correlationId,
      resolvedContactId: effectiveContactId,
      wasResolved: resolvedIdentity?.wasResolved ?? false,
      channel,
    });

    if (resolvedIdentity?.wasResolved) {
      await recordIdentityResolved(
        this.events, workspaceId, effectiveSubject, inboundKey,
        resolvedIdentity.contactId, resolvedIdentity.resolvedFromContactId,
      );
    }

    try {
      return await this.executeOrchestration(
        input, channel, effectiveSubject, inboundKey,
        gateResult.pipelineMode, effectiveContactId, correlationId,
      );
    } catch (error) {
      this.logger.error(
        `Orchestration failed for ${workspaceId}:${channel}`,
        error instanceof Error ? error.message : String(error),
      );
      await doHandleFallback(this.prisma, this.events, workspaceId, channel, gateResult.pipelineMode);
      throw error;
    }
  }

  private async resolveContactIdentity(input: InboundOrchestrationInput, channel: string) {
    if (!input.contactId) {
      throw new Error('resolveContactIdentity called without contactId');
    }
    return this.identity
      .resolve({
        workspaceId: input.workspaceId,
        channel,
        externalId: input.contactId,
      })
      .catch((error) => {
        this.logger.warn(
          `Identity resolution failed for ${input.workspaceId}:${channel} — proceeding with inbound contactId`,
          error instanceof Error ? error.message : String(error),
        );
        return {
          contactId: input.contactId ?? `unresolved:${channel}`,
          channelIdentifierId: '',
          wasCreated: false,
          wasResolved: false,
          resolvedFromContactId: undefined,
        };
      });
  }

  private async executeOrchestration(
    input: InboundOrchestrationInput,
    channel: string,
    subject: string,
    inboundKey: string,
    pipelineMode: 'shadow' | 'active',
    effectiveContactId: string,
    correlationId: string,
  ): Promise<InboundDecision> {
    const workspaceId = input.workspaceId;
    const traceCtx = { tracer: this.tracer, workspaceId, contactId: effectiveContactId, correlationId };

    const detections = await this.concepts.detect({
      workspaceId,
      subject,
      text: input.message,
      features: { channel, source: 'omnichannel_inbound' },
    });
    const conceptRows: ConceptRow[] = detections.map((row) => ({
      concept: String(row.concept),
      confidence: Number(row.confidence ?? 0),
    }));
    const concept = primaryConcept(conceptRows);

    traceConceptClassified({
      ...traceCtx,
      concept,
      concepts: conceptRows.map((r) => r.concept),
      confidence: conceptRows[0]?.confidence ?? 0,
    });

    const similarCases = await this.mind.retrieveSimilar({
      workspaceId,
      caseType: concept,
      text: input.message,
      features: { channel, concept },
      limit: 5,
    });

    traceMemoryQueried({ ...traceCtx, concept, count: similarCases.length });

    const channelSetup = await this.setup.getState(workspaceId, channel).catch(() => null);
    await recordCaseMemoryConsulted(
      this.events, workspaceId, subject, inboundKey, channel, concept, similarCases.length,
    );

    const audioRatio = hasConcept(conceptRows, 'audio_preference') ? 0.25 : 0.05;
    const soldRate = hasConcept(conceptRows, 'imminent_purchase') ? 0.2 : 0.05;
    const repliedRate = 0.5;
    const priceBand = priceBandFor(input.message);

    const allowedFormats = allowedFormatsFor(channel);

    const {
      formatCandidates,
      decisions: arsenalDecisions,
    } = filterArsenalFormats(channel, channelSetup?.arsenal);

    let decisions: Record<string, unknown> = { ...arsenalDecisions };

    const channelSupportsAudio = allowedFormats.includes('audio');
    if (!channelSupportsAudio) {
      decisions.audio_skipped = 'channel-no-audio';
    }

    const scored = await resolveDecisions(this.mind, {
      workspaceId, channel, message: input.message,
      conceptRows, concept,
      formatCandidates: channelSupportsAudio
        ? (formatCandidates)
        : (formatCandidates as string[]).filter((f) => f !== 'audio'),
      audioRatio, soldRate, repliedRate, priceBand, channelSetup,
    });

    decisions = { ...decisions, ...scored.decisions };

    const allowedTones = allowedTonesFor(channel);
    const toneResult = intersectToneRepertoire(channel, scored.tone, allowedTones);
    const tone = toneResult.tone;
    decisions = { ...decisions, ...toneResult.decisions };

    decisions.tom = {
      ...tone,
      hierarchyJustification: (scored.decisions.tom as Record<string, unknown>)?.hierarchyJustification,
    };

    const repr = repertoireFor(channel);
    if (repr && !repr.proactiveOutboundAllowed) {
      decisions.proactive_gate = 'channel-inbound-only';
    }

    tracePolicyChose({ ...traceCtx, decisions, concept });
    traceDeterminismGate({ ...traceCtx, pipelineMode, channel });

    const plan = buildReplyPlan({
      concept,
      effectiveAggressiveness: scored.effectiveAggressiveness,
      aggressiveness: scored.aggressiveness.aggressiveness,
      ...(scored.couponAction !== undefined ? { couponAction: scored.couponAction } : {}),
      ...(scored.productOffer !== undefined ? { productOffer: scored.productOffer } : {}),
      channelSetup,
      tone: tone.tone,
    });
    const customerMessage = composeCustomerMessage(plan);
    assertCustomerSafe(customerMessage);

    traceComposerProduced({ ...traceCtx, messageLength: customerMessage.length, concept });

    const actions = buildActions({
      ...(scored.couponDecision !== undefined ? { couponDecision: scored.couponDecision } : {}),
      discountPercentFromCoupon,
      ...(scored.productOfferDecision !== undefined ? { productOfferDecision: scored.productOfferDecision } : {}),
      ...(scored.humanTransferDecision !== undefined ? { humanTransferDecision: scored.humanTransferDecision } : {}),
      decisionTraceId: inboundKey,
      inboundKey,
      customerMessage,
      internalReplyPlan: plan,
      priceBand,
      segment: concept,
      decisions,
    });

    traceTransportInvoked({
      ...traceCtx,
      actions: actions.map((a) => a.tool),
      channel,
    });

    await recordPredecidedActionsBuilt(
      this.events, workspaceId, subject, inboundKey,
      actions.map((a) => a.tool), channel, concept, decisions, channelSetup,
    );

    traceFullOutcomePipeline({
      ...traceCtx,
      concept,
      actions: actions.map((a) => a.tool),
      pipelineMode,
      channel,
    });

    this.logger.log(`Deterministic inbound actions built for ${workspaceId}:${channel}`);

    if (pipelineMode === 'shadow') {
      await recordShadow(
        this.prisma, this.events,
        workspaceId, channel, inboundKey, concept, decisions,
      );
    }

    return {
      actions: pipelineMode === 'shadow' ? [] : actions,
      concepts: conceptRows.map((row) => row.concept),
      trace: {
        channel,
        concept,
        decisions,
        pipelineMode,
        shadow: pipelineMode === 'shadow',
        setup: channelSetup
          ? {
              arsenalCount: (channelSetup.arsenal ?? []).length,
              selectedProductIds: channelSetup.selectedProductIds ?? [],
              tone: channelSetup.config?.tone ?? null,
            }
          : null,
        similarCases: similarCases.length,
      },
    };
  }
}
