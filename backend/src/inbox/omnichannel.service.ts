import { Injectable, Logger } from '@nestjs/common';
import { InboxService } from './inbox.service';
import { SmartRoutingService } from './smart-routing.service';
import { StorageService } from '../common/storage/storage.service';

export interface NormalizedMessage {
  workspaceId: string;
  channel: 'WHATSAPP' | 'INSTAGRAM' | 'MESSENGER' | 'TELEGRAM' | 'EMAIL';
  externalId: string;
  from: string; // Phone or Username or Email
  fromName?: string;
  content: string;
  attachments?: MessageAttachment[];
  metadata?: any;
}

export interface MessageAttachment {
  url?: string;
  mimeType?: string;
  name?: string;
  size?: number;
  base64?: string;
}

export interface ProcessedAttachment {
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
      metadata: {
        ...(msg.metadata || {}),
        attachments: processedAttachments.length > 0 ? processedAttachments : undefined,
        fromName: msg.fromName,
      },
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
        if (attachment.url && attachment.url.startsWith('http')) {
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
      } catch (error: any) {
        this.logger.error(`[OMNI] Erro ao processar attachment: ${error.message}`);
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
      this.logger.log(`[OMNI] Upload attachment: ${filename} (${mimeType}) for workspace ${workspaceId}`);
      
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
    } catch (error: any) {
      this.logger.error(`[OMNI] Falha ao fazer upload de attachment: ${error.message}`);
      
      // Fallback: retorna data URL para arquivos pequenos
      if (base64.length < 1024 * 1024) { // < 1MB
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
    
    // Para Telegram
    if (msg.channel === 'TELEGRAM') {
      return `tg:${msg.externalId || msg.from}`;
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
    this.logger.log('[OMNI] Processing Instagram webhook', { workspaceId, hasPayload: !!payload });

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
    } catch (err: any) {
      this.logger.error('[OMNI] Erro ao processar Instagram webhook:', err.message);
      return { status: 'error', channel: 'instagram', error: err.message };
    }
  }

  /**
   * Processa webhook do Telegram - implementação completa
   * Suporta texto, fotos, vídeos, documentos, áudios, stickers, location
   */
  async processTelegramWebhook(workspaceId: string, payload: any) {
    this.logger.log('[OMNI] Processing Telegram webhook', { workspaceId, hasPayload: !!payload });

    try {
      const message = payload?.message || payload?.edited_message;
      const callbackQuery = payload?.callback_query;
      
      // Handle callback queries (botões inline)
      if (callbackQuery) {
        const callbackData = callbackQuery.data;
        const from = callbackQuery.from;
        
        const normalized: NormalizedMessage = {
          workspaceId,
          channel: 'TELEGRAM',
          externalId: String(from?.id || 'unknown'),
          from: from?.username || String(from?.id) || 'unknown',
          fromName: [from?.first_name, from?.last_name].filter(Boolean).join(' '),
          content: `[Botão clicado: ${callbackData}]`,
          metadata: { 
            raw: payload, 
            chatId: callbackQuery.message?.chat?.id,
            isCallback: true,
            callbackData,
          },
        };
        return this.handleIncomingMessage(normalized);
      }
      
      if (!message) {
        this.logger.warn('[OMNI] Telegram webhook sem mensagem válida');
        return { status: 'no_message', channel: 'telegram' };
      }

      const from = message.from;
      const chatId = message.chat?.id;
      const attachments: MessageAttachment[] = [];
      let content = '';
      
      // 1. Mensagem de texto
      if (message.text) {
        content = message.text;
      }
      
      // 2. Caption de mídia
      if (message.caption) {
        content = message.caption;
      }
      
      // 3. Fotos (pegar a maior resolução)
      if (message.photo && Array.isArray(message.photo)) {
        const largestPhoto = message.photo[message.photo.length - 1];
        attachments.push({
          url: `telegram://file/${largestPhoto.file_id}`,
          mimeType: 'image/jpeg',
          name: `photo_${largestPhoto.file_id}`,
          size: largestPhoto.file_size,
        });
        if (!content) content = '[Foto]';
      }
      
      // 4. Vídeos
      if (message.video) {
        attachments.push({
          url: `telegram://file/${message.video.file_id}`,
          mimeType: message.video.mime_type || 'video/mp4',
          name: message.video.file_name || `video_${message.video.file_id}`,
          size: message.video.file_size,
        });
        if (!content) content = '[Vídeo]';
      }
      
      // 5. Documentos
      if (message.document) {
        attachments.push({
          url: `telegram://file/${message.document.file_id}`,
          mimeType: message.document.mime_type || 'application/octet-stream',
          name: message.document.file_name || `doc_${message.document.file_id}`,
          size: message.document.file_size,
        });
        if (!content) content = `[Documento: ${message.document.file_name || 'arquivo'}]`;
      }
      
      // 6. Áudio/Voz
      if (message.audio || message.voice) {
        const audio = message.audio || message.voice;
        attachments.push({
          url: `telegram://file/${audio.file_id}`,
          mimeType: audio.mime_type || 'audio/ogg',
          name: audio.file_name || `audio_${audio.file_id}`,
          size: audio.file_size,
        });
        if (!content) content = message.voice ? '[Mensagem de voz]' : '[Áudio]';
      }
      
      // 7. Stickers
      if (message.sticker) {
        attachments.push({
          url: `telegram://file/${message.sticker.file_id}`,
          mimeType: message.sticker.is_animated ? 'application/x-tgsticker' : 'image/webp',
          name: message.sticker.emoji || 'sticker',
        });
        content = `[Sticker: ${message.sticker.emoji || '🎭'}]`;
      }
      
      // 8. Localização
      if (message.location) {
        content = `[Localização: ${message.location.latitude}, ${message.location.longitude}]`;
      }
      
      // 9. Contato compartilhado
      if (message.contact) {
        content = `[Contato: ${message.contact.first_name} - ${message.contact.phone_number}]`;
      }
      
      // 10. Comando de bot
      if (message.text?.startsWith('/')) {
        const command = message.text.split(' ')[0];
        content = message.text;
        // Pode adicionar lógica específica para comandos aqui
      }

      // Se não tem conteúdo, ignorar
      if (!content && attachments.length === 0) {
        return { status: 'empty_message', channel: 'telegram' };
      }

      const normalized: NormalizedMessage = {
        workspaceId,
        channel: 'TELEGRAM',
        externalId: String(from?.id || 'unknown'),
        from: from?.username || String(from?.id) || 'unknown',
        fromName: [from?.first_name, from?.last_name].filter(Boolean).join(' '),
        content,
        attachments: attachments.length > 0 ? attachments : undefined,
        metadata: { 
          raw: payload, 
          chatId,
          messageId: message.message_id,
          date: message.date,
        },
      };
      
      return this.handleIncomingMessage(normalized);
    } catch (err: any) {
      this.logger.error('[OMNI] Erro ao processar Telegram webhook:', err.message);
      return { status: 'error', channel: 'telegram', error: err.message };
    }
  }
}
