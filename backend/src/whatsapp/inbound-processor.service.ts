import { InjectRedis } from '@nestjs-modules/ioredis';
import { Inject, Injectable, Logger, Optional, forwardRef } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import Redis from 'ioredis';
import { InboxService } from '../inbox/inbox.service';
import { UnifiedAgentService } from '../kloel/unified-agent.service';
import { forEachSequential } from '../common/async-sequence';
import { toPrismaJsonValue } from '../common/prisma/prisma-json.util';
import { OpsAlertService } from '../observability/ops-alert.service';
import { PrismaService } from '../prisma/prisma.service';
import { buildQueueDedupId, buildQueueJobId } from '../queue/job-id.util';
import { autopilotQueue, flowQueue, voiceQueue } from '../queue/queue';
import { AccountAgentService } from './account-agent.service';
import { resolveConversationOwner } from './agent-conversation-state.util';
import { getDefaultContent, mapMessageType, normalizePhone } from './inbound-processor.helpers';
import { isPlaceholderContactName as isPlaceholderContactNameValue } from './whatsapp-normalization.util';
import { WhatsappService } from './whatsapp.service';
import { WorkerRuntimeService } from './worker-runtime.service';
import type { ProviderSettings } from './provider-settings.types';

import {
  checkDuplicateExt,
  isWorkspaceSelfInboundExt,
  isAutonomousEnabledExt,
  shouldUseInlineReactiveProcessingExt,
  shouldForceLiveAutonomyFallbackExt,
  shouldBypassHumanLockExt,
  shouldAutoReclaimHumanLockExt,
  buildInlineFallbackReplyExt,
  extractFallbackTopicExt,
  hasOutboundActionExt,
  buildPendingInboundBatchExt,
} from './__companions__/inbound-processor.service.companion';
import type {
  InboundMessage,
  InboundIngestMode,
} from './__companions__/inbound-processor.service.companion';
export type { InboundMessage } from './__companions__/inbound-processor.service.companion';

interface ProcessResult {
  deduped: boolean;
  messageId?: string;
  contactId?: string;
}

@Injectable()
export class InboundProcessorService {
  private readonly logger = new Logger(InboundProcessorService.name);
  private readonly contactDebounceMs = Math.max(
    500,
    Number.parseInt(process.env.AUTOPILOT_CONTACT_DEBOUNCE_MS || '2000', 10) || 2000,
  );
  private readonly sharedReplyLockMs = Math.max(
    10_000,
    Number.parseInt(process.env.AUTOPILOT_SHARED_REPLY_LOCK_MS || '45000', 10) || 45_000,
  );

  constructor(
    private readonly prisma: PrismaService,
    private readonly inbox: InboxService,
    @InjectRedis() private readonly redis: Redis,
    private readonly accountAgent: AccountAgentService,
    private readonly workerRuntime: WorkerRuntimeService,
    private readonly unifiedAgent: UnifiedAgentService,
    @Inject(forwardRef(() => WhatsappService)) private readonly whatsappService: WhatsappService,
    @Optional() private readonly opsAlert?: OpsAlertService,
  ) {}

  private isPlaceholderContactName(value: unknown, phone?: string | null): boolean {
    return isPlaceholderContactNameValue(value, phone);
  }

  private resolveTrustedContactName(phone: string, ...candidates: unknown[]): string {
    for (const c of candidates) {
      const n =
        typeof c === 'string'
          ? c.trim()
          : typeof c === 'number' || typeof c === 'boolean'
            ? String(c).trim()
            : '';
      if (n && !this.isPlaceholderContactName(n, phone)) return n;
    }
    return '';
  }

  private isWorkspaceSelfInbound(
    settings: Record<string, unknown>,
    from: string,
    phone: string,
  ): boolean {
    return isWorkspaceSelfInboundExt(settings, from, phone);
  }

  // ═══ PROCESS (thin wrapper) ═══
  async process(msg: InboundMessage): Promise<ProcessResult> {
    return this._processImpl(msg);
  }

