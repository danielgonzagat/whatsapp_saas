import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

/**
 * =====================================================================
 * WhatsAppApiProvider
 * 
 * Integração com chrishubert/whatsapp-api (https://github.com/chrishubert/whatsapp-api)
 * API REST wrapper para WhatsApp Web JS
 * =====================================================================
 */

export interface WhatsAppApiConfig {
  baseUrl: string;
  apiKey: string;
}

export interface SendMessagePayload {
  chatId: string;
  content: string;
  contentType?: 'string' | 'MessageMedia' | 'MessageMediaFromURL' | 'Location';
  options?: {
    media?: {
      mimetype: string;
      data: string;
      filename?: string;
    };
    caption?: string;
    quotedMessageId?: string;
    sendAudioAsVoice?: boolean;
  };
}

export interface SessionStatus {
  success: boolean;
  state: 'CONNECTED' | 'DISCONNECTED' | 'OPENING' | null;
  message: string;
}

export interface QrCodeResponse {
  success: boolean;
  qr?: string;
  message?: string;
}

@Injectable()
export class WhatsAppApiProvider {
  private readonly logger = new Logger(WhatsAppApiProvider.name);
  private readonly baseUrl: string;
  private readonly apiKey: string;
  private readonly startingSessions: Set<string> = new Set();

  constructor(private readonly configService: ConfigService) {
    // Dentro do docker-compose o serviço expõe porta interna 3000.
    // Fora do docker (host), use WHATSAPP_API_URL=http://localhost:3004.
    this.baseUrl = this.configService.get<string>('WHATSAPP_API_URL') || 'http://whatsapp-api:3000';
    this.apiKey = this.configService.get<string>('WHATSAPP_API_KEY') || 'kloel-whatsapp-api-key';
  }

  private async request<T>(
    method: 'GET' | 'POST' | 'DELETE',
    path: string,
    body?: any,
  ): Promise<T> {
    const url = `${this.baseUrl}${path}`;
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };
    if (this.apiKey) {
      headers['x-api-key'] = this.apiKey;
    }

