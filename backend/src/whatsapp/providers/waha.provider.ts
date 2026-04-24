// PULSE:OK — low-level WAHA transport only. Per-workspace daily send limits are enforced upstream
// in WhatsAppService.sendMessage() through PlanLimitsService.trackMessageSend().
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { findFirstSequential, forEachSequential } from '../../common/async-sequence';
import {
  extractAsciiDigits,
  isPlaceholderContactName as isPlaceholderContactNameValue,
  extractPhoneFromChatId as normalizePhoneFromChatId,
} from '../whatsapp-normalization.util';
import {
  normalizeWahaSessionStatus,
  mapWahaSessionStatus,
  resolveWahaSessionState,
} from './waha-types';
import { WahaSessionProvider } from './waha-session.provider';

export type {
  SessionStatus,
  QrCodeResponse,
  WahaChatSummary,
  WahaChatMessage,
  WahaLidMapping,
  WahaSessionOverview,
  WahaRuntimeConfigDiagnostics,
  WahaSessionConfigDiagnostics,
} from './waha-types';
export { normalizeWahaSessionStatus, mapWahaSessionStatus, resolveWahaSessionState };

const S_RE = /\s+/;

/**
 * Waha provider — messaging, contacts, and chat utilities.
 * Session lifecycle is handled by WahaSessionProvider (waha-session.provider.ts).
 */
@Injectable()
export class WahaProvider extends WahaSessionProvider {
  constructor(configService: ConfigService) {
    super(configService);
  }

  // ─── MESSAGING ────────────────────────────────────────────

  async sendMessage(
    sessionId: string,
    to: string,
    message: string,
    options?: { quotedMessageId?: string },
  ): Promise<{ success: boolean; message?: unknown }> {
    const resolvedSessionId = this.resolveSessionName(sessionId);
    const chatId = this.formatChatId(to);
    const payload: Record<string, unknown> = {
      session: resolvedSessionId,
      chatId,
      text: message,
    };
    if (options?.quotedMessageId) {
      payload.reply_to = options.quotedMessageId;
    }
    const result = await this.request<Record<string, unknown>>('POST', '/api/sendText', payload);
    return { success: true, message: result };
  }

  /** Send image from url. */
  async sendImageFromUrl(
    sessionId: string,
    to: string,
    imageUrl: string,
    caption?: string,
  ): Promise<{ success: boolean; message?: unknown }> {
    const resolvedSessionId = this.resolveSessionName(sessionId);
    const chatId = this.formatChatId(to);
    const result = await this.request<Record<string, unknown>>('POST', '/api/sendImage', {
      session: resolvedSessionId,
      chatId,
      file: { url: imageUrl },
      caption: caption || '',
    });
    return { success: true, message: result };
  }

  /** Send media from url. */
  async sendMediaFromUrl(
    sessionId: string,
    to: string,
    mediaUrl: string,
    caption?: string,
    _mediaType: 'image' | 'video' | 'audio' | 'document' = 'image',
    options?: { quotedMessageId?: string },
  ): Promise<{ success: boolean; message?: unknown }> {
    const resolvedSessionId = this.resolveSessionName(sessionId);
    const chatId = this.formatChatId(to);
    const payload: Record<string, unknown> = {
      session: resolvedSessionId,
      chatId,
      file: { url: mediaUrl },
      caption: caption || '',
    };
    if (options?.quotedMessageId) {
      payload.reply_to = options.quotedMessageId;
    }
    const result = await this.request<Record<string, unknown>>('POST', '/api/sendFile', payload);
    return { success: true, message: result };
  }

  /** Send media. */
  async sendMedia(
    sessionId: string,
    to: string,
    mimetype: string,
    data: string,
    filename?: string,
    caption?: string,
    options?: { quotedMessageId?: string },
  ): Promise<{ success: boolean; message?: unknown }> {
    const resolvedSessionId = this.resolveSessionName(sessionId);
    const chatId = this.formatChatId(to);
    const payload: Record<string, unknown> = {
      session: resolvedSessionId,
      chatId,
      file: { mimetype, data, filename: filename || 'file' },
      caption: caption || '',
    };
    if (options?.quotedMessageId) {
      payload.reply_to = options.quotedMessageId;
    }
    const result = await this.request<Record<string, unknown>>('POST', '/api/sendFile', payload);
    return { success: true, message: result };
  }

