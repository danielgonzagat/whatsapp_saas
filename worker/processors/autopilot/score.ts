import type { Prisma } from '@prisma/client';
import { WorkerLogger } from '../../logger';
import { prisma } from '../../db';
import { redis } from '../../redis-client';
import { forEachSequential } from '../../utils/async-sequence';
import { unifiedWhatsAppProvider as whatsappApiProvider } from '../../providers/unified-whatsapp-provider';
import { buildCiaWorkspaceStateFromSeed } from '../cia/build-state';
import { deriveOperationalUnreadCount, isConversationPendingForAgent } from '../../conversation-agent-state';
import { log, normalizeJsonObject, type UnknownRecord, CIA_OPPORTUNITY_REFRESH_TTL_SECONDS, CIA_OPPORTUNITY_LOOKBACK_DAYS, CIA_OPPORTUNITY_REFRESH_LIMIT, CIA_CONTACT_CATALOG_LOOKBACK_DAYS, CIA_CONTACT_SCORE_MESSAGE_LIMIT } from './shared';
import { buildHeuristicCatalogScore, maybeScoreContactWithAi, classifyOpportunityCandidate, buildCompressedOpportunityContext, mapOpportunityBucket } from './opportunity';
import { resolveCatalogChatActivityTimestamp } from './identity';

const scoreLog = new WorkerLogger('autopilot:score');