    try {
      const res = await fetch(url, {
        method,
        headers,
        body: body ? JSON.stringify(body) : undefined,
      });

      if (!res.ok) {
        const errorData = await res.json().catch(() => ({ error: res.statusText }));
        throw new Error(errorData.error || `HTTP ${res.status}`);
      }

      return res.json();
    } catch (err: any) {
      this.logger.error(`WhatsApp API request failed: ${method} ${path} -> ${err.message}`);
      throw err;
    }
  }

  // ============================================================
  // SESSION MANAGEMENT
  // ============================================================

  /**
   * Inicia uma nova sessão WhatsApp
   */
  async startSession(sessionId: string): Promise<{ success: boolean; message: string }> {
    // Idempotência: evita múltiplos starts concorrentes
    if (this.startingSessions.has(sessionId)) {
      return { success: true, message: 'session_starting' };
    }

    // Se já conectado, não dispara novo start
    try {
      const status = await this.getSessionStatus(sessionId);
      if (status?.state === 'CONNECTED') {
        return { success: true, message: 'already_connected' };
      }
    } catch (err: any) {
      this.logger.warn(`Status check before start failed (${sessionId}): ${err?.message}`);
    }

    this.logger.log(`Starting session: ${sessionId}`);
    this.startingSessions.add(sessionId);
    try {
      return await this.request('GET', `/session/start/${sessionId}`);
    } finally {
      this.startingSessions.delete(sessionId);
    }
  }

  /**
   * Obtém status da sessão
   */
  async getSessionStatus(sessionId: string): Promise<SessionStatus> {
    return this.request('GET', `/session/status/${sessionId}`);
  }

  /**
   * Obtém QR Code da sessão
   */
  async getQrCode(sessionId: string): Promise<QrCodeResponse> {
    try {
      const headers: Record<string, string> = {};
      if (this.apiKey) {
        headers['x-api-key'] = this.apiKey;
      }

      const res = await fetch(`${this.baseUrl}/session/qr/${sessionId}/image`, {
        headers,
      });
      
      if (!res.ok) {
        return { success: false, message: 'QR not available' };
      }

      // A API retorna a imagem como PNG, precisamos converter para base64
      const buffer = await res.arrayBuffer();
      const base64 = Buffer.from(buffer).toString('base64');
      return { success: true, qr: `data:image/png;base64,${base64}` };
    } catch (err: any) {
      this.logger.warn(`Failed to get QR code: ${err.message}`);
      return { success: false, message: err.message };
    }
  }

  /**
   * Obtém QR Code como texto (para terminal)
   */
  async getQrCodeText(sessionId: string): Promise<string | null> {
    try {
      const res = await this.request<{ success: boolean; qr?: string }>('GET', `/session/qr/${sessionId}`);
      return res.qr || null;
    } catch {
      return null;
    }
  }

  /**
   * Reinicia a sessão
   */
  async restartSession(sessionId: string): Promise<{ success: boolean; message: string }> {
    return this.request('GET', `/session/restart/${sessionId}`);
  }

  /**
   * Encerra a sessão
   */
  async terminateSession(sessionId: string): Promise<{ success: boolean; message: string }> {
    return this.request('GET', `/session/terminate/${sessionId}`);
  }

  // ============================================================
  // MESSAGING
  // ============================================================

  /**
   * Envia mensagem de texto
   */
  async sendMessage(
    sessionId: string,
    to: string,
    message: string,
    options?: { quotedMessageId?: string },
  ): Promise<{ success: boolean; message?: any }> {
    const chatId = this.formatChatId(to);
    
    const payload: SendMessagePayload = {
      chatId,
      content: message,
      contentType: 'string',
      options: options?.quotedMessageId ? { quotedMessageId: options.quotedMessageId } : undefined,
    };

    return this.request('POST', `/client/sendMessage/${sessionId}`, payload);
  }

  /**
   * Envia imagem via URL
   */
  async sendImageFromUrl(
    sessionId: string,
    to: string,
    imageUrl: string,
    caption?: string,
  ): Promise<{ success: boolean; message?: any }> {
    const chatId = this.formatChatId(to);

    const payload: SendMessagePayload = {
      chatId,
      content: imageUrl,
      contentType: 'MessageMediaFromURL',
      options: caption ? { caption } : undefined,
    };

    return this.request('POST', `/client/sendMessage/${sessionId}`, payload);
  }

  /**
   * Envia documento/mídia via URL
   */
  async sendMediaFromUrl(
    sessionId: string,
    to: string,
    mediaUrl: string,
    caption?: string,
    mediaType: 'image' | 'video' | 'audio' | 'document' = 'image',
  ): Promise<{ success: boolean; message?: any }> {
    const chatId = this.formatChatId(to);

    // Mapear tipo para contentType da API REST do whatsapp-api
    const contentTypeMap: Record<string, SendMessagePayload['contentType']> = {
      image: 'MessageMediaFromURL',
      video: 'MessageMediaFromURL',
      audio: 'MessageMediaFromURL',
      document: 'MessageMediaFromURL',
    };

    const payload: SendMessagePayload = {
      chatId,
      content: mediaUrl,
      contentType: contentTypeMap[mediaType] || 'MessageMediaFromURL',
      options: {
        caption,
        sendAudioAsVoice: mediaType === 'audio',
      },
    };

    return this.request('POST', `/client/sendMessage/${sessionId}`, payload);
  }

  /**
   * Envia mídia via base64
   */
  async sendMedia(
    sessionId: string,
    to: string,
    mimetype: string,
    data: string,
    filename?: string,
    caption?: string,
  ): Promise<{ success: boolean; message?: any }> {
    const chatId = this.formatChatId(to);

    const payload: SendMessagePayload = {
      chatId,
      content: '', // Content is in options.media for MessageMedia type
      contentType: 'MessageMedia',
      options: {
        media: { mimetype, data, filename },
        caption,
      },
    };

    return this.request('POST', `/client/sendMessage/${sessionId}`, payload);
  }

  /**
   * Envia localização
   */
  async sendLocation(
    sessionId: string,
    to: string,
    latitude: number,
    longitude: number,
    description?: string,
  ): Promise<{ success: boolean; message?: any }> {
    const chatId = this.formatChatId(to);

    const payload: SendMessagePayload = {
      chatId,
      content: JSON.stringify({ latitude, longitude, description }),
      contentType: 'Location',
    };

    return this.request('POST', `/client/sendMessage/${sessionId}`, payload);
  }

  // ============================================================
  // CONTACT & CHAT MANAGEMENT
  // ============================================================

  /**
   * Obtém informações do cliente/sessão
   */
  async getClientInfo(sessionId: string): Promise<any> {
    return this.request('GET', `/client/getClassInfo/${sessionId}`);
  }

  /**
   * Obtém contatos
   */
  async getContacts(sessionId: string): Promise<any> {
    return this.request('GET', `/client/getContacts/${sessionId}`);
  }

  /**
   * Obtém chats
   */
  async getChats(sessionId: string): Promise<any> {
    return this.request('GET', `/client/getChats/${sessionId}`);
  }

  /**
   * Verifica se número está registrado no WhatsApp
   */
  async isRegisteredUser(sessionId: string, phone: string): Promise<boolean> {
    try {
      const id = this.formatChatId(phone);
      const res = await this.request<{ success: boolean; result: boolean }>(
        'POST',
        `/client/isRegisteredUser/${sessionId}`,
        { id },
      );
      return res.result;
    } catch {
      return false;
    }
  }

  /**
   * Marca chat como visto
   */
  async sendSeen(sessionId: string, chatId: string): Promise<void> {
    await this.request('POST', `/client/sendSeen/${sessionId}`, { chatId: this.formatChatId(chatId) });
  }

  /**
   * Envia indicador de "digitando..."
   */
  async sendTyping(sessionId: string, chatId: string): Promise<void> {
    await this.request('POST', `/chat/sendStateTyping/${sessionId}`, { chatId: this.formatChatId(chatId) });
  }

  // ============================================================
  // UTILITIES
  // ============================================================

  /**
   * Formata número para chatId do WhatsApp
   */
  private formatChatId(phone: string): string {
    // Remove caracteres não numéricos
    const cleaned = phone.replace(/\D/g, '');
    
    // Se já tem sufixo, retorna como está
    if (phone.includes('@c.us') || phone.includes('@g.us')) {
      return phone;
    }

    // Adiciona sufixo @c.us para contatos individuais
    return `${cleaned}@c.us`;
  }

  /**
   * Extrai número de telefone do chatId
   */
  extractPhoneFromChatId(chatId: string): string {
    return chatId.replace(/@c\.us$/, '').replace(/@g\.us$/, '');
  }

  /**
   * Health check
   */
  async ping(): Promise<boolean> {
    try {
      const res = await this.request<{ success: boolean }>('GET', '/ping');
      return res.success;
    } catch {
      return false;
    }
  }
}
