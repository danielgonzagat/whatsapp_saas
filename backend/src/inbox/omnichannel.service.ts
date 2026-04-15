import { Injectable, Logger } from '@nestjs/common';
import { StorageService } from '../common/storage/storage.service';
import { InboxService } from './inbox.service';
import { SmartRoutingService } from './smart-routing.service';

interface NormalizedMessage {
  workspaceId: string;
  channel: 'WHATSAPP' | 'INSTAGRAM' | 'MESSENGER' | 'EMAIL';
  externalId: string;
  from: string; // Phone or Username or Email
  fromName?: string;
  content: string;
  attachments?: MessageAttachment[];
  metadata?: any;
}

interface MessageAttachment {
  url?: string;
  mimeType?: string;
  name?: string;
  size?: number;
  base64?: string;
}

interface ProcessedAttachment {
  url: string;
  mimeType: string;
  name: string;
  size?: number;
}

@Injectable()
export class OmnichannelService {
  private readonly logger = new Logger(OmnichannelService.name);

  constructor(
    private readonly inbox: InboxService,
    private readonly routing: SmartRoutingService,
    private readonly storage: StorageService,
  ) {}

  /**
   * Unified entry point for ALL channels
   */
  async handleIncomingMessage(msg: NormalizedMessage) {
    this.logger.log(`[OMNI] Incoming from ${msg.channel}: ${msg.from}`);

    // Determinar identificador - para canais sem telefone usar o externalId
    const identifier = this.extractIdentifier(msg);

    // Determinar tipo de mensagem baseado em attachments
    const messageType = this.determineMessageType(msg);

    // Processar attachments se existirem
    let processedAttachments: ProcessedAttachment[] = [];
    if (msg.attachments && msg.attachments.length > 0) {
      processedAttachments = await this.processAttachments(msg.workspaceId, msg.attachments);
    }

    // Construir conteúdo da mensagem
    let content = msg.content || '';
    if (processedAttachments.length > 0 && !content) {
      content = `[${messageType}] ${processedAttachments[0].name || 'arquivo'}`;
    }

    // 1. Save to Inbox (creates Contact/Conversation if needed)
    const savedMsg = await this.inbox.saveMessageByPhone({
      workspaceId: msg.workspaceId,
      phone: identifier,
      content,
      direction: 'INBOUND',
      type: messageType,
      channel: msg.channel,
      mediaUrl: processedAttachments.length > 0 ? processedAttachments[0].url : undefined,
    });

    // 2. Trigger Smart Routing if it's a new conversation or re-opened
    if (savedMsg.conversationId) {
      // We can check if conversation is unassigned
      // await this.routing.routeConversation(msg.workspaceId, savedMsg.conversationId, {
      //   channel: msg.channel,
      //   messageBody: msg.content
      // });
    }

    return savedMsg;
  }

  /**
   * Processa e armazena attachments
   * Retorna URLs públicas ou metadados para acesso posterior
   */
  private async processAttachments(
    workspaceId: string,
    attachments: MessageAttachment[],
  ): Promise<ProcessedAttachment[]> {
    const processed: ProcessedAttachment[] = [];

    for (const attachment of attachments) {
      try {
        // Se já tem URL pública, usar diretamente
        if (attachment.url?.startsWith('http')) {
          processed.push({
            url: attachment.url,
            mimeType: attachment.mimeType || 'application/octet-stream',
            name: attachment.name || 'attachment',
            size: attachment.size,
          });
          continue;
        }

        // Se tiver base64, fazer upload para storage
        if (attachment.base64) {
          const uploadedUrl = await this.uploadBase64ToStorage(
            workspaceId,
            attachment.base64,
            attachment.mimeType || 'application/octet-stream',
            attachment.name || `file_${Date.now()}`,
          );

          if (uploadedUrl) {
            processed.push({
              url: uploadedUrl,
              mimeType: attachment.mimeType || 'application/octet-stream',
              name: attachment.name || 'attachment',
              size: attachment.size,
            });
          }
        }
      } catch (error: unknown) {
        const errorInstanceofError =
          error instanceof Error
            ? error
            : new Error(typeof error === 'string' ? error : 'unknown error');
        this.logger.error(`[OMNI] Erro ao processar attachment: ${errorInstanceofError.message}`);
      }
    }

    return processed;
  }

  /**
   * Upload de base64 para storage (usa StorageService - local, S3 ou R2)
   */
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

      // Usar StorageService para upload (local, S3 ou R2 conforme configuração)
      const result = await this.storage.upload(buffer, {
        filename,
        mimeType,
        folder: `attachments/${workspaceId}`,
        workspaceId,
      });

