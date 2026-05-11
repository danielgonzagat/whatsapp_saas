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

function buildReplyDraft(input: {
  aggressiveness: string;
  concept: string;
  couponAction?: string;
  productOffer?: string;
  setup?: { arsenalCount: number; productCount: number; tone?: string | null };
  tone: string;
}): string {
  const parts = [
    `Responder com tom ${(input.setup?.tone || input.tone).toLowerCase()} e intensidade ${input.aggressiveness.toLowerCase()}.`,
  ];
  if (input.setup?.productCount) {
    parts.push(
      `Usar apenas os ${input.setup.productCount} produto(s) habilitados para este canal.`,
    );
  }
  if (input.setup?.arsenalCount) {
    parts.push(`Priorizar o arsenal aprovado do canal quando o formato permitir.`);
  }
  if (input.concept === 'price_objection' && input.couponAction) {
    parts.push(`Tratar a objeção de preço com política ${input.couponAction}.`);
  }
  if (input.productOffer) {
    parts.push(`Direcionar a oferta para ${input.productOffer}.`);
  }
  if (input.concept === 'imminent_purchase' || input.concept === 'hot_lead') {
    parts.push('Conduzir para o próximo passo de compra.');
  }
  return parts.join(' ');
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
    if (hasConcept(conceptRows, 'imminent_purchase') || hasConcept(conceptRows, 'hot_lead')) {
      const product = await this.mind.resolveProductOffer(
        input.workspaceId,
        'new_lead',
        concept,
        priceBand,
      );
      decisions.product_offer = product;
      productOfferDecision = product;
      productOffer = product.offer;
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

    const setupContext = channelSetup
      ? {
          arsenalCount: channelSetup.arsenal.length,
          productCount: channelSetup.selectedProductIds.length,
          tone: channelSetup.config?.tone,
        }
      : undefined;
    const replyDraft = buildReplyDraft({
      aggressiveness: aggressiveness.aggressiveness,
      concept,
      couponAction,
      productOffer,
      setup: setupContext,
      tone: tone.tone,
    });
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
          message: replyDraft,
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
