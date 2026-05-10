import type { DemandState } from '../../../providers/commercial-intelligence';
import { RX } from '../cognitive-state-patterns';
import {
  clamp,
  includesAny,
  uniqueTokens,
  BUYING_HINTS,
  SUPPORT_HINTS,
  TRUST_OBJECTION_HINTS,
  LEGAL_RISK_HINTS,
  REFUND_RISK_HINTS,
  HEALTH_RISK_HINTS,
  FAILED_RESOLUTION_HINTS,
  TECHNICAL_STYLE_HINTS,
  DIRECT_STYLE_HINTS,
  DESIRE_HINTS,
} from './cognitive-state-types';
import type {
  CustomerIntent,
  CustomerStage,
  CognitiveActionType,
  CustomerCognitiveState,
} from './cognitive-state-types';

const isPaymentIntent = (paymentState: CustomerCognitiveState['paymentState']): boolean =>
  paymentState === 'PENDING' || paymentState === 'READY_TO_PAY';

export const inferPaymentState = (text: string): CustomerCognitiveState['paymentState'] => {
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
};

export interface InferIntentParams {
  text: string;
  unreadCount: number;
  paymentState: CustomerCognitiveState['paymentState'];
  leadScore?: number | null | undefined;
}

const isCuriousByScore = (leadScore: number | null | undefined, unreadCount: number): boolean =>
  (Number(leadScore || 0) || 0) >= 70 || unreadCount > 0;

