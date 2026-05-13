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

interface CatalogScoreResult {
  leadScore: number;
  purchaseProbability: string;
  purchaseProbabilityScore: number;
  sentiment: string;
  intent: string;
  summary: string;
  nextBestAction: string;
  reasons: string[];
  buyerStatus: string;
  purchasedProduct: string | null;
  purchaseValue: number | null;
  purchaseReason: string | null;
  notPurchasedReason: string | null;
  preferences: string[];
  importantDetails: string[];
  purchaseProbabilityPercent: number;
  demographics: ReturnType<typeof inferHeuristicDemographics>;
}

function computeHeuristicScore(
  text: string,
  inboundCount: number,
  unreadCount: number,
  ageHours: number | null,
): { score: number; reasons: string[] } {
  let score = 18;
  const reasons: string[] = [];

  if (inboundCount >= 2) {
    score += Math.min(28, inboundCount * 6);
    reasons.push('multiple_recent_inbounds');
  }
  if (unreadCount > 0) {
    score += unreadCount >= 3 ? 15 : 12;
    reasons.push('has_unread_backlog');
  }
  if (PRE_C__O_VALOR_QUANTO_O_RE.test(text)) {
    score += 16;
    reasons.push('asked_price');
  }
  if (QUERO_VOU_COMPRAR_ME_MA_RE.test(text)) {
    score += 24;
    reasons.push('buying_signal');
  }
  if (PROBLEMA_ERRO_SUPORTE_A_RE.test(text)) {
    score -= 12;
    reasons.push('support_or_complaint');
  }
  if (ageHours !== null && ageHours <= 72) {
    score += 10;
    reasons.push('recent_activity');
  }
  if (ageHours !== null && ageHours > 24 * 7) {
    score -= 10;
    reasons.push('stale_interest');
  }

  score = Math.max(0, Math.min(100, Math.round(score)));
  return { score, reasons };
}

function inferHeuristicSentiment(text: string): string {
  if (PROBLEMA_RUIM_HORR_I__V_RE.test(text)) return 'NEGATIVE';
  if (OBRIGAD_VALEU_PERFEITO_RE_2.test(text)) return 'POSITIVE';
  return 'NEUTRAL';
}

function inferHeuristicIntent(text: string, inboundCount: number): string {
  if (QUERO_COMPRAR_ASSINAR_F_RE.test(text)) return 'BUY';
  if (PROBLEMA_ERRO_SUPORTE_A_RE_2.test(text)) return 'SUPPORT';
  if (RECLAMA_CANCELAR_RE.test(text)) return 'COMPLAINT';
  if (inboundCount > 0) return 'INFO';
  return 'COLD';
}

function inferHeuristicNextBestAction(purchaseProbability: string): string {
  if (purchaseProbability === 'VERY_HIGH' || purchaseProbability === 'HIGH')
    return 'PRIORITIZE_MANUAL_FOLLOWUP';
  if (purchaseProbability === 'MEDIUM') return 'NURTURE_LATER';
  return 'MONITOR_ONLY';
}

function inferHeuristicNotPurchasedReason(text: string, inboundCount: number): string {
  if (CARO_SEM_DINHEIRO_AGORA_RE.test(text)) return 'objection_or_timing';
  if (SUMI_SEM_RESPOSTA_DEPOI_RE.test(text)) return 'follow_up_needed';
  if (inboundCount > 0) return 'still_open';
  return 'insufficient_data';
}

