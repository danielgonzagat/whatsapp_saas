import type { Prisma } from '@prisma/client';

export const U0300__U036F_RE = /\p{M}/gu;
export const B_MEU_MINHA_MEUS_MINHAS_RE =
  /\b(meu|minha|meus|minhas|empresa|rotina|cliente|trabalho)\b/gi;

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

export const BUYING_HINTS = [
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

export const SUPPORT_HINTS = [
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

export const LEGAL_RISK_HINTS = ['procon', 'advog', 'process', 'reclama', 'justi', 'jurid', 'amea'];

export const TRUST_OBJECTION_HINTS = [
  'funciona',
  'confiavel',
  'confiável',
  'garantia',
  'seguro',
  'depoimento',
  'resultado',
];

export const URGENCY_HINTS = [
  'hoje',
  'agora',
  'urgente',
  'rapido',
  'rápido',
  'ainda hoje',
  'essa semana',
];

export const REFUND_RISK_HINTS = ['reembolso', 'cancel', 'devolu'];
export const HEALTH_RISK_HINTS = ['medic', 'receita', 'laudo', 'rea'];
export const FAILED_RESOLUTION_HINTS = [
  'nao resolveu',
  'nao resolvi',
  'não resolveu',
  'não resolvi',
];
export const TECHNICAL_STYLE_HINTS = ['como funciona', 'composi', 'tecnic'];
export const DIRECT_STYLE_HINTS = ['preco', 'preço', 'quanto', 'prazo'];

export const DESIRE_HINTS: Array<{ keyword: string; tag: string }> = [
  { keyword: 'resultado', tag: 'resultado_rapido' },
  { keyword: 'seguro', tag: 'seguranca' },
  { keyword: 'natural', tag: 'naturalidade' },
  { keyword: 'parcela', tag: 'parcelamento' },
  { keyword: 'pix', tag: 'facilidade_pagamento' },
];

export const clamp = (value: number, min = 0, max = 1): number =>
  Math.min(max, Math.max(min, value));

export const normalizeText = (value?: string | null): string =>
  String(value || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(U0300__U036F_RE, '');

export const includesAny = (text: string, keywords: string[]): boolean =>
  keywords.some((keyword) => text.includes(keyword));

export const uniqueTokens = (values: Array<string | null | undefined>): string[] => [
  ...new Set(values.map((item) => String(item || '').trim()).filter(Boolean)),
];
