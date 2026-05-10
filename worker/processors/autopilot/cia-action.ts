import { prisma } from '../../db';
import { publishAgentEvent } from '../../providers/agent-events';
import { updateVariantOutcome, recordDecisionLog } from '../cia/self-improvement';
import { type UnknownRecord, SEPARATOR_G_RE } from './shared';
import { acquireCiaContactLock, releaseCiaContactLock } from './opportunity';
import {
  createConversationProofSnapshotDraft,
  finalizeConversationProofSnapshot,
} from './score-proof';
import { dispatchCiaActionByType } from './cia-action-dispatch';

export async function runCiaAction(data: UnknownRecord) {
  const workspaceId = data?.workspaceId;
  if (!workspaceId) {
    return { outcome: 'SKIPPED', reason: 'missing_workspace' };
  }

  const lockKey = await acquireCiaContactLock(data?.contactId, data?.phone);
  if (!lockKey) {
    await publishAgentEvent({
      type: 'thought', workspaceId, phase: 'cia_lock_skip',
      message: `Pulei ${data?.contactName || data?.phone || 'um contato'} porque ele já está sendo processado.`,
      meta: { contactId: data?.contactId, phone: data?.phone },
    });
    return { outcome: 'SKIPPED', reason: 'contact_locked' };
  }

  let outcome: 'SENT' | 'FAILED' | 'SKIPPED' = 'SKIPPED';
  let variant: Awaited<ReturnType<typeof import('../cia/self-improvement').pickVariant>> | null = null;
  let errorMessage: string | null = null;
  let renderedMessage: string | null = null;
  let conversationProofId: string | null = null;
  const workspace = await prisma.workspace.findUnique({
    where: { id: workspaceId }, select: { providerSettings: true },
  });
  const settings = (workspace?.providerSettings ?? {}) as UnknownRecord;
  let selectedFamily: import('../cia/self-improvement').VariantFamily | null = null;

  try {
    const dispatchResult = await dispatchCiaActionByType(data, settings, workspaceId);
    outcome = dispatchResult.outcome;
    renderedMessage = dispatchResult.renderedMessage;
    conversationProofId = dispatchResult.conversationProofId;
    variant = dispatchResult.variant;
    selectedFamily = dispatchResult.family;

    if (variant && selectedFamily) {
      await updateVariantOutcome(prisma, { workspaceId, family: selectedFamily, variant, outcome });
    }
  } catch (err: unknown) {
    const errInstanceofError = err instanceof Error ? err : new Error(typeof err === 'string' ? err : 'unknown error');
    outcome = 'FAILED';
    errorMessage = errInstanceofError?.message || 'cia_action_failed';
  } finally {
    if (!conversationProofId && data?.conversationId) {
      const fallbackProof = await createConversationProofSnapshotDraft({
        workspaceId, conversationId: data?.conversationId,
        contactId: data?.contactId || null, phone: data?.phone || null,
        cycleProofId: data?.cycleProofId || null, accountProofId: data?.accountProofId || null,
        selectedActionType: String(data?.type || 'CIA_ACTION'),
        selectedTactic: data?.conversationTactic || null,
        governor: data?.governor || null, renderedMessage: renderedMessage,
        actionUniverse: data?.conversationActionUniverse || [],
        tacticUniverse: data?.conversationTacticUniverse || [],
        selectedAction: {
          type: data?.type || 'CIA_ACTION', governor: data?.governor || null,
          reason: data?.reason || null, priority: data?.priority || null,
          confidence: data?.confidence || data?.cognitiveState?.classificationConfidence || null,
          selectedActionUtility: data?.selectedActionUtility || null,
          selectedActionRank: data?.selectedActionRank || null,
          betterActionCount: data?.betterActionCount || 0,
          betterExecutableActionCount: data?.betterExecutableActionCount || 0,
          nextBestActionType: data?.nextBestActionType || null,
          nextBestActionUtility: data?.nextBestActionUtility || null,
          selectedTactic: data?.conversationTactic || null,
          selectedTacticUtility: data?.selectedTacticUtility || null,
          selectedTacticRank: data?.selectedTacticRank || null,
          betterTacticCount: data?.betterTacticCount || 0,
          nextBestTactic: data?.nextBestTactic || null,
          nextBestTacticUtility: data?.nextBestTacticUtility || null,
        },
      });
      conversationProofId = fallbackProof?.id || null;
    }

    await finalizeConversationProofSnapshot(conversationProofId, {
      status: outcome === 'SENT' ? 'EXECUTED' : outcome === 'FAILED' ? 'FAILED' : 'SKIPPED',
      outcome, renderedMessage,
      metadata: { cluster: data?.cluster || null, governor: data?.governor || null, cycleProofId: data?.cycleProofId || null, accountProofId: data?.accountProofId || null, error: errorMessage },
    });

    const actionLabel = String(data?.type || 'acao').toLowerCase().replace(SEPARATOR_G_RE, ' ').trim();
    await publishAgentEvent({
      type: 'proof', workspaceId, phase: 'cia_conversation_proof', persistent: outcome !== 'SENT',
      message:
        outcome === 'SENT'
          ? `Executei ${actionLabel} para ${data?.contactName || data?.phone || 'contato'} e sincronizei a execução com a conversa ao vivo.`
          : outcome === 'FAILED'
            ? `A execução de ${actionLabel} falhou para ${data?.contactName || data?.phone || 'contato'}.`
            : `A execução de ${actionLabel} foi pulada para ${data?.contactName || data?.phone || 'contato'}.`,
      meta: {
        contactId: data?.contactId, conversationId: data?.conversationId, phone: data?.phone,
        cycleProofId: data?.cycleProofId || null, accountProofId: data?.accountProofId || null,
        conversationProofId, capabilityCode: data?.type || 'CIA_ACTION',
        tacticCode: data?.conversationTactic || null, outcome, error: errorMessage,
        selectedActionUtility: data?.selectedActionUtility || null,
        selectedActionRank: data?.selectedActionRank || null,
        betterActionCount: data?.betterActionCount || 0,
        selectedTacticUtility: data?.selectedTacticUtility || null,
        selectedTacticRank: data?.selectedTacticRank || null,
        betterTacticCount: data?.betterTacticCount || 0,
      },
    });

    await recordDecisionLog(prisma, {
      workspaceId, contactId: data?.contactId, phone: data?.phone,
      variantKey: variant?.key || null, intent: data?.type || 'CIA_ACTION',
      message: renderedMessage || variant?.text || data?.lastMessageText || '',
      outcome, priority: data?.priority,
      metadata: {
        cluster: data?.cluster, reason: data?.reason, governor: data?.governor,
        cognition: data?.cognitiveState?.summary || null,
        conversationTactic: data?.conversationTactic || null, conversationProofId,
        error: errorMessage, cycleProofId: data?.cycleProofId || null, accountProofId: data?.accountProofId || null,
      },
    });

    await releaseCiaContactLock(lockKey);
  }

  if (outcome === 'FAILED') {
    throw new Error(errorMessage || 'cia_action_failed');
  }

  return { outcome };
}
