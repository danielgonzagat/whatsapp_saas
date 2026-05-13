import { InjectRedis } from '@nestjs-modules/ioredis';
import { Inject, Injectable, Logger, Optional, forwardRef } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import Redis from 'ioredis';
import { INBOX_SERVICE } from '../inbox/inbox.token';
import type { IInboxService } from '../inbox/inbox.interface';
import { UnifiedAgentService } from '../kloel/unified-agent.service';
import { DecisionOutcomeService } from '../kloel/decision-outcome.service';
import { OpsAlertService } from '../observability/ops-alert.service';
import { ChannelInboundHookService } from '../omnichannel/channel-inbound-hook.service';
import { PrismaService } from '../prisma/prisma.service';
import { buildQueueDedupId, buildQueueJobId } from '../queue/job-id.util';
import { autopilotQueue, flowQueue, voiceQueue } from '../queue/queue';
import { AccountAgentService } from './account-agent.service';
import {
  InboundMessage,
  type InboundIngestMode,
  getDefaultContent,
  mapMessageType,
  normalizePhone,
} from './inbound-processor.helpers';
import { isPlaceholderContactName as isPlaceholderContactNameValue } from './whatsapp-normalization.util';
import { WHATSAPP_MESSAGING } from './whatsapp.tokens';
import type { IWhatsappMessaging } from './whatsapp.interfaces';
import { WorkerRuntimeService } from './worker-runtime.service';
import { asProviderSettings, type ProviderSettings } from './provider-settings.types';
import type { ContactCustomFields } from '../contacts/contact-custom-fields.types';
import { executeInlineAutopilot } from './inbound-processor.inline-autopilot';
import { triggerWhatsappMindPercept } from './inbound-mind-percept';

import {
  checkDuplicateExt,
  isWorkspaceSelfInboundExt,
  isAutonomousEnabledExt,
  shouldUseInlineReactiveProcessingExt,
  shouldForceLiveAutonomyFallbackExt,
} from './inbound-processor.helpers';

export type { InboundMessage } from './inbound-processor.helpers';

type InboundRawPayload = {
  pushName?: string;
  notifyName?: string;
  _data?: { pushName?: string; notifyName?: string; [key: string]: unknown };
  message?: { pushName?: string; notifyName?: string; [key: string]: unknown };
  sender?: { pushName?: string; name?: string; [key: string]: unknown };
  contact?: { pushName?: string; name?: string; [key: string]: unknown };
  [key: string]: unknown;
};

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
    @Inject(forwardRef(() => INBOX_SERVICE)) private readonly inbox: IInboxService,
    @InjectRedis() private readonly redis: Redis,
    private readonly accountAgent: AccountAgentService,
    private readonly workerRuntime: WorkerRuntimeService,
    private readonly unifiedAgent: UnifiedAgentService,
    @Inject(forwardRef(() => WHATSAPP_MESSAGING))
    private readonly whatsappService: IWhatsappMessaging,
    private readonly decisionOutcome: DecisionOutcomeService,
    @Optional() private readonly opsAlert?: OpsAlertService,
    @Optional() private readonly mindHook?: ChannelInboundHookService,
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
      if (n && !this.isPlaceholderContactName(n, phone)) {
        return n;
      }
    }
    return '';
  }

  private isWorkspaceSelfInbound(settings: ProviderSettings, from: string, phone: string): boolean {
    return isWorkspaceSelfInboundExt(settings, from, phone);
  }

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
    const settings = asProviderSettings(workspace?.providerSettings);
    if (this.isWorkspaceSelfInbound(settings, msg.from, phone)) {
      this.logger.warn(`[SELF_CONTACT] Ignorando mensagem da própria sessão: ${msg.from}`);
      return { deduped: true };
    }
    const raw = (msg.raw ?? {}) as InboundRawPayload;
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
      update: trustedSenderName ? { name: trustedSenderName } : {},
      create: { workspaceId: msg.workspaceId, phone, name: trustedSenderName || null },
      select: { id: true, customFields: true },
    });
    if (trustedSenderName) {
      const cf =
        contact.customFields &&
        typeof contact.customFields === 'object' &&
        !Array.isArray(contact.customFields)
          ? { ...(contact.customFields as ContactCustomFields) }
          : {};
      await this.prisma.contact.updateMany({
        where: { id: contact.id, workspaceId: msg.workspaceId },
        data: {
          customFields: {
            ...cf,
            remotePushName: trustedSenderName,
            remotePushNameUpdatedAt: new Date().toISOString(),
          } as Prisma.InputJsonObject,
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
        ...(msg.mediaUrl !== undefined ? { mediaUrl: msg.mediaUrl } : {}),
        ...(msg.createdAt !== undefined ? { createdAt: msg.createdAt } : {}),
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

    void this.decisionOutcome.recordEvent({
      workspaceId: msg.workspaceId,
      eventType: 'inbound.received',
      eventKey: savedMessage.id,
      correlation: {
        contactId: contact.id,
        channel: 'whatsapp',
      },
    });

    if (!isCatchup) {
      await this.deliverToFlowContext(phone, processedContent, msg.workspaceId);
    }
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
    triggerWhatsappMindPercept({
      ...(this.mindHook !== undefined ? { mindHook: this.mindHook } : {}),
      logger: this.logger,
      msg,
      contactId: contact.id,
      messageId: savedMessage.id,
      phone,
      content: processedContent,
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
          await executeInlineAutopilot(
            {
              prisma: this.prisma,
              redis: this.redis,
              unifiedAgent: this.unifiedAgent,
              whatsappService: this.whatsappService,
              ...(this.opsAlert ? { opsAlert: this.opsAlert } : {}),
              logger: this.logger,
              contactDebounceMs: this.contactDebounceMs,
              sharedReplyLockMs: this.sharedReplyLockMs,
            },
            {
              workspaceId,
              contactId,
              phone,
              messageContent,
              messageId,
              providerMessageId,
              source: 'waha_inline_reactive',
              reason: 'inline_reactive_primary',
              ...(settings !== undefined ? { settings } : {}),
            },
          );
          return;
        }
        const workerAvailable = await this.workerRuntime.isAvailable();
        if (!workerAvailable) {
          await executeInlineAutopilot(
            {
              prisma: this.prisma,
              redis: this.redis,
              unifiedAgent: this.unifiedAgent,
              whatsappService: this.whatsappService,
              ...(this.opsAlert ? { opsAlert: this.opsAlert } : {}),
              logger: this.logger,
              contactDebounceMs: this.contactDebounceMs,
              sharedReplyLockMs: this.sharedReplyLockMs,
            },
            {
              workspaceId,
              contactId,
              phone,
              messageContent,
              messageId,
              providerMessageId,
              source: 'waha_inline_fallback',
              reason: 'worker_unavailable',
              ...(settings !== undefined ? { settings } : {}),
            },
          );
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
            if (!m.includes('Job is already waiting')) {
              throw error;
            }
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
      ) {
        await flowQueue.add('run-flow', {
          workspaceId,
          flowId: hotFlowId,
          user: phone,
          initialVars: { source: 'hot_signal', lastMessage: messageContent },
        });
      }
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
  private shouldForceLiveAutonomyFallback(
    settings?: ProviderSettings,
    ingestMode?: InboundIngestMode,
  ): boolean {
    return shouldForceLiveAutonomyFallbackExt(settings, ingestMode);
  }
}
