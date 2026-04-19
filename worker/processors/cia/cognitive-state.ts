import { randomUUID } from 'node:crypto';
import type { Prisma, PrismaClient } from '@prisma/client';
import type { DemandState } from '../../providers/commercial-intelligence';
// biome-ignore lint/performance/noNamespaceImport: RX aggregates ~20 regex constants consumed as RX.*_RE — listing all named imports is noisier
import * as RX from './cognitive-state-patterns';

const U0300__U036F_RE = /[\u0300-\u036f]/g;
const B_MEU_MINHA_MEUS_MINHAS_RE = /\b(meu|minha|meus|minhas|empresa|rotina|cliente|trabalho)\b/gi;

export type CustomerIntent =
  | 'BUYING'
  | 'PAYMENT'
  | 'SUPPORT'
  | 'OBJECTION'
  | 'CURIOUS'
  | 'POST_SALE'
  | 'UNKNOWN';

export type CustomerStage = 'COLD' | 'WARM' | 'HOT' | 'CHECKOUT' | 'POST_SALE' | 'SUPPORT';

export type CognitiveActionType =
  | 'RESPOND'
  | 'ASK_CLARIFYING'
  | 'SOCIAL_PROOF'
  | 'OFFER'
  | 'FOLLOWUP_SOFT'
  | 'FOLLOWUP_URGENT'
  | 'PAYMENT_RECOVERY'
  | 'WAIT'
  | 'ESCALATE_HUMAN';

export interface CustomerCognitiveState {
  conversationId?: string | null;
  contactId?: string | null;
  phone?: string | null;
  contactName?: string | null;
  intent: CustomerIntent;
  stage: CustomerStage;
  trustScore: number;
  urgencyScore: number;
  priceSensitivity: number;
  objections: string[];
  desires: string[];
  trustSignals: string[];
  lastOffer?: string | null;
  lastAction?: string | null;
  nextBestAction: CognitiveActionType;
  silenceMinutes: number;
  ltvEstimate: number;
  paymentState: 'NONE' | 'PENDING' | 'READY_TO_PAY' | 'PAID';
  lastOutcome?: string | null;
  riskFlags: string[];
  emotionalTone?:
    | 'positive'
    | 'negative'
    | 'neutral'
    | 'frustrated'
    | 'excited'
    | 'anxious'
    | 'confused';
  disclosureLevel?: number;
  corePain?: string | null;
  preferredStyle?: 'direct' | 'empathetic' | 'consultative' | 'technical';
  nextBestQuestion?: string | null;
  classificationConfidence: number;
  summary: string;
  updatedAt: string;
}

export interface RecordDecisionOutcomeInput {
  workspaceId: string;
  contactId?: string;
  conversationId?: string;
  phone?: string;
  action: CognitiveActionType | string;
  outcome: string;
  reward?: number;
  message?: string;
  metadata?: Prisma.InputJsonObject;
}

const BUYING_HINTS = [
  'preco',
  'preço',
  'valor',
  'quanto',
  'custa',
  'parcel',
  'pix',
  'boleto',
  'comprar',
  'quero',
  'fechar',
  'pagar',
  'pagamento',
];

const SUPPORT_HINTS = [
  'suporte',
  'ajuda',
  'erro',
  'problema',
  'nao chegou',
  'não chegou',
  'atraso',
  'cancel',
  'troca',
  'reembolso',
  'devolu',
];

const LEGAL_RISK_HINTS = ['procon', 'advog', 'process', 'reclama', 'justi', 'jurid', 'amea'];

const TRUST_OBJECTION_HINTS = [
  'funciona',
  'confiavel',
  'confiável',
  'garantia',
  'seguro',
  'depoimento',
  'resultado',
];

const URGENCY_HINTS = ['hoje', 'agora', 'urgente', 'rapido', 'rápido', 'ainda hoje', 'essa semana'];

const DESIRE_HINTS: Array<{ keyword: string; tag: string }> = [
  { keyword: 'resultado', tag: 'resultado_rapido' },
  { keyword: 'seguro', tag: 'seguranca' },
  { keyword: 'natural', tag: 'naturalidade' },
  { keyword: 'parcela', tag: 'parcelamento' },
  { keyword: 'pix', tag: 'facilidade_pagamento' },
];

function clamp(value: number, min = 0, max = 1) {
  return Math.min(max, Math.max(min, value));
}

