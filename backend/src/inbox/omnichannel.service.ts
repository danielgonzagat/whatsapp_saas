import { Inject, Injectable, Logger, Optional, forwardRef } from '@nestjs/common';
import { forEachSequential } from '../common/async-sequence';
import { StorageService } from '../common/storage/storage.service';
import { UnifiedAgentService } from '../kloel/unified-agent.service';
import { ChannelInboundHookService } from '../omnichannel/channel-inbound-hook.service';
import { OmnichannelContactResolutionService } from '../omnichannel/contact-resolution.service';
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
    private readonly contactResolution: OmnichannelContactResolutionService,
    @Optional()
    @Inject(forwardRef(() => UnifiedAgentService))
    private readonly unifiedAgent?: UnifiedAgentService,
    @Optional()
    @Inject(forwardRef(() => ChannelInboundHookService))
    private readonly mindHook?: ChannelInboundHookService,
  ) {}

  /** Unified entry point for ALL channels — saves, triggers CIA, and (optionally) routes. */
  async handleIncomingMessage(msg: NormalizedMessage) {
    this.logger.log(`[OMNI] Incoming from ${msg.channel}: ${msg.from}`);

    const identifier = extractIdentifier(msg);
    const messageType = determineMessageType(msg);
    const processedAttachments = await this.maybeProcessAttachments(msg);
    const content = buildAttachmentContent(msg.content || '', messageType, processedAttachments);

    const resolved = await this.contactResolution.resolveFromMessage(msg).catch((err) => {
      this.logger.warn(
        `[OMNI] Contact resolution failed for ${msg.channel}:${msg.from}, falling back to phone-based lookup: ${String(err)}`,
      );
      return null;
    });

    const savedMsg = resolved
      ? await this.inbox.saveMessage({
          workspaceId: msg.workspaceId,
          contactId: resolved.id,
          content,
          direction: 'INBOUND',
          type: messageType,
          channel: msg.channel,
          mediaUrl: processedAttachments.length > 0 ? processedAttachments[0].url : undefined,
        })
      : await this.inbox.saveMessageByPhone({
          workspaceId: msg.workspaceId,
          phone: identifier,
          content,
          direction: 'INBOUND',
          type: messageType,
          channel: msg.channel,
          mediaUrl: processedAttachments.length > 0 ? processedAttachments[0].url : undefined,
        });

    void this.routing;

    this.triggerCia(msg, savedMsg, identifier);
    this.triggerMindPercept(msg, savedMsg);

    return savedMsg;
  }

  /** Fire-and-forget CIA processing after message is safely persisted. */
  private triggerCia(
    msg: NormalizedMessage,
    savedMsg: { contactId?: string; id?: string },
    identifier: string,
  ) {
    if (!this.unifiedAgent) return;

    const normalizedChannel = String(msg.channel || '')
      .trim()
      .toLowerCase();

    this.unifiedAgent
      .processIncomingMessage({
        workspaceId: msg.workspaceId,
        contactId: savedMsg.contactId,
        phone: identifier,
        message: msg.content,
        channel: normalizedChannel,
        context: {
          source: 'omnichannel',
          deliveryMode: 'reactive',
          messageId: savedMsg.id,
          providerMessageId: msg.externalId,
        },
      })
      .catch((err: unknown) => {
        const wrapped = ensureError(err);
        this.logger.error(
          `[OMNI] CIA trigger failed for channel ${msg.channel}: ${wrapped.message}`,
        );
      });
  }

  /** Fire-and-forget MIND percept event push after message is persisted. */
  private triggerMindPercept(
    msg: NormalizedMessage,
    savedMsg: { contactId?: string; id?: string },
  ) {
    if (!this.mindHook) return;

    this.mindHook.onMessageReceived(msg, savedMsg.contactId, savedMsg.id).catch((err: unknown) => {
      const wrapped = ensureError(err);
      this.logger.error(
        `[OMNI] MIND percept hook failed for channel ${msg.channel}: ${wrapped.message}`,
      );
    });
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

  /**
   * Processes a TikTok webhook payload — extracts direct messages, comments and
   * lead-gen events into the unified inbox. Returns an honest status when the
   * payload does not contain a processable message.
   *
   * TikTok's webhook API (Business Messaging / Lead Gen v2) ships different
   * shapes for different event types. We probe for known structures and
   * fall through gracefully when none match.
   *
   * @param workspaceId - Owning workspace id resolved from the TikTok connection.
   * @param payload - Raw TikTok webhook body (already signature-verified).
   * @returns The saved inbox message or a status indicator.
   */
  async processTikTokWebhook(workspaceId: string, payload: Record<string, unknown>) {
    this.logger.log('[OMNI] Processing TikTok webhook', { workspaceId });

    try {
      const extracted = this.extractTikTokMessage(payload);
      if (!extracted) {
        this.logger.log('[OMNI] TikTok webhook without processable message content');
        return { status: 'unsupported_event', channel: 'tiktok' };
      }

      const normalized: NormalizedMessage = {
        workspaceId,
        channel: 'TIKTOK',
        externalId: extracted.senderId,
        from: extracted.senderId,
        fromName: extracted.senderName,
        content: extracted.content,
        attachments: extracted.attachments,
        metadata: {
          raw: payload,
          messageId: extracted.messageId,
          eventType: extracted.eventType,
        },
      };

      return this.handleIncomingMessage(normalized);
    } catch (err: unknown) {
      const wrapped = ensureError(err);
      this.logger.error('[OMNI] Erro ao processar TikTok webhook:', wrapped.message);
      return { status: 'error', channel: 'tiktok', error: wrapped.message };
    }
  }

  /** Probe a TikTok webhook body for known message structures. */
  private extractTikTokMessage(payload: Record<string, unknown>): {
    senderId: string;
    senderName?: string;
    content: string;
    attachments?: MessageAttachment[];
    messageId?: string;
    eventType?: string;
  } | null {
    const body = payload?.body || payload;

    if (typeof body !== 'object' || body === null || Array.isArray(body)) {
      return null;
    }

    const b = body as Record<string, unknown>;

    if (b.type === 'dm' || b.event === 'dm' || b.type === 'direct_message') {
      return this.extractTikTokDm(b);
    }

    if (b.type === 'comment' || b.event === 'comment') {
      return this.extractTikTokComment(b);
    }

    if (b.type === 'lead_gen' || b.event === 'lead_gen') {
      return this.extractTikTokLeadGen(b);
    }

    if (typeof b.text === 'string' && b.text.trim()) {
      const sid = this.fieldStr(b, 'sender_id') || this.fieldStr(b, 'user_id') || 'unknown';
      const sname = this.fieldStr(b, 'sender_name');
      const eventT = this.fieldStr(b, 'type') || this.fieldStr(b, 'event') || 'message';
      return {
        senderId: sid,
        senderName: sname || undefined,
        content: b.text.trim(),
        messageId: this.fieldStr(b, 'message_id'),
        eventType: eventT,
      };
    }

    return null;
  }

  private extractTikTokDm(body: Record<string, unknown>) {
    const data = (body.data || body) as Record<string, unknown>;
    const sid =
      this.fieldStr(data, 'sender_id') ||
      this.fieldStr(data, 'user_id') ||
      this.fieldStr(data, 'from') ||
      'unknown';
    const sname = this.fieldStr(data, 'sender_name');
    return {
      senderId: sid,
      senderName: sname || undefined,
      content:
        this.fieldStr(data, 'text') ||
        this.fieldStr(data, 'content') ||
        this.fieldStr(data, 'message') ||
        '',
      messageId: this.fieldStr(data, 'message_id'),
      eventType: 'dm',
    };
  }

  private extractTikTokComment(body: Record<string, unknown>) {
    const data = (body.data || body) as Record<string, unknown>;
    const commentText =
      this.fieldStr(data, 'text') ||
      this.fieldStr(data, 'comment_text') ||
      this.fieldStr(data, 'content') ||
      '';
    const sid = this.fieldStr(data, 'user_id') || this.fieldStr(data, 'commenter_id') || 'unknown';
    const sname = this.fieldStr(data, 'user_name');
    return {
      senderId: sid,
      senderName: sname || undefined,
      content: `[Comentário TikTok] ${commentText}`,
      messageId: this.fieldStr(data, 'comment_id'),
      eventType: 'comment',
    };
  }

  private extractTikTokLeadGen(body: Record<string, unknown>) {
    const data = (body.data || body) as Record<string, unknown>;
    const fields: string[] = [];
    if (typeof data.name === 'string') fields.push(`Nome: ${data.name}`);
    if (typeof data.email === 'string') fields.push(`Email: ${data.email}`);
    if (typeof data.phone === 'string') fields.push(`Telefone: ${data.phone}`);
    const sid = this.fieldStr(data, 'lead_id') || this.fieldStr(data, 'user_id') || 'unknown';
    const sname = this.fieldStr(data, 'name');
    return {
      senderId: sid,
      senderName: sname || undefined,
      content: `[Lead TikTok] ${fields.join(' | ') || 'Novo lead'}`,
      messageId: this.fieldStr(data, 'lead_id'),
      eventType: 'lead_gen',
    };
  }

  private fieldStr(obj: Record<string, unknown>, key: string): string | null {
    const value = obj[key];
    return typeof value === 'string' ? value : null;
  }
}
