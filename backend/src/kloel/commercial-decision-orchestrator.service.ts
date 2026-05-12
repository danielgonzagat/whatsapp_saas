import { Injectable, Logger } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { BrainEventSpineService } from './brain-event-spine.service';
import { ChannelSetupService } from './channel-setup.service';
import { MindConceptService } from './mind-concepts.service';
import { MindService } from './mind.service';
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

function supportedFormats(channel: string): string[] {
  if (channel === 'email') return ['text', 'html_rich'];
  if (channel === 'tiktok') return ['text', 'video'];
  if (channel === 'instagram' || channel === 'messenger')
    return ['text', 'audio', 'image', 'video'];
  return ['text', 'audio', 'image', 'document', 'template'];
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

@Injectable()
export class CommercialDecisionOrchestratorService {
  private readonly logger = new Logger(CommercialDecisionOrchestratorService.name);

  constructor(
    private readonly mind: MindService,
    private readonly concepts: MindConceptService,
    private readonly events: BrainEventSpineService,
    private readonly setup: ChannelSetupService,
  ) {}

  async orchestrateInbound(input: InboundOrchestrationInput): Promise<InboundDecision> {
    const channel = normalizeChannel(input.channel);
    const subject = input.contactId ? `contact:${input.contactId}` : `channel:${channel}`;
    const inboundKey = stableInboundKey(input, subject, channel);
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

    const audioRatio = hasConcept(conceptRows, 'audio_preference') ? 0.25 : 0.05;
    const soldRate = hasConcept(conceptRows, 'imminent_purchase') ? 0.2 : 0.05;
    const repliedRate = 0.5;
    const priceBand = priceBandFor(input.message);
    const [audio, tone, aggressiveness, format, channelChoice] = await Promise.all([
      this.mind.resolveAudioVsText(input.workspaceId, channel, audioRatio),
      this.mind.resolveTone(input.workspaceId, channel, repliedRate, soldRate, concept),
      this.mind.resolveAggressiveness(input.workspaceId, 'inbound', soldRate, repliedRate, 0),
      this.mind.resolveMessageFormat(
        input.workspaceId,
        channel,
        concept,
        supportedFormats(channel),
      ),
      this.mind.resolveChannelChoice(
        input.workspaceId,
        [channel],
        concept,
        new Date().getHours(),
        concept,
      ),
    ]);

    const decisions: Record<string, unknown> = {
      audio_vs_text: audio,
      channel_choice: channelChoice,
      message_format: format,
      tom: tone,
      cia_aggressiveness: aggressiveness,
    };

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
    return {
      actions,
      concepts: conceptRows.map((row) => row.concept),
      trace: {
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
        similarCases: similarCases.length,
      },
    };
  }
}
