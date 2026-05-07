import { Injectable, Logger } from '@nestjs/common';
import { forEachSequential } from '../common/async-sequence';
import { StorageService } from '../common/storage/storage.service';
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

/** Omnichannel ingestion service — normalizes messages from every channel. */
@Injectable()
export class OmnichannelService {
  private readonly logger = new Logger(OmnichannelService.name);

  constructor(
    private readonly inbox: InboxService,
    private readonly routing: SmartRoutingService,
    private readonly storage: StorageService,
  ) {}

  /** Unified entry point for ALL channels — saves and (optionally) routes the message. */
  async handleIncomingMessage(msg: NormalizedMessage) {
    this.logger.log(`[OMNI] Incoming from ${msg.channel}: ${msg.from}`);

    const identifier = extractIdentifier(msg);
    const messageType = determineMessageType(msg);
    const processedAttachments = await this.maybeProcessAttachments(msg);
    const content = buildAttachmentContent(msg.content || '', messageType, processedAttachments);

    const savedMsg = await this.inbox.saveMessageByPhone({
      workspaceId: msg.workspaceId,
      phone: identifier,
      content,
      direction: 'INBOUND',
      type: messageType,
      channel: msg.channel,
      mediaUrl: processedAttachments.length > 0 ? processedAttachments[0].url : undefined,
    });

    // Smart routing hook — kept as a no-op until conversation re-routing is wired
    // through this entry point. Reading the service prevents an unused-property
    // warning while preserving the public DI surface.
    void this.routing;

    return savedMsg;
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
        fromName: extracted.senderName,
        content: extracted.content,
        attachments: extracted.attachments.length > 0 ? extracted.attachments : undefined,
        metadata: {
          raw: payload,
          messageId: extracted.messageId,
          timestamp: extracted.timestamp,
        },
      };

      return this.handleIncomingMessage(normalized);
    } catch (err: unknown) {
      const wrapped = ensureError(err);
      this.logger.error('[OMNI] Erro ao processar Instagram webhook:', wrapped.message);
      return { status: 'error', channel: 'instagram', error: wrapped.message };
    }
  }
}