function normalizeText(value?: string | null) {
  return String(value || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(U0300__U036F_RE, '');
}

function includesAny(text: string, keywords: string[]) {
  return keywords.some((keyword) => text.includes(keyword));
}

function uniqueTokens(values: Array<string | null | undefined>) {
  return [...new Set(values.map((item) => String(item || '').trim()).filter(Boolean))];
}

function inferPaymentState(text: string) {
  if (RX.PAGO_PAGUEI_COMPENSADO_RE.test(text)) {
    return 'PAID' as const;
  }
  if (RX.PIX_BOLETO_LINK_PAGAMEN_RE.test(text)) {
    return 'PENDING' as const;
  }
  if (RX.QUERO_FECHAR_QUERO_PAGA_RE.test(text)) {
    return 'READY_TO_PAY' as const;
  }
  return 'NONE' as const;
}

function inferIntent(params: {
  text: string;
  unreadCount: number;
  paymentState: CustomerCognitiveState['paymentState'];
  leadScore?: number | null;
}) {
  const { text, unreadCount, paymentState } = params;
  if (paymentState === 'PENDING' || paymentState === 'READY_TO_PAY') {
    return 'PAYMENT' as const;
  }
  if (includesAny(text, SUPPORT_HINTS)) {
    return 'SUPPORT' as const;
  }
  if (includesAny(text, BUYING_HINTS)) {
    return 'BUYING' as const;
  }
  if (includesAny(text, TRUST_OBJECTION_HINTS)) {
    return 'OBJECTION' as const;
  }
  if ((Number(params.leadScore || 0) || 0) >= 70 || unreadCount > 0) {
    return 'CURIOUS' as const;
  }
  return 'UNKNOWN' as const;
}

function inferStage(params: {
  intent: CustomerIntent;
  paymentState: CustomerCognitiveState['paymentState'];
  trustScore: number;
  urgencyScore: number;
}) {
  if (params.intent === 'SUPPORT') return 'SUPPORT' as const;
  if (params.paymentState === 'PAID') return 'POST_SALE' as const;
  if (params.paymentState === 'PENDING' || params.paymentState === 'READY_TO_PAY') {
    return 'CHECKOUT' as const;
  }
  if (params.intent === 'BUYING' && (params.trustScore >= 0.58 || params.urgencyScore >= 0.72)) {
    return 'HOT' as const;
  }
  if (params.intent === 'BUYING' || params.intent === 'CURIOUS' || params.intent === 'OBJECTION') {
    return 'WARM' as const;
  }
  return 'COLD' as const;
}

function inferObjections(text: string) {
  const objections: string[] = [];
  if (RX.PRECO_PRE_O_VALOR_CARO_RE.test(text)) {
    objections.push('price');
  }
  if (RX.FUNCIONA_GARANTIA_SEGUR_RE.test(text)) {
    objections.push('trust');
  }
  if (RX.PRAZO_DEMORA_ENTREGA_QU_RE.test(text)) {
    objections.push('timing');
  }
  return objections;
}

function inferDesires(text: string) {
  return uniqueTokens(
    DESIRE_HINTS.filter((item) => text.includes(item.keyword)).map((item) => item.tag),
  );
}

function inferRiskFlags(text: string, intent: CustomerIntent) {
  const riskFlags: string[] = [];
  if (includesAny(text, LEGAL_RISK_HINTS)) {
    riskFlags.push('LEGAL_RISK');
  }
  // nosemgrep: javascript.lang.security.audit.detect-non-literal-regexp.regex-dos-vulnerability.regex-dos-vulnerability
  // Safe: RX.*_RE are module-scope literal regexes with simple alternation only — no nested quantifiers. Input `text` is a WhatsApp message (bounded length, sanitized upstream).
  if (RX.REEMBOLSO_CANCEL_DEVOLU_RE.test(text)) {
    riskFlags.push('REFUND_RISK');
  }
  // nosemgrep: javascript.lang.security.audit.detect-non-literal-regexp.regex-dos-vulnerability.regex-dos-vulnerability
  // Safe: RX.*_RE are module-scope literal regexes with simple alternation only — no nested quantifiers. Input `text` is a bounded WhatsApp message string.
  if (RX.MEDIC_RECEITA_LAUDO_REA_RE.test(text)) {
    riskFlags.push('HEALTH_RISK');
  }
  if (intent === 'SUPPORT') {
    riskFlags.push('SUPPORT_REQUIRED');
  }
  return uniqueTokens(riskFlags);
}

function inferTrustSignals(text: string) {
  const trustSignals: string[] = [];
  if (RX.OBRIGAD_VALEU_PERFEITO_RE.test(text)) {
    trustSignals.push('positive_ack');
  }
  if (RX.QUERO_VOU_FECHAR_ME_MAN_RE.test(text)) {
    trustSignals.push('buying_signal');
  }
  if (RX.FUNCIONA_GARANTIA_DEPOI_RE.test(text)) {
    trustSignals.push('needs_proof');
  }
  return uniqueTokens(trustSignals);
}

function inferEmotionalTone(text: string) {
  if (RX.ANSIOS_INSEGUR_MEDO_REC_RE.test(text)) {
    return 'anxious' as const;
  }
  if (RX.FRUSTR_CANSAD_RAIVA_PRO_RE.test(text)) {
    return 'frustrated' as const;
  }
  if (RX.NAO_ENTENDI_N_O_ENTENDI_RE.test(text)) {
    return 'confused' as const;
  }
  if (RX.PERFEITO_GOSTEI_AMEI_AN_RE.test(text)) {
    return 'positive' as const;
  }
  if (RX.QUERO_FECHAR_MANDA_AGOR_RE.test(text)) {
    return 'excited' as const;
  }
  if (RX.NAO_N_O_CARO_DEMORA_DUV_RE.test(text)) {
    return 'negative' as const;
  }
  return 'neutral' as const;
}

function inferDisclosureLevel(text: string) {
  const wordCount = String(text || '')
    .split(RX.S_RE)
    .filter(Boolean).length;
  const personalMarkers = (text.match(B_MEU_MINHA_MEUS_MINHAS_RE) || []).length;
  return Number(clamp(wordCount / 40 + personalMarkers * 0.08, 0, 1).toFixed(3));
}

function inferCorePain(text: string, objections: string[], desires: string[]) {
  if (objections.includes('price')) return 'receio de investir sem retorno';
  if (objections.includes('trust')) return 'medo de errar ou ser enganado';
  if (objections.includes('timing')) return 'urgencia com receio de demora';
  if (desires.includes('resultado_rapido')) return 'quer resultado perceptivel rapido';
  if (desires.includes('seguranca')) return 'busca seguranca para decidir';
  // nosemgrep: javascript.lang.security.audit.detect-non-literal-regexp.regex-dos-vulnerability.regex-dos-vulnerability
  // Safe: RX.*_RE are module-scope literal regexes with simple alternation only — no nested quantifiers. Input `text` is a bounded WhatsApp message string.
  if (RX.NAO_RESOLVEU_N_O_RESOLV_RE.test(text)) {
    return 'frustracao por tentativas anteriores sem resultado';
  }
  return null;
}

function inferPreferredStyle(text: string, emotionalTone: string) {
  // nosemgrep: javascript.lang.security.audit.detect-non-literal-regexp.regex-dos-vulnerability.regex-dos-vulnerability
  // Safe: RX.*_RE are module-scope literal regexes with simple alternation only — no nested quantifiers. Input `text` is a bounded WhatsApp message string.
  if (RX.COMO_FUNCIONA_COMPOSI_T_RE.test(text)) {
    return 'technical' as const;
  }
  if (emotionalTone === 'frustrated' || emotionalTone === 'anxious') {
    return 'empathetic' as const;
  }
  // nosemgrep: javascript.lang.security.audit.detect-non-literal-regexp.regex-dos-vulnerability.regex-dos-vulnerability
  // Safe: RX.*_RE are module-scope literal regexes with simple alternation only — no nested quantifiers. Input `text` is a bounded WhatsApp message string.
  if (RX.PRECO_PRE_O_QUANTO_PRAZ_RE.test(text)) {
    return 'direct' as const;
  }
  return 'consultative' as const;
}

function inferNextBestQuestion(input: {
  stage: CustomerStage;
  emotionalTone: string;
  objections: string[];
  corePain?: string | null;
}) {
  if (input.objections.includes('price')) {
    return 'O que pesa mais pra voce hoje: investimento ou seguranca da decisao?';
  }
  if (input.objections.includes('trust')) {
    return 'Qual parte voce precisa sentir mais seguranca antes de avancar?';
  }
  if (input.emotionalTone === 'frustrated') {
    return 'O que mais te desgasta nisso hoje?';
  }
  if (input.stage === 'COLD') {
    return 'O que te trouxe aqui agora?';
  }
  if (input.stage === 'WARM') {
    return 'Qual resultado faria isso valer a pena pra voce?';
  }
  if (input.corePain) {
    return 'Quando isso acontece, o que mais pesa no seu dia a dia?';
  }
  return null;
}

function inferConfidence(input: {
  intent: CustomerIntent;
  riskFlags: string[];
  objections: string[];
  unreadCount: number;
}) {
  let confidence = 0.58;
  if (input.intent === 'BUYING' || input.intent === 'PAYMENT') confidence += 0.18;
  if (input.intent === 'SUPPORT') confidence -= 0.12;
  if (input.objections.length > 0) confidence += 0.04;
  if (input.riskFlags.length > 0) confidence -= 0.18;
  if (input.unreadCount > 1) confidence += 0.05;
  return Number(clamp(confidence, 0.1, 0.98).toFixed(3));
}

interface NextActionInput {
  intent: CustomerIntent;
  stage: CustomerStage;
  unreadCount: number;
  silenceMinutes: number;
  trustScore: number;
  urgencyScore: number;
  priceSensitivity: number;
  paymentState: CustomerCognitiveState['paymentState'];
  riskFlags: string[];
  objections: string[];
  desires: string[];
  confidence: number;
}

function needsLowConfidenceClarification(input: NextActionInput): boolean {
  return input.intent === 'UNKNOWN' && input.unreadCount > 0 && input.confidence < 0.68;
}

function hasPaymentRecoverySignal(input: NextActionInput): boolean {
  return (
    input.paymentState === 'PENDING' ||
    input.paymentState === 'READY_TO_PAY' ||
    input.intent === 'PAYMENT'
  );
}

function nextActionForEscalation(input: NextActionInput): CognitiveActionType | null {
  if (input.riskFlags.length > 0) return 'ESCALATE_HUMAN';
  if (needsLowConfidenceClarification(input)) return 'ASK_CLARIFYING';
  if (hasPaymentRecoverySignal(input)) return 'PAYMENT_RECOVERY';
  return null;
}

function nextActionForUnread(input: NextActionInput): CognitiveActionType | null {
  if (input.unreadCount <= 0) return null;
  if (input.objections.includes('price') && input.trustScore < 0.62) {
    return 'SOCIAL_PROOF';
  }
  if (
    input.stage === 'HOT' ||
    input.stage === 'CHECKOUT' ||
    input.urgencyScore >= 0.7 ||
    input.desires.includes('resultado_rapido')
  ) {
    return 'OFFER';
  }
  return 'RESPOND';
}

function nextActionForSilence(input: NextActionInput): CognitiveActionType {
  if (input.silenceMinutes >= 24 * 60 || (input.urgencyScore >= 0.72 && input.stage === 'HOT')) {
    return 'FOLLOWUP_URGENT';
  }
  if (input.silenceMinutes >= 6 * 60 || input.stage === 'WARM') {
    return 'FOLLOWUP_SOFT';
  }
  return 'WAIT';
}

function inferNextBestAction(input: NextActionInput): CognitiveActionType {
  return (
    nextActionForEscalation(input) ?? nextActionForUnread(input) ?? nextActionForSilence(input)
  );
}

function summarizeState(input: {
  intent: CustomerIntent;
  stage: CustomerStage;
  objections: string[];
  nextBestAction: CognitiveActionType;
  paymentState: CustomerCognitiveState['paymentState'];
  trustScore: number;
  urgencyScore: number;
  riskFlags: string[];
}) {
  const parts = [
    `intenção ${input.intent.toLowerCase()}`,
    `estágio ${input.stage.toLowerCase()}`,
    `próxima ação ${input.nextBestAction.toLowerCase()}`,
  ];
  if (input.paymentState !== 'NONE') {
    parts.push(`pagamento ${input.paymentState.toLowerCase()}`);
  }
  if (input.objections.length > 0) {
    parts.push(`objeções ${input.objections.join(', ')}`);
  }
  parts.push(`confiança ${Math.round(input.trustScore * 100)}%`);
  parts.push(`urgência ${Math.round(input.urgencyScore * 100)}%`);
  if (input.riskFlags.length > 0) {
    parts.push(`riscos ${input.riskFlags.join(', ')}`);
  }
  return parts.join(' • ');
}

interface SeedCognitiveStateInput {
  conversationId?: string | null;
  contactId?: string | null;
  phone?: string | null;
  contactName?: string | null;
  lastMessageText?: string | null;
  unreadCount?: number;
  lastMessageAt?: Date | string | null;
  leadScore?: number | null;
  previousState?: Partial<CustomerCognitiveState> | null;
  demandState?: DemandState | null;
  lastOutcome?: string | null;
  lastAction?: string | null;
}

function computeSilenceMinutes(lastMessageAt?: Date | string | null): number {
  if (!lastMessageAt) return 0;
  return Math.max(0, Math.round((Date.now() - new Date(lastMessageAt).getTime()) / 60_000));
}

function computeTrustScore(params: {
  previous: Partial<CustomerCognitiveState> | null;
  leadScore?: number | null;
  trustSignals: string[];
  objections: string[];
}): number {
  const previousTrust = Number(params.previous?.trustScore || 0.45) || 0.45;
  const leadScoreNorm = clamp((Number(params.leadScore || 0) || 0) / 100, 0, 1);
  const base =
    previousTrust * 0.45 +
    leadScoreNorm * 0.3 +
    (params.trustSignals.includes('positive_ack') ? 0.12 : 0) +
    (params.trustSignals.includes('buying_signal') ? 0.1 : 0) -
    (params.objections.includes('trust') ? 0.08 : 0);
  return Number(clamp(base, 0, 1).toFixed(3));
}

function computeUrgencyScore(params: {
  previous: Partial<CustomerCognitiveState> | null;
  text: string;
  unreadCount: number;
  demandState?: DemandState | null;
}): number {
  const previousUrgency = Number(params.previous?.urgencyScore || 0.2) || 0.2;
  const base =
    previousUrgency * 0.35 +
    (includesAny(params.text, URGENCY_HINTS) ? 0.35 : 0) +
    Math.min(params.unreadCount / 4, 0.2) +
    (params.demandState?.attentionScore || 0) * 0.25;
  return Number(clamp(base, 0, 1).toFixed(3));
}

function computePriceSensitivity(params: {
  previous: Partial<CustomerCognitiveState> | null;
  text: string;
  objections: string[];
}): number {
  const previousPrice = Number(params.previous?.priceSensitivity || 0.15) || 0.15;
  const base =
    previousPrice * 0.45 +
    (params.objections.includes('price') ? 0.4 : 0) +
    (params.text.includes('parcel') ? 0.15 : 0) +
    (params.text.includes('desconto') ? 0.15 : 0);
  return Number(clamp(base, 0, 1).toFixed(3));
}

function computeLtvEstimate(params: {
  leadScore?: number | null;
  trustScore: number;
  urgencyScore: number;
  stage: CustomerStage;
}): number {
  const stageBonus = params.stage === 'CHECKOUT' ? 140 : params.stage === 'HOT' ? 90 : 30;
  const base =
    (Number(params.leadScore || 0) || 0) * 4 +
    params.trustScore * 180 +
    params.urgencyScore * 120 +
    stageBonus;
  return Number(base.toFixed(2));
}

interface DerivedSignals {
  text: string;
  unreadCount: number;
  silenceMinutes: number;
  previous: Partial<CustomerCognitiveState> | null;
  paymentState: CustomerCognitiveState['paymentState'];
  intent: CustomerIntent;
  objections: string[];
  desires: string[];
  trustSignals: string[];
  riskFlags: string[];
  emotionalTone: NonNullable<CustomerCognitiveState['emotionalTone']>;
  disclosureLevel: number;
  corePain: string | null;
  preferredStyle: NonNullable<CustomerCognitiveState['preferredStyle']>;
}

function deriveSignals(input: SeedCognitiveStateInput): DerivedSignals {
  const text = normalizeText(input.lastMessageText);
  const unreadCount = Number(input.unreadCount || 0) || 0;
  const silenceMinutes = computeSilenceMinutes(input.lastMessageAt);
  const previous = input.previousState || null;
  const paymentState = inferPaymentState(text);
  const intent = inferIntent({ text, unreadCount, paymentState, leadScore: input.leadScore });
  const objections = uniqueTokens([...(previous?.objections || []), ...inferObjections(text)]);
  const desires = uniqueTokens([...(previous?.desires || []), ...inferDesires(text)]);
  const trustSignals = uniqueTokens([
    ...(previous?.trustSignals || []),
    ...inferTrustSignals(text),
  ]);
  const riskFlags = uniqueTokens([...(previous?.riskFlags || []), ...inferRiskFlags(text, intent)]);
  const emotionalTone = inferEmotionalTone(text);
  const disclosureLevel = inferDisclosureLevel(text);
  const corePain = inferCorePain(text, objections, desires);
  const preferredStyle = inferPreferredStyle(text, emotionalTone);
  return {
    text,
    unreadCount,
    silenceMinutes,
    previous,
    paymentState,
    intent,
    objections,
    desires,
    trustSignals,
    riskFlags,
    emotionalTone,
    disclosureLevel,
    corePain,
    preferredStyle,
  };
}

interface DerivedScores {
  trustScore: number;
  urgencyScore: number;
  priceSensitivity: number;
  stage: CustomerStage;
  confidence: number;
  ltvEstimate: number;
}

function computeDerivedScores(
  input: SeedCognitiveStateInput,
  signals: DerivedSignals,
): DerivedScores {
  const { previous } = signals;
  const trustScore = computeTrustScore({
    previous,
    leadScore: input.leadScore,
    trustSignals: signals.trustSignals,
    objections: signals.objections,
  });
  const urgencyScore = computeUrgencyScore({
    previous,
    text: signals.text,
    unreadCount: signals.unreadCount,
    demandState: input.demandState,
  });
  const priceSensitivity = computePriceSensitivity({
    previous,
    text: signals.text,
    objections: signals.objections,
  });
  const stage = inferStage({
    intent: signals.intent,
    paymentState: signals.paymentState,
    trustScore,
    urgencyScore,
  });
  const confidence = inferConfidence({
    intent: signals.intent,
    riskFlags: signals.riskFlags,
    objections: signals.objections,
    unreadCount: signals.unreadCount,
  });
  const ltvEstimate = computeLtvEstimate({
    leadScore: input.leadScore,
    trustScore,
    urgencyScore,
    stage,
  });
  return { trustScore, urgencyScore, priceSensitivity, stage, confidence, ltvEstimate };
}

function computeRecommendedActions(
  signals: DerivedSignals,
  scores: DerivedScores,
): {
  nextBestAction: CognitiveActionType;
  nextBestQuestion: string | null | undefined;
} {
  const nextBestAction = inferNextBestAction({
    intent: signals.intent,
    stage: scores.stage,
    unreadCount: signals.unreadCount,
    silenceMinutes: signals.silenceMinutes,
    trustScore: scores.trustScore,
    urgencyScore: scores.urgencyScore,
    priceSensitivity: scores.priceSensitivity,
    paymentState: signals.paymentState,
    riskFlags: signals.riskFlags,
    objections: signals.objections,
    desires: signals.desires,
    confidence: scores.confidence,
  });
  const nextBestQuestion = inferNextBestQuestion({
    stage: scores.stage,
    emotionalTone: signals.emotionalTone,
    objections: signals.objections,
    corePain: signals.corePain,
  });
  return { nextBestAction, nextBestQuestion };
}

function buildCognitiveStatePayload(
  input: SeedCognitiveStateInput,
  signals: DerivedSignals,
  scores: DerivedScores,
  recommended: {
    nextBestAction: CognitiveActionType;
    nextBestQuestion: string | null | undefined;
  },
): CustomerCognitiveState {
  const { previous } = signals;
  return {
    conversationId: input.conversationId || previous?.conversationId || null,
    contactId: input.contactId || previous?.contactId || null,
    phone: input.phone || previous?.phone || null,
    contactName: input.contactName || previous?.contactName || null,
    intent: signals.intent,
    stage: scores.stage,
    trustScore: scores.trustScore,
    urgencyScore: scores.urgencyScore,
    priceSensitivity: scores.priceSensitivity,
    objections: signals.objections,
    desires: signals.desires,
    trustSignals: signals.trustSignals,
    lastOffer: previous?.lastOffer || null,
    lastAction: input.lastAction || previous?.lastAction || null,
    nextBestAction: recommended.nextBestAction,
    silenceMinutes: signals.silenceMinutes,
    ltvEstimate: scores.ltvEstimate,
    paymentState: signals.paymentState,
    lastOutcome: input.lastOutcome || previous?.lastOutcome || null,
    riskFlags: signals.riskFlags,
    emotionalTone: signals.emotionalTone,
    disclosureLevel: signals.disclosureLevel,
    corePain: signals.corePain,
    preferredStyle: signals.preferredStyle,
    nextBestQuestion: recommended.nextBestQuestion,
    classificationConfidence: scores.confidence,
    summary: '',
    updatedAt: new Date().toISOString(),
  };
}

function assembleCognitiveState(
  input: SeedCognitiveStateInput,
  signals: DerivedSignals,
): CustomerCognitiveState {
  const scores = computeDerivedScores(input, signals);
  const recommended = computeRecommendedActions(signals, scores);
  const state = buildCognitiveStatePayload(input, signals, scores, recommended);

  state.summary = summarizeState({
    intent: state.intent,
    stage: state.stage,
    objections: state.objections,
    nextBestAction: state.nextBestAction,
    paymentState: state.paymentState,
    trustScore: state.trustScore,
    urgencyScore: state.urgencyScore,
    riskFlags: state.riskFlags,
  });

  return state;
}

export function buildSeedCognitiveState(input: SeedCognitiveStateInput): CustomerCognitiveState {
  const signals = deriveSignals(input);
  return assembleCognitiveState(input, signals);
}

function buildStateKey(input: {
  conversationId?: string | null;
  contactId?: string | null;
  phone?: string | null;
}) {
  return `cognitive_state:${input.conversationId || input.contactId || input.phone || 'workspace'}`;
}

export async function loadCustomerCognitiveState(
  prisma: PrismaClient,
  input: {
    workspaceId: string;
    conversationId?: string | null;
    contactId?: string | null;
    phone?: string | null;
  },
): Promise<CustomerCognitiveState | null> {
  if (!prisma?.kloelMemory?.findUnique) return null;
  const key = buildStateKey(input);
  const record = await prisma.kloelMemory
    .findUnique({
      where: {
        workspaceId_key: {
          workspaceId: input.workspaceId,
          key,
        },
      },
    })
    .catch(() => null /* not found */);

  return ((record?.value || null) as CustomerCognitiveState | null) || null;
}

interface PersistCognitiveStateInput {
  workspaceId: string;
  conversationId?: string | null;
  contactId?: string | null;
  phone?: string | null;
  contactName?: string | null;
  state: CustomerCognitiveState;
  source?: string;
}

function normalizeStateForPersist(input: PersistCognitiveStateInput): CustomerCognitiveState {
  return {
    ...input.state,
    conversationId: input.conversationId || input.state.conversationId || null,
    contactId: input.contactId || input.state.contactId || null,
    phone: input.phone || input.state.phone || null,
    contactName: input.contactName || input.state.contactName || null,
    updatedAt: new Date().toISOString(),
  } satisfies CustomerCognitiveState;
}

function buildPersistMetadata(normalizedState: CustomerCognitiveState, source: string) {
  return {
    source,
    contactId: normalizedState.contactId || null,
    conversationId: normalizedState.conversationId || null,
    phone: normalizedState.phone || null,
    nextBestAction: normalizedState.nextBestAction,
    intent: normalizedState.intent,
    stage: normalizedState.stage,
  };
}

async function fetchPreviousMemory(prisma: PrismaClient, workspaceId: string, key: string) {
  if (!prisma?.kloelMemory?.findUnique) return null;
  return prisma.kloelMemory
    .findUnique({ where: { workspaceId_key: { workspaceId, key } } })
    .catch(() => null /* not found */);
}

async function upsertCognitiveMemory(
  prisma: PrismaClient,
  args: {
    workspaceId: string;
    key: string;
    normalizedState: CustomerCognitiveState;
    source: string;
  },
) {
  const metadata = buildPersistMetadata(args.normalizedState, args.source);
  const stateValue = args.normalizedState as unknown as Prisma.InputJsonValue;
  await prisma.kloelMemory.upsert({
    where: { workspaceId_key: { workspaceId: args.workspaceId, key: args.key } },
    update: {
      value: stateValue,
      metadata,
      content: args.normalizedState.summary,
    },
    create: {
      workspaceId: args.workspaceId,
      key: args.key,
      category: 'cognitive_state',
      type: args.normalizedState.intent,
      content: args.normalizedState.summary,
      value: stateValue,
      metadata,
    },
  });
}

async function writeCognitiveDelta(
  prisma: PrismaClient,
  args: {
    workspaceId: string;
    previousValue: unknown;
    normalizedState: CustomerCognitiveState;
    source: string;
  },
) {
  if (!prisma?.kloelMemory?.create) return;
  if (JSON.stringify(args.previousValue || null) === JSON.stringify(args.normalizedState)) return;

  const { normalizedState } = args;
  const deltaKey = `cognitive_delta:${normalizedState.contactId || normalizedState.phone || 'workspace'}:${Date.now()}:${randomUUID()}`;

  const deltaValue = {
    previous: (args.previousValue as Prisma.InputJsonValue) || null,
    current: normalizedState as unknown as Prisma.InputJsonValue,
    source: args.source,
  } as unknown as Prisma.InputJsonValue;

  await prisma.kloelMemory
    .create({
      data: {
        workspaceId: args.workspaceId,
        key: deltaKey,
        category: 'cognitive_delta',
        type: normalizedState.nextBestAction,
        content: normalizedState.summary,
        value: deltaValue,
        metadata: {
          contactId: normalizedState.contactId || null,
          conversationId: normalizedState.conversationId || null,
          phone: normalizedState.phone || null,
        },
      },
    })
    .catch(() => null /* non-critical: best-effort cognitive delta persistence */);
}

function computePurchaseProbability(stage: CustomerStage): string {
  const raw = stage === 'CHECKOUT' ? 0.86 : stage === 'HOT' ? 0.7 : stage === 'WARM' ? 0.42 : 0.18;
  return clamp(raw, 0, 1).toFixed(3);
}

async function projectStateToContact(
  prisma: PrismaClient,
  normalizedState: CustomerCognitiveState,
) {
  if (!normalizedState.contactId || !prisma?.contact?.update) return;
  const leadScore = Math.max(
    0,
    Math.min(100, Math.round(normalizedState.trustScore * 55 + normalizedState.urgencyScore * 45)),
  );
  await prisma.contact
    .update({
      where: { id: normalizedState.contactId },
      data: {
        leadScore,
        purchaseProbability: computePurchaseProbability(normalizedState.stage),
        nextBestAction: normalizedState.nextBestAction,
        aiSummary: normalizedState.summary,
      },
    })
    .catch(() => null /* non-critical: best-effort contact score update */);
}

export async function persistCustomerCognitiveState(
  prisma: PrismaClient,
  input: PersistCognitiveStateInput,
) {
  if (!prisma?.kloelMemory?.upsert) return input.state;

  const key = buildStateKey(input);
  const source = input.source || 'autonomy';
  const previous = await fetchPreviousMemory(prisma, input.workspaceId, key);
  const normalizedState = normalizeStateForPersist(input);

  await upsertCognitiveMemory(prisma, {
    workspaceId: input.workspaceId,
    key,
    normalizedState,
    source,
  });
  await writeCognitiveDelta(prisma, {
    workspaceId: input.workspaceId,
    previousValue: previous?.value,
    normalizedState,
    source,
  });
  await projectStateToContact(prisma, normalizedState);

  return normalizedState;
}

export async function recordDecisionOutcome(
  prisma: PrismaClient,
  input: RecordDecisionOutcomeInput,
) {
  if (!prisma?.kloelMemory?.create) return null;

  return prisma.kloelMemory.create({
    data: {
      workspaceId: input.workspaceId,
      key: `decision_outcome:${input.contactId || input.phone || input.conversationId || 'workspace'}:${Date.now()}:${randomUUID()}`,
      category: 'decision_outcome',
      type: String(input.action || 'UNKNOWN'),
      content: input.message || String(input.action || 'UNKNOWN'),
      value: {
        action: input.action,
        outcome: input.outcome,
        reward: input.reward || 0,
        message: input.message || null,
        conversationId: input.conversationId || null,
        metadata: input.metadata || {},
      },
      metadata: {
        contactId: input.contactId || null,
        conversationId: input.conversationId || null,
        phone: input.phone || null,
        outcome: input.outcome,
      },
    },
  });
}
