import { InjectRedis } from '@nestjs-modules/ioredis';
import { Inject, Injectable, Logger, forwardRef } from '@nestjs/common';
import type Redis from 'ioredis';
import { AgentEventsService } from './agent-events.service';
import { WhatsappService } from './whatsapp.service';

const WHITESPACE_G_RE = /\s+/g;
const PATTERN_RE = /[?!.;,]+$/g;
const D_RE = /\D/g;
const WHITESPACE_RE = /\s+/;

const PRE_C__O_QUANTO_VALOR_C_RE = /(pre[cç]o|quanto|valor|custa|comprar|boleto|pix|pagamento)/i;
const AGENDAR_AGENDA_REUNI_A_RE = /(agendar|agenda|reuni[aã]o|hor[aá]rio|marcar)/i;
const OL__A__BOM_DIA_BOA_TARD_RE = /(ol[áa]|bom dia|boa tarde|boa noite|oi\b)/i;
const B___SOBRE_DO_DA_DE_PARA_RE =
  /\b(?:sobre|do|da|de|para)\s+([A-Za-zÀ-ÿ0-9][A-Za-zÀ-ÿ0-9\s/-]{2,40})/i;

const CIA_DAILY_MESSAGE_LIMIT = Math.max(
  1,
  Number.parseInt(process.env.CIA_DAILY_MESSAGE_LIMIT || '1000', 10) || 1000,
);
const CIA_MESSAGE_LIMIT_TTL_SECONDS = 60 * 60 * 48;

const CIA_SHARED_REPLY_LOCK_MS = Math.max(
  10_000,
  Number.parseInt(process.env.AUTOPILOT_SHARED_REPLY_LOCK_MS || '45000', 10) || 45_000,
);

export { CIA_SHARED_REPLY_LOCK_MS };

/**
 * Shared sending helpers for CIA inline and remote backlog services:
 * daily message limits, reply locks, fallback reply generation,
 * and remote message normalization utilities.
 */
@Injectable()
export class CiaSendHelpersService {
  private readonly logger = new Logger(CiaSendHelpersService.name);

  constructor(
    @InjectRedis() private readonly redis: Redis,
    private readonly agentEvents: AgentEventsService,
    @Inject(forwardRef(() => WhatsappService))
    private readonly whatsappService: WhatsappService,
  ) {}

  getSharedReplyLockKey(
    workspaceId: string,
    contactId?: string | null,
    phone?: string | null,
  ): string {
    const normalizedPhone = String(phone || '').replace(D_RE, '');
    return `autopilot:reply:${workspaceId}:${contactId || normalizedPhone}`;
  }

  async redisSetNx(key: string, value: string, ttlMs: number): Promise<boolean> {
    return (await this.redis.set(key, value, 'PX', ttlMs, 'NX').catch(() => null)) === 'OK';
  }

  async releaseSharedReplyLock(key: string) {
    await this.redis.del(key).catch(() => undefined);
  }

  dailyMessageLimitKey(workspaceId: string): string {
    const day = new Date().toISOString().slice(0, 10);
    return `cia:daily-message-limit:${workspaceId}:${day}`;
  }

  async reserveDailyMessageLimit(workspaceId: string): Promise<boolean> {
    const key = this.dailyMessageLimitKey(workspaceId);
    const used = await this.redis.incr(key);
    if (used === 1) {
      await this.redis.expire(key, CIA_MESSAGE_LIMIT_TTL_SECONDS);
    }
    if (used <= CIA_DAILY_MESSAGE_LIMIT) {
      return true;
    }

    await this.redis.decr(key).catch(() => undefined);
    await this.agentEvents.publish({
      type: 'error',
      workspaceId,
      phase: 'daily_message_limit',
      message: `Limite diário de ${CIA_DAILY_MESSAGE_LIMIT} mensagens autônomas atingido.`,
      persistent: true,
    });
    return false;
  }

  async releaseDailyMessageLimit(workspaceId: string): Promise<void> {
    await this.redis.decr(this.dailyMessageLimitKey(workspaceId)).catch(() => undefined);
  }