  private async _processImpl(msg: InboundMessage): Promise<ProcessResult> {
    const startTime = Date.now();
    const exists = await this.checkDuplicate(msg.workspaceId, msg.providerMessageId);
    if (exists) {
      this.logger.debug(`[DEDUPE] Mensagem duplicada ignorada: ${msg.providerMessageId}`);
      return { deduped: true, messageId: exists };
    }
    const phone = normalizePhone(msg.from);
    const workspace = await this.prisma.workspace.findUnique({
      where: { id: msg.workspaceId },
      select: { providerSettings: true },
    });
    const settings = (workspace?.providerSettings as Record<string, unknown>) || {};
    if (this.isWorkspaceSelfInbound(settings, msg.from, phone)) {
      this.logger.warn(`[SELF_CONTACT] Ignorando mensagem da própria sessão: ${msg.from}`);
      return { deduped: true };
    }
    const raw = (msg.raw ?? {}) as Record<string, Record<string, unknown>>;
    const trustedSenderName = this.resolveTrustedContactName(
      phone,
      msg.senderName,
      raw?.pushName,
      raw?.notifyName,
      raw?._data?.pushName,
      raw?._data?.notifyName,
      raw?.message?.pushName,
      raw?.message?.notifyName,
      raw?.sender?.pushName,
      raw?.sender?.name,
      raw?.contact?.pushName,
      raw?.contact?.name,
    );
    const contact = await this.prisma.contact.upsert({
      where: { workspaceId_phone: { workspaceId: msg.workspaceId, phone } },
      update: trustedSenderName ? { name: trustedSenderName || undefined } : {},
      create: { workspaceId: msg.workspaceId, phone, name: trustedSenderName || null },
      select: { id: true, customFields: true },
    });
    if (trustedSenderName) {
      const cf =
        contact.customFields &&
        typeof contact.customFields === 'object' &&
        !Array.isArray(contact.customFields)
          ? { ...(contact.customFields as Record<string, unknown>) }
          : {};
      await this.prisma.contact.updateMany({
        where: { id: contact.id, workspaceId: msg.workspaceId },
        data: {
          customFields: {
            ...cf,
            remotePushName: trustedSenderName,
            remotePushNameUpdatedAt: new Date().toISOString(),
          },
        },
      });
      await this.whatsappService
        .syncRemoteContactProfile(msg.workspaceId, phone, trustedSenderName)
        .catch(() => undefined);
    }
    const processedContent = msg.text || getDefaultContent(msg.type);
    let savedMessage: { id: string; conversationId?: string | null };
    try {
      savedMessage = await this.inbox.saveMessageByPhone({
        workspaceId: msg.workspaceId,
        phone,
        content: processedContent,
        direction: 'INBOUND',
        externalId: msg.providerMessageId,
        type: mapMessageType(msg.type),
        mediaUrl: msg.mediaUrl,
        createdAt: msg.createdAt,
        countAsUnread: msg.ingestMode !== 'catchup',
        silent: msg.ingestMode === 'catchup',
      });
    } catch (error: unknown) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        const existing = await this.prisma.message.findFirst({
          where: { workspaceId: msg.workspaceId, externalId: msg.providerMessageId },
          select: { id: true, contactId: true },
        });
        if (existing) {
          await this.redis.set(
            `inbound:dedupe:${msg.workspaceId}:${msg.providerMessageId}`,
            existing.id,
            'EX',
            300,
          );
          return { deduped: true, messageId: existing.id, contactId: existing.contactId };
        }
      }
      throw error;
    }
    await this.redis.set(
      `inbound:dedupe:${msg.workspaceId}:${msg.providerMessageId}`,
      savedMessage.id,
      'EX',
      300,
    );
    const isCatchup = msg.ingestMode === 'catchup';
    if (!isCatchup) await this.deliverToFlowContext(phone, processedContent, msg.workspaceId);
    if (!isCatchup && msg.type === 'audio' && msg.mediaUrl) {
      await voiceQueue.add('transcribe-audio', {
        workspaceId: msg.workspaceId,
        contactId: contact.id,
        messageId: savedMessage.id,
        phone,
        mediaUrl: msg.mediaUrl,
        mime: msg.mediaMime,
      });
    }
    await this.accountAgent.detectCatalogGap({
      workspaceId: msg.workspaceId,
      contactId: contact.id,
      phone,
      conversationId: savedMessage.conversationId || null,
      messageContent: processedContent,
    });
    await this.triggerAutopilot(
      msg.workspaceId,
      contact.id,
      phone,
      processedContent,
      savedMessage.id,
      msg.providerMessageId,
      settings,
      msg.ingestMode,
    );
    const duration = Date.now() - startTime;
    this.logger.log(
      `[INBOUND${isCatchup ? ':CATCHUP' : ''}] Processado em ${duration}ms: ${phone} via ${msg.provider}`,
    );
    return { deduped: false, messageId: savedMessage.id, contactId: contact.id };
  }

  private async checkDuplicate(workspaceId: string, pMid: string): Promise<string | null> {
    return checkDuplicateExt({ prisma: this.prisma, redis: this.redis }, workspaceId, pMid);
  }

  private async deliverToFlowContext(phone: string, message: string, workspaceId: string) {
    const k = `reply:${normalizePhone(phone)}`;
    await this.redis.rpush(k, message).catch(() => {});
    await this.redis.expire(k, 60 * 60 * 24).catch(() => {});
    await flowQueue.add(
      'resume-flow',
      { user: normalizePhone(phone), message, workspaceId },
      { removeOnComplete: true },
    );
  }

  // ═══ triggerAutopilot (big, inline) ═══
  private async triggerAutopilot(
    workspaceId: string,
    contactId: string,
    phone: string,
    messageContent: string,
    messageId: string,
    providerMessageId: string,
    settings?: ProviderSettings,
    ingestMode?: InboundIngestMode,
  ) {
    try {
      const autonomousEnabled = this.isAutonomousEnabled(settings, ingestMode);
      const liveFallback =
        !autonomousEnabled && this.shouldForceLiveAutonomyFallback(settings, ingestMode);
      if (autonomousEnabled || liveFallback) {
        if (this.shouldUseInlineReactiveProcessing(settings, ingestMode)) {
          await this.triggerInlineAutopilot({
            workspaceId,
            contactId,
            phone,
            messageContent,
            messageId,
            providerMessageId,
            source: 'waha_inline_reactive',
            reason: 'inline_reactive_primary',
            settings,
          });
          return;
        }
        const workerAvailable = await this.workerRuntime.isAvailable();
        if (!workerAvailable) {
          await this.triggerInlineAutopilot({
            workspaceId,
            contactId,
            phone,
            messageContent,
            messageId,
            providerMessageId,
            source: 'waha_inline_fallback',
            reason: 'worker_unavailable',
            settings,
          });
          return;
        }
        const scanKey = `autopilot:scan-contact:${workspaceId}:${contactId}`;
        const reserved = await this.redis.set(
          scanKey,
          messageId,
          'PX',
          this.contactDebounceMs,
          'NX',
        );
        if (reserved === 'OK') {
          try {
            await autopilotQueue.add(
              'scan-contact',
              { workspaceId, contactId, phone, messageContent, messageId, providerMessageId },
              {
                jobId: buildQueueJobId('scan-contact', workspaceId, contactId, messageId),
                delay: this.contactDebounceMs,
                deduplication: {
                  id: buildQueueDedupId('scan-contact', workspaceId, contactId),
                  ttl: this.contactDebounceMs + 500,
                },
                removeOnComplete: true,
              },
            );
          } catch (error: unknown) {
            const m = String(
              (error instanceof Error ? error : new Error(String(error))).message || '',
            );
            if (!m.includes('Job is already waiting')) throw error;
          }
        }
      }
      const hotFlowId = settings?.autopilot?.hotFlowId;
      const lower = (messageContent || '').toLowerCase();
      if (
        hotFlowId &&
        [
          'preco',
          'preço',
          'price',
          'quanto',
          'pix',
          'boleto',
          'garantia',
          'comprar',
          'assinar',
        ].some((k) => lower.includes(k))
      )
        await flowQueue.add('run-flow', {
          workspaceId,
          flowId: hotFlowId,
          user: phone,
          initialVars: { source: 'hot_signal', lastMessage: messageContent },
        });
    } catch (err: unknown) {
      this.logger.warn(
        `[AUTOPILOT] Erro: ${(err instanceof Error ? err : new Error(String(err))).message}`,
      );
      void this.opsAlert?.alertOnCriticalError(err, 'InboundProcessorService.triggerAutopilot', {
        workspaceId,
        metadata: { contactId, phone },
      });
    }
  }

  private isAutonomousEnabled(
    settings?: ProviderSettings,
    ingestMode?: InboundIngestMode,
  ): boolean {
    return isAutonomousEnabledExt(settings, ingestMode);
  }
  private shouldUseInlineReactiveProcessing(
    settings?: ProviderSettings,
    ingestMode?: InboundIngestMode,
  ): boolean {
    return shouldUseInlineReactiveProcessingExt(settings, ingestMode);
  }

  // ═══ triggerInlineAutopilot (big, inline) ═══
  private async triggerInlineAutopilot(input: {
    workspaceId: string;
    contactId: string;
    phone: string;
    messageContent: string;
    messageId: string;
    providerMessageId: string;
    source: string;
    reason: 'inline_reactive_primary' | 'worker_unavailable';
    settings?: ProviderSettings;
  }) {
    const conversation = await this.prisma.conversation.findFirst({
      where: {
        workspaceId: input.workspaceId,
        OR: [{ contactId: input.contactId }, { contact: { phone: input.phone } }],
      },
      orderBy: { updatedAt: 'desc' },
      select: {
        id: true,
        mode: true,
        status: true,
        assignedAgentId: true,
        lastMessageAt: true,
        messages: {
          take: 3,
          orderBy: { createdAt: 'desc' },
          select: { direction: true, createdAt: true },
        },
      },
    });
    const owner = resolveConversationOwner(conversation);
    const bypass = this.shouldBypassHumanLock(input.settings);
    const reclaim = this.shouldAutoReclaimHumanLock(input.settings, conversation);
    if (conversation && owner !== 'AGENT' && reclaim) {
      await this.prisma.conversation.updateMany({
        where: { id: conversation.id, workspaceId: input.workspaceId },
        data: { mode: 'AI', assignedAgentId: null },
      });
      await this.recordAutopilotSkip(
        input.workspaceId,
        input.contactId,
        'human_lock_auto_reclaimed',
        {
          conversationId: conversation.id,
          previousMode: conversation.mode || null,
          previousAssignedAgentId: conversation.assignedAgentId || null,
        },
      );
    }
    if (conversation && owner !== 'AGENT' && !bypass && !reclaim) {
      await this.recordAutopilotSkip(input.workspaceId, input.contactId, 'human_mode_lock', {
        conversationId: conversation.id,
        mode: conversation.mode || null,
        status: conversation.status || null,
        assignedAgentId: conversation.assignedAgentId || null,
      });
      return;
    }
    const inlineKey = `autopilot:inline:${input.workspaceId}:${input.contactId}`;
    const reserved = await this.redis.set(
      inlineKey,
      input.messageId,
      'PX',
      Math.max(5000, this.contactDebounceMs + 3000),
      'NX',
    );
    if (reserved !== 'OK') return;
    const replyLockKey = this.getSharedReplyLockKey(
      input.workspaceId,
      input.contactId,
      input.phone,
    );
    const replyRsv = await this.redis.set(
      replyLockKey,
      input.messageId,
      'PX',
      this.sharedReplyLockMs,
      'NX',
    );
    if (replyRsv !== 'OK') return;
    let keepReplyLock = false;
    await this.sleep(this.contactDebounceMs);
    const pendingBatch = await this.buildPendingInboundBatch({
      workspaceId: input.workspaceId,
      contactId: input.contactId,
      phone: input.phone,
      fallbackMessageContent: input.messageContent,
      fallbackProviderMessageId: input.providerMessageId,
    });
    const aggMsg = pendingBatch?.aggregatedMessage || input.messageContent;
    const latestQid = pendingBatch?.latestQuotedMessageId || input.providerMessageId;
    try {
      const result = await this.unifiedAgent.processIncomingMessage({
        workspaceId: input.workspaceId,
        contactId: input.contactId,
        phone: input.phone,
        message: aggMsg,
        channel: 'whatsapp',
        context: {
          source: input.source,
          deliveryMode: 'reactive',
          messageId: input.messageId,
          providerMessageId: latestQid,
          pendingQuotedMessageIds: pendingBatch?.messages.map((m) => m.quotedMessageId),
          pendingMessageCount: pendingBatch?.messages.length || 1,
          forceDirect: true,
        },
      });
      if (this.hasOutboundAction(result?.actions || [])) {
        keepReplyLock = true;
        return;
      }
      const reply = String(
        result?.reply || result?.response || this.buildInlineFallbackReply(aggMsg),
      ).trim();
      if (!reply) return;
      const replyPlan = await this.unifiedAgent.buildQuotedReplyPlan({
        workspaceId: input.workspaceId,
        contactId: input.contactId,
        phone: input.phone,
        draftReply: reply,
        customerMessages: pendingBatch?.messages || [
          { content: input.messageContent, quotedMessageId: latestQid },
        ],
      });
      await forEachSequential(replyPlan, async (plan, index) => {
        const r = await this.whatsappService.sendMessage(
          input.workspaceId,
          input.phone,
          plan.text,
          {
            externalId: `inline:${input.messageId}:${index + 1}`,
            complianceMode: 'reactive',
            forceDirect: true,
            quotedMessageId: plan.quotedMessageId || latestQid,
          },
        );
        if (r?.error)
          this.logger.error(`[AUTOPILOT] Inline reply failed: ${r.message || 'send_failed'}`);
      });
      keepReplyLock = true;
    } catch (agentError: unknown) {
      this.logger.error(
        `[AUTOPILOT] Inline agent failed: ${(agentError instanceof Error ? agentError : new Error(String(agentError))).message}`,
      );
      void this.opsAlert?.alertOnCriticalError(
        agentError,
        'InboundProcessorService.triggerInlineAutopilot',
        {
          workspaceId: input.workspaceId,
          metadata: { contactId: input.contactId, phone: input.phone },
        },
      );

      const fallbackReply = this.buildInlineFallbackReply(aggMsg);
      if (fallbackReply) {
        try {
          const r = await this.whatsappService.sendMessage(
            input.workspaceId,
            input.phone,
            fallbackReply,
            {
              externalId: `inline:${input.messageId}:fallback`,
              complianceMode: 'reactive',
              forceDirect: true,
              quotedMessageId: latestQid,
            },
          );
          if (!r?.error) keepReplyLock = true;
        } catch (fallbackErr: unknown) {
          this.logger.error(
            `[AUTOPILOT] Fallback reply also failed: ${(fallbackErr instanceof Error ? fallbackErr : new Error(String(fallbackErr))).message}`,
          );
        }
      }
    } finally {
      if (!keepReplyLock) await this.releaseSharedReplyLock(replyLockKey);
    }
  }

  private hasOutboundAction(actions: Array<{ tool?: string; result?: unknown }> = []): boolean {
    return hasOutboundActionExt(actions);
  }

  private async buildPendingInboundBatch(params: {
    workspaceId: string;
    contactId: string;
    phone: string;
    fallbackMessageContent: string;
    fallbackProviderMessageId: string;
  }) {
    return buildPendingInboundBatchExt({ prisma: this.prisma }, params);
  }

  private shouldBypassHumanLock(settings?: ProviderSettings): boolean {
    return shouldBypassHumanLockExt(settings);
  }
  private shouldAutoReclaimHumanLock(
    settings?: ProviderSettings,
    conversation?: {
      mode?: string | null;
      status?: string | null;
      assignedAgentId?: string | null;
      messages?: Array<{ direction?: string | null; createdAt?: Date | string | null }>;
    } | null,
  ): boolean {
    return shouldAutoReclaimHumanLockExt(settings, conversation);
  }
  private shouldForceLiveAutonomyFallback(
    settings?: ProviderSettings,
    ingestMode?: InboundIngestMode,
  ): boolean {
    return shouldForceLiveAutonomyFallbackExt(settings, ingestMode);
  }
  private buildInlineFallbackReply(messageContent: string): string {
    return buildInlineFallbackReplyExt(messageContent);
  }
  private extractFallbackTopic(messageContent: string): string | null {
    return extractFallbackTopicExt(messageContent);
  }
  private getSharedReplyLockKey(
    workspaceId: string,
    contactId?: string | null,
    phone?: string | null,
  ): string {
    return `autopilot:reply:${workspaceId}:${contactId || normalizePhone(String(phone || ''))}`;
  }
  private async releaseSharedReplyLock(key: string) {
    try {
      await this.redis.del(key);
    } catch {
      /* lock cleanup is best-effort */
    }
  }
  private async sleep(ms: number) {
    await new Promise((r) => setTimeout(r, ms));
  }

  private async recordAutopilotSkip(
    workspaceId: string,
    contactId: string,
    reason: string,
    meta?: Record<string, unknown>,
  ) {
    try {
      await this.prisma.autopilotEvent.create({
        data: {
          workspaceId,
          contactId,
          intent: 'INLINE_AUTOPILOT',
          action: 'SKIP_INLINE_REPLY',
          status: 'skipped',
          reason,
          meta: toPrismaJsonValue(meta ?? {}),
        },
      });
    } catch (error: unknown) {
      this.logger.warn(
        `[AUTOPILOT] Falha ao registrar skip: ${(error instanceof Error ? error : new Error(String(error))).message}`,
      );
      void this.opsAlert?.alertOnCriticalError(
        error,
        'InboundProcessorService.recordAutopilotSkip',
        { workspaceId },
      );
    }
  }
}
