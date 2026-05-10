import { prisma } from '../../db';
import { publishAgentEvent } from '../../providers/agent-events';
import {
  buildDecisionEnvelope,
  computeDemandState,
} from '../../providers/commercial-intelligence';
import { pickVariant, updateVariantOutcome } from '../cia/self-improvement';
import { type CognitiveActionType } from '../cia/cognitive-state';
import { type UnknownRecord, SEPARATOR_G_RE } from './shared';
import { acquireCiaContactLock, releaseCiaContactLock } from './opportunity';
import { maybeEscalateToHumanControl } from './backlog';
import { runScanContact } from './scan';
import { buildCognitiveMessage } from './cognition';
import { sendDirectAutopilotText } from './execution';
import {
  createConversationProofSnapshotDraft,
  finalizeConversationProofSnapshot,
} from './score';
import { recordDecisionLog } from '../cia/self-improvement';

export async function runCiaAction(data: UnknownRecord) {
  const workspaceId = data?.workspaceId;
  if (!workspaceId) {
    return { outcome: 'SKIPPED', reason: 'missing_workspace' };
  }

  const lockKey = await acquireCiaContactLock(data?.contactId, data?.phone);
  if (!lockKey) {
    await publishAgentEvent({
      type: 'thought',
      workspaceId,
      phase: 'cia_lock_skip',
      message: `Pulei ${data?.contactName || data?.phone || 'um contato'} porque ele já está sendo processado.`,
      meta: {
        contactId: data?.contactId,
        phone: data?.phone,
      },
    });
    return { outcome: 'SKIPPED', reason: 'contact_locked' };
  }

  let outcome: 'SENT' | 'FAILED' | 'SKIPPED' = 'SKIPPED';
  let variant: Awaited<ReturnType<typeof pickVariant>> | null = null;
  let errorMessage: string | null = null;
  let renderedMessage: string | null = null;
  let conversationProofId: string | null = null;
  const workspace = await prisma.workspace.findUnique({
    where: { id: workspaceId },
    select: { providerSettings: true },
  });
  const settings = (workspace?.providerSettings ?? {}) as UnknownRecord;

  try {
    await publishAgentEvent({
      type: 'action',
      workspaceId,
      phase: 'cia_best_action_selected',
      message: `Escolhi ${String(data?.type || 'ACTION').toLowerCase()} para ${data?.contactName || data?.phone || 'contato'} como a melhor próxima ação disponível neste tick.`,
      meta: {
        contactId: data?.contactId,
        conversationId: data?.conversationId,
        phone: data?.phone,
        cluster: data?.cluster,
        priority: data?.priority,
        governor: data?.governor,
        cognition: data?.cognitiveState?.summary || null,
        cycleProofId: data?.cycleProofId || null,
        accountProofId: data?.accountProofId || null,
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

    if (data?.type === 'WAIT') {
      await publishAgentEvent({
        type: 'status',
        workspaceId,
        phase: 'cia_wait',
        message: `Segurei a ação com ${data?.contactName || data?.phone || 'o contato'} até ter sinais melhores.`,
        meta: {
          contactId: data?.contactId,
          phone: data?.phone,
          cognition: data?.cognitiveState?.summary || null,
        },
      });
      outcome = 'SKIPPED';
    } else if (data?.type === 'ESCALATE_HUMAN') {
      const humanGate = await maybeEscalateToHumanControl({
        workspaceId,
        contactId: data?.contactId,
        contactName: data?.contactName,
        phone: data?.phone,
        decisionEnvelope: buildDecisionEnvelope({
          intent: data?.cognitiveState?.intent || 'GENERAL_ASSISTANCE',
          action: 'CIA_ESCALATE_HUMAN',
          confidence: data?.confidence || data?.cognitiveState?.classificationConfidence,
          messageContent: data?.lastMessageText || '',
          demandState:
            data?.demandState ||
            computeDemandState({
              lastMessageAt: new Date(),
              unreadCount: 0,
              leadScore: 0,
              lastMessageText: data?.lastMessageText || '',
            }),
          matchedProducts: [],
        }),
        messageContent: data?.lastMessageText || '',
        intent: data?.cognitiveState?.intent || 'GENERAL_ASSISTANCE',
        action: 'CIA_ESCALATE_HUMAN',
      });
      outcome = humanGate.blocked ? 'SKIPPED' : 'FAILED';
      if (!humanGate.blocked) {
        errorMessage = 'cia_escalation_failed';
      }
    } else if (data?.type === 'RESPOND') {
      await runScanContact({
        workspaceId,
        contactId: data?.contactId,
        phone: data?.phone,
        contactName: data?.contactName,
      });
      outcome = 'SENT';
    } else {
      const actionType = String(data?.type || '');
      const family =
        actionType === 'PAYMENT_RECOVERY'
          ? 'payment_recovery'
          : actionType === 'FOLLOWUP_SOFT' || actionType === 'FOLLOWUP_URGENT'
            ? 'followup'
            : null;

      let message = '';
      if (family) {
        variant = await pickVariant(prisma, workspaceId, family, data?.globalStrategy || null);
        message =
          actionType === 'FOLLOWUP_URGENT'
            ? `${variant.text} Se ainda fizer sentido, eu consigo priorizar isso agora.`
            : variant.text;
      } else {
        message = buildCognitiveMessage({
          action: actionType as CognitiveActionType,
          state: data?.cognitiveState || null,
          contactName: data?.contactName,
          matchedProducts: [],
          tactic: data?.conversationTactic || null,
        });
      }
      renderedMessage = message;

      const conversationProof = data?.conversationId
        ? await createConversationProofSnapshotDraft({
            workspaceId,
            conversationId: data?.conversationId,
            contactId: data?.contactId || null,
            phone: data?.phone || null,
            cycleProofId: data?.cycleProofId || null,
            accountProofId: data?.accountProofId || null,
            selectedActionType: actionType,
            selectedTactic: data?.conversationTactic || null,
            governor: data?.governor || null,
            renderedMessage: message,
            actionUniverse: data?.conversationActionUniverse || [],
            tacticUniverse: data?.conversationTacticUniverse || [],
            selectedAction: {
              type: actionType,
              governor: data?.governor || null,
              reason: data?.reason || null,
              priority: data?.priority || null,
              confidence:
                data?.confidence || data?.cognitiveState?.classificationConfidence || null,
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
          })
        : null;
      conversationProofId = conversationProof?.id || null;

      const result = await sendDirectAutopilotText({
        workspaceId,
        contactId: data?.contactId,
        conversationId: data?.conversationId,
        phone: data?.phone,
        contactName: data?.contactName,
        text: message,
        settings,
        intent: data?.cognitiveState?.intent || 'GENERAL_ASSISTANCE',
        reason: data?.reason || 'cia_nba_execution',
        workspaceRecord: { providerSettings: settings },
        intentConfidence: data?.confidence || data?.cognitiveState?.classificationConfidence,
        actionLabel: actionType,
        usedHistory: true,
        usedKb: false,
        deliveryMode: 'proactive',
        idempotencyContext: {
          source: 'cia_action',
          action: actionType,
          capabilityCode: actionType,
          conversationTactic: data?.conversationTactic || null,
          conversationProofId,
          cycleGeneratedAt: data?.cycleGeneratedAt || null,
          cycleProofId: data?.cycleProofId || null,
          accountProofId: data?.accountProofId || null,
        },
      });
      outcome = result === 'executed' ? 'SENT' : 'SKIPPED';

      if (variant && family) {
        await updateVariantOutcome(prisma, {
          workspaceId,
          family,
          variant,
          outcome,
        });
      }
    }
  } catch (err: unknown) {
    const errInstanceofError =
      err instanceof Error ? err : new Error(typeof err === 'string' ? err : 'unknown error');
    outcome = 'FAILED';
    errorMessage = errInstanceofError?.message || 'cia_action_failed';
  } finally {
    if (!conversationProofId && data?.conversationId) {
      const fallbackProof = await createConversationProofSnapshotDraft({
        workspaceId,
        conversationId: data?.conversationId,
        contactId: data?.contactId || null,
        phone: data?.phone || null,
        cycleProofId: data?.cycleProofId || null,
        accountProofId: data?.accountProofId || null,
        selectedActionType: String(data?.type || 'CIA_ACTION'),
        selectedTactic: data?.conversationTactic || null,
        governor: data?.governor || null,
        renderedMessage: renderedMessage,
        actionUniverse: data?.conversationActionUniverse || [],
        tacticUniverse: data?.conversationTacticUniverse || [],
        selectedAction: {
          type: data?.type || 'CIA_ACTION',
          governor: data?.governor || null,
          reason: data?.reason || null,
          priority: data?.priority || null,
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
      outcome,
      renderedMessage,
      metadata: {
        cluster: data?.cluster || null,
        governor: data?.governor || null,
        cycleProofId: data?.cycleProofId || null,
        accountProofId: data?.accountProofId || null,
        error: errorMessage,
      },
    });

    const actionLabel = String(data?.type || 'acao')
      .toLowerCase()
      .replace(SEPARATOR_G_RE, ' ')
      .trim();

    await publishAgentEvent({
      type: 'proof',
      workspaceId,
      phase: 'cia_conversation_proof',
      persistent: outcome !== 'SENT',
      message:
        outcome === 'SENT'
          ? `Executei ${actionLabel} para ${data?.contactName || data?.phone || 'contato'} e sincronizei a execução com a conversa ao vivo.`
          : outcome === 'FAILED'
            ? `A execução de ${actionLabel} falhou para ${data?.contactName || data?.phone || 'contato'}.`
            : `A execução de ${actionLabel} foi pulada para ${data?.contactName || data?.phone || 'contato'}.`,
      meta: {
        contactId: data?.contactId,
        conversationId: data?.conversationId,
        phone: data?.phone,
        cycleProofId: data?.cycleProofId || null,
        accountProofId: data?.accountProofId || null,
        conversationProofId,
        capabilityCode: data?.type || 'CIA_ACTION',
        tacticCode: data?.conversationTactic || null,
        outcome,
        error: errorMessage,
        selectedActionUtility: data?.selectedActionUtility || null,
        selectedActionRank: data?.selectedActionRank || null,
        betterActionCount: data?.betterActionCount || 0,
        selectedTacticUtility: data?.selectedTacticUtility || null,
        selectedTacticRank: data?.selectedTacticRank || null,
        betterTacticCount: data?.betterTacticCount || 0,
      },
    });

    await recordDecisionLog(prisma, {
      workspaceId,
      contactId: data?.contactId,
      phone: data?.phone,
      variantKey: variant?.key || null,
      intent: data?.type || 'CIA_ACTION',
      message: renderedMessage || variant?.text || data?.lastMessageText || '',
      outcome,
      priority: data?.priority,
      metadata: {
        cluster: data?.cluster,
        reason: data?.reason,
        governor: data?.governor,
        cognition: data?.cognitiveState?.summary || null,
        conversationTactic: data?.conversationTactic || null,
        conversationProofId,
        error: errorMessage,
        cycleProofId: data?.cycleProofId || null,
        accountProofId: data?.accountProofId || null,
      },
    });

    await releaseCiaContactLock(lockKey);
  }

  if (outcome === 'FAILED') {
    throw new Error(errorMessage || 'cia_action_failed');
  }

  return { outcome };
}
