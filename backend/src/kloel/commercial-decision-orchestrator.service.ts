import { Injectable, Logger } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { BrainEventSpineService } from './brain-event-spine.service';
import { allowedFormatsFor, allowedTonesFor, repertoireFor } from './channel-repertoire.config';
import { ChannelSetupService } from './channel-setup.service';
import { MindConceptService } from './mind-concepts.service';
import { MindService } from './mind.service';
import { PrismaService } from '../prisma/prisma.service';
import type { PredecidedAction } from './unified-agent.types';

type ConceptRow = { concept: string; confidence?: number };

type InboundOrchestrationInput = {
  channel: string;
  contactId?: string;
  conversationId?: string;
  message: string;
  workspaceId: string;
};

type InboundDecision = {
  actions: PredecidedAction[];
  concepts: string[];
  trace: Record<string, unknown>;
};

function normalizeChannel(channel: string): string {
  return String(channel || 'whatsapp')
    .trim()
    .toLowerCase();
}

function primaryConcept(rows: ConceptRow[]): string {
  return rows[0]?.concept || 'general';
}

function hasConcept(rows: ConceptRow[], concept: string): boolean {
  return rows.some((row) => row.concept === concept);
}

function priceBandFor(text: string): string {
  const normalized = text.toLowerCase();
  if (/\b(1000|mil|premium|alto valor)\b/.test(normalized)) return 'over_500';
  if (/\b(300|500|caro|pre[cç]o)\b/.test(normalized)) return 'over_300';
  return 'unknown';
}

function discountPercentFromCoupon(action?: string): number | undefined {
  if (action === 'coupon_5') return 5;
  if (action === 'coupon_10') return 10;
  if (action === 'coupon_15') return 15;
  if (action === 'coupon_20') return 20;
  return undefined;
}

// Structured internal plan emitted by the deterministic orchestrator.
// NEVER sent verbatim to the customer — must be transformed into a
// customer-facing message string by composeCustomerMessage() and validated
// by assertCustomerSafe() before reaching the transport.
export type InternalReplyPlan = {
  aggressiveness: string;
  concept: string;
  couponAction?: string;
  productOffer?: string;
  setup?: { arsenalCount: number; productCount: number; tone?: string | null };
  tone: string;
};

// These patterns target the specific orchestrator-internal directive voice
// (third-person commands such as "Responder com tom X e intensidade Y"). They
// must NOT trip on legitimate first-/second-person customer messages that
// happen to contain individual verbs like "responder" or "tratar". Each
// pattern starts at message boundary and includes the directive complement
// (tom/objeção/oferta/...) that only appears in plan output.
const FORBIDDEN_INTERNAL_DIRECTIVES = [
  /(?:^|\n)\s*responder com tom\b/i,
  /(?:^|\n)\s*usar (?:apenas )?os \d+ produto/i,
  /(?:^|\n|\.\s+)priorizar o arsenal\b/i,
  /(?:^|\n|\.\s+)tratar a objeç[aã]o de pre[cç]o\b/i,
  /(?:^|\n|\.\s+)direcionar a oferta para\b/i,
  /(?:^|\n|\.\s+)conduzir para o pr[oó]ximo passo de compra\b/i,
];

/**
 * Customer-safety guard: throws if `message` reads like an internal plan
 * (third-person directive instructing the IA). Called immediately before
 * the action is queued for transport. Failure here means the orchestrator
 * leaked plan-as-message and the send must be cancelled, never relaxed.
 */
export function assertCustomerSafe(message: string): void {
  const text = String(message || '').trim();
  if (!text) {
    throw new Error('customer-safe-violation: empty message');
  }
  for (const pattern of FORBIDDEN_INTERNAL_DIRECTIVES) {
    if (pattern.test(text)) {
      throw new Error(
        `customer-safe-violation: message matched internal-directive pattern ${pattern}`,
      );
    }
  }
}

/**
 * Compose a customer-facing message from the internal plan.
 *
 * Voice rules:
 *  - First/second person only ("conseguimos…", "te indico…", "podemos…").
 *  - Never narrates strategy ("vou responder com tom…", "vou usar 3 produtos…").
 *  - When the brain decision is ambiguous (no concept-specific branch fired),
 *    emits a neutral holding message so the lead is acknowledged rather than
 *    receiving a leaked plan.
 *
 * This is the deterministic-pipeline equivalent of the LLM writer described
 * in the prompt. When a real LLM writer is introduced later, it should
 * accept `plan` as the structured input and produce a richer message; the
 * `assertCustomerSafe` guard must continue to validate its output.
 */
