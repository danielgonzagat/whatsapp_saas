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
  phoneNumber?: string | null;
  pushName?: string | null;
}

export interface QrCodeResponse {
  success: boolean;
  qr?: string;
  message?: string;
}

export interface WahaChatSummary {
  id: string;
  unreadCount?: number;
  timestamp?: number;
  lastMessageTimestamp?: number;
}

export interface WahaChatMessage {
  id: string;
  from?: string;
  to?: string;
  fromMe?: boolean;
  body?: string;
  type?: string;
  hasMedia?: boolean;
  mediaUrl?: string;
  mimetype?: string;
  timestamp?: number;
  chatId?: string;
  raw?: any;
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

  getResolvedSessionId(workspaceSessionId: string): string {
    return this.resolveSessionName(workspaceSessionId);
  }

  private buildHeaders(
    overrides?: Record<string, string>,
  ): Record<string, string> {
    const headers: Record<string, string> = {
      Accept: 'application/json',
      ...overrides,
    };
    if (this.apiKey) {
      headers['X-Api-Key'] = this.apiKey;
    }
    return headers;
  }

  private async parseJsonSafely<T>(res: Response): Promise<T> {
    const text = await res.text().catch(() => '');
    if (!text) return {} as T;
    try {
      return JSON.parse(text) as T;
    } catch {
      return { message: text } as T;
    }
  }

  private async rawRequest(
    method: 'GET' | 'POST' | 'PUT' | 'DELETE',
    path: string,
    body?: any,
    options?: {
      headers?: Record<string, string>;
      timeoutMs?: number;
    },
  ): Promise<Response> {
    const url = `${this.baseUrl}${path}`;
    const hasBody = body !== undefined;
    const headers = this.buildHeaders({
      ...(hasBody ? { 'Content-Type': 'application/json' } : {}),
      ...(options?.headers || {}),
    });

    try {
      const controller = new AbortController();
      const timeout = setTimeout(
        () => controller.abort(),
        options?.timeoutMs ?? 15_000,
      );

      const res = await fetch(url, {
        method,
        headers,
        body: body ? JSON.stringify(body) : undefined,
        signal: controller.signal,
      });

      clearTimeout(timeout);
      return res;
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

  // ─── HTTP helper ──────────────────────────────────────────
  private async request<T>(
    method: 'GET' | 'POST' | 'PUT' | 'DELETE',
    path: string,
    body?: any,
    options?: {
      headers?: Record<string, string>;
      timeoutMs?: number;
    },
  ): Promise<T> {
    const res = await this.rawRequest(method, path, body, options);

    if (!res.ok) {
      const parsed = await this.parseJsonSafely<any>(res);
      throw new Error(parsed?.message || parsed?.error || `HTTP ${res.status}`);
    }

    return this.parseJsonSafely<T>(res);
  }

  private async tryRequest<T>(
    method: 'GET' | 'POST' | 'PUT' | 'DELETE',
    path: string,
    body?: any,
    options?: {
      headers?: Record<string, string>;
      timeoutMs?: number;
    },
  ): Promise<T | null> {
    try {
      return await this.request<T>(method, path, body, options);
    } catch {
      return null;
    }
  }

  private isSessionMissingMessage(message?: string): boolean {
    const lower = String(message || '').toLowerCase();
    return (
      lower.includes('404') ||
      lower.includes('not found') ||
      lower.includes('session') ||
      lower.includes('does not exist')
    );
  }

  private isAlreadyExistsMessage(message?: string): boolean {
    const lower = String(message || '').toLowerCase();
    return (
      lower.includes('already') ||
      lower.includes('exist') ||
      lower.includes('conflict')
    );
  }

  private async ensureSessionExists(sessionId: string) {
    const createPayload = {
      name: sessionId,
      config: this.buildSessionConfig(),
    };

    try {
      await this.request('POST', '/api/sessions', createPayload);
      return;
    } catch (err: any) {
      if (this.isAlreadyExistsMessage(err?.message)) {
        return;
      }
    }

    try {
      await this.request('POST', '/api/sessions/start', { name: sessionId });
    } catch (err: any) {
      if (!this.isAlreadyExistsMessage(err?.message)) {
        throw err;
      }
    }
  }

  private buildSessionConfig() {
    const webhookUrl =
      this.configService.get<string>('WHATSAPP_HOOK_URL') ||
      this.configService.get<string>('WAHA_HOOK_URL') ||
      '';
    const events =
      this.configService.get<string>('WHATSAPP_HOOK_EVENTS') ||
      this.configService.get<string>('WAHA_HOOK_EVENTS') ||
      '';
    const webhookSecret =
      this.configService.get<string>('WHATSAPP_API_WEBHOOK_SECRET') ||
      this.configService.get<string>('WAHA_WEBHOOK_SECRET') ||
      '';

    const webhooks =
      webhookUrl && events
        ? [
            {
              url: webhookUrl,
              events: events
                .split(',')
                .map((value) => value.trim())
                .filter(Boolean),
              hmac: this.configService.get<string>('WHATSAPP_HOOK_HMAC_KEY')
                ? {
                    key: this.configService.get<string>('WHATSAPP_HOOK_HMAC_KEY'),
                  }
                : undefined,
              customHeaders: webhookSecret
                ? {
                    'X-Api-Key': webhookSecret,
                  }
                : undefined,
            },
          ]
        : undefined;

    const storeEnabled =
      this.configService.get<string>('WAHA_STORE_ENABLED') !== 'false';

    return {
      webhooks,
      store: {
        enabled: storeEnabled,
        fullSync: true,
      },
    };
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
      await this.ensureSessionExists(resolvedSessionId);

      const directStart = await this.tryRequest(
        'POST',
        `/api/sessions/${encodeURIComponent(resolvedSessionId)}/start`,
      );

      if (!directStart) {
        await this.request('POST', '/api/sessions/start', {
          name: resolvedSessionId,
        });
      }

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
        phoneNumber:
          data?.me?.id ||
          data?.me?.phone ||
          data?.phone ||
          data?.phoneNumber ||
          null,
        pushName:
          data?.me?.pushName ||
          data?.me?.name ||
          data?.pushName ||
          data?.name ||
          null,
      };
    } catch (err: any) {
      return { success: false, state: null, message: err.message };
    }
  }

