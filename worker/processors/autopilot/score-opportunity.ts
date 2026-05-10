import type { Prisma } from '@prisma/client';
import { prisma } from '../../db';
import { redis } from '../../redis-client';
import { forEachSequential } from '../../utils/async-sequence';
import { buildCiaWorkspaceStateFromSeed } from '../cia/build-state';
import { deriveOperationalUnreadCount, isConversationPendingForAgent } from '../../conversation-agent-state';
import { log, type UnknownRecord, CIA_OPPORTUNITY_REFRESH_TTL_SECONDS, CIA_OPPORTUNITY_LOOKBACK_DAYS, CIA_OPPORTUNITY_REFRESH_LIMIT } from './shared';
import { classifyOpportunityCandidate, buildCompressedOpportunityContext, mapOpportunityBucket } from './opportunity';

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