  async sendCiaMessageWithDailyLimit(
    workspaceId: string,
    phone: string,
    text: string,
    options: Parameters<WhatsappService['sendMessage']>[3],
  ): Promise<Awaited<ReturnType<WhatsappService['sendMessage']>>> {
    const reserved = await this.reserveDailyMessageLimit(workspaceId);
    if (!reserved) {
      return {
        error: true,
        message: 'CIA_DAILY_MESSAGE_LIMIT_REACHED',
      };
    }

    try {
      const sendResult = await this.whatsappService.sendMessage(workspaceId, phone, text, options);
      if (
        sendResult &&
        typeof sendResult === 'object' &&
        'error' in sendResult &&
        sendResult.error
      ) {
        await this.releaseDailyMessageLimit(workspaceId);
      }
      return sendResult;
    } catch (error: unknown) {
      await this.releaseDailyMessageLimit(workspaceId);
      throw error;
    }
  }

  hasOutboundAction(actions: Array<{ tool?: string; result?: unknown }> = []): boolean {
    const outboundTools = new Set([
      'send_message',
      'send_product_info',
      'create_payment_link',
      'send_media',
      'send_document',
      'send_voice_note',
      'send_audio',
    ]);

    return actions.some((action) => {
      if (!outboundTools.has(String(action?.tool || ''))) {
        return false;
      }
      const result = action?.result as Record<string, unknown> | undefined;
      return result?.sent === true || result?.success === true || result?.messageId;
    });
  }

  buildInlineFallbackReply(messageContent: string): string {
    const normalized = String(messageContent || '')
      .trim()
      .toLowerCase();
    const topic = this.extractFallbackTopic(messageContent);

    if (PRE_C__O_QUANTO_VALOR_C_RE.test(normalized)) {
      return topic
        ? `Boa, você foi direto ao ponto. Posso confirmar preço, pagamento e disponibilidade de ${topic}. Quer que eu siga por aí?`
        : 'Boa, sem rodeio fica melhor. Posso confirmar preço, pagamento e disponibilidade. Me diz o produto ou procedimento.';
    }

    if (AGENDAR_AGENDA_REUNI_A_RE.test(normalized)) {
      return 'Perfeito, organização ainda existe. Me diz o dia ou horário e eu organizo isso com você.';
    }

    if (OL__A__BOM_DIA_BOA_TARD_RE.test(normalized)) {
      return 'Oi. Vamos pular a cerimônia: me diz o produto ou a dúvida e eu sigo com você.';
    }

    return topic
      ? `Entendi. Você falou de ${topic}. Me diz o que quer confirmar e eu te respondo sem enrolação.`
      : 'Entendi. Me diz o produto, exame ou objetivo e eu sigo com a informação certa, sem teatro.';
  }

  extractFallbackTopic(messageContent: string): string | null {
    const normalized = String(messageContent || '')
      .replace(WHITESPACE_G_RE, ' ')
      .trim();
    if (!normalized) {
      return null;
    }

    const explicit = normalized.match(B___SOBRE_DO_DA_DE_PARA_RE)?.[1] || '';
    const candidate = explicit || normalized;
    const compact = candidate
      .replace(PATTERN_RE, '')
      .split(WHITESPACE_RE)
      .slice(0, explicit ? 6 : 8)
      .join(' ')
      .trim();

    return compact || null;
  }

  extractRemoteSenderName(
    payload: Record<string, unknown> | null | undefined,
    fallbackName?: string | null,
  ): string | null {
    const data = payload?._data as Record<string, unknown> | undefined;
    const candidates: unknown[] = [
      fallbackName,
      data?.pushName,
      payload?.pushName,
      data?.notifyName,
      payload?.notifyName,
      payload?.senderName,
      payload?.author,
      payload?.name,
    ];

    for (const candidate of candidates) {
      if (typeof candidate !== 'string') {
        continue;
      }
      const normalized = candidate.trim();
      if (normalized) {
        return normalized;
      }
    }

    return null;
  }

  normalizeRemoteTimestamp(value?: string | number | Date | null): string | null {
    if (!value && value !== 0) {
      return null;
    }
    const parsed =
      value instanceof Date
        ? value
        : typeof value === 'number'
          ? new Date(value > 1e12 ? value : value * 1000)
          : new Date(String(value));
    return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
  }

  buildRemoteHistorySummary(
    messages: Array<{
      fromMe: boolean;
      content: string;
      createdAt?: string | null;
    }>,
  ): string {
    return messages
      .slice(-20)
      .map((message) => {
        const role = message.fromMe ? 'vendedora' : 'cliente';
        const content = String(message.content || '').trim();
        return content ? `${role}: ${content}` : null;
      })
      .filter(Boolean)
      .join('\n');
  }

  /** Expose logger.warn for delegated helpers. */
  warn(message: string) {
    this.logger.warn(message);
  }
}
