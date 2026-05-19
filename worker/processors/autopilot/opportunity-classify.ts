import { type CustomerCognitiveState } from '../cia/cognitive-state';
import {
  J__S_COMPREI_JA_S_COMPR_RE,
  PIX_BOLETO_CART_A__O_CA_RE,
  QUERO_VOU_COMPRAR_COMO_RE,
  QUANTO_VALOR_PRE_C__O_F_RE,
} from './autopilot-types';

export function mapOpportunityBucket(score: number): 'LOW' | 'MEDIUM' | 'HIGH' {
  if (score >= 75) {
    return 'HIGH';
  }
  if (score >= 45) {
    return 'MEDIUM';
  }
  return 'LOW';
}

export function classifyOpportunityCandidate(input: {
  candidate: {
    cluster: string;
    pending: boolean;
    unreadCount: number;
    priority: number;
    silenceMinutes: number;
    suggestedAction: string;
    cognitiveState: CustomerCognitiveState;
  };
  joinedText: string;
  optedOutAt?: Date | string | null;
  customFields?: Record<string, unknown> | null;
}) {
  const text = String(input.joinedText || '').toLowerCase();
  const customFields = (input.customFields || {}) as Record<string, unknown>;
  const customerStatus = String(
    customFields.customerStatus || customFields.status || customFields.stage || '',
  ).toLowerCase();

  const purchased =
    input.optedOutAt ||
    customerStatus.includes('won') ||
    customerStatus.includes('cliente') ||
    customerStatus.includes('customer') ||
    J__S_COMPREI_JA_S_COMPR_RE.test(text);

  if (purchased) {
    return {
      opportunityClass: 'BOUGHT',
      score: 0,
      nextBestAction: 'DO_NOT_CONTACT',
      reason: 'already_converted_or_blocked',
    };
  }

  const waitingMoney =
    input.candidate.cluster === 'PAYMENT' ||
    input.candidate.cognitiveState.paymentState === 'PENDING' ||
    input.candidate.cognitiveState.paymentState === 'READY_TO_PAY' ||
    PIX_BOLETO_CART_A__O_CA_RE.test(text);

  const hotIntent =
    input.candidate.cluster === 'HOT' ||
    ['HOT', 'CHECKOUT'].includes(input.candidate.cognitiveState.stage) ||
    QUERO_VOU_COMPRAR_COMO_RE.test(text);

  const clientWaiting =
    input.candidate.pending ||
    input.candidate.unreadCount > 0 ||
    input.candidate.cognitiveState.nextBestAction === 'RESPOND';

  const askedAndGhosted =
    !clientWaiting &&
    input.candidate.silenceMinutes >= 6 * 60 &&
    QUANTO_VALOR_PRE_C__O_F_RE.test(text);

  const warm =
    !askedAndGhosted &&
    (input.candidate.priority >= 55 ||
      input.candidate.silenceMinutes < 72 * 60 ||
      input.candidate.cognitiveState.trustScore >= 0.45);

  let opportunityClass = 'COLD';
  if (waitingMoney) {
    opportunityClass = 'WAITING_MONEY';
  } else if (hotIntent) {
    opportunityClass = 'HIGH_INTENT';
  } else if (clientWaiting) {
    opportunityClass = 'ASKED_AND_GHOSTED';
  } else if (warm) {
    opportunityClass = 'WARM';
  }

  const baseScore = Math.max(
    0,
    Math.min(
      100,
      Math.round(
        input.candidate.priority +
          input.candidate.cognitiveState.trustScore * 18 +
          input.candidate.cognitiveState.urgencyScore * 22 -
          Math.min(18, input.candidate.silenceMinutes / 180),
      ),
    ),
  );

  const score =
    opportunityClass === 'WAITING_MONEY'
      ? Math.max(88, baseScore)
      : opportunityClass === 'HIGH_INTENT'
        ? Math.max(78, baseScore)
        : opportunityClass === 'ASKED_AND_GHOSTED'
          ? Math.max(62, baseScore)
          : opportunityClass === 'WARM'
            ? Math.max(48, Math.min(74, baseScore))
            : Math.min(44, baseScore);

  return {
    opportunityClass,
    score,
    nextBestAction: input.candidate.suggestedAction || 'FOLLOWUP_SOFT',
    reason: `opportunity_${opportunityClass.toLowerCase()}`,
  };
}

export function buildCompressedOpportunityContext(input: {
  contactName?: string | null;
  phone?: string | null;
  candidate: {
    lastMessageText: string;
    unreadCount: number;
    silenceMinutes: number;
    cluster: string;
    suggestedAction: string;
    cognitiveState: CustomerCognitiveState;
  };
  messages: Array<{ direction: string; content?: string | null }>;
  opportunityClass: string;
  score: number;
}) {
  const lastInbound = input.messages.find((message) => message.direction === 'INBOUND');
  const lastOutbound = input.messages.find((message) => message.direction === 'OUTBOUND');

  return [
    `Contato: ${input.contactName || input.phone || 'sem_nome'}`,
    `Classe de oportunidade: ${input.opportunityClass}`,
    `Probabilidade estimada: ${input.score}%`,
    `Cluster CIA: ${input.candidate.cluster}`,
    `Próxima melhor ação: ${input.candidate.suggestedAction}`,
    `Silêncio: ${input.candidate.silenceMinutes} minuto(s)`,
    `Mensagens pendentes: ${input.candidate.unreadCount}`,
    `Resumo cognitivo: ${input.candidate.cognitiveState.summary}`,
    `Última inbound: ${String(lastInbound?.content || input.candidate.lastMessageText || '').slice(0, 280)}`,
    `Última outbound: ${String(lastOutbound?.content || '').slice(0, 280)}`,
  ]
    .filter(Boolean)
    .join('\n');
}
