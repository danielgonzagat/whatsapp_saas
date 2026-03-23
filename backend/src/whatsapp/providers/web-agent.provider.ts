import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  QrCodeResponse,
  SessionStatus,
} from './whatsapp-api.provider';
import { WorkerBrowserRuntimeService } from '../worker-browser-runtime.service';

@Injectable()
export class WhatsAppWebAgentProvider {
  private readonly logger = new Logger(WhatsAppWebAgentProvider.name);

  constructor(
    private readonly configService: ConfigService,
    private readonly workerBrowserRuntime: WorkerBrowserRuntimeService,
  ) {}

  getResolvedSessionId(workspaceSessionId: string): string {
    return String(workspaceSessionId || '').trim();
  }

  private mapState(rawState?: string | null): SessionStatus['state'] {
    const normalized = String(rawState || '')
      .trim()
      .toUpperCase();

    switch (normalized) {
      case 'CONNECTED':
      case 'TAKEOVER':
        return 'CONNECTED';
      case 'QR_PENDING':
        return 'SCAN_QR_CODE';
      case 'BOOTING':
      case 'RECOVERING':
        return 'STARTING';
      case 'CRASHED':
        return 'FAILED';
      case 'DISCONNECTED':
      default:
        return 'DISCONNECTED';
    }
  }

  async startSession(
    sessionId: string,
  ): Promise<{ success: boolean; qrCode?: string; message?: string }> {
    const snapshot = await this.workerBrowserRuntime.startSession(sessionId);
    return {
      success: true,
      qrCode: snapshot.screenshotDataUrl || undefined,
      message: snapshot.connected ? 'already_connected' : 'qr_ready',
    };
  }

  async getSessionStatus(sessionId: string): Promise<SessionStatus> {
    const snapshot = await this.workerBrowserRuntime.getSessionStatus(sessionId);
    return {
      success: true,
      state: this.mapState(snapshot.state),
      message: snapshot.message || snapshot.state,
      phoneNumber: snapshot.phoneNumber || null,
      pushName: snapshot.pushName || null,
      selfIds: [],
    };
  }

  async getQrCode(sessionId: string): Promise<QrCodeResponse> {
    const snapshot = await this.workerBrowserRuntime.getQrCode(sessionId);
    return {
      success: true,
      qr: snapshot.screenshotDataUrl || undefined,
      message: snapshot.message || undefined,
    };
  }

  async terminateSession(
    sessionId: string,
  ): Promise<{ success: boolean; message?: string }> {
    await this.workerBrowserRuntime.disconnect(sessionId);
    return {
      success: true,
      message: 'disconnected',
    };
  }

  async logoutSession(
    sessionId: string,
  ): Promise<{ success: boolean; message?: string }> {
    await this.workerBrowserRuntime.logout(sessionId);
    return {
      success: true,
      message: 'logged_out',
    };
  }

  async sendMessage(
    sessionId: string,
    to: string,
    message: string,
    options?: { quotedMessageId?: string; chatId?: string },
  ): Promise<{ success: boolean; message?: any }> {
    const result = await this.workerBrowserRuntime.sendText({
      workspaceId: sessionId,
      to,
      message,
      quotedMessageId: options?.quotedMessageId,
      chatId: options?.chatId,
    });

    if (!result.success) {
      throw new Error(result.message || 'web_agent_send_failed');
    }

    return {
      success: true,
      message: {
        id: result.messageId,
      },
    };
  }

  async sendMediaFromUrl(
    sessionId: string,
    to: string,
    mediaUrl: string,
    caption?: string,
    mediaType?: 'image' | 'video' | 'audio' | 'document',
    options?: { quotedMessageId?: string; chatId?: string },
  ): Promise<{ success: boolean; message?: any }> {
    const result = await this.workerBrowserRuntime.sendMedia({
      workspaceId: sessionId,
      to,
      mediaUrl,
      mediaType: mediaType || 'image',
      caption,
      quotedMessageId: options?.quotedMessageId,
      chatId: options?.chatId,
    });

    if (!result.success) {
      throw new Error(result.message || 'web_agent_send_media_failed');
    }

    return {
      success: true,
      message: {
        id: result.messageId,
      },
    };
  }

  async getClientInfo(sessionId: string): Promise<any> {
    const snapshot = await this.workerBrowserRuntime.getSessionStatus(sessionId);
    return {
      phone: snapshot.phoneNumber || null,
      pushName: snapshot.pushName || null,
      state: snapshot.state,
      provider: 'whatsapp-web-agent',
    };
  }

  async getContacts(sessionId: string): Promise<any> {
    const chats = await this.workerBrowserRuntime.getChats(sessionId);
    return chats.map((chat, index) => ({
      id: chat?.id || `web-chat-${index}`,
      name: chat?.name || null,
      pushName: chat?.name || null,
      shortName: chat?.name || null,
      phone: null,
      source: 'whatsapp-web-agent',
    }));
  }

  async upsertContactProfile(
    _sessionId: string,
    _phone: string,
    _name?: string | null,
  ): Promise<boolean> {
    return false;
  }

  async getChats(sessionId: string): Promise<any> {
    return this.workerBrowserRuntime.getChats(sessionId);
  }

  async getChatMessages(
    sessionId: string,
    chatId?: string,
    options?: { limit?: number; offset?: number; downloadMedia?: boolean },
  ): Promise<any> {
    return this.workerBrowserRuntime.getChatMessages(sessionId, chatId, options);
  }

  async isRegisteredUser(_sessionId: string, phone: string): Promise<boolean> {
    return Boolean(String(phone || '').replace(/\D/g, ''));
  }

  async readChatMessages(_sessionId: string, _chatId: string): Promise<void> {}

  async sendSeen(_sessionId: string, _chatId: string): Promise<void> {}

  async setPresence(
    _sessionId: string,
    _presence: 'available' | 'offline',
    _chatId?: string,
  ): Promise<void> {}

  async sendTyping(_sessionId: string, _chatId: string): Promise<void> {}

  async stopTyping(_sessionId: string, _chatId: string): Promise<void> {}

  async ping(): Promise<boolean> {
    return this.workerBrowserRuntime.ping();
  }
}