  /** Send location. */
  async sendLocation(
    sessionId: string,
    to: string,
    latitude: number,
    longitude: number,
    description?: string,
  ): Promise<{ success: boolean; message?: unknown }> {
    const resolvedSessionId = this.resolveSessionName(sessionId);
    const chatId = this.formatChatId(to);
    const result = await this.request<Record<string, unknown>>('POST', '/api/sendLocation', {
      session: resolvedSessionId,
      chatId,
      latitude,
      longitude,
      title: description || '',
    });
    return { success: true, message: result };
  }

  // ─── CONTACT & CHAT INFO ─────────────────────────────────

  async getClientInfo(sessionId: string): Promise<Record<string, unknown>> {
    const resolvedSessionId = this.resolveSessionName(sessionId);
    return this.request<Record<string, unknown>>(
      'GET',
      `/api/sessions/${encodeURIComponent(resolvedSessionId)}`,
    );
  }

  /** Get contacts. */
  async getContacts(sessionId: string): Promise<unknown[]> {
    const resolvedSessionId = this.resolveSessionName(sessionId);
    return this.request<unknown[]>(
      'GET',
      `/api/contacts?session=${encodeURIComponent(resolvedSessionId)}`,
    );
  }

  /** Upsert contact profile. */
  async upsertContactProfile(
    sessionId: string,
    input: { phone: string; name?: string | null },
  ): Promise<boolean> {
    const resolvedSessionId = this.resolveSessionName(sessionId);
    const chatId = this.formatChatId(input.phone);
    const fullName = String(input.name || '').trim();

    if (!chatId || !fullName || this.isPlaceholderContactName(fullName, input.phone)) {
      return false;
    }

    const [firstName, ...rest] = fullName.split(S_RE).filter(Boolean);
    const lastName = rest.join(' ').trim();
    const scopedPayload = {
      firstName: firstName || fullName,
      lastName: lastName || undefined,
      fullName,
      name: fullName,
    };
    const genericPayload = { session: resolvedSessionId, chatId, ...scopedPayload };

    const attempts = [
      () =>
        this.tryRequest(
          'PUT',
          `/api/${encodeURIComponent(resolvedSessionId)}/contacts/${encodeURIComponent(chatId)}`,
          scopedPayload,
        ),
      () =>
        this.tryRequest(
          'POST',
          `/api/${encodeURIComponent(resolvedSessionId)}/contacts/${encodeURIComponent(chatId)}`,
          scopedPayload,
        ),
      () => this.tryRequest('POST', '/api/contacts', genericPayload),
    ];

    const delivered = await findFirstSequential(attempts, async (attempt) =>
      (await attempt()) ? true : undefined,
    );
    return delivered === true;
  }

  /** Get chats. */
  async getChats(sessionId: string): Promise<unknown[]> {
    const resolvedSessionId = this.resolveSessionName(sessionId);
    if (!this.shouldSkipChatsOverview(resolvedSessionId)) {
      const overview = await this.collectChatsWithPagination(
        (offset, limit) =>
          `/api/${encodeURIComponent(resolvedSessionId)}/chats/overview?limit=${limit}&offset=${offset}`,
        { timeoutMs: this.chatsOverviewTimeoutMs },
      );
      if (overview?.length) {
        this.clearChatsOverviewFailure(resolvedSessionId);
        return overview;
      }
      this.markChatsOverviewFailure(resolvedSessionId);
    }

    const chats = await this.collectChatsWithPagination(
      (offset, limit) =>
        `/api/${encodeURIComponent(resolvedSessionId)}/chats?limit=${limit}&offset=${offset}`,
    );
    if (chats?.length) {
      return chats;
    }
    return this.request<unknown[]>('GET', `/api/${encodeURIComponent(resolvedSessionId)}/chats`);
  }

