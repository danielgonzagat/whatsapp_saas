import { scoreToProbabilityBucket } from './autopilot-utils';
import {
  PAGAMENTO_APROVADO_PAGA_RE,
  CURSO_PLANO_MENTORIA_PR_RE,
  OBRIGAD_VALEU_PERFEITO_RE,
  OBRIGAD_VALEU_PERFEITO_RE_2,
  PRE_C__O_VALOR_QUANTO_O_RE,
  QUERO_VOU_COMPRAR_ME_MA_RE,
  PROBLEMA_ERRO_SUPORTE_A_RE,
  PROBLEMA_RUIM_HORR_I__V_RE,
  QUERO_COMPRAR_ASSINAR_F_RE,
  PROBLEMA_ERRO_SUPORTE_A_RE_2,
  RECLAMA_CANCELAR_RE,
  CARO_SEM_DINHEIRO_AGORA_RE,
  SUMI_SEM_RESPOSTA_DEPOI_RE,
  B_SOU_HOMEM_MEU_MARIDO_RE,
  B_SOU_MULHER_MINHA_ESPO_RE,
  B__D_2___S_ANOS_B_RE,
  B___SOU_DE_MORO_EM_AQUI_RE,
} from './autopilot-types';

export function buildHeuristicCatalogScore(input: {
  joinedText: string;
  messages: Array<{ direction: string; content: string; createdAt?: Date | string | null }>;
  unreadCount: number;
  optedOutAt?: Date | string | null;
  wonDealTitle?: string | null;
  wonDealValue?: number | null;
}) {
  const text = String(input.joinedText || '').toLowerCase();
  const demographics = inferHeuristicDemographics(text);
  const inboundMessages = input.messages.filter((message) => message.direction === 'INBOUND');
  const lastInbound = inboundMessages[inboundMessages.length - 1];
  const lastInboundAt = lastInbound?.createdAt ? new Date(lastInbound.createdAt) : null;
  const ageHours =
    lastInboundAt && Number.isFinite(lastInboundAt.getTime())
      ? (Date.now() - lastInboundAt.getTime()) / 3600000
      : null;
  const reasons: string[] = [];

  if (input.optedOutAt) {
    return {
      leadScore: 0,
      purchaseProbability: 'LOW' as const,
      purchaseProbabilityScore: 0,
      sentiment: 'NEUTRAL',
      intent: 'COLD',
      summary: 'Contato bloqueado ou já convertido. Não abordar automaticamente.',
      nextBestAction: 'DO_NOT_CONTACT',
      reasons: ['opt_out_or_converted'],
      buyerStatus: 'UNKNOWN' as const,
      purchasedProduct: null,
      purchaseValue: null,
      purchaseReason: null,
      notPurchasedReason: 'opted_out',
      preferences: [],
      importantDetails: [],
      purchaseProbabilityPercent: 0,
      demographics,
    };
  }

  const boughtByDeal =
    String(input.wonDealTitle || '').trim().length > 0 ||
    (Number(input.wonDealValue || 0) || 0) > 0;
  const boughtByConversation = PAGAMENTO_APROVADO_PAGA_RE.test(text);

  if (boughtByDeal || boughtByConversation) {
    const purchaseReason = boughtByDeal
      ? 'won_deal_recorded'
      : 'payment_or_access_confirmed_in_chat';
    const purchasedProduct =
      String(input.wonDealTitle || '').trim() ||
      (CURSO_PLANO_MENTORIA_PR_RE.exec(text)?.[0] ?? null);
    const purchaseValueRaw = Number(input.wonDealValue || 0) || 0;
    const positivePostPurchaseSignal = OBRIGAD_VALEU_PERFEITO_RE.test(text);
    const repurchaseProbabilityScore = positivePostPurchaseSignal ? 0.78 : 0.56;
    const repurchaseLeadScore = Math.round(repurchaseProbabilityScore * 100);
    return {
      leadScore: repurchaseLeadScore,
      purchaseProbability: positivePostPurchaseSignal ? ('HIGH' as const) : ('MEDIUM' as const),
      purchaseProbabilityScore: repurchaseProbabilityScore,
      sentiment: OBRIGAD_VALEU_PERFEITO_RE_2.test(text) ? 'POSITIVE' : 'NEUTRAL',
      intent: 'BUY',
      summary:
        `${String(input.wonDealTitle || 'Cliente convertido').trim() || 'Cliente convertido'} com compra identificada.`.trim(),
      nextBestAction: positivePostPurchaseSignal ? 'RETAIN_AND_UPSELL' : 'CUSTOMER_SUCCESS',
      reasons: [
        purchaseReason,
        positivePostPurchaseSignal ? 'positive_post_purchase_signal' : 'existing_customer',
      ],
      buyerStatus: 'BOUGHT' as const,
      purchasedProduct,
      purchaseValue: purchaseValueRaw > 0 ? Number(purchaseValueRaw.toFixed(2)) : null,
      purchaseReason,
      notPurchasedReason: null,
      preferences: [],
      importantDetails: purchasedProduct ? [`Produto: ${purchasedProduct}`] : [],
      purchaseProbabilityPercent: Math.round(repurchaseProbabilityScore * 100),
      demographics,
    };
  }

  let leadScore = 18;
  if (inboundMessages.length >= 2) {
    leadScore += Math.min(28, inboundMessages.length * 6);
    reasons.push('multiple_recent_inbounds');
  }
  if (input.unreadCount > 0) {
    leadScore += 12;
    reasons.push('has_unread_backlog');
  }
  if (PRE_C__O_VALOR_QUANTO_O_RE.test(text)) {
    leadScore += 16;
    reasons.push('asked_price');
  }
  if (QUERO_VOU_COMPRAR_ME_MA_RE.test(text)) {
    leadScore += 24;
    reasons.push('buying_signal');
  }
  if (PROBLEMA_ERRO_SUPORTE_A_RE.test(text)) {
    leadScore -= 12;
    reasons.push('support_or_complaint');
  }
  if (ageHours !== null && ageHours <= 72) {
    leadScore += 10;
    reasons.push('recent_activity');
  }
  if (ageHours !== null && ageHours > 24 * 7) {
    leadScore -= 10;
    reasons.push('stale_interest');
  }

  leadScore = Math.max(0, Math.min(100, Math.round(leadScore)));

  const purchaseProbability = scoreToProbabilityBucket(leadScore);
  const sentiment = PROBLEMA_RUIM_HORR_I__V_RE.test(text)
    ? 'NEGATIVE'
    : OBRIGAD_VALEU_PERFEITO_RE_2.test(text)
      ? 'POSITIVE'
      : 'NEUTRAL';
  const intent = QUERO_COMPRAR_ASSINAR_F_RE.test(text)
    ? 'BUY'
    : PROBLEMA_ERRO_SUPORTE_A_RE_2.test(text)
      ? 'SUPPORT'
      : RECLAMA_CANCELAR_RE.test(text)
        ? 'COMPLAINT'
        : inboundMessages.length > 0
          ? 'INFO'
          : 'COLD';
  const nextBestAction =
    purchaseProbability === 'VERY_HIGH' || purchaseProbability === 'HIGH'
      ? 'PRIORITIZE_MANUAL_FOLLOWUP'
      : purchaseProbability === 'MEDIUM'
        ? 'NURTURE_LATER'
        : 'MONITOR_ONLY';
  const notPurchasedReason = CARO_SEM_DINHEIRO_AGORA_RE.test(text)
    ? 'objection_or_timing'
    : SUMI_SEM_RESPOSTA_DEPOI_RE.test(text)
      ? 'follow_up_needed'
      : inboundMessages.length > 0
        ? 'still_open'
        : 'insufficient_data';

  return {
    leadScore,
    purchaseProbability,
    purchaseProbabilityScore: Number((leadScore / 100).toFixed(3)),
    sentiment,
    intent,
    summary:
      inboundMessages.length > 0
        ? `Contato com ${inboundMessages.length} mensagem(ns) inbound recente(s). Último tema: ${String(lastInbound?.content || '').slice(0, 140)}`
        : 'Contato catalogado sem histórico suficiente para alta confiança.',
    nextBestAction,
    reasons,
    buyerStatus: 'NOT_BOUGHT' as const,
    purchasedProduct: null,
    purchaseValue: null,
    purchaseReason: null,
    notPurchasedReason,
    preferences: [],
    importantDetails: [],
    purchaseProbabilityPercent: Math.round((leadScore / 100) * 100),
    demographics,
  };
}

