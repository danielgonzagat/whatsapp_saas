import { Inject, Injectable, Logger, forwardRef } from '@nestjs/common';
import { findFirstSequential, forEachSequential } from '../common/async-sequence';
import { UnifiedAgentService } from '../kloel/unified-agent.service';
import { PrismaService } from '../prisma/prisma.service';
import { AgentEventsService } from '../whatsapp/agent-events.service';
import { CiaChatFilterService } from './cia-chat-filter.service';
import { CiaRuntimeStateService } from './cia-runtime-state.service';
import { CIA_SHARED_REPLY_LOCK_MS, CiaSendHelpersService } from './cia-send-helpers.service';
import { WhatsAppProviderRegistry } from '../whatsapp/providers/provider-registry';
import { WahaChatSummary } from '../whatsapp/providers/whatsapp-api.provider';
import { extractPhoneFromChatId as normalizePhoneFromChatId } from '../whatsapp/whatsapp-normalization.util';
import { WHATSAPP_MESSAGING } from '../whatsapp/whatsapp.tokens';
import type { IWhatsappMessaging } from '../whatsapp/whatsapp.interfaces';
import type { BacklogMode } from '../whatsapp/cia-remote-backlog.helpers';
import { loadRemotePendingBatchHelper } from '../whatsapp/cia-remote-backlog.helpers';

/**
 * Handles remote backlog fallback: reads pending chats directly from the
 * WhatsApp provider (WAHA/Meta Cloud), loads message history, upserts contacts,
 * and replies using the UnifiedAgent when the local DB has not yet synced.
 */
@Injectable()
export class CiaRemoteBacklogService {
  private readonly logger = new Logger(CiaRemoteBacklogService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly providerRegistry: WhatsAppProviderRegistry,
    private readonly agentEvents: AgentEventsService,
    private readonly chatFilter: CiaChatFilterService,
    private readonly runtimeState: CiaRuntimeStateService,
    private readonly sendHelpers: CiaSendHelpersService,
    @Inject(forwardRef(() => UnifiedAgentService))
    private readonly unifiedAgent: UnifiedAgentService,
    @Inject(forwardRef(() => WHATSAPP_MESSAGING))
    private readonly whatsappService: IWhatsappMessaging,
  ) {}

  async listRemotePendingChats(
    _workspaceId: string,
    sessionKey: string,
    limit: number,
  ): Promise<WahaChatSummary[]> {
    this.logger.log('Calling WhatsApp provider getChats', {
      context: 'CiaRemoteBacklogService.listRemotePendingChats',
      provider: 'waha',
    });
    const chats = this.chatFilter.normalizeChats(await this.providerRegistry.getChats(sessionKey));
    return this.chatFilter
      .selectRemotePendingChats(chats)
      .slice(0, Math.max(1, Math.min(200, Number(limit || 1) || 1)));
  }

  normalizeRemotePhone(chatId: string): string {
    return normalizePhoneFromChatId(chatId);
  }

  async loadRemotePendingBatch(params: {
    workspaceId: string;
    chat: WahaChatSummary;
    sessionKey: string;
  }): Promise<{
    contactId?: string;
    phone: string;
    contactName: string;
    aggregatedMessage: string;
    customerMessages: Array<{
      content: string;
      quotedMessageId: string;
      createdAt?: string | null;
    }>;
    historySummary: string;
    shouldMirrorReplies: boolean;
  } | null> {
    const result = await loadRemotePendingBatchHelper(
      {
        prisma: this.prisma,
        providerRegistry: this.providerRegistry,
        chatFilter: this.chatFilter,
        sendHelpers: this.sendHelpers,
      },
      params,
    );

    if (result) {
      await this.whatsappService
        .syncRemoteContactProfile(params.workspaceId, result.phone, result.contactName)
        .catch(() => undefined);
    }

    return result;
  }