  async getQrCode(sessionId: string): Promise<QrCodeResponse> {
    const resolvedSessionId = this.resolveSessionName(sessionId);
    try {
      const res =
        (await this.tryGetQrImage(
          'POST',
          `/api/${encodeURIComponent(resolvedSessionId)}/auth/qr`,
        )) ||
        (await this.tryGetQrImage(
          'GET',
          `/api/${encodeURIComponent(resolvedSessionId)}/auth/qr`,
        )) ||
        (await this.tryGetQrImage(
          'GET',
          `/api/screenshot?session=${encodeURIComponent(resolvedSessionId)}`,
        ));

      if (!res) {
        return { success: false, message: 'QR not available' };
      }

      const contentType = res.headers.get('content-type') || '';
      if (contentType.includes('image')) {
        const buffer = await res.arrayBuffer();
        const base64 = Buffer.from(buffer).toString('base64');
        return { success: true, qr: `data:image/png;base64,${base64}` };
      }

      const data = await this.parseJsonSafely<any>(res);
      if (data?.value) {
        return { success: true, qr: data.value };
      }
      if (data?.qr) {
        return { success: true, qr: data.qr };
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
      const restarted = await this.tryRequest(
        'POST',
        `/api/sessions/${encodeURIComponent(resolvedSessionId)}/restart`,
      );

      if (restarted) {
        return { success: true, message: 'session_restarted' };
      }
    } catch {
      // fallback below
    }

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
      const directStop = await this.tryRequest(
        'POST',
        `/api/sessions/${encodeURIComponent(resolvedSessionId)}/stop`,
      );
      if (!directStop) {
        await this.request('POST', '/api/sessions/stop', {
          name: resolvedSessionId,
        });
      }
      return { success: true, message: 'session_stopped' };
    } catch (err: any) {
      return { success: false, message: err.message };
    }
  }

  async logoutSession(
    sessionId: string,
  ): Promise<{ success: boolean; message: string }> {
    const resolvedSessionId = this.resolveSessionName(sessionId);

    try {
      await this.request('POST', '/api/sessions/logout', {
        name: resolvedSessionId,
      });
      return { success: true, message: 'session_logged_out' };
    } catch (err: any) {
      try {
        await this.request('POST', '/api/sessions/stop', {
          name: resolvedSessionId,
          logout: true,
        });
        return { success: true, message: 'session_logged_out' };
      } catch (fallbackErr: any) {
        return {
          success: false,
          message: fallbackErr?.message || err?.message || 'logout_failed',
        };
      }
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
    const overview = await this.tryRequest<any>(
      'GET',
      `/api/${encodeURIComponent(resolvedSessionId)}/chats/overview`,
    );

    if (overview) {
      return overview;
    }

    return this.request(
      'GET',
      `/api/${encodeURIComponent(resolvedSessionId)}/chats`,
    );
  }

  async getChatMessages(
    sessionId: string,
    chatId: string,
    options?: { limit?: number; downloadMedia?: boolean },
  ): Promise<any> {
    const resolvedSessionId = this.resolveSessionName(sessionId);
    const normalizedChatId = this.formatChatId(chatId);
    const limit = Math.max(1, Math.min(100, options?.limit || 20));
    const downloadMedia = options?.downloadMedia === true ? 'true' : 'false';

    const sessionScoped = await this.tryRequest<any>(
      'GET',
      `/api/${encodeURIComponent(resolvedSessionId)}/chats/${encodeURIComponent(normalizedChatId)}/messages?limit=${limit}&downloadMedia=${downloadMedia}`,
    );

    if (sessionScoped) {
      return sessionScoped;
    }

    return this.request<any>(
      'GET',
      `/api/messages?session=${encodeURIComponent(resolvedSessionId)}&chatId=${encodeURIComponent(normalizedChatId)}&limit=${limit}&downloadMedia=${downloadMedia}`,
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
    const payload = {
      session: resolvedSessionId,
      chatId: this.formatChatId(chatId),
    };

    const direct = await this.tryRequest('POST', '/api/startTyping', payload);
    if (direct) return;

    await this.request(
      'POST',
      `/api/${encodeURIComponent(resolvedSessionId)}/presence`,
      {
        chatId: this.formatChatId(chatId),
        presence: 'typing',
      },
    ).catch(() => {});
  }

  async stopTyping(sessionId: string, chatId: string): Promise<void> {
    const resolvedSessionId = this.resolveSessionName(sessionId);
    const payload = {
      session: resolvedSessionId,
      chatId: this.formatChatId(chatId),
    };

    const direct = await this.tryRequest('POST', '/api/stopTyping', payload);
    if (direct) return;

    await this.request(
      'POST',
      `/api/${encodeURIComponent(resolvedSessionId)}/presence`,
      {
        chatId: this.formatChatId(chatId),
        presence: 'paused',
      },
    ).catch(() => {});
  }

  private async tryGetQrImage(
    method: 'GET' | 'POST',
    path: string,
  ): Promise<Response | null> {
    try {
      const res = await this.rawRequest(method, path, undefined, {
        headers: { Accept: 'image/png, application/json' },
      });
      if (!res.ok) return null;
      return res;
    } catch {
      return null;
    }
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