export async function runScoreContact(data: UnknownRecord) {
  const workspaceId = String(data?.workspaceId || '').trim();
  const contactId = String(data?.contactId || '').trim();
  if (!workspaceId || !contactId) {
    return { scored: false, reason: 'missing_input' };
  }

  const cutoff = new Date(Date.now() - CIA_CONTACT_CATALOG_LOOKBACK_DAYS * 24 * 60 * 60 * 1000);
  const contact = await prisma.contact.findUnique({
    where: { id: contactId },
    include: {
      deals: {
        where: { status: 'WON' },
        orderBy: { updatedAt: 'desc' },
        take: 3,
        select: {
          title: true,
          value: true,
          status: true,
          updatedAt: true,
        },
      },
      messages: {
        where: { createdAt: { gte: cutoff } },
        orderBy: { createdAt: 'desc' },
        take: CIA_CONTACT_SCORE_MESSAGE_LIMIT,
        select: {
          direction: true,
          content: true,
          createdAt: true,
        },
      },
      conversations: {
        where: { workspaceId },
        select: {
          unreadCount: true,
          lastMessageAt: true,
        },
        orderBy: { lastMessageAt: 'desc' },
        take: 1,
      },
    },
  });

  if (!contact) {
    return { scored: false, reason: 'contact_missing' };
  }

  let messages = [...(contact.messages || [])]
    .map((message) => ({
      direction: String(message.direction || '').toUpperCase(),
      content: String(message.content || '').trim(),
      createdAt: message.createdAt,
    }))
    .filter((message) => message.content)
    .sort(
      (left: UnknownRecord, right: UnknownRecord) =>
        new Date(left.createdAt).getTime() - new Date(right.createdAt).getTime(),
    );

  if (messages.length < 4 && data?.chatId) {
    const remoteMessages = await whatsappApiProvider
      .getChatMessages(workspaceId, String(data.chatId), {
        limit: CIA_CONTACT_SCORE_MESSAGE_LIMIT,
        offset: 0,
        downloadMedia: false,
      })
      .catch(() => []);
    if (remoteMessages.length) {
      messages = (remoteMessages as UnknownRecord[])
        .map((message: UnknownRecord) => ({
          direction:
            message?.fromMe === true ||
            message?.key?.fromMe === true ||
            message?.id?.fromMe === true
              ? 'OUTBOUND'
              : 'INBOUND',
          content: String(message?.body || message?.text?.body || message?.caption || '').trim(),
          createdAt:
            resolveCatalogChatActivityTimestamp(message) > 0
              ? new Date(resolveCatalogChatActivityTimestamp(message))
              : new Date(),
        }))
        .filter((message) => message.content)
        .sort(
          (left: UnknownRecord, right: UnknownRecord) =>
            new Date(left.createdAt).getTime() - new Date(right.createdAt).getTime(),
        );
    }
  }

  const history = messages
    .map((message) => `[${message.direction}] ${String(message.content || '').slice(0, 500)}`)
    .join('\n');
  const unreadCount = Number(contact.conversations?.[0]?.unreadCount || 0) || 0;
  const latestWonDeal = Array.isArray((contact as UnknownRecord).deals)
    ? (contact as UnknownRecord).deals?.[0]
    : null;
  const heuristic = buildHeuristicCatalogScore({
    joinedText: history,
    messages,
    unreadCount,
    optedOutAt: contact.optedOutAt,
    wonDealTitle: latestWonDeal?.title || null,
    wonDealValue: latestWonDeal?.value || null,
  });
  const aiScore = await maybeScoreContactWithAi({
    contactName: contact.name,
    phone: contact.phone,
    history,
    wonDealTitle: latestWonDeal?.title || null,
    wonDealValue: latestWonDeal?.value || null,
  });
  const score = aiScore || heuristic;
  const probabilityScore = Math.max(
    0,
    Math.min(1, Number(score.purchaseProbabilityScore || score.leadScore / 100) || 0),
  );
  const probabilityPercent = Math.max(
    0,
    Math.min(
      100,
      Math.round(Number(score.purchaseProbabilityPercent || probabilityScore * 100) || 0),
    ),
  );
  const compressedSummary = [
    `Contato: ${contact.name || contact.phone}`,
    `Status do cliente: ${score.buyerStatus}`,
    `Score: ${score.leadScore}/100`,
    score.buyerStatus === 'BOUGHT'
      ? `Probabilidade de recompra: ${score.purchaseProbability} (${probabilityPercent}%)`
      : `Probabilidade de compra: ${score.purchaseProbability} (${probabilityPercent}%)`,
    score.buyerStatus === 'BOUGHT'
      ? `Compra identificada: ${score.purchasedProduct || latestWonDeal?.title || 'produto não identificado'}`
      : null,
    score.purchaseValue ? `Valor pago: ${score.purchaseValue}` : null,
    `Intenção: ${score.intent}`,
    `Sentimento: ${score.sentiment}`,
    `Perfil inferido: ${score.demographics.gender}, ${score.demographics.ageRange}, ${score.demographics.location} (confiança ${Math.round(
      (Number(score.demographics.confidence || 0) || 0) * 100,
    )}%)`,
    `Próxima ação: ${score.nextBestAction}`,
    `Resumo: ${score.summary}`,
    score.purchaseReason ? `Motivo da compra: ${score.purchaseReason}` : null,
    score.notPurchasedReason ? `Motivo de não compra: ${score.notPurchasedReason}` : null,
  ]
    .filter(Boolean)
    .join('\n');

  const existingCustomFields = normalizeJsonObject(contact.customFields);
  await prisma.contact.updateMany({
    where: { id: contact.id, workspaceId },
    data: {
      leadScore: score.leadScore,
      sentiment: score.sentiment,
      purchaseProbability: score.purchaseProbability,
      nextBestAction: score.nextBestAction,
      aiSummary: score.summary,
      customFields: {
        ...existingCustomFields,
        purchaseProbabilityScore: Number(probabilityScore.toFixed(3)),
        purchaseProbabilityPercent: probabilityPercent,
        probabilityReasons: score.reasons,
        catalogedAt: existingCustomFields.catalogedAt || new Date().toISOString(),
        lastScoredAt: new Date().toISOString(),
        lastScoredSource: aiScore ? 'ai_catalog_score' : 'heuristic_catalog_score',
        intent: score.intent,
        buyerStatus: score.buyerStatus,
        purchasedProduct: score.purchasedProduct || latestWonDeal?.title || null,
        purchaseValue:
          score.purchaseValue ||
          ((Number(latestWonDeal?.value || 0) || 0) > 0
            ? Number(Number(latestWonDeal?.value || 0).toFixed(2))
            : null),
        purchaseReason: score.purchaseReason,
        notPurchasedReason: score.notPurchasedReason,
        preferences: score.preferences,
        importantDetails: score.importantDetails,
        demographics: score.demographics,
        fullSummary: score.summary,
      },
    },
  });

  await prisma.kloelMemory.upsert({
    where: {
      workspaceId_key: {
        workspaceId,
        key: `compressed_context:${contact.id}`,
      },
    },
    update: {
      value: {
        contactId: contact.id,
        phone: contact.phone,
        summary: compressedSummary,
        score: score.leadScore,
        purchaseProbability: score.purchaseProbability,
        purchaseProbabilityScore: Number(probabilityScore.toFixed(3)),
        purchaseProbabilityPercent: probabilityPercent,
        intent: score.intent,
        nextBestAction: score.nextBestAction,
        buyerStatus: score.buyerStatus,
        purchasedProduct: score.purchasedProduct || latestWonDeal?.title || null,
        purchaseValue:
          score.purchaseValue ||
          ((Number(latestWonDeal?.value || 0) || 0) > 0
            ? Number(Number(latestWonDeal?.value || 0).toFixed(2))
            : null),
        source: aiScore ? 'ai_catalog_score' : 'heuristic_catalog_score',
      },
      category: 'compressed_context',
      type: 'contact_context',
      content: compressedSummary,
      metadata: {
        contactId: contact.id,
        phone: contact.phone,
        score: score.leadScore,
        purchaseProbability: score.purchaseProbability,
        purchaseProbabilityScore: Number(probabilityScore.toFixed(3)),
        purchaseProbabilityPercent: probabilityPercent,
        intent: score.intent,
        buyerStatus: score.buyerStatus,
        reason: data?.reason || 'catalog_job',
      },
    },
    create: {
      workspaceId,
      key: `compressed_context:${contact.id}`,
      category: 'compressed_context',
      type: 'contact_context',
      content: compressedSummary,
      value: {
        contactId: contact.id,
        phone: contact.phone,
        summary: compressedSummary,
        score: score.leadScore,
        purchaseProbability: score.purchaseProbability,
        purchaseProbabilityScore: Number(probabilityScore.toFixed(3)),
        purchaseProbabilityPercent: probabilityPercent,
        intent: score.intent,
        nextBestAction: score.nextBestAction,
        buyerStatus: score.buyerStatus,
        purchasedProduct: score.purchasedProduct || latestWonDeal?.title || null,
        purchaseValue:
          score.purchaseValue ||
          ((Number(latestWonDeal?.value || 0) || 0) > 0
            ? Number(Number(latestWonDeal?.value || 0).toFixed(2))
            : null),
        source: aiScore ? 'ai_catalog_score' : 'heuristic_catalog_score',
      },
      metadata: {
        contactId: contact.id,
        phone: contact.phone,
        score: score.leadScore,
        purchaseProbability: score.purchaseProbability,
        purchaseProbabilityScore: Number(probabilityScore.toFixed(3)),
        purchaseProbabilityPercent: probabilityPercent,
        intent: score.intent,
        buyerStatus: score.buyerStatus,
        reason: data?.reason || 'catalog_job',
      },
    },
  });

  return {
    scored: true,
    contactId: contact.id,
    leadScore: score.leadScore,
    purchaseProbability: score.purchaseProbability,
    purchaseProbabilityScore: Number(probabilityScore.toFixed(3)),
    purchaseProbabilityPercent: probabilityPercent,
    buyerStatus: score.buyerStatus,
  };
}

