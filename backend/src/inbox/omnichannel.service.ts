import { Injectable, Logger, Optional, Inject } from '@nestjs/common';
import { ModuleRef } from '@nestjs/core';
import { forEachSequential } from '../common/async-sequence';
import { StorageService } from '../common/storage/storage.service';
import { UNIFIED_AGENT_TOKEN } from '../kloel/tokens';
import { DecisionOutcomeService } from '../kloel/decision-outcome.service';
import { InboxService } from './inbox.service';
import {
  buildAttachmentContent,
  buildProcessedAttachment,
  determineMessageType,
  ensureError,
  extractIdentifier,
  extractInstagramMessage,
  firstInstagramMessaging,
  type MessageAttachment,
  type NormalizedMessage,
  type ProcessedAttachment,
} from './omnichannel.helpers';
import { SmartRoutingService } from './smart-routing.service';

export type { MessageAttachment, NormalizedMessage, ProcessedAttachment };

type UnifiedAgentPort = {
  processIncomingMessage(input: {
    workspaceId: string;
    phone: string;
    message: string;
    contactId: string;
    channel: string;
    executeTools?: boolean;
    context?: { deliveryMode?: string; externalId?: string; fromName?: string; metadata?: Record<string, unknown> };
  }): Promise<void>;
};

/** Omnichannel ingestion service — normalizes messages from every channel. */
@Injectable()
export class OmnichannelService {
  private readonly logger = new Logger(OmnichannelService.name);

  constructor(
    private readonly inbox: InboxService,
    private readonly routing: SmartRoutingService,
    private readonly storage: StorageService,
    private readonly decisionOutcome: DecisionOutcomeService,
    private readonly moduleRef: ModuleRef,
    @Optional() @Inject(UNIFIED_AGENT_TOKEN) private readonly _unifiedAgent?: UnifiedAgentPort,
  ) {}

  /** Unified entry point for ALL channels — saves, triggers CIA, and (optionally) routes. */
  async handleIncomingMessage(msg: NormalizedMessage) {
    this.logger.log(`[OMNI] Incoming from ${msg.channel}: ${msg.from}`);

    const identifier = extractIdentifier(msg);
    const messageType = determineMessageType(msg);
    const processedAttachments = await this.maybeProcessAttachments(msg);
    const content = buildAttachmentContent(msg.content || '', messageType, processedAttachments);

    const mediaUrlVal = processedAttachments.length > 0 ? processedAttachments[0]?.url : undefined;
    const savedMsg = await this.inbox.saveMessageByPhone({
      workspaceId: msg.workspaceId,
      phone: identifier,
      content,
      direction: 'INBOUND',
      type: messageType,
      channel: msg.channel,
      ...(mediaUrlVal !== undefined ? { mediaUrl: mediaUrlVal } : {}),
    });

    void this.routing;

    void this.decisionOutcome.recordEvent({
      workspaceId: msg.workspaceId,
      eventType: 'inbound.received',
      eventKey: savedMsg.id,
      correlation: {
        contactId: savedMsg.contactId ?? identifier,
        channel: msg.channel.toLowerCase(),
      },
    });

    await this.maybeDispatchToUnifiedAgent(msg, identifier, content, savedMsg.contactId);

    return savedMsg;
  }

  private resolveUnifiedAgent(): UnifiedAgentPort | null {
    return this._unifiedAgent ?? null;
  }

  private async maybeDispatchToUnifiedAgent(
    msg: NormalizedMessage,
    identifier: string,
    content: string,
    contactId: string,
  ): Promise<void> {
    const unifiedAgent = this.resolveUnifiedAgent();
    if (!unifiedAgent) {
      return;
    }
    try {
      await unifiedAgent.processIncomingMessage({
        workspaceId: msg.workspaceId,
        phone: identifier,
        message: content,
        contactId,
        channel: msg.channel.toLowerCase(),
        executeTools: msg.channel === 'WHATSAPP',
        context: {
          deliveryMode: 'reactive',
          externalId: msg.externalId,
          fromName: msg.fromName || msg.from,
          metadata: msg.metadata || {},
        },
      });
    } catch (error: unknown) {
      const wrapped = ensureError(error);
      this.logger.warn(`[OMNI] Unified agent dispatch failed: ${wrapped.message}`);
    }
  }

  private async maybeProcessAttachments(msg: NormalizedMessage): Promise<ProcessedAttachment[]> {
    if (!msg.attachments || msg.attachments.length === 0) {
      return [];
    }
    return this.processAttachments(msg.workspaceId, msg.attachments);
  }

  private async processBase64Attachment(
    workspaceId: string,
    attachment: MessageAttachment,
  ): Promise<ProcessedAttachment | null> {
    if (!attachment.base64) {
      return null;
    }
    const uploadedUrl = await this.uploadBase64ToStorage(
      workspaceId,
      attachment.base64,
      attachment.mimeType || 'application/octet-stream',
      attachment.name || `file_${Date.now()}`,
    );
    if (!uploadedUrl) {
      return null;
    }
    return buildProcessedAttachment(uploadedUrl, attachment);
  }

  private async processSingleAttachment(
    workspaceId: string,
    attachment: MessageAttachment,
  ): Promise<ProcessedAttachment | null> {
    const directUrl = attachment.url;
    if (directUrl && directUrl.startsWith('http')) {
      return buildProcessedAttachment(directUrl, attachment);
    }
    return this.processBase64Attachment(workspaceId, attachment);
  }

