import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

/**
 * =====================================================================
 * WhatsAppApiProvider — WAHA (WhatsApp HTTP API)
 *
 * Documentação: https://waha.devlike.pro/docs/overview/introduction/
 * Endpoints base: /api/sessions, /api/sendText, /api/sendImage, etc.
 * Autenticação: header X-Api-Key
 * =====================================================================
 */

export interface SessionStatus {
  success: boolean;
  state:
    | 'CONNECTED'
    | 'DISCONNECTED'
    | 'OPENING'
    | 'SCAN_QR_CODE'
    | 'STARTING'
    | 'FAILED'
    | null;
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
  private readonly sessionIdOverride: string;
  private readonly useWorkspaceSessions: boolean;
  private readonly startingSessions: Set<string> = new Set();

  constructor(private readonly configService: ConfigService) {
    this.baseUrl = (
      this.configService.get<string>('WAHA_API_URL') ||
      this.configService.get<string>('WAHA_BASE_URL') ||
      this.configService.get<string>('WAHA_URL') ||
      'https://waha-plus-production-1172.up.railway.app'
    ).replace(/\/+$/, '');

    this.apiKey =
      this.configService.get<string>('WAHA_API_KEY') ||
      this.configService.get<string>('WAHA_API_TOKEN') ||
      '';

    this.sessionIdOverride = (
      this.configService.get<string>('WAHA_SESSION_ID') || ''
    ).trim();
    const explicitWorkspaceMode =
      this.configService.get<string>('WAHA_MULTISESSION') === 'true' ||
      this.configService.get<string>('WAHA_USE_WORKSPACE_SESSION') === 'true';
    const explicitSingleSessionMode =
      this.configService.get<string>('WAHA_SINGLE_SESSION') === 'true' ||
      this.configService.get<string>('WAHA_MULTISESSION') === 'false' ||
      this.configService.get<string>('WAHA_USE_WORKSPACE_SESSION') === 'false';

    this.useWorkspaceSessions =
      !this.sessionIdOverride &&
      (explicitWorkspaceMode || !explicitSingleSessionMode);

    this.logger.log(
      `WAHA provider initialized. Base URL: ${this.baseUrl}. Session mode: ${
        this.sessionIdOverride
          ? `override(${this.sessionIdOverride})`
          : this.useWorkspaceSessions
            ? 'workspace'
            : 'default'
      }`,
    );
  }

  private resolveSessionName(workspaceSessionId: string): string {
    if (this.sessionIdOverride) {
      return this.sessionIdOverride;
    }

    if (this.useWorkspaceSessions) {
      return workspaceSessionId;
    }

    return 'default';
  }

