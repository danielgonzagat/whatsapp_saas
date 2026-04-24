import { Inject, Injectable, forwardRef } from '@nestjs/common';
import { findFirstSequential, forEachSequential } from '../common/async-sequence';
import { UnifiedAgentService } from '../kloel/unified-agent.service';
import { PrismaService } from '../prisma/prisma.service';
import { AgentEventsService } from './agent-events.service';
import { CiaChatFilterService } from './cia-chat-filter.service';
import { CiaRuntimeStateService } from './cia-runtime-state.service';
import { CIA_SHARED_REPLY_LOCK_MS, CiaSendHelpersService } from './cia-send-helpers.service';
import { WhatsAppProviderRegistry } from './providers/provider-registry';
import { WahaChatSummary } from './providers/whatsapp-api.provider';
import { extractPhoneFromChatId as normalizePhoneFromChatId } from './whatsapp-normalization.util';
import { WhatsappService } from './whatsapp.service';

type BacklogMode = 'reply_all_recent_first' | 'reply_only_new' | 'prioritize_hot';

const safeStr = (v: unknown, fb = ''): string =>
  typeof v === 'string' ? v : typeof v === 'number' || typeof v === 'boolean' ? String(v) : fb;

/**
 * Handles remote backlog fallback: reads pending chats directly from the
 * WhatsApp provider (WAHA/Meta Cloud), loads message history, upserts contacts,
 * and replies using the UnifiedAgent when the local DB has not yet synced.
 */
@Injectable()
export class CiaRemoteBacklogService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly providerRegistry: WhatsAppProviderRegistry,
    private readonly agentEvents: AgentEventsService,
    private readonly chatFilter: CiaChatFilterService,
    private readonly runtimeState: CiaRuntimeStateService,
    private readonly sendHelpers: CiaSendHelpersService,
    @Inject(forwardRef(() => UnifiedAgentService))
    private readonly unifiedAgent: UnifiedAgentService,
    @Inject(forwardRef(() => WhatsappService))
    private readonly whatsappService: WhatsappService,
  ) {}

  async listRemotePendingChats(
    workspaceId: string,
    sessionKey: string,
    limit: number,
  ): Promise<WahaChatSummary[]> {
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
    const rawMessages: unknown = await this.providerRegistry.getChatMessages(
      params.sessionKey,
      params.chat.id,
      {
        limit: 80,
        offset: 0,
        downloadMedia: false,
      },
    );

    const rawObj = rawMessages as Record<string, unknown> | unknown[] | null;
    const normalizedMessages = (
      Array.isArray(rawObj)
        ? rawObj
        : rawObj && typeof rawObj === 'object' && Array.isArray(rawObj.messages)
          ? (rawObj.messages as unknown[])
          : rawObj && typeof rawObj === 'object' && Array.isArray(rawObj.items)
            ? (rawObj.items as unknown[])
            : rawObj && typeof rawObj === 'object' && Array.isArray(rawObj.data)
              ? (rawObj.data as unknown[])
              : []
    )
      .map((message: unknown) => {
        const msg = (message && typeof message === 'object' ? message : {}) as Record<
          string,
          unknown
        >;
        const msgId = msg.id as Record<string, unknown> | string | undefined;
        const msgKey = msg.key as Record<string, unknown> | undefined;
        const msgText = msg.text as Record<string, unknown> | undefined;
        const idSerialized = typeof msgId === 'object' && msgId ? msgId._serialized : undefined;
        const idId = typeof msgId === 'object' && msgId ? msgId.id : undefined;
        const keyId = msgKey ? msgKey.id : undefined;
        return {
          externalId: safeStr(idSerialized || idId || keyId || msg.id).trim(),
          fromMe: msg.fromMe === true || (typeof msgId === 'object' && msgId?.fromMe === true),
          content: safeStr(msg.body || msgText?.body).trim(),
          createdAt: this.sendHelpers.normalizeRemoteTimestamp(
            (msg.timestamp || msg.t || msg.createdAt || null) as string | number | null,
          ),
          raw: msg,
        };
      })
      .filter((message) => message.externalId && message.content);

    if (!normalizedMessages.length) {
      return null;
    }

    let lastOutboundIndex = -1;
    normalizedMessages.forEach((message, index) => {
      if (message.fromMe) {
        lastOutboundIndex = index;
      }
    });

    const pendingMessages = normalizedMessages.filter(
      (message, index) => !message.fromMe && index > lastOutboundIndex,
    );
    const effectivePending = pendingMessages.length
      ? pendingMessages
      : normalizedMessages.filter((message) => !message.fromMe).slice(-1);

    if (!effectivePending.length) {
      return null;
    }

    const latestCustomerActivityTimestamp = Math.max(
      this.chatFilter.resolveLatestRemoteMessageTimestamp(effectivePending),
      this.chatFilter.resolveChatActivityTimestamp(params.chat),
    );
    if (!this.chatFilter.isFreshRemotePendingActivity(latestCustomerActivityTimestamp)) {
      return null;
    }

    const phone = this.normalizeRemotePhone(params.chat.id);
    if (!phone) {
      return null;
    }

    const detectedName =
      this.sendHelpers.extractRemoteSenderName(
        effectivePending[effectivePending.length - 1]?.raw,
        params.chat.name || null,
      ) || phone;

    const contact = await this.prisma.contact.upsert({
      where: {
        workspaceId_phone: {
          workspaceId: params.workspaceId,
          phone,
        },
      },
      update: {
        name: detectedName,
      },
      create: {
        workspaceId: params.workspaceId,
        phone,
        name: detectedName,
      },
      select: {
        id: true,
        name: true,
        phone: true,
      },
    });

    await this.whatsappService
      .syncRemoteContactProfile(params.workspaceId, phone, detectedName)
      .catch(() => undefined);

    const customerMessages = effectivePending.map((message) => ({
      content: message.content,
      quotedMessageId: message.externalId,
      createdAt: message.createdAt,
    }));
    const shouldMirrorReplies = this.chatFilter.isRecentRemoteBatch(customerMessages);

    return {
      contactId: contact.id,
      phone,
      contactName: contact.name || detectedName,
      aggregatedMessage:
        customerMessages.length === 1
          ? customerMessages[0].content
          : customerMessages
              .map((message, index) => `[${index + 1}] ${String(message.content || '').trim()}`)
              .join('\n'),
      customerMessages,
      historySummary: this.sendHelpers.buildRemoteHistorySummary(normalizedMessages),
      shouldMirrorReplies,
    };
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
      }).catch(() => null);

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

        const result = await this.unifiedAgent.processIncomingMessage({
          workspaceId,
          contactId: remoteBatch.contactId || undefined,
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
                  contactId: remoteBatch.contactId || undefined,
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
