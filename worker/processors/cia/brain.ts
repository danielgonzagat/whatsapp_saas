import type {
  CiaActionType,
  CiaCandidate,
  CiaCluster,
  CiaWorkspaceState,
} from "./build-state";

export interface CiaActionDecision {
  type: CiaActionType;
  cluster: CiaCluster;
  contactId?: string;
  phone?: string;
  contactName?: string;
  conversationId: string;
  priority: number;
  reason: string;
  lastMessageText: string;
  variantFamily?: "followup" | "payment_recovery";
}

export interface CiaDecisionBatch {
  actions: CiaActionDecision[];
  ignoredCount: number;
  summary: string;
}

function toDecision(candidate: CiaCandidate): CiaActionDecision {
  return {
    type: candidate.suggestedAction,
    cluster: candidate.cluster,
    contactId: candidate.contactId,
    phone: candidate.phone,
    contactName: candidate.contactName,
    conversationId: candidate.conversationId,
    priority: candidate.priority,
    reason:
      candidate.suggestedAction === "PAYMENT_RECOVERY"
        ? "payment_recovery_due"
        : candidate.suggestedAction === "RESPOND"
          ? "pending_backlog_detected"
          : "followup_reengagement",
    lastMessageText: candidate.lastMessageText,
    variantFamily:
      candidate.suggestedAction === "RESPOND"
        ? undefined
        : candidate.suggestedAction === "PAYMENT_RECOVERY"
          ? "payment_recovery"
          : "followup",
  };
}

function takeBest(
  source: CiaCandidate[],
  chosen: Map<string, CiaActionDecision>,
): CiaActionDecision | null {
  for (const candidate of source) {
    const key = candidate.contactId || candidate.phone || candidate.conversationId;
    if (chosen.has(key)) continue;
    const decision = toDecision(candidate);
    chosen.set(key, decision);
    return decision;
  }
  return null;
}

export function planCiaActions(
  state: CiaWorkspaceState,
  options?: { maxActionsPerCycle?: number },
): CiaDecisionBatch {
  const maxActions = Math.max(
    1,
    Math.min(10, Number(options?.maxActionsPerCycle || 5) || 5),
  );
  const chosen = new Map<string, CiaActionDecision>();
  const actions: CiaActionDecision[] = [];

  const hot = takeBest(state.clusters.HOT, chosen);
  if (hot) actions.push(hot);

  const payment = takeBest(state.clusters.PAYMENT, chosen);
  if (payment) actions.push(payment);

  const ordered = [...state.candidates].sort((a, b) => b.priority - a.priority);
  for (const candidate of ordered) {
    if (actions.length >= maxActions) break;
    const key = candidate.contactId || candidate.phone || candidate.conversationId;
    if (chosen.has(key)) continue;
    const decision = toDecision(candidate);
    chosen.set(key, decision);
    actions.push(decision);
  }

  const byPriority = actions.sort((a, b) => b.priority - a.priority).slice(0, maxActions);
  const paymentCount = byPriority.filter((item) => item.type === "PAYMENT_RECOVERY").length;
  const respondCount = byPriority.filter((item) => item.type === "RESPOND").length;
  const followupCount = byPriority.filter((item) => item.type === "FOLLOWUP").length;

  return {
    actions: byPriority,
    ignoredCount: Math.max(state.candidates.length - byPriority.length, 0),
    summary:
      byPriority.length > 0
        ? `Vou agir agora em ${byPriority.length} frentes: ${respondCount} respostas, ${paymentCount} recuperações de pagamento e ${followupCount} follow-ups.`
        : "Não encontrei uma ação segura para este ciclo agora.",
  };
}