export function inferHeuristicDemographics(text: string): {
  gender: string;
  ageRange: string;
  location: string;
  confidence: number;
} {
  const normalized = String(text || '').toLowerCase();

  let gender = 'UNKNOWN';
  if (B_SOU_HOMEM_MEU_MARIDO_RE.test(normalized)) {
    gender = 'MASCULINO';
  } else if (B_SOU_MULHER_MINHA_ESPO_RE.test(normalized)) {
    gender = 'FEMININO';
  }

  const explicitAge = normalized.match(B__D_2___S_ANOS_B_RE);
  let ageRange = 'UNKNOWN';
  if (explicitAge) {
    const age = Number(explicitAge[1]);
    if (age >= 18 && age <= 24) {
      ageRange = '18-24';
    } else if (age <= 34) {
      ageRange = '25-34';
    } else if (age <= 44) {
      ageRange = '35-44';
    } else if (age <= 54) {
      ageRange = '45-54';
    } else if (age > 54) {
      ageRange = '55+';
    }
  }

  const locationMatch = normalized.match(B___SOU_DE_MORO_EM_AQUI_RE) || null;
  const location = locationMatch?.[1] ? String(locationMatch[1]).trim() : 'UNKNOWN';

  let confidence = 0;
  if (gender !== 'UNKNOWN') {
    confidence = Math.max(confidence, 0.35);
  }
  if (ageRange !== 'UNKNOWN') {
    confidence = Math.max(confidence, 0.55);
  }
  if (location !== 'UNKNOWN') {
    confidence = Math.max(confidence, 0.45);
  }

  return {
    gender,
    ageRange,
    location,
    confidence,
  };
}