  private logAttachmentError(error: unknown): void {
    const wrapped = ensureError(error);
    this.logger.error(`[OMNI] Erro ao processar attachment: ${wrapped.message}`);
  }

  private async processAttachments(
    workspaceId: string,
    attachments: MessageAttachment[],
  ): Promise<ProcessedAttachment[]> {
    const processed: ProcessedAttachment[] = [];
    await forEachSequential(attachments, async (attachment) => {
      try {
        const result = await this.processSingleAttachment(workspaceId, attachment);
        if (result) {
          processed.push(result);
        }
      } catch (error: unknown) {
        this.logAttachmentError(error);
      }
    });
    return processed;
  }

  /** Upload a base64-encoded buffer to storage (local, S3 or R2). */
  private async uploadBase64ToStorage(
    workspaceId: string,
    base64: string,
    mimeType: string,
    filename: string,
  ): Promise<string | null> {
    try {
      this.logger.log(
        `[OMNI] Upload attachment: ${filename} (${mimeType}) for workspace ${workspaceId}`,
      );
      const buffer = Buffer.from(base64, 'base64');
      const result = await this.storage.upload(buffer, {
        filename,
        mimeType,
        folder: `attachments/${workspaceId}`,
        workspaceId,
      });
      this.logger.log(`[OMNI] Attachment uploaded: ${result.url}`);
      return result.url;
    } catch (error: unknown) {
      return this.fallbackBase64Upload(error, base64, mimeType);
    }
  }

  private fallbackBase64Upload(error: unknown, base64: string, mimeType: string): string | null {
    const wrapped = ensureError(error);
    this.logger.error(`[OMNI] Falha ao fazer upload de attachment: ${wrapped.message}`);
    if (base64.length < 1024 * 1024) {
      return `data:${mimeType};base64,${base64}`;
    }
    return null;
  }

  // --- ADAPTERS ---

  /**
   * Processes an Instagram webhook payload — text, attachments, story replies and reactions.
   *
   * @param workspaceId - Owning workspace id.
   * @param payload - Raw Instagram webhook body.
   * @returns The saved inbox message or a status indicator when no message was extracted.
   */
  async processInstagramWebhook(workspaceId: string, payload: Record<string, unknown>) {
    this.logger.log('[OMNI] Processing Instagram webhook', {
      workspaceId,
      hasPayload: !!payload,
    });

    try {
      const messaging = firstInstagramMessaging(payload);
      if (!messaging) {
        this.logger.warn('[OMNI] Instagram webhook sem mensagem válida');
        return { status: 'no_message', channel: 'instagram' };
      }

      const extracted = extractInstagramMessage(messaging);
      if (!extracted.content && extracted.attachments.length === 0) {
        return { status: 'empty_message', channel: 'instagram' };
      }

      const normalized: NormalizedMessage = {
        workspaceId,
        channel: 'INSTAGRAM',
        externalId: extracted.senderId,
        from: extracted.senderId,
        ...(extracted.senderName !== undefined ? { fromName: extracted.senderName } : {}),
        content: extracted.content,
        ...(extracted.attachments.length > 0 ? { attachments: extracted.attachments } : {}),
        metadata: {
          raw: payload,
          ...(extracted.messageId !== undefined ? { messageId: extracted.messageId } : {}),
          ...(extracted.timestamp !== undefined ? { timestamp: extracted.timestamp } : {}),
        },
      };

      return this.handleIncomingMessage(normalized);
    } catch (err: unknown) {
      const wrapped = ensureError(err);
      this.logger.error('[OMNI] Erro ao processar Instagram webhook:', wrapped.message);
      return { status: 'error', channel: 'instagram', error: wrapped.message };
    }
  }

  async processTikTokWebhook(payload: Record<string, unknown>) {
    const nested = this.readRecord(payload.data) || this.readRecord(payload.message) || payload;
    const workspaceId =
      this.readText(payload.workspaceId) ||
      this.readText(payload.workspace_id) ||
      this.readText(nested.workspaceId) ||
      this.readText(nested.workspace_id);
    if (!workspaceId) {
      return { status: 'no_workspace', channel: 'tiktok' };
    }

    const externalId =
      this.readText(nested.open_id) ||
      this.readText(nested.openId) ||
      this.readText(nested.user_id) ||
      this.readText(nested.userId) ||
      this.readText(nested.sender_id) ||
      this.readText(nested.from);
    if (!externalId) {
      return { status: 'no_sender', channel: 'tiktok' };
    }

    const content =
      this.readText(nested.text) ||
      this.readText(nested.content) ||
      this.readText(nested.comment_text) ||
      this.readText(nested.message_text);
    if (!content) {
      return { status: 'empty_message', channel: 'tiktok' };
    }

    return this.handleIncomingMessage({
      workspaceId,
      channel: 'TIKTOK',
      externalId,
      from: externalId,
      content,
      metadata: { raw: payload },
    });
  }

  private readRecord(value: unknown): Record<string, unknown> | null {
    return value && typeof value === 'object' && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : null;
  }

  private readText(value: unknown): string {
    return typeof value === 'string' && value.trim() ? value.trim() : '';
  }
}
