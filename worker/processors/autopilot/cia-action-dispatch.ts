import { prisma } from '../../db';
import { publishAgentEvent } from '../../providers/agent-events';
import { buildDecisionEnvelope, computeDemandState } from '../../providers/commercial-intelligence';
import { pickVariant, type VariantFamily } from '../cia/self-improvement';
import { type CognitiveActionType } from '../cia/cognitive-state';
import { type UnknownRecord } from './shared';
import { maybeEscalateToHumanControl } from './backlog-escalation';
import { runScanContact } from './scan';
import { buildCognitiveMessage } from './cognition';
import { sendDirectAutopilotText } from './execution';
import { createConversationProofSnapshotDraft } from './score-proof';

export async function dispatchCiaActionByType(
  data: UnknownRecord,
  settings: UnknownRecord,
  workspaceId: string,
): Promise<{
  outcome: 'SENT' | 'FAILED' | 'SKIPPED';
  renderedMessage: string | null;
  conversationProofId: string | null;
  variant: Awaited<ReturnType<typeof pickVariant>> | null;
  family: VariantFamily | null;
}> {
  const defaultResult = {
    outcome: 'SKIPPED' as const,
    renderedMessage: null as string | null,
    conversationProofId: null as string | null,
    variant: null as Awaited<ReturnType<typeof pickVariant>> | null,
    family: null as VariantFamily | null,
  };

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
    return { ...defaultResult, outcome: 'SKIPPED' };
  }

  if (data?.type === 'ESCALATE_HUMAN') {
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
    return { ...defaultResult, outcome: humanGate.blocked ? 'SKIPPED' : 'FAILED' };
  }

  if (data?.type === 'RESPOND') {
    await runScanContact({
      workspaceId,
      contactId: data?.contactId,
      phone: data?.phone,
      contactName: data?.contactName,
    });
    return { ...defaultResult, outcome: 'SENT' };
  }

  const actionType = String(data?.type || '');
  const family: VariantFamily | null =
    actionType === 'PAYMENT_RECOVERY'
      ? 'payment_recovery'
      : actionType === 'FOLLOWUP_SOFT' || actionType === 'FOLLOWUP_URGENT'
        ? 'followup'
        : null;

  let message = '';
  let variant: Awaited<ReturnType<typeof pickVariant>> | null = null;
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
      })
    : null;

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
      conversationProofId: conversationProof?.id || null,
      cycleGeneratedAt: data?.cycleGeneratedAt || null,
      cycleProofId: data?.cycleProofId || null,
      accountProofId: data?.accountProofId || null,
    },
  });

  return {
    outcome: result === 'executed' ? 'SENT' : 'SKIPPED',
    renderedMessage: message,
    conversationProofId: conversationProof?.id || null,
    variant,
    family,
  };
}