  async runRemoteBacklogInlineFallback(
    workspaceId: string,
    runId: string,
    mode: BacklogMode,
    chats: WahaChatSummary[],
    sessionKey: string,
  ) {
    await this.runtimeState.updateAutonomyRunStatus(workspaceId, runId, 'RUNNING');

    await this.agentEvents.publish({
      type: 'status',
      workspaceId,
      runId,
      phase: 'backlog_remote_inline_fallback',
      persistent: true,
      message: `Banco local ainda não refletiu o backlog completo. Vou agir direto a partir do WAHA em ${chats.length} conversa(s).`,
      meta: {
        total: chats.length,
        mode,
      },
    });

    let processed = 0;
    let skipped = 0;

    await forEachSequential(Array.from(chats.entries()), async ([index, chat]) => {
      const remoteBatch = await this.loadRemotePendingBatch({
        workspaceId,
        chat,
        sessionKey,
      }).catch((error: unknown) => {
        this.logger.error(
          'Failed to load remote pending batch',
          error instanceof Error ? error.message : String(error),
          {
            context: 'CiaRemoteBacklogService.runRemoteBacklogInlineFallback',
            chatId: chat.id,
          },
        );
        return null;
      });

      if (!remoteBatch?.phone || !remoteBatch.customerMessages.length) {
        skipped += 1;
        return;
      }

      const phone = remoteBatch.phone;
      const replyLockKey = this.sendHelpers.getSharedReplyLockKey(
        workspaceId,
        remoteBatch.contactId || null,
        phone,
      );
      const replyReserved = await this.sendHelpers.redisSetNx(
        replyLockKey,
        `${runId}:${chat.id}:${index}`,
        CIA_SHARED_REPLY_LOCK_MS,
      );
      if (!replyReserved) {
        skipped += 1;
        return;
      }

      let keepReplyLock = false;
      try {
        await this.agentEvents.publish({
          type: 'thought',
          workspaceId,
          runId,
          phase: 'backlog_remote_contact',
          message: `Abrindo ${remoteBatch.contactName} (${index + 1}/${chats.length}) e usando o histórico remoto real antes de responder.`,
          meta: {
            phone,
            chatId: chat.id,
            contactId: remoteBatch.contactId || null,
            backlogIndex: index + 1,
            backlogTotal: chats.length,
            deliveryMode: remoteBatch.shouldMirrorReplies ? 'reactive' : 'proactive',
          },
        });

        this.logger.log('Calling unifiedAgent.processIncomingMessage', {
          context: 'CiaRemoteBacklogService.runRemoteBacklogInlineFallback',
          deliveryMode: remoteBatch.shouldMirrorReplies ? 'reactive' : 'proactive',
          backlogIndex: index + 1,
          backlogTotal: chats.length,
        });
        const result = await this.unifiedAgent.processIncomingMessage({
          workspaceId,
          ...(remoteBatch.contactId ? { contactId: remoteBatch.contactId } : {}),
          phone,
          message: remoteBatch.aggregatedMessage,
          channel: 'whatsapp',
          context: {
            source: 'cia_backlog_remote_inline',
            deliveryMode: remoteBatch.shouldMirrorReplies ? 'reactive' : 'proactive',
            remoteChatId: chat.id,
            remoteHistorySummary: remoteBatch.historySummary,
            leadVisibleName: remoteBatch.contactName,
            backlogIndex: index + 1,
            backlogTotal: chats.length,
            forceDirect: true,
          },
        });

        const reply = String(
          result.reply ||
            result.response ||
            this.sendHelpers.buildInlineFallbackReply(remoteBatch.aggregatedMessage),
        ).trim();

        const latestQuotedMessageId =
          remoteBatch.customerMessages[remoteBatch.customerMessages.length - 1]?.quotedMessageId ||
          '';
        const replyPlan =
          reply && remoteBatch.customerMessages.length
            ? remoteBatch.shouldMirrorReplies
              ? await this.unifiedAgent.buildQuotedReplyPlan({
                  workspaceId,
                  ...(remoteBatch.contactId ? { contactId: remoteBatch.contactId } : {}),
                  phone,
                  draftReply: reply,
                  customerMessages: remoteBatch.customerMessages,
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

        if (!replyPlan.length) {
          skipped += 1;
          return;
        }

        let sendFailed = false;
        await findFirstSequential(
          Array.from(replyPlan.entries()),
          async ([replyIndex, replyItem]) => {
            this.logger.log('Sending WhatsApp message via remote inline fallback', {
              context: 'CiaRemoteBacklogService.runRemoteBacklogInlineFallback',
              complianceMode: remoteBatch.shouldMirrorReplies ? 'reactive' : 'proactive',
              replyIndex: replyIndex + 1,
              replyTotal: replyPlan.length,
            });
            const sendResult = await this.sendHelpers.sendCiaMessageWithDailyLimit(
              workspaceId,
              phone,
              replyItem.text,
              {
                externalId: `cia-remote-inline:${runId}:${chat.id}:${replyIndex + 1}`,
                quotedMessageId: replyItem.quotedMessageId,
                complianceMode: remoteBatch.shouldMirrorReplies ? 'reactive' : 'proactive',
                forceDirect: true,
              },
              remoteBatch.contactId,
              runId,
              'remote_backlog_inline_fallback',
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
      } finally {
        if (!keepReplyLock) {
          await this.sendHelpers.releaseSharedReplyLock(replyLockKey);
        }
      }
    });

    await this.runtimeState.updateAutonomyRunStatus(workspaceId, runId, 'COMPLETED');
    await this.runtimeState.finalizeSilentLiveMode(
      workspaceId,
      'remote_inline_backlog_completed',
      runId,
    );

    const message =
      processed > 0
        ? `Fallback remoto concluído. Respondi ${processed} conversa(s) direto do WAHA enquanto o banco local ainda sincronizava.`
        : 'Fallback remoto executado, mas nenhuma conversa gerou resposta enviada.';

    await this.agentEvents.publish({
      type: 'status',
      workspaceId,
      runId,
      phase: 'backlog_remote_inline_done',
      persistent: true,
      message,
      meta: {
        processed,
        skipped,
        total: chats.length,
      },
    });

    return { processed, skipped, message };
  }
}