  // ─── HTTP helper ──────────────────────────────────────────
  private async request<T>(
    method: 'GET' | 'POST' | 'PUT' | 'DELETE',
    path: string,
    body?: any,
  ): Promise<T> {
    const url = `${this.baseUrl}${path}`;
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      Accept: 'application/json',
    };
    if (this.apiKey) {
      headers['X-Api-Key'] = this.apiKey;
    }

    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 15_000);

      const res = await fetch(url, {
        method,
        headers,
        body: body ? JSON.stringify(body) : undefined,
        signal: controller.signal,
      });

      clearTimeout(timeout);

      // Some WAHA endpoints return 404 when session doesn't exist yet
      if (!res.ok) {
        const text = await res.text().catch(() => '');
        let parsed: any;
        try {
          parsed = JSON.parse(text);
        } catch {
          parsed = { message: text };
        }
        throw new Error(
          parsed?.message || parsed?.error || `HTTP ${res.status}`,
        );
      }

      const text = await res.text();
      if (!text) return {} as T;
      return JSON.parse(text);
    } catch (err: any) {
      let diagnosis = err.message;
      if (err.name === 'AbortError') {
        diagnosis = `TIMEOUT after 15s connecting to ${this.baseUrl}`;
      } else if (err.cause?.code === 'ECONNREFUSED') {
        diagnosis = `ECONNREFUSED — WAHA at ${this.baseUrl} is not reachable.`;
      }
      this.logger.error(
        `WAHA request failed: ${method} ${path} -> ${diagnosis}`,
      );
      throw new Error(diagnosis);
    }
  }

  // ─── SESSION MANAGEMENT ───────────────────────────────────

  async startSession(
    sessionId: string,
  ): Promise<{ success: boolean; message: string }> {
    const resolvedSessionId = this.resolveSessionName(sessionId);

    if (this.startingSessions.has(resolvedSessionId)) {
      return { success: true, message: 'session_starting' };
    }

    // Check if already connected
    try {
      const status = await this.getSessionStatus(sessionId);
      if (status?.state === 'CONNECTED') {
        return { success: true, message: 'already_connected' };
      }
    } catch {
      // Session might not exist yet — that's fine
    }

    this.logger.log(
      `Starting WAHA session: ${resolvedSessionId} (workspace/session key: ${sessionId})`,
    );
    this.startingSessions.add(resolvedSessionId);
    try {
      // WAHA: POST /api/sessions/start with { name: sessionId }
      await this.request('POST', '/api/sessions/start', {
        name: resolvedSessionId,
      });
      return { success: true, message: 'session_started' };
    } catch (err: any) {
      // If session already exists, try to get its status
      const message = String(err.message || '').toLowerCase();
      if (
        message.includes('already') ||
        message.includes('exist') ||
        message.includes('session_starting')
      ) {
        return { success: true, message: 'session_exists' };
      }
      this.logger.warn(
        `Failed to start session ${resolvedSessionId}: ${err.message}`,
      );
      return { success: false, message: err.message };
    } finally {
      this.startingSessions.delete(resolvedSessionId);
    }
  }

  async getSessionStatus(sessionId: string): Promise<SessionStatus> {
    const resolvedSessionId = this.resolveSessionName(sessionId);
    try {
      // WAHA: GET /api/sessions/:name
      const data = await this.request<any>(
        'GET',
        `/api/sessions/${encodeURIComponent(resolvedSessionId)}`,
      );
      const wahaStatus = data?.status || data?.engine?.state || 'UNKNOWN';

      // Map WAHA statuses to our internal format
      const stateMap: Record<string, SessionStatus['state']> = {
        WORKING: 'CONNECTED',
        CONNECTED: 'CONNECTED',
        SCAN_QR_CODE: 'SCAN_QR_CODE',
        STARTING: 'STARTING',
        FAILED: 'FAILED',
        STOPPED: 'DISCONNECTED',
      };

      return {
        success: true,
        state: stateMap[wahaStatus] || 'DISCONNECTED',
        message: wahaStatus,
      };
    } catch (err: any) {
      return { success: false, state: null, message: err.message };
    }
  }

  async getQrCode(sessionId: string): Promise<QrCodeResponse> {
    const resolvedSessionId = this.resolveSessionName(sessionId);
    try {
      // WAHA: GET /api/screenshot?session=<name> returns a png
      // But for QR specifically: GET /api/:session/auth/qr — returns image
      const headers: Record<string, string> = { Accept: 'image/png' };
      if (this.apiKey) {
        headers['X-Api-Key'] = this.apiKey;
      }

      const url = `${this.baseUrl}/api/${encodeURIComponent(resolvedSessionId)}/auth/qr`;
      const res = await fetch(url, { headers });

      if (!res.ok) {
        // Try alternative WAHA endpoint
        const altUrl = `${this.baseUrl}/api/screenshot?session=${encodeURIComponent(resolvedSessionId)}`;
        const altRes = await fetch(altUrl, {
          headers: { ...headers, Accept: 'image/png' },
        });
        if (!altRes.ok) {
          return { success: false, message: 'QR not available' };
        }
        const buffer = await altRes.arrayBuffer();
        const base64 = Buffer.from(buffer).toString('base64');
        return { success: true, qr: `data:image/png;base64,${base64}` };
      }

      const contentType = res.headers.get('content-type') || '';
      if (contentType.includes('image')) {
        const buffer = await res.arrayBuffer();
        const base64 = Buffer.from(buffer).toString('base64');
        return { success: true, qr: `data:image/png;base64,${base64}` };
      }

      // JSON response with QR data
      const data = await res.json().catch(() => null);
      if (data?.value) {
        return { success: true, qr: data.value };
      }

      return { success: false, message: 'QR not available in response' };
    } catch (err: any) {
      this.logger.warn(`Failed to get QR code: ${err.message}`);
      return { success: false, message: err.message };
    }
  }

  async restartSession(
    sessionId: string,
  ): Promise<{ success: boolean; message: string }> {
    const resolvedSessionId = this.resolveSessionName(sessionId);
    try {
      await this.request('POST', '/api/sessions/stop', {
        name: resolvedSessionId,
      });
    } catch {
      // Ignore stop errors
    }
    return this.startSession(sessionId);
  }

  async terminateSession(
    sessionId: string,
  ): Promise<{ success: boolean; message: string }> {
    const resolvedSessionId = this.resolveSessionName(sessionId);
    try {
      await this.request('POST', '/api/sessions/stop', {
        name: resolvedSessionId,
      });
      return { success: true, message: 'session_stopped' };
    } catch (err: any) {
      return { success: false, message: err.message };
    }
  }

  // ─── MESSAGING ────────────────────────────────────────────

  async sendMessage(
    sessionId: string,
    to: string,
    message: string,
    options?: { quotedMessageId?: string },
  ): Promise<{ success: boolean; message?: any }> {
    const resolvedSessionId = this.resolveSessionName(sessionId);
    const chatId = this.formatChatId(to);

    // WAHA: POST /api/sendText
    const payload: any = {
      session: resolvedSessionId,
      chatId,
      text: message,
    };
    if (options?.quotedMessageId) {
      payload.reply_to = options.quotedMessageId;
    }

    const result = await this.request<any>('POST', '/api/sendText', payload);
    return { success: true, message: result };
  }

  async sendImageFromUrl(
    sessionId: string,
    to: string,
    imageUrl: string,
    caption?: string,
  ): Promise<{ success: boolean; message?: any }> {
    const resolvedSessionId = this.resolveSessionName(sessionId);
    const chatId = this.formatChatId(to);

    const result = await this.request<any>('POST', '/api/sendImage', {
      session: resolvedSessionId,
      chatId,
      file: { url: imageUrl },
      caption: caption || '',
    });
    return { success: true, message: result };
  }

  async sendMediaFromUrl(
    sessionId: string,
    to: string,
    mediaUrl: string,
    caption?: string,
    mediaType: 'image' | 'video' | 'audio' | 'document' = 'image',
  ): Promise<{ success: boolean; message?: any }> {
    const resolvedSessionId = this.resolveSessionName(sessionId);
    const chatId = this.formatChatId(to);

    // WAHA uses /api/sendFile for generic media
    const result = await this.request<any>('POST', '/api/sendFile', {
      session: resolvedSessionId,
      chatId,
      file: { url: mediaUrl },
      caption: caption || '',
    });
    return { success: true, message: result };
  }

  async sendMedia(
    sessionId: string,
    to: string,
    mimetype: string,
    data: string,
    filename?: string,
    caption?: string,
  ): Promise<{ success: boolean; message?: any }> {
    const resolvedSessionId = this.resolveSessionName(sessionId);
    const chatId = this.formatChatId(to);

    const result = await this.request<any>('POST', '/api/sendFile', {
      session: resolvedSessionId,
      chatId,
      file: {
        mimetype,
        data,
        filename: filename || 'file',
      },
      caption: caption || '',
    });
    return { success: true, message: result };
  }

  async sendLocation(
    sessionId: string,
    to: string,
    latitude: number,
    longitude: number,
    description?: string,
  ): Promise<{ success: boolean; message?: any }> {
    const resolvedSessionId = this.resolveSessionName(sessionId);
    const chatId = this.formatChatId(to);

    const result = await this.request<any>('POST', '/api/sendLocation', {
      session: resolvedSessionId,
      chatId,
      latitude,
      longitude,
      title: description || '',
    });
    return { success: true, message: result };
  }

  // ─── CONTACT & CHAT INFO ─────────────────────────────────

  async getClientInfo(sessionId: string): Promise<any> {
    const resolvedSessionId = this.resolveSessionName(sessionId);
    return this.request(
      'GET',
      `/api/sessions/${encodeURIComponent(resolvedSessionId)}`,
    );
  }

  async getContacts(sessionId: string): Promise<any> {
    const resolvedSessionId = this.resolveSessionName(sessionId);
    return this.request(
      'GET',
      `/api/contacts?session=${encodeURIComponent(resolvedSessionId)}`,
    );
  }

  async getChats(sessionId: string): Promise<any> {
    const resolvedSessionId = this.resolveSessionName(sessionId);
    return this.request(
      'GET',
      `/api/${encodeURIComponent(resolvedSessionId)}/chats`,
    );
  }

  async isRegisteredUser(sessionId: string, phone: string): Promise<boolean> {
    const resolvedSessionId = this.resolveSessionName(sessionId);
    try {
      const chatId = this.formatChatId(phone);
      const res = await this.request<any>(
        'GET',
        `/api/contacts/check-exists?session=${encodeURIComponent(resolvedSessionId)}&phone=${encodeURIComponent(chatId)}`,
      );
      return res?.numberExists === true;
    } catch {
      return false;
    }
  }

  async sendSeen(sessionId: string, chatId: string): Promise<void> {
    const resolvedSessionId = this.resolveSessionName(sessionId);
    await this.request('POST', '/api/sendSeen', {
      session: resolvedSessionId,
      chatId: this.formatChatId(chatId),
    }).catch(() => {});
  }

  async sendTyping(sessionId: string, chatId: string): Promise<void> {
    const resolvedSessionId = this.resolveSessionName(sessionId);
    await this.request('POST', '/api/startTyping', {
      session: resolvedSessionId,
      chatId: this.formatChatId(chatId),
    }).catch(() => {});
  }

  // ─── UTILITIES ────────────────────────────────────────────

  private formatChatId(phone: string): string {
    const cleaned = phone.replace(/\D/g, '');
    if (
      phone.includes('@c.us') ||
      phone.includes('@g.us') ||
      phone.includes('@s.whatsapp.net')
    ) {
      return phone;
    }
    return `${cleaned}@c.us`;
  }

  extractPhoneFromChatId(chatId: string): string {
    return chatId
      .replace(/@c\.us$/, '')
      .replace(/@g\.us$/, '')
      .replace(/@s\.whatsapp\.net$/, '');
  }

  async ping(): Promise<boolean> {
    try {
      const res = await this.request<any>('GET', '/api/sessions');
      return Array.isArray(res);
    } catch {
      return false;
    }
  }
}
