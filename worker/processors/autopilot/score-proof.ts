import type { Prisma } from '@prisma/client';
import { prisma } from '../../db';
import { type UnknownRecord } from './shared';

export async function persistCiaCycleProof(input: {
  workspaceId: string;
  cycleProofId: string;
  summary: string;
  guaranteeReport: Record<string, unknown>;
  exhaustionReport: Record<string, unknown>;
}) {
  if (!prisma?.kloelMemory?.upsert) {
    return null;
  }

  const payload = {
    cycleProofId: input.cycleProofId,
    summary: input.summary,
    guaranteeReport: input.guaranteeReport,
    exhaustionReport: input.exhaustionReport,
    generatedAt: new Date().toISOString(),
  };

  const details = (input.exhaustionReport?.details ?? {}) as Record<string, unknown>;
  const buildMetadata = () => ({
    cycleProofId: input.cycleProofId,
    candidateCount: Number(details?.candidateCount || 0),
    selectedCount: Number(details?.selectedCount || 0),
    dispatchableCount: Number(input.exhaustionReport?.dispatchableCount || 0),
    exhaustive: Boolean(input.exhaustionReport?.exhaustive),
    noLegalActions: Boolean(input.exhaustionReport?.noLegalActions),
  });

  return prisma.kloelMemory.upsert({
    where: {
      workspaceId_key: {
        workspaceId: input.workspaceId,
        key: 'cia_cycle_proof:current',
      },
    },
    update: {
      value: payload as never as Prisma.InputJsonValue,
      category: 'cia_cycle_proof',
      type: input.exhaustionReport?.noLegalActions ? 'no_legal_actions' : 'dispatched',
      content: input.summary,
      metadata: buildMetadata(),
    },
    create: {
      workspaceId: input.workspaceId,
      key: 'cia_cycle_proof:current',
      value: payload as never as Prisma.InputJsonValue,
      category: 'cia_cycle_proof',
      type: input.exhaustionReport?.noLegalActions ? 'no_legal_actions' : 'dispatched',
      content: input.summary,
      metadata: buildMetadata(),
    },
  });
}

export async function listCanonicalWorkItems(workspaceId: string) {
  const client = prisma as never as UnknownRecord;
  if (!client?.agentWorkItem?.findMany) {
    return [];
  }

  return client.agentWorkItem.findMany({
    where: { workspaceId },
    orderBy: [{ priority: 'desc' }, { updatedAt: 'desc' }],
    take: 200,
  });
}

export async function persistAccountProofSnapshot(input: {
  workspaceId: string;
  cycleProofId: string;
  summary: string;
  guaranteeReport: Record<string, unknown>;
  exhaustionReport: Record<string, unknown>;
  actions: Array<Record<string, unknown>>;
  workItemUniverse: Array<Record<string, unknown>>;
  tacticUniverse: Array<Record<string, unknown>>;
}) {
  const client = prisma as never as UnknownRecord;
  if (!client?.accountProofSnapshot?.create) {
    return null;
  }

  const exhaustionDetails = (input.exhaustionReport?.details ?? {}) as Record<string, unknown>;
  const classifications = Array.isArray(exhaustionDetails?.classifications)
    ? exhaustionDetails.classifications
    : [];
  const blockedActions = classifications.filter(
    (item: UnknownRecord) => item?.disposition === 'DEFERRED_BY_RULE',
  );
  const deferredActions = classifications.filter(
    (item: UnknownRecord) => item?.disposition === 'DEFERRED_BY_CYCLE_BUDGET',
  );

  return client.accountProofSnapshot.create({
    data: {
      workspaceId: input.workspaceId,
      proofType: 'CIA_CYCLE',
      status: input.exhaustionReport?.noLegalActions
        ? 'NO_LEGAL_ACTIONS'
        : input.actions.length > 0
          ? 'ACTIVE'
          : 'IDLE',
      cycleProofId: input.cycleProofId,
      noLegalActions: Boolean(input.exhaustionReport?.noLegalActions),
      candidateCount: Number(exhaustionDetails?.candidateCount || 0),
      eligibleActionCount: Number(input.exhaustionReport?.dispatchableCount || 0),
      blockedActionCount: Number(input.exhaustionReport?.deferredByRuleCount || 0),
      deferredActionCount: Number(input.exhaustionReport?.deferredByBudgetCount || 0),
      waitingApprovalCount: Number(input.exhaustionReport?.waitingHumanCount || 0),
      waitingInputCount: Number(input.exhaustionReport?.waitingClarificationCount || 0),
      silentRemainderCount: Number(input.exhaustionReport?.silentCount || 0),
      workItemUniverse: input.workItemUniverse,
      actionUniverse: classifications,
      executedActions: input.actions,
      blockedActions,
      deferredActions,
      metadata: {
        summary: input.summary,
        guaranteeReport: input.guaranteeReport,
        exhaustionReport: input.exhaustionReport,
        tacticUniverse: input.tacticUniverse,
      },
    },
  });
}

export async function createConversationProofSnapshotDraft(input: {
  workspaceId: string;
  conversationId: string;
  contactId?: string | null;
  phone?: string | null;
  cycleProofId?: string | null;
  accountProofId?: string | null;
  selectedActionType: string;
  selectedTactic?: string | null;
  governor?: string | null;
  renderedMessage?: string | null;
  actionUniverse?: Array<Record<string, unknown>>;
  tacticUniverse?: Array<Record<string, unknown>>;
  selectedAction?: Record<string, unknown> | null;
}) {
  const client = prisma as never as UnknownRecord;
  if (!client?.conversationProofSnapshot?.create) {
    return null;
  }

  const selectedTacticData =
    (input.tacticUniverse || []).find(
      (item: UnknownRecord) => String(item?.tactic || '') === String(input.selectedTactic || ''),
    ) || null;

  return client.conversationProofSnapshot.create({
    data: {
      workspaceId: input.workspaceId,
      conversationId: input.conversationId,
      contactId: input.contactId || null,
      phone: input.phone || null,
      status: 'PENDING_EXECUTION',
      cycleProofId: input.cycleProofId || null,
      accountProofId: input.accountProofId || null,
      selectedActionType: input.selectedActionType,
      selectedTactic: input.selectedTactic || null,
      governor: input.governor || null,
      renderedMessage: input.renderedMessage || null,
      outcome: null,
      actionUniverse: input.actionUniverse || [],
      tacticUniverse: input.tacticUniverse || [],
      selectedAction: input.selectedAction || null,
      selectedTacticData,
      metadata: {
        createdBy: 'runCiaAction',
      },
    },
  });
}

export async function finalizeConversationProofSnapshot(
  recordId: string | null | undefined,
  payload: {
    status: string;
    outcome?: string | null;
    renderedMessage?: string | null;
    metadata?: Record<string, unknown> | null;
  },
) {
  if (!recordId) {
    return null;
  }
  const client = prisma as never as UnknownRecord;
  if (!client?.conversationProofSnapshot?.update) {
    return null;
  }

  return client.conversationProofSnapshot.update({
    where: { id: recordId },
    data: {
      status: payload.status,
      outcome: payload.outcome || null,
      renderedMessage: payload.renderedMessage || undefined,
      metadata: payload.metadata || undefined,
    },
  });
}
