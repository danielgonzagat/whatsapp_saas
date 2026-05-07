import {
  PRECO_PRE_O_VALOR_QUANT_RE,
  RECLAMA_RUIM_PROBLEMA_C_RE,
} from './neuro-crm-analysis.shared';

import type {
  AnalysisContact,
  AnalysisResult,
  IntentBucket,
  PurchaseProbabilityBucket,
  RawAnalysis,
  SentimentBucket,
} from './neuro-crm-analysis.shared';

function coerceToString(value: unknown): string {
  if (typeof value === 'string') {
    return value;
  }
  if (typeof value === 'number' || typeof value === 'boolean' || typeof value === 'bigint') {
    return String(value);
  }
  return '';
}

function normalizeProbabilityBucket(value: unknown): PurchaseProbabilityBucket {
  const normalized = coerceToString(value).trim().toUpperCase();
  if (
    normalized === 'LOW' ||
    normalized === 'MEDIUM' ||
    normalized === 'HIGH' ||
    normalized === 'VERY_HIGH'
  ) {
    return normalized;
  }
  if (normalized.includes('ALTA') || normalized.includes('HIGH')) {
    return 'HIGH';
  }
  if (normalized.includes('BAIXA') || normalized.includes('LOW')) {
    return 'LOW';
  }
  return 'LOW';
}

function normalizeProbabilityScore(value: unknown, leadScore: number, bucket: string): number {
  const numeric = Number(value);
  if (Number.isFinite(numeric)) {
    const normalized = numeric > 1 ? numeric / 100 : numeric;
    return Math.max(0, Math.min(1, Number(normalized.toFixed(3))));
  }

  if (bucket === 'VERY_HIGH') {
    return 0.95;
  }
  if (bucket === 'HIGH') {
    return Math.max(0.75, Number((leadScore / 100).toFixed(3)));
  }
  if (bucket === 'MEDIUM') {
    return Math.max(0.35, Number((leadScore / 100).toFixed(3)));
  }
  return Math.min(0.2, Number((leadScore / 100).toFixed(3)));
}

function normalizeSentiment(value: unknown): SentimentBucket {
  const normalized = coerceToString(value).trim().toUpperCase();
  if (normalized === 'POSITIVE' || normalized === 'NEUTRAL' || normalized === 'NEGATIVE') {
    return normalized;
  }
  if (normalized.includes('POSITIV')) {
    return 'POSITIVE';
  }
  if (normalized.includes('NEGATIV')) {
    return 'NEGATIVE';
  }
  return 'NEUTRAL';
}

function normalizeIntent(value: unknown): IntentBucket {
  const normalized = coerceToString(value).trim().toUpperCase();
  if (
    normalized === 'BUY' ||
    normalized === 'SUPPORT' ||
    normalized === 'COMPLAINT' ||
    normalized === 'INFO' ||
    normalized === 'COLD'
  ) {
    return normalized;
  }
  if (normalized.includes('COMPRA') || normalized.includes('BUY')) {
    return 'BUY';
  }
  if (normalized.includes('SUPORTE') || normalized.includes('SUPPORT')) {
    return 'SUPPORT';
  }
  if (normalized.includes('RECLAM')) {
    return 'COMPLAINT';
  }
  return 'INFO';
}

function buildFallbackSummary(
  contact: AnalysisContact,
  history: string,
  leadScore: number,
): string {
  if (history) {
    return `${contact.name || contact.phone} tem histórico recente e score ${leadScore}/100.`;
  }
  return `${contact.name || contact.phone} ainda tem pouco histórico e score ${leadScore}/100.`;
}

export function normalizeAnalysis(
  raw: RawAnalysis,
  contact: AnalysisContact,
  history: string,
): AnalysisResult {
  const leadScore = Math.max(
    0,
    Math.min(100, Number(raw?.leadScore ?? raw?.score ?? contact?.leadScore ?? 50) || 0),
  );
  const purchaseProbability = normalizeProbabilityBucket(raw?.purchaseProbability ?? raw?.urgency);
  const purchaseProbabilityScore = normalizeProbabilityScore(
    raw?.purchaseProbabilityScore,
    leadScore,
    purchaseProbability,
  );
  const sentiment = normalizeSentiment(raw?.sentiment ?? contact?.sentiment);
  const intent = normalizeIntent(raw?.intent);
  const summary =
    coerceToString(raw?.summary).trim() || buildFallbackSummary(contact, history, leadScore);
  const nextBestAction = coerceToString(raw?.nextBestAction).trim() || 'FOLLOW_UP_SOFT';
  const cluster = coerceToString(raw?.cluster).trim() || null;
  const reasons = Array.isArray(raw?.reasons)
    ? raw.reasons.map((reason) => coerceToString(reason).trim()).filter(Boolean)
    : [];

  return {
    leadScore,
    purchaseProbability,
    purchaseProbabilityScore,
    sentiment,
    intent,
    summary,
    nextBestAction,
    cluster,
    reasons,
  };
}

export function buildFallbackAnalysis(contact: AnalysisContact, history: string): AnalysisResult {
  const normalizedHistory = String(history || '').toLowerCase();
  const leadScore = normalizedHistory
    ? Math.max(20, Math.min(95, 30 + contact.messages.length * 6))
    : Math.max(10, contact.leadScore || 10);
  const buyingSignal = PRECO_PRE_O_VALOR_QUANT_RE.test(normalizedHistory);
  const complaintSignal = RECLAMA_RUIM_PROBLEMA_C_RE.test(normalizedHistory);
  const intent = complaintSignal ? 'COMPLAINT' : buyingSignal ? 'BUY' : history ? 'INFO' : 'COLD';
  const sentiment = complaintSignal ? 'NEGATIVE' : buyingSignal ? 'POSITIVE' : 'NEUTRAL';
  const purchaseProbability =
    buyingSignal && leadScore >= 80
      ? 'VERY_HIGH'
      : buyingSignal
        ? 'HIGH'
        : leadScore >= 45
          ? 'MEDIUM'
          : 'LOW';

  return {
    leadScore,
    purchaseProbability,
    purchaseProbabilityScore: normalizeProbabilityScore(null, leadScore, purchaseProbability),
    sentiment,
    intent,
    summary: buildFallbackSummary(contact, history, leadScore),
    nextBestAction:
      intent === 'BUY'
        ? 'SEND_OFFER'
        : intent === 'COMPLAINT'
          ? 'TRATAR_OBJECAO'
          : 'FOLLOW_UP_SOFT',
    cluster:
      purchaseProbability === 'VERY_HIGH' || purchaseProbability === 'HIGH'
        ? 'Warm'
        : purchaseProbability === 'MEDIUM'
          ? 'Warm'
          : 'Cold',
    reasons: buyingSignal
      ? ['buying_signal_detected']
      : complaintSignal
        ? ['complaint_signal_detected']
        : ['insufficient_signal'],
  };
}
