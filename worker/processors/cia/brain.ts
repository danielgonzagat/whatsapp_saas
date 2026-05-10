import type { CiaActionType, CiaCandidate, CiaWorkspaceState } from './build-state';
import type {
  CiaActionDecision,
  CiaDecisionBatch,
  CiaGovernorVerdict,
  CiaStrategyHints,
  ConversationActionCandidate,
} from './brain.types';

export type {
  CiaActionDecision,
  CiaDecisionBatch,
  CiaGovernorVerdict,
  CiaStrategyHints,
  ConversationActionCandidate,
} from './brain.types';

import { evaluateCiaCandidate } from './brain.governor';

export { evaluateCiaCandidate } from './brain.governor';

function takeBest(
  source: CiaCandidate[],
  chosen: Map<string, CiaActionDecision>,
  strategy?: CiaStrategyHints | null,
): CiaActionDecision | null {
  for (const candidate of source) {
    const key = candidate.contactId || candidate.phone || candidate.conversationId;
    if (chosen.has(key)) {
      continue;
    }
    const decision = evaluateCiaCandidate(candidate, strategy);
    if (decision.type === 'WAIT') {
      continue;
    }
    chosen.set(key, decision);
    return decision;
  }
  return null;
}

const ACTION_LABELS: Partial<Record<CiaActionType, string>> = {
  RESPOND: 'resposta',
  ASK_CLARIFYING: 'pergunta de qualificação',
  SOCIAL_PROOF: 'prova social',
  OFFER: 'oferta',
  FOLLOWUP_SOFT: 'follow-up leve',
  FOLLOWUP_URGENT: 'follow-up urgente',
  PAYMENT_RECOVERY: 'recuperação de pagamento',
  ESCALATE_HUMAN: 'escalada humana',
};

function actionLabel(action: CiaActionType) {
  return ACTION_LABELS[action] || 'ação';
}

function resolveMaxActions(
  maxActionsPerCycle: number | undefined,
  strategy: CiaStrategyHints | null,
): number {
  const base = Number(maxActionsPerCycle || 5) || 5;
  let adjusted = base;
  if (strategy?.aggressiveness === 'HIGH') {
    adjusted = base + 1;
  } else if (strategy?.aggressiveness === 'LOW') {
    adjusted = base - 1;
  }
  return Math.max(1, Math.min(10, adjusted));
}

function collectPriorityActions(
  state: CiaWorkspaceState,
  strategy: CiaStrategyHints | null,
  chosen: Map<string, CiaActionDecision>,
  actions: CiaActionDecision[],
  maxActions: number,
): void {
  const ordered = [...state.candidates]
    .map((candidate) => evaluateCiaCandidate(candidate, strategy))
    .filter((decision) => decision.type !== 'WAIT')
    .sort((left, right) => right.priority - left.priority);

  for (const decision of ordered) {
    if (actions.length >= maxActions) {
      break;
    }
    const key = decision.contactId || decision.phone || decision.conversationId;
    if (chosen.has(key)) {
      continue;
    }
    chosen.set(key, decision);
    actions.push(decision);
  }
}

function buildActionCounts(actions: CiaActionDecision[]): Record<string, number> {
  return actions.reduce<Record<string, number>>((acc, action) => {
    acc[action.type] = (acc[action.type] || 0) + 1;
    return acc;
  }, {});
}

function buildSummaryParts(counts: Record<string, number>): string[] {
  return [
    counts.RESPOND ? `${counts.RESPOND} respostas` : null,
    counts.ASK_CLARIFYING ? `${counts.ASK_CLARIFYING} perguntas de qualificação` : null,
    counts.OFFER ? `${counts.OFFER} ofertas` : null,
    counts.SOCIAL_PROOF ? `${counts.SOCIAL_PROOF} provas sociais` : null,
    counts.PAYMENT_RECOVERY ? `${counts.PAYMENT_RECOVERY} recuperações de pagamento` : null,
    counts.FOLLOWUP_SOFT || counts.FOLLOWUP_URGENT
      ? `${(counts.FOLLOWUP_SOFT || 0) + (counts.FOLLOWUP_URGENT || 0)} follow-ups`
      : null,
    counts.ESCALATE_HUMAN ? `${counts.ESCALATE_HUMAN} exceções humanas` : null,
  ].filter(Boolean) as string[];
}

/** Plan cia actions. */
export function planCiaActions(
  state: CiaWorkspaceState,
  options?: {
    maxActionsPerCycle?: number;
    strategy?: CiaStrategyHints | null;
  },
): CiaDecisionBatch {
  const strategy = options?.strategy || null;
  const maxActions = resolveMaxActions(options?.maxActionsPerCycle, strategy);
  const chosen = new Map<string, CiaActionDecision>();
  const actions: CiaActionDecision[] = [];

  const hot = takeBest(state.clusters.HOT, chosen, strategy);
  if (hot) {
    actions.push(hot);
  }

  const payment = takeBest(state.clusters.PAYMENT, chosen, strategy);
  if (payment) {
    actions.push(payment);
  }

  collectPriorityActions(state, strategy, chosen, actions, maxActions);

  const byPriority = actions.sort((a, b) => b.priority - a.priority).slice(0, maxActions);
  const counts = buildActionCounts(byPriority);
  const summaryParts = buildSummaryParts(counts);

  return {
    actions: byPriority,
    ignoredCount: Math.max(state.candidates.length - byPriority.length, 0),
    summary:
      byPriority.length > 0
        ? `Vou agir agora em ${byPriority.length} frentes: ${summaryParts.join(', ')}.`
        : 'Não encontrei uma ação segura para este ciclo agora.',
  };
}

/** Summarize decision cognition. */
export function summarizeDecisionCognition(decision: CiaActionDecision) {
  return `${actionLabel(decision.type)} • ${decision.cognitiveState.summary}`;
}
