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

    // 1. Save to Inbox (creates Contact/Conversation if needed)
    const savedMsg = await this.inbox.saveMessageByPhone({
      workspaceId: msg.workspaceId,
      phone: msg.from, // TODO: Handle non-phone identifiers for Email/Insta
      content: msg.content,
      direction: 'INBOUND',
      type: 'TEXT', // TODO: Map from attachments
      channel: msg.channel, // Need to update InboxService to accept channel
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
