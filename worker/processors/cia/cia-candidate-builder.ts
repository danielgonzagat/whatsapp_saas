import type { CiaSeedConversation } from './cia-types';
import type { DemandState } from '../../providers/commercial-intelligence';
import { computeDemandState } from '../../providers/commercial-intelligence';
import { buildSeedCognitiveState } from './cognitive-state';
import type { CognitiveActionType } from './cognitive-state';

export type CiaCluster = 'HOT' | 'PAYMENT' | 'WARM' | 'COLD';

export interface CiaCandidate {
  conversationId: string;
  contactId?: string | undefined;
  phone?: string | undefined;
  contactName?: string | undefined;
  unreadCount: number;
  pending: boolean;
  lastMessageAt?: string | null;
  lastMessageText: string;
  priority: number;
  cluster: CiaCluster;
  suggestedAction: CiaActionType;
  demandState: DemandState;
  silenceMinutes: number;
  cognitiveState: ReturnType<typeof buildSeedCognitiveState>;
}

export type CiaActionType = CognitiveActionType;

const PAYMENT_HINTS = [
  'pix',
  'boleto',
  'cartao',
  'cartão',
  'pagamento',
  'pagar',
  'vencimento',
  'cobran',
];

function normalizeText(value?: string | null) {
  return String(value || '').toLowerCase();
}

function includesAny(text: string, keywords: string[]) {
  return keywords.some((keyword) => text.includes(keyword));
}

export function computePriority(input: {
  demandState: DemandState;
  unreadCount: number;
  lastMessageAt?: Date | string | null | undefined;
  isPayment: boolean;
  cognitiveState: {
    trustScore: number;
    urgencyScore: number;
    nextBestAction: string;
    riskFlags: string[];
  };
}) {
  const recencyBoost = input.lastMessageAt
    ? Math.max(0, 48 - (Date.now() - new Date(input.lastMessageAt).getTime()) / 3_600_000) * 0.6
    : 0;

  return Number(
    (
      input.demandState.attentionScore * 100 +
      input.unreadCount * 6 +
      recencyBoost +
      (input.isPayment ? 18 : 0) -
      input.demandState.fatigueScore * 14 +
      input.cognitiveState.trustScore * 12 +
      input.cognitiveState.urgencyScore * 14 +
      (input.cognitiveState.nextBestAction === 'OFFER' ? 10 : 0) +
      (input.cognitiveState.nextBestAction === 'PAYMENT_RECOVERY' ? 14 : 0) -
      input.cognitiveState.riskFlags.length * 8
    ).toFixed(3),
  );
}

export function resolveCluster(
  isPayment: boolean,
  cognitiveState: { stage: string },
  demandState: { lane: string },
): CiaCluster {
  if (isPayment) {
    return 'PAYMENT';
  }
  if (cognitiveState.stage === 'HOT' || demandState.lane === 'HOT') {
    return 'HOT';
  }
  if (demandState.lane === 'WARM') {
    return 'WARM';
  }
  return 'COLD';
}

export function computeSilenceMinutes(lastMessageAt: CiaSeedConversation['lastMessageAt']): number {
  if (!lastMessageAt) {
    return 0;
  }
  const elapsedMs = Date.now() - new Date(lastMessageAt).getTime();
  return Math.max(0, Math.round(elapsedMs / 60_000));
}

function normalizeLastMessageAt(
  lastMessageAt: CiaSeedConversation['lastMessageAt'],
): string | null {
  if (typeof lastMessageAt === 'string') {
    return lastMessageAt;
  }
  return lastMessageAt?.toISOString?.() || null;
}

export function toCandidate(seed: CiaSeedConversation): CiaCandidate {
  const lastMessageText = String(seed.lastMessageText || '');
  const normalized = normalizeText(lastMessageText);
  const unreadCount = Number(seed.unreadCount || 0) || 0;
  const demandState = computeDemandState({
    lastMessageAt: seed.lastMessageAt,
    unreadCount,
    leadScore: seed.leadScore || 0,
    lastMessageText,
  });

  const isPayment =
    demandState.strategy === 'RECOVER_PAYMENT' || includesAny(normalized, PAYMENT_HINTS);
  const cognitiveState = buildSeedCognitiveState({
    conversationId: seed.conversationId,
    contactId: seed.contactId,
    phone: seed.phone,
    contactName: seed.contactName,
    lastMessageText,
    unreadCount,
    lastMessageAt: seed.lastMessageAt,
    leadScore: seed.leadScore || 0,
    demandState,
  });
  const suggestedAction: CiaActionType = cognitiveState.nextBestAction;

  return {
    conversationId: seed.conversationId,
    contactId: seed.contactId,
    phone: seed.phone,
    contactName: seed.contactName,
    unreadCount,
    pending: Boolean(seed.pending),
    lastMessageAt: normalizeLastMessageAt(seed.lastMessageAt),
    lastMessageText,
    priority: computePriority({
      demandState,
      unreadCount,
      lastMessageAt: seed.lastMessageAt,
      isPayment,
      cognitiveState,
    }),
    cluster: resolveCluster(isPayment, cognitiveState, demandState),
    suggestedAction,
    demandState,
    silenceMinutes: computeSilenceMinutes(seed.lastMessageAt),
    cognitiveState,
  };
}
