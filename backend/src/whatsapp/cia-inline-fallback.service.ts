import { Inject, Injectable, forwardRef } from '@nestjs/common';
import { findFirstSequential, forEachSequential } from '../common/async-sequence';
import { UnifiedAgentService } from '../kloel/unified-agent.service';
import { PrismaService } from '../prisma/prisma.service';
import { AgentEventsService } from './agent-events.service';
import { CiaChatFilterService } from './cia-chat-filter.service';
import { CiaRuntimeStateService } from './cia-runtime-state.service';
import { CIA_SHARED_REPLY_LOCK_MS, CiaSendHelpersService } from './cia-send-helpers.service';

type BacklogMode = 'reply_all_recent_first' | 'reply_only_new' | 'prioritize_hot';

const safeStr = (v: unknown, fb = ''): string =>
  typeof v === 'string' ? v : typeof v === 'number' || typeof v === 'boolean' ? String(v) : fb;

/**
 * Handles inline (in-process) backlog fallback execution when the BullMQ worker
 * is unavailable. Reads pending conversations from the local DB and replies
 * using the UnifiedAgent, respecting daily message limits and reply locks.
 */
@Injectable()
export class CiaInlineFallbackService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly agentEvents: AgentEventsService,
    private readonly chatFilter: CiaChatFilterService,
    private readonly runtimeState: CiaRuntimeStateService,
    private readonly sendHelpers: CiaSendHelpersService,
    @Inject(forwardRef(() => UnifiedAgentService))
    private readonly unifiedAgent: UnifiedAgentService,
  ) {}

  async buildPendingInboundBatch(params: {
    workspaceId: string;
    contactId?: string | null;
    phone?: string | null;
    fallbackMessageContent?: string | null;
    fallbackQuotedMessageId?: string | null;
  }): Promise<{
    aggregatedMessage: string;
    messages: Array<{
      content: string;
      quotedMessageId: string;
      createdAt?: string | null;
    }>;
  } | null> {
    const phone = String(params.phone || '').trim();
    const contact = params.contactId
      ? await this.prisma.contact.findFirst({
          where: { id: params.contactId, workspaceId: params.workspaceId },
          select: { id: true, phone: true },
        })
      : phone
        ? await this.prisma.contact.findFirst({
            where: { workspaceId: params.workspaceId, phone },
            select: { id: true, phone: true },
          })
        : null;

    const contactId = contact?.id || params.contactId || null;
    if (!contactId && !phone) {
      return null;
    }

    const lastOutbound = await this.prisma.message.findFirst({
      where: {
        workspaceId: params.workspaceId,
        ...(contactId ? { contactId } : { contact: { phone } }),
        direction: 'OUTBOUND',
      },
      orderBy: { createdAt: 'desc' },
      select: { createdAt: true },
    });

    const inboundMessages = await this.prisma.message.findMany({
      take: 12,
      where: {
        workspaceId: params.workspaceId,
        ...(contactId ? { contactId } : { contact: { phone } }),
        direction: 'INBOUND',
        ...(lastOutbound?.createdAt
          ? {
              createdAt: {
                gt: lastOutbound.createdAt,
              },
            }
          : {}),
      },
      orderBy: { createdAt: 'asc' },
      select: {
        content: true,
        externalId: true,
        createdAt: true,
      },
    });

    const messages = inboundMessages
      .map((message) => ({
        content: String(message.content || '').trim(),
        quotedMessageId: String(message.externalId || '').trim(),
        createdAt: message.createdAt?.toISOString?.() || null,
      }))
      .filter((message) => message.content && message.quotedMessageId);

    if (!messages.length) {
      const fallbackContent = String(params.fallbackMessageContent || '').trim();
      const fallbackQuotedMessageId = String(params.fallbackQuotedMessageId || '').trim();
      if (!fallbackContent || !fallbackQuotedMessageId) {
        return null;
      }

      return {
        aggregatedMessage: fallbackContent,
        messages: [
          {
            content: fallbackContent,
            quotedMessageId: fallbackQuotedMessageId,
            createdAt: null,
          },
        ],
      };
    }

    return {
      aggregatedMessage:
        messages.length === 1
          ? messages[0].content
          : messages
              .map((message, index) => `[${index + 1}] ${String(message.content || '').trim()}`)
              .join('\n'),
      messages,
    };
  }

  async runBacklogInlineFallback(
    workspaceId: string,
    runId: string,
    mode: BacklogMode,
    conversations: Record<string, unknown>[],
  ) {
    if (!conversations.length) {
      await this.runtimeState.updateAutonomyRunStatus(workspaceId, runId, 'COMPLETED');
      await this.runtimeState.finalizeSilentLiveMode(workspaceId, 'inline_backlog_empty', runId);
      return {
        processed: 0,
        skipped: 0,
        message:
          'Worker indisponível e nenhuma conversa elegível foi encontrada para fallback inline.',
      };
    }

    await this.agentEvents.publish({
      type: 'status',
      workspaceId,
      runId,
      phase: 'backlog_inline_fallback',
      persistent: true,
      message: `Worker indisponível. Vou responder ${conversations.length} conversas inline agora para não deixar o WhatsApp parado.`,
      meta: {
        total: conversations.length,
        mode,
      },
    });

    let processed = 0;
    let skipped = 0;

    await forEachSequential(Array.from(conversations.entries()), async ([index, conversation]) => {
      const messages = conversation.messages as Record<string, unknown>[] | undefined;
      const contact = conversation.contact as Record<string, unknown> | undefined;
      const lastMessage = messages?.[0];
      const pendingBatch = await this.buildPendingInboundBatch({
        workspaceId,
        contactId: safeStr(conversation.contactId) || null,
        phone: safeStr(contact?.phone) || null,
        fallbackMessageContent: safeStr(lastMessage?.content) || null,
        fallbackQuotedMessageId: safeStr(lastMessage?.externalId) || null,
      });
      const messageContent = safeStr(
        pendingBatch?.aggregatedMessage || lastMessage?.content,
      ).trim();
      const messageDirection = safeStr(lastMessage?.direction).trim().toUpperCase();
      const phone = safeStr(contact?.phone).trim();

      if (!phone || !messageContent || messageDirection !== 'INBOUND') {
        skipped += 1;
        return;
      }

      await this.agentEvents.publish({
        type: 'thought',
        workspaceId,
        runId,
        phase: 'backlog_inline_contact',
        message: `Respondendo inline ${safeStr(contact?.name, phone)} (${index + 1}/${conversations.length}).`,
        meta: {
          conversationId: conversation.id || null,
          contactId: conversation.contactId || null,
          phone,
          backlogIndex: index + 1,
          backlogTotal: conversations.length,
        },
      });

      const replyLockKey = this.sendHelpers.getSharedReplyLockKey(
        workspaceId,
        safeStr(conversation.contactId) || null,
        phone,
      );
      const replyReserved = await this.sendHelpers.redisSetNx(
        replyLockKey,
        `${runId}:${safeStr(conversation.id || conversation.contactId, String(index))}`,
        CIA_SHARED_REPLY_LOCK_MS,
      );
      if (!replyReserved) {
        skipped += 1;
        return;
      }

      let keepReplyLock = false;
      try {
        const result = await this.unifiedAgent.processIncomingMessage({
          workspaceId,
          contactId: safeStr(conversation.contactId) || undefined,
          phone,
          message: messageContent,
          channel: 'whatsapp',
          context: {
            source: 'cia_backlog_inline',
            deliveryMode: this.chatFilter.isRecentRemoteBatch(pendingBatch?.messages || [])
              ? 'reactive'
              : 'proactive',
            conversationId: safeStr(conversation.id) || null,
            runId,
            backlogIndex: index + 1,
            backlogTotal: conversations.length,
            forceDirect: true,
          },
        });

        if (this.sendHelpers.hasOutboundAction(result.actions || [])) {
          keepReplyLock = true;
          processed += 1;
          return;
        }

        const shouldMirrorReplies = this.chatFilter.isRecentRemoteBatch(
          pendingBatch?.messages || [],
        );
        const reply = String(
          result.reply ||
            result.response ||
            this.sendHelpers.buildInlineFallbackReply(messageContent),
        ).trim();
        const latestQuotedMessageId = pendingBatch?.messages?.length
          ? pendingBatch.messages[pendingBatch.messages.length - 1]?.quotedMessageId || ''
          : '';
        const replyPlan =
          reply && pendingBatch?.messages?.length
            ? shouldMirrorReplies
              ? await this.unifiedAgent.buildQuotedReplyPlan({
                  workspaceId,
                  contactId: safeStr(conversation.contactId) || undefined,
                  phone,
                  draftReply: reply,
                  customerMessages: pendingBatch.messages,
                })
              : latestQuotedMessageId
                ? [
                    {
                      quotedMessageId: latestQuotedMessageId,
                      text: reply,
                    },
                  ]
                : []
            : [];
        if (!reply || !replyPlan.length) {
          skipped += 1;
          return;
        }

        let sendFailed = false;
        await findFirstSequential(
          Array.from(replyPlan.entries()),
          async ([replyIndex, replyItem]) => {
            const sendResult = await this.sendHelpers.sendCiaMessageWithDailyLimit(
              workspaceId,
              phone,
              replyItem.text,
              {
                externalId: `cia-inline:${runId}:${safeStr(conversation.id || conversation.contactId, String(index))}:${replyIndex + 1}`,
                quotedMessageId: replyItem.quotedMessageId,
                complianceMode: shouldMirrorReplies ? 'reactive' : 'proactive',
                forceDirect: true,
              },
            );

            if (
              sendResult &&
              typeof sendResult === 'object' &&
              'error' in sendResult &&
              sendResult.error
            ) {
              sendFailed = true;
              return true;
            }
            return undefined;
          },
        );

        if (sendFailed) {
          skipped += 1;
          return;
        }

        keepReplyLock = true;
        processed += 1;
      } catch {
        // PULSE:OK — Per-conversation processing failure is isolated; others still processed
        skipped += 1;
      } finally {
        if (!keepReplyLock) {
          await this.sendHelpers.releaseSharedReplyLock(replyLockKey);
        }
      }
    });

    await this.runtimeState.updateAutonomyRunStatus(workspaceId, runId, 'COMPLETED');
    await this.runtimeState.finalizeSilentLiveMode(workspaceId, 'inline_backlog_completed', runId);

    const message =
      processed > 0
        ? `Fallback inline concluído. Respondi ${processed} conversa(s) enquanto o worker estava indisponível.`
        : 'Fallback inline executado, mas nenhuma conversa gerou resposta enviada.';

    await this.agentEvents.publish({
      type: 'status',
      workspaceId,
      runId,
      phase: 'backlog_inline_done',
      persistent: true,
      message,
      meta: {
        processed,
        skipped,
        mode,
      },
    });

    return {
      processed,
      skipped,
      message,
    };
  }
}
