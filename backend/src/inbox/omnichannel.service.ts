import { Injectable, Logger } from '@nestjs/common';
import { InboxService } from './inbox.service';
import { SmartRoutingService } from './smart-routing.service';

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
   * Upload de base64 para storage (placeholder - integrar com S3/R2/Supabase)
   * TODO: Implementar integração real com cloud storage
   */
  private async uploadBase64ToStorage(
    workspaceId: string,
    base64: string,
    mimeType: string,
    filename: string,
  ): Promise<string | null> {
    // Por enquanto, retorna data URL para uso local
    // Em produção, fazer upload para S3/R2/Supabase
    this.logger.log(`[OMNI] Upload attachment: ${filename} (${mimeType}) for workspace ${workspaceId}`);
    
    // TODO: Integrar com MediaService ou S3
    // const buffer = Buffer.from(base64, 'base64');
    // const url = await this.mediaService.upload(workspaceId, buffer, filename, mimeType);
    // return url;

    // Placeholder: retorna data URL (funciona para arquivos pequenos)
    if (base64.length < 1024 * 1024) { // < 1MB
      return `data:${mimeType};base64,${base64}`;
    }

    this.logger.warn(`[OMNI] Arquivo muito grande para data URL, necessário integração com storage`);
    return null;
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
   * Processa webhook do Instagram - implementação básica
   * TODO: Expandir quando integração Instagram estiver disponível
   */
  async processInstagramWebhook(workspaceId: string, payload: any) {
    this.logger.warn('[OMNI] Instagram webhook recebido: processamento ainda não totalmente implementado', { 
      workspaceId, 
      hasPayload: !!payload 
    });

    // Tentar extrair dados básicos do payload Meta
    try {
      const entry = payload?.entry?.[0];
      const messaging = entry?.messaging?.[0];
      
      if (messaging?.message?.text) {
        const normalized: NormalizedMessage = {
          workspaceId,
          channel: 'INSTAGRAM',
          externalId: messaging.sender?.id || 'unknown',
          from: messaging.sender?.id || 'unknown',
          fromName: messaging.sender?.name,
          content: messaging.message.text,
          attachments: messaging.message?.attachments,
          metadata: { raw: payload },
        };
        return this.handleIncomingMessage(normalized);
      }
    } catch (err) {
      this.logger.error('[OMNI] Erro ao processar Instagram webhook:', err);
    }

    return { status: 'partially_implemented', channel: 'instagram' };
  }

  /**
   * Processa webhook do Telegram - implementação básica
   * TODO: Expandir quando integração Telegram estiver disponível
   */
  async processTelegramWebhook(workspaceId: string, payload: any) {
    this.logger.warn('[OMNI] Telegram webhook recebido: processamento ainda não totalmente implementado', { 
      workspaceId, 
      hasPayload: !!payload 
    });

    // Tentar extrair dados básicos do payload Telegram
    try {
      const message = payload?.message;
      
      if (message?.text) {
        const normalized: NormalizedMessage = {
          workspaceId,
          channel: 'TELEGRAM',
          externalId: String(message.from?.id || 'unknown'),
          from: message.from?.username || String(message.from?.id) || 'unknown',
          fromName: [message.from?.first_name, message.from?.last_name].filter(Boolean).join(' '),
          content: message.text,
          metadata: { raw: payload, chatId: message.chat?.id },
        };
        return this.handleIncomingMessage(normalized);
      }
    } catch (err) {
      this.logger.error('[OMNI] Erro ao processar Telegram webhook:', err);
    }

    return { status: 'partially_implemented', channel: 'telegram' };
  }
}