function buildBoughtResult(input: {
  text: string;
  demographics: ReturnType<typeof inferHeuristicDemographics>;
  wonDealTitle?: string | null;
  wonDealValue?: number | null;
  boughtByDeal: boolean;
}): CatalogScoreResult {
  const purchaseReason = input.boughtByDeal
    ? 'won_deal_recorded'
    : 'payment_or_access_confirmed_in_chat';
  const purchasedProduct =
    String(input.wonDealTitle || '').trim() ||
    (CURSO_PLANO_MENTORIA_PR_RE.exec(input.text)?.[0] ?? null);
  const purchaseValueRaw = Number(input.wonDealValue || 0) || 0;
  const positivePostPurchaseSignal = OBRIGAD_VALEU_PERFEITO_RE.test(input.text);
  const repurchaseProbabilityScore = positivePostPurchaseSignal ? 0.78 : 0.56;
  const repurchaseLeadScore = Math.round(repurchaseProbabilityScore * 100);
  const purchasedTitle =
    String(input.wonDealTitle || 'Cliente convertido').trim() || 'Cliente convertido';
  return {
    leadScore: repurchaseLeadScore,
    purchaseProbability: positivePostPurchaseSignal ? ('HIGH' as const) : ('MEDIUM' as const),
    purchaseProbabilityScore: repurchaseProbabilityScore,
    sentiment: OBRIGAD_VALEU_PERFEITO_RE_2.test(input.text) ? 'POSITIVE' : 'NEUTRAL',
    intent: 'BUY',
    summary: `${purchasedTitle} com compra identificada.`,
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
    demographics: input.demographics,
  };
}

function buildOptedOutResult(
  demographics: ReturnType<typeof inferHeuristicDemographics>,
): CatalogScoreResult {
  return {
    leadScore: 0,
    purchaseProbability: 'LOW' as const,
    purchaseProbabilityScore: 0,
    sentiment: 'NEUTRAL',
    intent: 'COLD',
    summary: 'Contato bloqueado ou ja convertido. Nao abordar automaticamente.',
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

function buildColdLeadResult(
  leadScore: number,
  reasons: string[],
  text: string,
  inboundCount: number,
  lastInboundContent: string | null,
  demographics: ReturnType<typeof inferHeuristicDemographics>,
): CatalogScoreResult {
  const purchaseProbability = scoreToProbabilityBucket(leadScore);
  const sentiment = inferHeuristicSentiment(text);
  const intent = inferHeuristicIntent(text, inboundCount);
  const nextBestAction = inferHeuristicNextBestAction(purchaseProbability);
  const notPurchasedReason = inferHeuristicNotPurchasedReason(text, inboundCount);
  const summary =
    inboundCount > 0
      ? `Contato com ${inboundCount} mensagem(ns) inbound recente(s). Ultimo tema: ${String(lastInboundContent || '').slice(0, 140)}`
      : 'Contato catalogado sem historico suficiente para alta confianca.';

  return {
    leadScore,
    purchaseProbability,
    purchaseProbabilityScore: Number((leadScore / 100).toFixed(3)),
    sentiment,
    intent,
    summary,
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

  if (input.optedOutAt) {
    return buildOptedOutResult(demographics);
  }

  const boughtByDeal =
    String(input.wonDealTitle || '').trim().length > 0 ||
    (Number(input.wonDealValue || 0) || 0) > 0;

  if (boughtByDeal || PAGAMENTO_APROVADO_PAGA_RE.test(text)) {
    return buildBoughtResult({
      text,
      demographics,
      wonDealTitle: input.wonDealTitle ?? null,
      wonDealValue: input.wonDealValue ?? null,
      boughtByDeal,
    });
  }

  const { score, reasons } = computeHeuristicScore(
    text,
    inboundMessages.length,
    input.unreadCount,
    ageHours,
  );
  return buildColdLeadResult(
    score,
    reasons,
    text,
    inboundMessages.length,
    lastInbound?.content ?? null,
    demographics,
  );
}

export function inferHeuristicDemographics(text: string): {
  gender: string;
  ageRange: string;
  location: string;
  confidence: number;
} {
  const normalized = String(text || '').toLowerCase();

  let gender = 'UNKNOWN';
  if (B_SOU_MULHER_MINHA_ESPO_RE.test(normalized)) {
    gender = 'FEMININO';
  } else if (B_SOU_HOMEM_MEU_MARIDO_RE.test(normalized)) {
    gender = 'MASCULINO';
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
