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
  attachments?: any[];
  metadata?: any;
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

    // 1. Save to Inbox (creates Contact/Conversation if needed)
    const savedMsg = await this.inbox.saveMessageByPhone({
      workspaceId: msg.workspaceId,
      phone: identifier,
      content: msg.content,
      direction: 'INBOUND',
      type: messageType,
      channel: msg.channel,
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

  processInstagramWebhook(workspaceId: string, payload: any) {
    void workspaceId;
    void payload;
    // Extract data from Meta payload
    // const entry = payload.entry[0];
    // const messaging = entry.messaging[0];
    // const senderId = messaging.sender.id;
    // const text = messaging.message.text;
    // const normalized: NormalizedMessage = {
    //   workspaceId,
    //   channel: 'INSTAGRAM',
    //   externalId: '...',
    //   from: 'senderId', // Map to real username if possible
    //   content: 'text',
    // };
    // return this.handleIncomingMessage(normalized);
  }

  processTelegramWebhook(workspaceId: string, payload: any) {
    void workspaceId;
    void payload;
    // ...
  }
}