export function composeCustomerMessage(plan: InternalReplyPlan): string {
  if (plan.concept === 'price_objection') {
    if (plan.couponAction) {
      const pct = discountPercentFromCoupon(plan.couponAction);
      if (pct) {
        return `Entendo a preocupação com o valor. Consigo liberar um desconto especial de ${pct}% válido por 24h para você fechar agora — quer que eu mande o link com o desconto já aplicado?`;
      }
    }
    return 'Entendo sua preocupação com o valor — me conta o que cabe no seu orçamento que eu vejo o que conseguimos ajustar.';
  }
  if (plan.concept === 'imminent_purchase' || plan.concept === 'hot_lead') {
    return 'Perfeito! Já vou preparar o próximo passo de compra para você. Confirma para mim o melhor canal para receber o link?';
  }
  if (plan.concept === 'trust_objection') {
    return 'Tudo bem, entendo a hesitação. Posso te mostrar provas reais de clientes parecidos com você que já compraram. Quer ver?';
  }
  if (plan.concept === 'fatigue_risk') {
    return 'Sem pressa nenhuma. Sigo aqui quando você quiser retomar.';
  }
  if (plan.concept === 'audio_preference') {
    return 'Vi que você prefere áudio — posso te responder por áudio também, fica mais natural. Quer?';
  }
  // Neutral acknowledgement when no concept-specific branch applies.
  // Better than leaking an internal plan if every other path falls through.
  return 'Recebi sua mensagem e já estou olhando aqui para te responder com o melhor caminho. Volto em instantes.';
}

function stableInboundKey(input: InboundOrchestrationInput, subject: string, channel: string) {
  return createHash('sha256')
    .update(input.workspaceId)
    .update(subject)
    .update(channel)
    .update(input.conversationId || '')
    .update(input.message)
    .digest('hex')
    .slice(0, 24);
}

