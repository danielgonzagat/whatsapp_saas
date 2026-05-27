import { attributeHierarchy } from '../economic-hierarchy';
import { MindService } from '../mind.service';
import {
  hasConcept,
  type ConceptRow,
} from './types';

export type ScoringInput = {
  workspaceId: string;
  channel: string;
  message: string;
  conceptRows: ConceptRow[];
  concept: string;
  formatCandidates: string[];
  audioRatio: number;
  soldRate: number;
  repliedRate: number;
  priceBand: string;
  channelSetup: {
    arsenal?: Array<{ id: string; type?: string }>;
    config?: { tone?: string; aggressiveness?: string } | null;
    selectedProductIds?: string[];
  } | null;
};

export type ScoringOutput = {
  tone: { tone: string; confidence: number; fallback: boolean };
  aggressiveness: { aggressiveness: string; confidence: number; fallback: boolean };
  format: { format: string; confidence: number; fallback: boolean };
  channelChoice: { channel: string; confidence: number; fallback: boolean };
  audio: { choice: string; confidence: number; fallback: boolean };
  couponDecision?: Record<string, unknown> | undefined;
  couponAction?: string | undefined;
  productOfferDecision?: Record<string, unknown> | undefined;
  productOffer?: string | undefined;
  humanTransferDecision?: Record<string, unknown> | undefined;
  effectiveAggressiveness: string;
  decisions: Record<string, unknown>;
  concept: string;
  conceptRows: ConceptRow[];
};

