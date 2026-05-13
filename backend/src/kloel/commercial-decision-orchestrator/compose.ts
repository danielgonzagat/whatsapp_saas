import { discountPercentFromCoupon, type InternalReplyPlan } from './types';
import type { PredecidedAction } from '../unified-agent.types';

const FORBIDDEN_INTERNAL_DIRECTIVES = [
  /(?:^|\n)\s*responder com tom\b/i,
  /(?:^|\n)\s*usar (?:apenas )?os \d+ produto/i,
  /(?:^|\n|\.\s+)priorizar o arsenal\b/i,
  /(?:^|\n|\.\s+)tratar a objeç[aã]o de pre[cç]o\b/i,
  /(?:^|\n|\.\s+)direcionar a oferta para\b/i,
  /(?:^|\n|\.\s+)conduzir para o pr[oó]ximo passo de compra\b/i,
];

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
  return 'Recebi sua mensagem e já estou olhando aqui para te responder com o melhor caminho. Volto em instantes.';
}

export function buildReplyPlan(params: {
  concept: string;
  effectiveAggressiveness: string;
  aggressiveness: string;
  couponAction?: string;
  productOffer?: string;
  channelSetup: {
    arsenal?: Array<unknown>;
    selectedProductIds?: string[];
    config?: { tone?: string; aggressiveness?: string } | null;
  } | null;
  tone: string;
}): InternalReplyPlan {
  const channelTone = params.channelSetup?.config?.tone;
  const setupContext:
    | { arsenalCount: number; productCount: number; tone?: string | null }
    | undefined = params.channelSetup
    ? channelTone != null
      ? {
          arsenalCount: (params.channelSetup.arsenal ?? []).length,
          productCount: (params.channelSetup.selectedProductIds ?? []).length,
          tone: channelTone,
        }
      : {
          arsenalCount: (params.channelSetup.arsenal ?? []).length,
          productCount: (params.channelSetup.selectedProductIds ?? []).length,
        }
    : undefined;
  return {
    aggressiveness: params.effectiveAggressiveness || params.aggressiveness,
    concept: params.concept,
    ...(params.couponAction !== undefined ? { couponAction: params.couponAction } : {}),
    ...(params.productOffer !== undefined ? { productOffer: params.productOffer } : {}),
    ...(setupContext !== undefined ? { setup: setupContext } : {}),
    tone: channelTone || params.tone,
  };
}

export function buildActions(params: {
  couponDecision?: Record<string, unknown>;
  discountPercentFromCoupon: (action?: string) => number | undefined;
  productOfferDecision?: Record<string, unknown>;
  humanTransferDecision?: Record<string, unknown>;
  decisionTraceId: string;
  inboundKey: string;
  customerMessage: string;
  internalReplyPlan: InternalReplyPlan;
  priceBand: string;
  segment: string;
}): PredecidedAction[] {
  const actions: PredecidedAction[] = [];
  const discountFn = params.discountPercentFromCoupon;
  const couponDecision = params.couponDecision;
  const couponPercent =
    couponDecision && 'action' in couponDecision
      ? discountFn(String((couponDecision as Record<string, unknown>).action))
      : undefined;
  if (couponDecision && couponPercent) {
    actions.push({
      tool: 'apply_discount',
      args: {
        couponDecision,
        decisionTraceId: params.decisionTraceId,
        discountPercent: couponPercent,
        expiresIn: '24h',
        inboundCorrelationId: params.inboundKey,
        priceBand: params.priceBand,
        productOffer: params.productOfferDecision,
        reason: 'Política MIND decidida no pipeline determinístico.',
        segment: params.segment,
      },
    });
  } else {
    actions.push({
      tool: 'send_message',
      args: {
        decisionTraceId: params.decisionTraceId,
        inboundCorrelationId: params.inboundKey,
        message: params.customerMessage,
        internalReplyPlan: params.internalReplyPlan,
      },
    });
  }
  if (
    params.humanTransferDecision &&
    (params.humanTransferDecision as Record<string, unknown>).action !== 'continue_ai' &&
    (params.humanTransferDecision as Record<string, unknown>).action !== 'pause_wait'
  ) {
    actions.push({
      tool: 'transfer_to_human',
      args: {
        decisionTraceId: params.decisionTraceId,
        handoffDecision: params.humanTransferDecision,
        inboundCorrelationId: params.inboundKey,
        priority: 'high',
        reason: 'Pipeline determinístico detectou risco comercial.',
      },
    });
  }
  return actions;
}