function buildLegacyBaseline(concept: string, _channel: string): Record<string, unknown> {
  // Deterministic rule-based version of the same decisions, simulating
  // what the pre-deterministic-pipeline path would have produced.
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

@Injectable()
export class CommercialDecisionOrchestratorService {
  private readonly logger = new Logger(CommercialDecisionOrchestratorService.name);

  constructor(
    private readonly mind: MindService,
    private readonly concepts: MindConceptService,
    private readonly events: BrainEventSpineService,
    private readonly setup: ChannelSetupService,
    private readonly prisma: PrismaService,
  ) {}

  async orchestrateInbound(input: InboundOrchestrationInput): Promise<InboundDecision> {
    const channel = normalizeChannel(input.channel);
    const subject = input.contactId ? `contact:${input.contactId}` : `channel:${channel}`;
    const inboundKey = stableInboundKey(input, subject, channel);

    const pipelineState = await this.prisma.pipelineState.findUnique({
      where: { workspaceId: input.workspaceId },
      select: { state: true, fallbackRate1h: true },
    });
    const pipelineMode = (pipelineState?.state ?? 'legacy') as 'legacy' | 'shadow' | 'active';

    if (pipelineMode === 'legacy') {
      this.logger.log(
        `Pipeline legacy path for ${input.workspaceId}:${channel} — returning empty actions`,
      );
      return {
        actions: [],
        concepts: [],
        trace: {
          channel,
          pipelineState: 'legacy',
          skipped: true,
          delegatedToLegacy: true,
        },
      };
    }

    try {
      return await this.executeOrchestration(
        input,
        channel,
        subject,
        inboundKey,
        pipelineMode,
      );
    } catch (error) {
      this.logger.error(
        `Orchestration failed for ${input.workspaceId}:${channel}`,
        error instanceof Error ? error.message : String(error),
      );
      await this.handleOrchestrationFallback(input.workspaceId, channel, pipelineMode);
      throw error;
    }
  }

  private async executeOrchestration(
    input: InboundOrchestrationInput,
    channel: string,
    subject: string,
    inboundKey: string,
    pipelineMode: 'legacy' | 'shadow' | 'active',
  ): Promise<InboundDecision> {
    const detections = await this.concepts.detect({
      workspaceId: input.workspaceId,
      subject,
      text: input.message,
      features: { channel, source: 'omnichannel_inbound' },
    });
    const conceptRows = detections.map((row) => ({
      concept: String(row.concept),
      confidence: Number(row.confidence ?? 0),
    }));
    const concept = primaryConcept(conceptRows);
    const decisionTraceId = inboundKey;
    const similarCases = await this.mind.retrieveSimilar({
      workspaceId: input.workspaceId,
      caseType: concept,
      text: input.message,
      features: { channel, concept },
      limit: 5,
    });
    const channelSetup = await this.setup.getState(input.workspaceId, channel).catch(() => null);
    const occurredAt = new Date();
    await this.events.recordCommercial({
      workspaceId: input.workspaceId,
      subject,
      eventType: 'case_memory.consulted',
      occurredAt,
      idempotencyKey: `case-memory:${inboundKey}`,
      payload: { channel, concept, count: similarCases.length },
    });

    const repr = repertoireFor(channel);
    const allowedFormats = allowedFormatsFor(channel);
    const allowedTones = allowedTonesFor(channel);

    const audioRatio = hasConcept(conceptRows, 'audio_preference') ? 0.25 : 0.05;
    const soldRate = hasConcept(conceptRows, 'imminent_purchase') ? 0.2 : 0.05;
    const repliedRate = 0.5;
    const priceBand = priceBandFor(input.message);

    const decisions: Record<string, unknown> = {};

    // P6 — if channel does not support audio format, force text without
    // consulting the mind. Record the reason so the trace is auditable.
    let audio: { choice: string; confidence: number; fallback: boolean };
    if (!allowedFormats.includes('audio' as never)) {
      audio = { choice: 'text', confidence: 1, fallback: false };
      decisions.audio_skipped = 'channel-no-audio';
    } else {
      audio = await this.mind.resolveAudioVsText(input.workspaceId, channel, audioRatio);
    }

    const [toneRaw, aggressiveness, format, channelChoice] = await Promise.all([
      this.mind.resolveTone(input.workspaceId, channel, repliedRate, soldRate, concept),
      this.mind.resolveAggressiveness(
        input.workspaceId,
        `inbound:${channel}`,
        soldRate,
        repliedRate,
        0,
      ),
      this.mind.resolveMessageFormat(
        input.workspaceId,
        channel,
        concept,
        allowedFormats,
      ),
      this.mind.resolveChannelChoice(
        input.workspaceId,
        [channel],
        concept,
        new Date().getHours(),
        concept,
      ),
    ]);

    // P6 — intersect brain tone with channel-allowed tones. If the brain
    // chose a tone outside the channel repertoire, replace with the first
    // allowed tone and record the override.
    let tone = toneRaw;
    const toneLower = String(tone.tone || '').toLowerCase();
    const toneInRepertoire = allowedTones.some((t) => t === toneLower);
    if (!toneInRepertoire) {
      const fallbackTone = allowedTones[0] ?? 'consultivo';
      tone = {
        tone: fallbackTone,
        confidence: toneRaw.confidence,
        fallback: true,
      };
      decisions.tone_repertoire_override = {
        brain: toneRaw.tone,
        channel,
        replaced_with: fallbackTone,
        reason: 'channel-repertoire-intersection',
      };
    }

    // P6 — gate proactive outbound by channel repertoire.
    if (repr && !repr.proactiveOutboundAllowed) {
      decisions.proactive_gate = 'channel-inbound-only';
    }

    decisions.audio_vs_text = audio;
    decisions.channel_choice = channelChoice;
    decisions.message_format = format;
    decisions.tom = tone;
    decisions.cia_aggressiveness = aggressiveness;

    let couponAction: string | undefined;
    let couponDecision: Record<string, unknown> | undefined;
    if (hasConcept(conceptRows, 'price_objection')) {
      const coupon = await this.mind.resolveCoupon(input.workspaceId, priceBand, soldRate, concept);
      const objection = await this.mind.resolveObjectionResponse(
        input.workspaceId,
        channel,
        concept,
        priceBand,
      );
      decisions.coupon_offer = coupon;
      decisions.objection_response = objection;
      couponDecision = coupon;
      couponAction = coupon.action;
    }

    let productOffer: string | undefined;
    let productOfferDecision: Record<string, unknown> | undefined;
    const allowedProductIds = channelSetup?.selectedProductIds ?? [];
    if (hasConcept(conceptRows, 'imminent_purchase') || hasConcept(conceptRows, 'hot_lead')) {
      if (allowedProductIds.length === 0 && channelSetup) {
        // P1.4 — channel has been set up but no products selected for it.
        // Recommending anything here would offer a product the operator did
        // not authorize for the channel. Skip the offer and record the gap.
        decisions.product_offer = {
          offer: 'cold_start_no_products',
          confidence: 0,
          fallback: true,
          reason: 'channel-setup has zero selectedProductIds',
        };
      } else {
        const product = await this.mind.resolveProductOffer(
          input.workspaceId,
          'new_lead',
          concept,
          priceBand,
          undefined,
          { channel, allowedProductIds },
        );
        decisions.product_offer = product;
        productOfferDecision = product;
        productOffer = product.offer;
      }
    }

    // P1.4 — enforce wizard-config ceilings. If the operator capped
    // aggressiveness at "normal" or "baixa", the brain cannot escalate to
    // "alta"/"agressiva" regardless of what scoring chose. Decision is
    // recorded honestly in the trace so this override is auditable.
    const aggressivenessCeiling = String(channelSetup?.config?.aggressiveness || '').toLowerCase();
    const brainAggressiveness = String(aggressiveness.aggressiveness || '').toLowerCase();
    const aggressivenessRank = (label: string): number => {
      if (label.includes('alta') || label.includes('agress')) return 3;
      if (label.includes('normal') || label.includes('moder')) return 2;
      if (label.includes('baixa')) return 1;
      return 2; // unknown -> treat as normal
    };
    const effectiveAggressiveness =
      aggressivenessCeiling &&
      aggressivenessRank(brainAggressiveness) > aggressivenessRank(aggressivenessCeiling)
        ? aggressivenessCeiling
        : aggressivenessRank(brainAggressiveness) === aggressivenessRank(aggressivenessCeiling)
          ? brainAggressiveness
          : brainAggressiveness;
    if (
      aggressivenessCeiling &&
      effectiveAggressiveness !== brainAggressiveness
    ) {
      decisions.aggressiveness_ceiling_applied = {
        brain: brainAggressiveness,
        ceiling: aggressivenessCeiling,
        effective: effectiveAggressiveness,
      };
    }

    let humanTransferDecision: Record<string, unknown> | undefined;
    if (hasConcept(conceptRows, 'trust_objection') || hasConcept(conceptRows, 'fatigue_risk')) {
      const transferConcept = hasConcept(conceptRows, 'trust_objection')
        ? 'trust_objection'
        : 'fatigue_risk';
      const transfer = await this.mind.resolveHumanTransfer(
        input.workspaceId,
        channel,
        transferConcept,
        0.7,
      );
      decisions.human_transfer = transfer;
      humanTransferDecision = transfer;
    }

    const channelTone = channelSetup?.config?.tone;
    const setupContext: { arsenalCount: number; productCount: number; tone?: string | null } | undefined = channelSetup
      ? (channelTone != null
        ? {
            arsenalCount: channelSetup.arsenal.length,
            productCount: channelSetup.selectedProductIds.length,
            tone: channelTone,
          }
        : {
            arsenalCount: channelSetup.arsenal.length,
            productCount: channelSetup.selectedProductIds.length,
          })
      : undefined;
    const internalReplyPlan: InternalReplyPlan = {
      aggressiveness: effectiveAggressiveness || aggressiveness.aggressiveness,
      concept,
      ...(couponAction !== undefined ? { couponAction } : {}),
      ...(productOffer !== undefined ? { productOffer } : {}),
      ...(setupContext !== undefined ? { setup: setupContext } : {}),
      tone: channelTone || tone.tone,
    };
    const customerMessage = composeCustomerMessage(internalReplyPlan);
    // Guard: refuse to enqueue any send_message whose payload matches an
    // internal-plan directive (third-person voice). This must fail loud, never
    // silently downgrade — otherwise an instruction leaks to the customer.
    assertCustomerSafe(customerMessage);
    const actions: PredecidedAction[] = [];
    const couponPercent = discountPercentFromCoupon(couponAction);
    if (couponDecision && couponPercent) {
      actions.push({
        tool: 'apply_discount',
        args: {
          couponDecision,
          decisionTraceId,
          discountPercent: couponPercent,
          expiresIn: '24h',
          inboundCorrelationId: inboundKey,
          priceBand,
          productOffer: productOfferDecision,
          reason: 'Política MIND decidida no pipeline determinístico.',
          segment: concept,
        },
      });
    } else {
      actions.push({
        tool: 'send_message',
        args: {
          decisionTraceId,
          inboundCorrelationId: inboundKey,
          message: customerMessage,
          internalReplyPlan,
        },
      });
    }
    if (
      humanTransferDecision &&
      humanTransferDecision.action !== 'continue_ai' &&
      humanTransferDecision.action !== 'pause_wait'
    ) {
      actions.push({
        tool: 'transfer_to_human',
        args: {
          decisionTraceId,
          handoffDecision: humanTransferDecision,
          inboundCorrelationId: inboundKey,
          priority: 'high',
          reason: 'Pipeline determinístico detectou risco comercial.',
        },
      });
    }

    await this.events.recordCommercial({
      workspaceId: input.workspaceId,
      subject,
      eventType: 'predecided_actions.built',
      occurredAt,
      idempotencyKey: `predecided:${inboundKey}`,
      payload: {
        actions: actions.map((action) => action.tool),
        channel,
        concept,
        decisions,
        setup: channelSetup
          ? {
              arsenalCount: channelSetup.arsenal.length,
              selectedProductIds: channelSetup.selectedProductIds,
              tone: channelSetup.config?.tone ?? null,
            }
          : null,
      },
    });

    this.logger.log(`Deterministic inbound actions built for ${input.workspaceId}:${channel}`);

    if (pipelineMode === 'shadow') {
      await this.recordShadowExecution(
        input.workspaceId,
        channel,
        inboundKey,
        concept,
        decisions,
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
              arsenalCount: channelSetup.arsenal.length,
              selectedProductIds: channelSetup.selectedProductIds,
              tone: channelSetup.config?.tone ?? null,
            }
          : null,
        similarCases: similarCases.length,
      },
    };
  }

  private async recordShadowExecution(
    workspaceId: string,
    channel: string,
    inboundKey: string,
    concept: string,
    decisions: Record<string, unknown>,
  ): Promise<void> {
    try {
      await this.prisma.decisionShadow.upsert({
        where: {
          workspaceId_inboundCorrelationId: {
            workspaceId,
            inboundCorrelationId: inboundKey,
          },
        },
        create: {
          workspaceId,
          channel,
          inboundCorrelationId: inboundKey,
          orchestratorDecision: decisions as object,
          legacyBaseline: buildLegacyBaseline(concept, channel) as object,
          outcomeKey: `shadow:${workspaceId}:${channel}:${concept}`,
        },
        update: {
          orchestratorDecision: decisions as object,
          legacyBaseline: buildLegacyBaseline(concept, channel) as object,
          outcomeKey: `shadow:${workspaceId}:${channel}:${concept}`,
        },
      });

      await this.events.recordCommercial({
        workspaceId,
        subject: `channel:${channel}`,
        eventType: 'pipeline.shadow_recorded',
        occurredAt: new Date(),
        idempotencyKey: `pipeline-shadow:${workspaceId}:${inboundKey}`,
        payload: {
          channel,
          inboundCorrelationId: inboundKey,
          outcomeKey: `shadow:${workspaceId}:${channel}:${concept}`,
        },
      });
    } catch (err) {
      this.logger.warn(
        `Failed to record shadow for ${workspaceId}:${inboundKey} — non-fatal`,
        err instanceof Error ? err.message : String(err),
      );
    }
  }

  private async handleOrchestrationFallback(
    workspaceId: string,
    channel: string,
    pipelineMode: string,
  ): Promise<void> {
    if (pipelineMode !== 'active') return;

    try {
      await this.prisma.pipelineState.updateMany({
        where: { workspaceId },
        data: { fallbackRate1h: { increment: 0.01 } },
      });

      const state = await this.prisma.pipelineState.findUnique({
        where: { workspaceId },
        select: { state: true, fallbackRate1h: true },
      });

      if (
        state &&
        state.state === 'active' &&
        state.fallbackRate1h >= 0.05
      ) {
        await this.prisma.pipelineState.update({
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

        await this.events.recordCommercial({
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

        this.logger.warn(
          `Pipeline auto-fallback ${workspaceId}: active -> shadow (fallbackRate1h=${state.fallbackRate1h})`,
        );
      }
    } catch (err) {
      this.logger.error(
        `Failed to handle orchestration fallback for ${workspaceId}`,
        err instanceof Error ? err.message : String(err),
      );
    }
  }
}