export async function refreshOpportunityUniverse(workspaceId: string) {
  const throttleKey = `cia:opportunity-refresh:${workspaceId}`;
  const reserved = await redis.set(
    throttleKey,
    new Date().toISOString(),
    'EX',
    CIA_OPPORTUNITY_REFRESH_TTL_SECONDS,
    'NX',
  );
  if (reserved !== 'OK') {
    return { refreshed: false as const, reason: 'throttled' };
  }

  const cutoff = new Date(Date.now() - CIA_OPPORTUNITY_LOOKBACK_DAYS * 24 * 60 * 60 * 1000);
  const conversations = await prisma.conversation.findMany({
    where: {
      workspaceId,
      lastMessageAt: { gte: cutoff },
      contactId: { not: '' },
    },
    include: {
      contact: {
        select: {
          id: true,
          phone: true,
          name: true,
          leadScore: true,
          customFields: true,
          optedOutAt: true,
        },
      },
      messages: {
        orderBy: { createdAt: 'desc' },
        take: 12,
        select: {
          direction: true,
          createdAt: true,
          content: true,
          externalId: true,
        },
      },
    },
    orderBy: { lastMessageAt: 'desc' },
    take: CIA_OPPORTUNITY_REFRESH_LIMIT,
  });

  const seedState = buildCiaWorkspaceStateFromSeed({
    workspaceId,
    conversations: conversations.map((conversation: UnknownRecord) => {
      const lastInbound =
        conversation.messages.find((message: UnknownRecord) => message.direction === 'INBOUND') ||
        conversation.messages[0];
      const pending = isConversationPendingForAgent(conversation);

      return {
        conversationId: conversation.id,
        contactId: conversation.contact?.id,
        phone: conversation.contact?.phone,
        contactName: conversation.contact?.name,
        unreadCount: deriveOperationalUnreadCount(conversation),
        pending,
        lastMessageAt: conversation.lastMessageAt,
        lastMessageText: lastInbound?.content || '',
        leadScore: conversation.contact?.leadScore || 0,
        customFields: conversation.contact?.customFields || {},
      };
    }),
  });

  const conversationMap = new Map(
    conversations.map((conversation: UnknownRecord) => [conversation.id, conversation]),
  );
  const rankings: Array<Record<string, unknown>> = [];

  await forEachSequential(seedState.candidates, async (candidate) => {
    const conversation = conversationMap.get(candidate.conversationId);
    if (!conversation?.contact?.id) {
      return;
    }

    const joinedText = (conversation.messages || [])
      .map((message: UnknownRecord) => String(message.content || ''))
      .join('\n');
    const classification = classifyOpportunityCandidate({
      candidate,
      joinedText,
      optedOutAt: conversation.contact?.optedOutAt || null,
      customFields: conversation.contact?.customFields || {},
    });
    const compressedContext = buildCompressedOpportunityContext({
      contactName: conversation.contact?.name,
      phone: conversation.contact?.phone,
      candidate,
      messages: conversation.messages || [],
      opportunityClass: classification.opportunityClass,
      score: classification.score,
    });

    await prisma.contact
      .update({
        where: { id: conversation.contact.id },
        data: {
          purchaseProbability: mapOpportunityBucket(classification.score),
          nextBestAction: classification.nextBestAction,
        },
      })
      .catch((err) => {
        log.warn('contact_update_score_failed', { error: err?.message });
        return undefined;
      });

    await prisma.kloelMemory.upsert({
      where: {
        workspaceId_key: {
          workspaceId,
          key: `compressed_context:${conversation.contact.id}`,
        },
      },
      update: {
        value: {
          contactId: conversation.contact.id,
          phone: conversation.contact?.phone || null,
          summary: compressedContext,
          opportunityClass: classification.opportunityClass,
          score: classification.score,
          nextBestAction: classification.nextBestAction,
          source: 'cia_opportunity_refresh',
        },
        category: 'compressed_context',
        type: 'contact_context',
        content: compressedContext,
        metadata: {
          contactId: conversation.contact.id,
          phone: conversation.contact?.phone || null,
          opportunityClass: classification.opportunityClass,
          score: classification.score,
          source: 'cia_opportunity_refresh',
        },
      },
      create: {
        workspaceId,
        key: `compressed_context:${conversation.contact.id}`,
        value: {
          contactId: conversation.contact.id,
          phone: conversation.contact?.phone || null,
          summary: compressedContext,
          opportunityClass: classification.opportunityClass,
          score: classification.score,
          nextBestAction: classification.nextBestAction,
          source: 'cia_opportunity_refresh',
        },
        category: 'compressed_context',
        type: 'contact_context',
        content: compressedContext,
        metadata: {
          contactId: conversation.contact.id,
          phone: conversation.contact?.phone || null,
          opportunityClass: classification.opportunityClass,
          score: classification.score,
          source: 'cia_opportunity_refresh',
        },
      },
    });

    await prisma.kloelMemory.upsert({
      where: {
        workspaceId_key: {
          workspaceId,
          key: `opportunity_rank:${conversation.contact.id}`,
        },
      },
      update: {
        value: {
          contactId: conversation.contact.id,
          phone: conversation.contact?.phone || null,
          score: classification.score,
          opportunityClass: classification.opportunityClass,
          nextBestAction: classification.nextBestAction,
          reason: classification.reason,
          lastMessageAt: candidate.lastMessageAt,
        },
        category: 'opportunity_ranking',
        type: 'contact_opportunity',
        content: `${classification.opportunityClass} (${classification.score}%)`,
        metadata: {
          conversationId: candidate.conversationId,
          contactId: conversation.contact.id,
        },
      },
      create: {
        workspaceId,
        key: `opportunity_rank:${conversation.contact.id}`,
        value: {
          contactId: conversation.contact.id,
          phone: conversation.contact?.phone || null,
          score: classification.score,
          opportunityClass: classification.opportunityClass,
          nextBestAction: classification.nextBestAction,
          reason: classification.reason,
          lastMessageAt: candidate.lastMessageAt,
        },
        category: 'opportunity_ranking',
        type: 'contact_opportunity',
        content: `${classification.opportunityClass} (${classification.score}%)`,
        metadata: {
          conversationId: candidate.conversationId,
          contactId: conversation.contact.id,
        },
      },
    });

    rankings.push({
      contactId: conversation.contact.id,
      phone: conversation.contact?.phone || null,
      contactName: conversation.contact?.name || null,
      opportunityClass: classification.opportunityClass,
      score: classification.score,
      nextBestAction: classification.nextBestAction,
      conversationId: candidate.conversationId,
    });
  });

  const orderedRankings = rankings.sort((left, right) => Number(right.score) - Number(left.score));
  await prisma.kloelMemory.upsert({
    where: {
      workspaceId_key: {
        workspaceId,
        key: 'opportunity_universe:current',
      },
    },
    update: {
      value: {
        refreshedAt: new Date().toISOString(),
        lookbackDays: CIA_OPPORTUNITY_LOOKBACK_DAYS,
        totalContacts: orderedRankings.length,
        rankings: orderedRankings as never as Prisma.InputJsonValue,
      },
      category: 'opportunity_ranking',
      type: 'workspace_opportunity_universe',
      content: `Universo de oportunidades atualizado com ${orderedRankings.length} contato(s).`,
      metadata: {
        totalContacts: orderedRankings.length,
        lookbackDays: CIA_OPPORTUNITY_LOOKBACK_DAYS,
      },
    },
    create: {
      workspaceId,
      key: 'opportunity_universe:current',
      value: {
        refreshedAt: new Date().toISOString(),
        lookbackDays: CIA_OPPORTUNITY_LOOKBACK_DAYS,
        totalContacts: orderedRankings.length,
        rankings: orderedRankings as never as Prisma.InputJsonValue,
      },
      category: 'opportunity_ranking',
      type: 'workspace_opportunity_universe',
      content: `Universo de oportunidades atualizado com ${orderedRankings.length} contato(s).`,
      metadata: {
        totalContacts: orderedRankings.length,
        lookbackDays: CIA_OPPORTUNITY_LOOKBACK_DAYS,
      },
    },
  });

  return {
    refreshed: true as const,
    totalContacts: orderedRankings.length,
    topContacts: orderedRankings.slice(0, 10),
  };
}

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