export const inferIntent = (params: InferIntentParams): CustomerIntent => {
  const { text, unreadCount, paymentState } = params;
  if (isPaymentIntent(paymentState)) {
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
  if (isCuriousByScore(params.leadScore, unreadCount)) {
    return 'CURIOUS' as const;
  }
  return 'UNKNOWN' as const;
};

export interface InferStageParams {
  intent: CustomerIntent;
  paymentState: CustomerCognitiveState['paymentState'];
  trustScore: number;
  urgencyScore: number;
}

const isHotByIntent = (params: InferStageParams): boolean =>
  params.intent === 'BUYING' && (params.trustScore >= 0.58 || params.urgencyScore >= 0.72);

const isWarmByIntent = (intent: CustomerIntent): boolean =>
  intent === 'BUYING' || intent === 'CURIOUS' || intent === 'OBJECTION';

export const inferStage = (params: InferStageParams): CustomerStage => {
  if (params.intent === 'SUPPORT') {
    return 'SUPPORT' as const;
  }
  if (params.paymentState === 'PAID') {
    return 'POST_SALE' as const;
  }
  if (isPaymentIntent(params.paymentState)) {
    return 'CHECKOUT' as const;
  }
  if (isHotByIntent(params)) {
    return 'HOT' as const;
  }
  if (isWarmByIntent(params.intent)) {
    return 'WARM' as const;
  }
  return 'COLD' as const;
};

export function inferObjections(text: string) {
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

export function inferDesires(text: string) {
  return uniqueTokens(
    DESIRE_HINTS.filter((item) => text.includes(item.keyword)).map((item) => item.tag),
  );
}

export function inferRiskFlags(text: string, intent: CustomerIntent) {
  const riskFlags: string[] = [];
  if (includesAny(text, LEGAL_RISK_HINTS)) {
    riskFlags.push('LEGAL_RISK');
  }
  if (includesAny(text, REFUND_RISK_HINTS)) {
    riskFlags.push('REFUND_RISK');
  }
  if (includesAny(text, HEALTH_RISK_HINTS)) {
    riskFlags.push('HEALTH_RISK');
  }
  if (intent === 'SUPPORT') {
    riskFlags.push('SUPPORT_REQUIRED');
  }
  return uniqueTokens(riskFlags);
}

export function inferTrustSignals(text: string) {
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

export function inferEmotionalTone(text: string) {
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

export function inferDisclosureLevel(text: string) {
  const wordCount = String(text || '')
    .split(RX.S_RE)
    .filter(Boolean).length;
  const personalMarkers = (
    text.match(/\\b(meu|minha|meus|minhas|empresa|rotina|cliente|trabalho)\\b/gi) || []
  ).length;
  return Number(clamp(wordCount / 40 + personalMarkers * 0.08, 0, 1).toFixed(3));
}

export function inferCorePain(text: string, objections: string[], desires: string[]) {
  if (objections.includes('price')) {
    return 'receio de investir sem retorno';
  }
  if (objections.includes('trust')) {
    return 'medo de errar ou ser enganado';
  }
  if (objections.includes('timing')) {
    return 'urgencia com receio de demora';
  }
  if (desires.includes('resultado_rapido')) {
    return 'quer resultado perceptivel rapido';
  }
  if (desires.includes('seguranca')) {
    return 'busca seguranca para decidir';
  }
  if (includesAny(text, FAILED_RESOLUTION_HINTS)) {
    return 'frustracao por tentativas anteriores sem resultado';
  }
  return null;
}

export function inferPreferredStyle(text: string, emotionalTone: string) {
  if (includesAny(text, TECHNICAL_STYLE_HINTS)) {
    return 'technical' as const;
  }
  if (emotionalTone === 'frustrated' || emotionalTone === 'anxious') {
    return 'empathetic' as const;
  }
  if (includesAny(text, DIRECT_STYLE_HINTS)) {
    return 'direct' as const;
  }
  return 'consultative' as const;
}

export function inferNextBestQuestion(input: {
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

export function inferConfidence(input: {
  intent: CustomerIntent;
  riskFlags: string[];
  objections: string[];
  unreadCount: number;
}) {
  let confidence = 0.58;
  if (input.intent === 'BUYING' || input.intent === 'PAYMENT') {
    confidence += 0.18;
  }
  if (input.intent === 'SUPPORT') {
    confidence -= 0.12;
  }
  if (input.objections.length > 0) {
    confidence += 0.04;
  }
  if (input.riskFlags.length > 0) {
    confidence -= 0.18;
  }
  if (input.unreadCount > 1) {
    confidence += 0.05;
  }
  return Number(clamp(confidence, 0.1, 0.98).toFixed(3));
}

export interface NextActionInput {
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

const needsLowConfidenceClarification = (input: NextActionInput): boolean =>
  input.intent === 'UNKNOWN' && input.unreadCount > 0 && input.confidence < 0.68;

const hasPaymentRecoverySignal = (input: NextActionInput): boolean =>
  input.paymentState === 'PENDING' ||
  input.paymentState === 'READY_TO_PAY' ||
  input.intent === 'PAYMENT';

const nextActionForEscalation = (input: NextActionInput): CognitiveActionType | null => {
  if (input.riskFlags.length > 0) {
    return 'ESCALATE_HUMAN';
  }
  if (needsLowConfidenceClarification(input)) {
    return 'ASK_CLARIFYING';
  }
  if (hasPaymentRecoverySignal(input)) {
    return 'PAYMENT_RECOVERY';
  }
  return null;
};

const shouldOfferOnUnread = (input: NextActionInput): boolean =>
  input.stage === 'HOT' ||
  input.stage === 'CHECKOUT' ||
  input.urgencyScore >= 0.7 ||
  input.desires.includes('resultado_rapido');

const nextActionForUnread = (input: NextActionInput): CognitiveActionType | null => {
  if (input.unreadCount <= 0) {
    return null;
  }
  if (input.objections.includes('price') && input.trustScore < 0.62) {
    return 'SOCIAL_PROOF';
  }
  if (shouldOfferOnUnread(input)) {
    return 'OFFER';
  }
  return 'RESPOND';
};

const isUrgentSilence = (input: NextActionInput): boolean =>
  input.silenceMinutes >= 24 * 60 || (input.urgencyScore >= 0.72 && input.stage === 'HOT');

const isSoftSilence = (input: NextActionInput): boolean =>
  input.silenceMinutes >= 6 * 60 || input.stage === 'WARM';

const nextActionForSilence = (input: NextActionInput): CognitiveActionType => {
  if (isUrgentSilence(input)) {
    return 'FOLLOWUP_URGENT';
  }
  if (isSoftSilence(input)) {
    return 'FOLLOWUP_SOFT';
  }
  return 'WAIT';
};

export const inferNextBestAction = (input: NextActionInput): CognitiveActionType =>
  nextActionForEscalation(input) ?? nextActionForUnread(input) ?? nextActionForSilence(input);

export interface SummarizeStateInput {
  intent: CustomerIntent;
  stage: CustomerStage;
  objections: string[];
  nextBestAction: CognitiveActionType;
  paymentState: CustomerCognitiveState['paymentState'];
  trustScore: number;
  urgencyScore: number;
  riskFlags: string[];
}

export const summarizeState = (input: SummarizeStateInput): string => {
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
};

export interface SeedCognitiveStateInput {
  conversationId?: string | null | undefined;
  contactId?: string | null | undefined;
  phone?: string | null | undefined;
  contactName?: string | null | undefined;
  lastMessageText?: string | null | undefined;
  unreadCount?: number | undefined;
  lastMessageAt?: Date | string | null | undefined;
  leadScore?: number | null | undefined;
  previousState?: Partial<CustomerCognitiveState> | null | undefined;
  demandState?: DemandState | null | undefined;
  lastOutcome?: string | null | undefined;
  lastAction?: string | null | undefined;
}