export async function resolveDecisions(
  mind: MindService,
  input: ScoringInput,
): Promise<ScoringOutput> {
  const {
    workspaceId,
    channel,
    conceptRows,
    concept,
    formatCandidates,
    audioRatio,
    soldRate,
    repliedRate,
    priceBand,
    channelSetup,
  } = input;

  const decisions: Record<string, unknown> = {};
  const allConcepts = conceptRows.map((r) => r.concept);

  const audio = await mind.resolveAudioVsText(workspaceId, channel, audioRatio);

  const [toneRaw, aggressivenessRaw, format, channelChoice] = await Promise.all([
    mind.resolveTone(workspaceId, channel, repliedRate, soldRate, concept),
    mind.resolveAggressiveness(
      workspaceId,
      `inbound:${channel}`,
      soldRate,
      repliedRate,
      0,
    ),
    mind.resolveMessageFormat(workspaceId, channel, concept, formatCandidates),
    mind.resolveChannelChoice(
      workspaceId,
      [channel],
      concept,
      new Date().getHours(),
      concept,
    ),
  ]);

  decisions.audio_vs_text = {
    ...audio,
    hierarchyJustification: attributeHierarchy({
      type: 'audio_vs_text',
      chosen: audio.choice,
      context: {
        audioRatio,
        arsenalCount: channelSetup?.arsenal?.length ?? 0,
        concept,
        concepts: allConcepts,
        confidence: audio.confidence,
      },
    }),
  };
  decisions.channel_choice = {
    ...channelChoice,
    hierarchyJustification: attributeHierarchy({
      type: 'channel_choice',
      chosen: channelChoice.channel,
      context: { concept, concepts: allConcepts, confidence: channelChoice.confidence },
    }),
  };
  decisions.message_format = {
    ...format,
    hierarchyJustification: attributeHierarchy({
      type: 'message_format',
      chosen: format.format,
      context: { concept, concepts: allConcepts, confidence: format.confidence },
    }),
  };
  decisions.tom = {
    ...toneRaw,
    hierarchyJustification: attributeHierarchy({
      type: 'tom',
      chosen: toneRaw.tone,
      context: {
        concept,
        concepts: allConcepts,
        confidence: toneRaw.confidence,
        repliedRate,
        soldRate,
      },
    }),
  };
  decisions.cia_aggressiveness = {
    ...aggressivenessRaw,
  };

  let couponAction: string | undefined;
  let couponDecision: Record<string, unknown> | undefined;
  if (hasConcept(conceptRows, 'price_objection')) {
    const coupon = await mind.resolveCoupon(workspaceId, priceBand, soldRate, concept);
    const objection = await mind.resolveObjectionResponse(
      workspaceId,
      channel,
      concept,
      priceBand,
    );
    const discountPct = (() => {
      if (coupon.action === 'coupon_5') {return 5;}
      if (coupon.action === 'coupon_10') {return 10;}
      if (coupon.action === 'coupon_15') {return 15;}
      if (coupon.action === 'coupon_20') {return 20;}
      return 0;
    })();
    decisions.coupon_offer = {
      ...coupon,
      hierarchyJustification: attributeHierarchy({
        type: 'coupon_offer',
        chosen: coupon.action,
        context: {
          concept,
          concepts: allConcepts,
          confidence: coupon.confidence,
          discountPercent: discountPct,
          channelMaxDiscount: 100,
        },
      }),
    };
    decisions.objection_response = {
      ...objection,
      hierarchyJustification: attributeHierarchy({
        type: 'objection_response',
        chosen: objection.strategy,
        context: { concept, concepts: allConcepts, confidence: objection.confidence, priceBand },
      }),
    };
    couponDecision = {
      ...coupon,
      hierarchyJustification: (decisions.coupon_offer as { hierarchyJustification?: unknown }).hierarchyJustification,
    };
    couponAction = coupon.action;
  }

  let productOffer: string | undefined;
  let productOfferDecision: Record<string, unknown> | undefined;
  const allowedProductIds = channelSetup?.selectedProductIds ?? [];
  if (hasConcept(conceptRows, 'imminent_purchase') || hasConcept(conceptRows, 'hot_lead')) {
    if (allowedProductIds.length === 0 && channelSetup) {
      decisions.product_offer = {
        offer: 'cold_start_no_products',
        confidence: 0,
        fallback: true,
        reason: 'channel-setup has zero selectedProductIds',
        hierarchyJustification: attributeHierarchy({
          type: 'product_offer',
          chosen: 'cold_start_no_products',
          context: { concept, concepts: allConcepts, confidence: 0 },
        }),
      };
    } else {
      const product = await mind.resolveProductOffer(
        workspaceId,
        'new_lead',
        concept,
        priceBand,
        undefined,
        { channel, allowedProductIds },
      );
      decisions.product_offer = {
        ...product,
        hierarchyJustification: attributeHierarchy({
          type: 'product_offer',
          chosen: product.offer,
          context: {
            concept,
            concepts: allConcepts,
            confidence: product.confidence,
            priceBand,
            repliedRate,
            segment: 'new_lead',
          },
        }),
      };
      productOfferDecision = {
        ...product,
        hierarchyJustification: (decisions.product_offer as { hierarchyJustification?: unknown }).hierarchyJustification,
      };
      productOffer = product.offer;
    }
  }

  const aggressivenessCeiling = String(channelSetup?.config?.aggressiveness || '').toLowerCase();
  const brainAggressiveness = String(aggressivenessRaw.aggressiveness || '').toLowerCase();
  const aggressivenessRank = (label: string): number => {
    if (label.includes('alta') || label.includes('agress')) {return 3;}
    if (label.includes('normal') || label.includes('moder')) {return 2;}
    if (label.includes('baixa')) {return 1;}
    return 2;
  };
  const effectiveAggressiveness =
    aggressivenessCeiling &&
    aggressivenessRank(brainAggressiveness) > aggressivenessRank(aggressivenessCeiling)
      ? aggressivenessCeiling
      : aggressivenessRank(brainAggressiveness) === aggressivenessRank(aggressivenessCeiling)
        ? brainAggressiveness
        : brainAggressiveness;
  if (aggressivenessCeiling && effectiveAggressiveness !== brainAggressiveness) {
    decisions.aggressiveness_ceiling_applied = {
      brain: brainAggressiveness,
      ceiling: aggressivenessCeiling,
      effective: effectiveAggressiveness,
    };
  }

  decisions.cia_aggressiveness = {
    ...aggressivenessRaw,
    hierarchyJustification: attributeHierarchy({
      type: 'cia_aggressiveness',
      chosen: effectiveAggressiveness || aggressivenessRaw.aggressiveness,
      context: {
        concept,
        concepts: allConcepts,
        confidence: aggressivenessRaw.confidence,
        aggressivenessCeiling,
        brainAggressiveness,
        soldRate,
        repliedRate,
      },
    }),
  };

  let humanTransferDecision: Record<string, unknown> | undefined;
  if (hasConcept(conceptRows, 'trust_objection') || hasConcept(conceptRows, 'fatigue_risk')) {
    const transferConcept = hasConcept(conceptRows, 'trust_objection')
      ? 'trust_objection'
      : 'fatigue_risk';
    const transfer = await mind.resolveHumanTransfer(
      workspaceId,
      channel,
      transferConcept,
      0.7,
    );
    decisions.human_transfer = {
      ...transfer,
      hierarchyJustification: attributeHierarchy({
        type: 'human_transfer',
        chosen: transfer.action,
        context: {
          concept: transferConcept,
          concepts: allConcepts,
          confidence: transfer.confidence,
        },
      }),
    };
    humanTransferDecision = {
      ...transfer,
      hierarchyJustification: (decisions.human_transfer as { hierarchyJustification?: unknown }).hierarchyJustification,
    };
  }

  return {
    tone: toneRaw,
    aggressiveness: aggressivenessRaw,
    format,
    channelChoice,
    audio,
    couponDecision,
    couponAction,
    productOfferDecision,
    productOffer,
    humanTransferDecision,
    effectiveAggressiveness,
    decisions,
    concept,
    conceptRows,
  };
}