  /** Get chat messages. */
  async getChatMessages(
    sessionId: string,
    chatId: string,
    options?: { limit?: number; offset?: number; downloadMedia?: boolean },
  ): Promise<unknown[]> {
    const resolvedSessionId = this.resolveSessionName(sessionId);
    const normalizedChatId = this.formatChatId(chatId);
    const limit = Math.max(1, Math.min(100, options?.limit || 20));
    const offset = Math.max(0, options?.offset || 0);
    const downloadMedia = options?.downloadMedia === true ? 'true' : 'false';

    const sessionScoped = await this.tryRequest<unknown[]>(
      'GET',
      `/api/${encodeURIComponent(resolvedSessionId)}/chats/${encodeURIComponent(normalizedChatId)}/messages?limit=${limit}&offset=${offset}&downloadMedia=${downloadMedia}`,
    );
    if (sessionScoped) {
      return sessionScoped;
    }
    return this.request<unknown[]>(
      'GET',
      `/api/messages?session=${encodeURIComponent(resolvedSessionId)}&chatId=${encodeURIComponent(normalizedChatId)}&limit=${limit}&offset=${offset}&downloadMedia=${downloadMedia}`,
    );
  }

  /** Is registered user. */
  async isRegisteredUser(sessionId: string, phone: string): Promise<boolean> {
    const resolvedSessionId = this.resolveSessionName(sessionId);
    try {
      const chatId = this.formatChatId(phone);
      const res = await this.request<Record<string, unknown>>(
        'GET',
        `/api/contacts/check-exists?session=${encodeURIComponent(resolvedSessionId)}&phone=${encodeURIComponent(chatId)}`,
      );
      return res?.numberExists === true;
    } catch {
      return false;
    }
  }

  /** Send seen. */
  async sendSeen(sessionId: string, chatId: string): Promise<void> {
    const resolvedSessionId = this.resolveSessionName(sessionId);
    await findFirstSequential(this.buildChatIdCandidates(chatId), async (candidate) => {
      const delivered = await this.tryRequest('POST', '/api/sendSeen', {
        session: resolvedSessionId,
        chatId: candidate,
      });
      return delivered ? true : false;
    });
  }

  /** Read chat messages. */
  async readChatMessages(sessionId: string, chatId: string): Promise<void> {
    const resolvedSessionId = this.resolveSessionName(sessionId);
    const candidates = this.buildChatIdCandidates(chatId);

    const sessionScoped = await findFirstSequential(candidates, async (candidate) => {
      const result = await this.tryRequest(
        'POST',
        `/api/${encodeURIComponent(resolvedSessionId)}/chats/${encodeURIComponent(candidate)}/messages/read`,
      );
      return result ? true : false;
    });

    if (sessionScoped) {
      return;
    }
    await forEachSequential(candidates, async (candidate) => {
      await this.sendSeen(resolvedSessionId, candidate).catch(() => undefined);
    });
  }

  /** Set presence. */
  async setPresence(
    sessionId: string,
    presence: 'available' | 'offline' | 'typing' | 'paused',
    chatId?: string,
  ): Promise<void> {
    const resolvedSessionId = this.resolveSessionName(sessionId);
    const payload: Record<string, unknown> = { presence };
    if (chatId) {
      payload.chatId = this.formatChatId(chatId);
    }
    await this.request(
      'POST',
      `/api/${encodeURIComponent(resolvedSessionId)}/presence`,
      payload,
    ).catch(() => {
      /* non-critical: presence update */
    });
  }

  /** Send typing. */
  async sendTyping(sessionId: string, chatId: string): Promise<void> {
    const resolvedSessionId = this.resolveSessionName(sessionId);
    const payload = { session: resolvedSessionId, chatId: this.formatChatId(chatId) };

    const direct = await this.tryRequest('POST', '/api/startTyping', payload);
    if (direct) {
      return;
    }
    await this.request('POST', `/api/${encodeURIComponent(resolvedSessionId)}/presence`, {
      chatId: this.formatChatId(chatId),
      presence: 'typing',
    }).catch(() => {
      /* non-critical: typing indicator */
    });
  }