      this.logger.log(`[OMNI] Attachment uploaded: ${result.url}`);
      return result.url;
    } catch (error: unknown) {
      const errorInstanceofError =
        error instanceof Error
          ? error
          : new Error(typeof error === 'string' ? error : 'unknown error');
      this.logger.error(
        `[OMNI] Falha ao fazer upload de attachment: ${errorInstanceofError.message}`,
      );

      // Fallback: retorna data URL para arquivos pequenos
      if (base64.length < 1024 * 1024) {
        // < 1MB
        return `data:${mimeType};base64,${base64}`;
      }

      return null;
    }
  }

  /**
   * Extrai identificador do remetente baseado no canal
   */
  private extractIdentifier(msg: NormalizedMessage): string {
    // Para WhatsApp, usar telefone diretamente
    if (msg.channel === 'WHATSAPP') {
      return msg.from;
    }

    // Para Instagram, usar externalId como identificador
    if (msg.channel === 'INSTAGRAM') {
      return `ig:${msg.externalId || msg.from}`;
    }

    // Para Messenger (Facebook)
    if (msg.channel === 'MESSENGER') {
      return `fb:${msg.externalId || msg.from}`;
    }

    // Para Email, usar o email como identificador
    if (msg.channel === 'EMAIL') {
      return msg.from;
    }

    // Fallback
    return msg.from || msg.externalId || 'unknown';
  }

  /**
   * Determina tipo de mensagem baseado em attachments
   */
  private determineMessageType(msg: NormalizedMessage): string {
    if (!msg.attachments || msg.attachments.length === 0) {
      return 'TEXT';
    }

    const firstAttachment = msg.attachments[0];
    const mimeType = firstAttachment.mimeType?.toLowerCase() || '';

    if (mimeType.startsWith('image/')) return 'IMAGE';
    if (mimeType.startsWith('video/')) return 'VIDEO';
    if (mimeType.startsWith('audio/')) return 'AUDIO';
    if (mimeType.includes('pdf') || mimeType.includes('document')) return 'DOCUMENT';

    return 'TEXT';
  }

  // --- ADAPTERS ---

  /**
   * Processa webhook do Instagram - implementação completa
   * Suporta texto, imagens, vídeos, stories replies e reactions
   */
  async processInstagramWebhook(workspaceId: string, payload: any) {
    this.logger.log('[OMNI] Processing Instagram webhook', {
      workspaceId,
      hasPayload: !!payload,
    });

    try {
      const entry = payload?.entry?.[0];
      const messaging = entry?.messaging?.[0];

      if (!messaging) {
        this.logger.warn('[OMNI] Instagram webhook sem mensagem válida');
        return { status: 'no_message', channel: 'instagram' };
      }

      // Extrair informações do remetente
      const senderId = messaging.sender?.id || 'unknown';
      const senderName = messaging.sender?.name;

      // Processar diferentes tipos de mensagens
      const attachments: MessageAttachment[] = [];
      let content = '';

      // 1. Mensagem de texto
      if (messaging.message?.text) {
        content = messaging.message.text;
      }

      // 2. Attachments (imagens, vídeos, áudios)
      if (messaging.message?.attachments && Array.isArray(messaging.message.attachments)) {
        for (const att of messaging.message.attachments) {
          const attType = att.type; // image, video, audio, file
          const url = att.payload?.url;

          if (url) {
            let mimeType = 'application/octet-stream';
            if (attType === 'image') mimeType = 'image/jpeg';
            else if (attType === 'video') mimeType = 'video/mp4';
            else if (attType === 'audio') mimeType = 'audio/mp4';

            attachments.push({
              url,
              mimeType,
              name: `instagram_${attType}_${Date.now()}`,
            });
          }
        }
      }

      // 3. Story reply
      if (messaging.message?.reply_to?.story) {
        const storyUrl = messaging.message.reply_to.story.url;
        content = `[Resposta ao Story] ${content}`;
        if (storyUrl) {
          attachments.push({
            url: storyUrl,
            mimeType: 'image/jpeg',
            name: 'story_reply',
          });
        }
      }

      // 4. Reactions
      if (messaging.reaction) {
        content = `[Reação: ${messaging.reaction.reaction}]`;
      }

      // 5. Story mentions
      if (messaging.message?.story_mention) {
        content = `[Mencionou você em um Story]`;
      }

      // Se não tem conteúdo nem attachments, ignorar
      if (!content && attachments.length === 0) {
        return { status: 'empty_message', channel: 'instagram' };
      }

      const normalized: NormalizedMessage = {
        workspaceId,
        channel: 'INSTAGRAM',
        externalId: senderId,
        from: senderId,
        fromName: senderName,
        content,
        attachments: attachments.length > 0 ? attachments : undefined,
        metadata: {
          raw: payload,
          messageId: messaging.message?.mid,
          timestamp: messaging.timestamp,
        },
      };

      return this.handleIncomingMessage(normalized);
    } catch (err: unknown) {
      const errInstanceofError =
        err instanceof Error ? err : new Error(typeof err === 'string' ? err : 'unknown error');
      this.logger.error('[OMNI] Erro ao processar Instagram webhook:', errInstanceofError.message);
      return { status: 'error', channel: 'instagram', error: errInstanceofError.message };
    }
  }
}