  /** Stop typing. */
  async stopTyping(sessionId: string, chatId: string): Promise<void> {
    const resolvedSessionId = this.resolveSessionName(sessionId);
    const payload = { session: resolvedSessionId, chatId: this.formatChatId(chatId) };

    const direct = await this.tryRequest('POST', '/api/stopTyping', payload);
    if (direct) {
      return;
    }
    await this.request('POST', `/api/${encodeURIComponent(resolvedSessionId)}/presence`, {
      chatId: this.formatChatId(chatId),
      presence: 'paused',
    }).catch(() => {
      /* non-critical: stop typing indicator */
    });
  }

  // ─── UTILITIES ────────────────────────────────────────────

  private buildChatIdCandidates(chatId: string): string[] {
    const raw = String(chatId || '').trim();
    const phone = this.extractPhoneFromChatId(raw);
    return Array.from(
      new Set(
        [
          raw,
          this.formatChatId(raw),
          phone ? `${phone}@c.us` : '',
          phone ? `${phone}@s.whatsapp.net` : '',
        ].filter(Boolean),
      ),
    );
  }

  private extractChatsPayload(payload: unknown): unknown[] {
    if (Array.isArray(payload)) {
      return payload;
    }
    const p = payload as Record<string, unknown> | undefined;
    if (Array.isArray(p?.chats)) {
      return p.chats as unknown[];
    }
    return [];
  }

  private getChatDedupKey(chat: unknown): string {
    const c = chat as Record<string, unknown>;
    const cContact = c?.contact as Record<string, unknown> | undefined;
    const candidates = [c?.id, c?.chatId, c?.contactId, c?.phone, cContact?.phone];
    const strMatch = candidates.find((v): v is string => typeof v === 'string' && v.trim() !== '');
    if (strMatch) {
      return strMatch.trim();
    }
    const numMatch = candidates.find((v): v is number => typeof v === 'number');
    return numMatch !== undefined ? String(numMatch) : '';
  }

  private async collectChatsWithPagination(
    pathBuilder: (offset: number, limit: number) => string,
    options?: { timeoutMs?: number },
  ): Promise<unknown[] | null> {
    const pageSize = 200;
    const maxPages = 10;
    const collected: unknown[] = [];
    const seen = new Set<string>();
    const fetchPage = async (page: number): Promise<unknown[] | null> => {
      if (page >= maxPages) {
        return collected;
      }
      const offset = page * pageSize;
      const payload = await this.tryRequest<Record<string, unknown> | unknown[]>(
        'GET',
        pathBuilder(offset, pageSize),
        undefined,
        options,
      );
      if (!payload) {
        return page === 0 ? null : collected;
      }
      const rows = this.extractChatsPayload(payload);
      if (!rows.length) {
        return collected;
      }
      let added = 0;
      for (const chat of rows) {
        const key = this.getChatDedupKey(chat);
        if (key) {
          if (seen.has(key)) {
            continue;
          }
          seen.add(key);
        }
        collected.push(chat);
        added += 1;
      }
      if (rows.length < pageSize || added === 0) {
        return collected;
      }
      return fetchPage(page + 1);
    };
    return fetchPage(0);
  }

  private isPlaceholderContactName(value: unknown, phone?: string | null): boolean {
    return isPlaceholderContactNameValue(value, phone);
  }

  private formatChatId(phone: string): string {
    const normalized = String(phone || '').trim();
    if (!normalized) {
      return '';
    }
    if (normalized.includes('@')) {
      return normalized;
    }
    const cleaned = extractAsciiDigits(normalized);
    return `${cleaned}@c.us`;
  }

  /** Extract phone from chat id. */
  extractPhoneFromChatId(chatId: string): string {
    return normalizePhoneFromChatId(chatId);
  }

  /** Ping. */
  async ping(): Promise<boolean> {
    try {
      const res = await this.request<unknown[]>('GET', '/api/sessions');
      return Array.isArray(res);
    } catch {
      return false;
    }
  }
}
