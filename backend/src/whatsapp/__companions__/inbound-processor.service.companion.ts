import type { InboxService } from '../../inbox/inbox.service';
import type { PrismaService } from '../../prisma/prisma.service';
import type { UnifiedAgentService } from '../../kloel/unified-agent.service';
import type { AccountAgentService } from '../account-agent.service';
import type { WorkerRuntimeService } from '../worker-runtime.service';
import type { WhatsappService } from '../whatsapp.service';
import type { OpsAlertService } from '../../observability/ops-alert.service';
import type Redis from 'ioredis';
import type { ProviderSettings } from '../provider-settings.types';
import { areEquivalentPhones, normalizePhone } from '../inbound-processor.helpers';
import { extractFallbackTopic as extractFallbackTopicValue } from '../whatsapp-normalization.util';

const PRE_C__O_QUANTO_VALOR_C_RE = /(pre[cç]o|quanto|valor|custa|comprar|boleto|pix|pagamento)/i;
const AGENDAR_AGENDA_REUNI_A_RE = /(agendar|agenda|reuni[aã]o|hor[aá]rio|marcar)/i;
const OL__A__BOM_DIA_BOA_TARD_RE = /(ol[áa]|bom dia|boa tarde|boa noite|oi\b)/i;

export type InboundIngestMode = 'live' | 'catchup';
export type InboundProvider = 'meta-cloud' | 'whatsapp-api' | 'whatsapp-web-agent';

export interface InboundMessage {
  workspaceId: string;
  provider: InboundProvider;
  ingestMode?: InboundIngestMode;
  createdAt?: Date | string | null;
  providerMessageId: string;
  from: string;
  to?: string;
  senderName?: string;
  type: 'text' | 'audio' | 'image' | 'document' | 'video' | 'sticker' | 'unknown';
  text?: string;
  mediaUrl?: string;
  mediaMime?: string;
  raw?: Record<string, unknown>;
}

export type ProcessDeps = {
  prisma: PrismaService;
  inbox: InboxService;
  redis: Redis;
  accountAgent: AccountAgentService;
  workerRuntime: WorkerRuntimeService;
  unifiedAgent: UnifiedAgentService;
  whatsappService: WhatsappService;
  opsAlert?: OpsAlertService;
  contactDebounceMs: number;
  sharedReplyLockMs: number;
};

function normalizeUnknownText(value: unknown): string {
  if (typeof value === 'string') return value.trim();
  if (typeof value === 'number' || typeof value === 'boolean') return String(value).trim();
  return '';
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

// ── checkDuplicate extracted ──
export async function checkDuplicateExt(
  deps: Pick<ProcessDeps, 'redis' | 'prisma'>,
  workspaceId: string,
  providerMessageId: string,
): Promise<string | null> {
  if (!providerMessageId) return null;
  const cacheKey = `inbound:dedupe:${workspaceId}:${providerMessageId}`;
  const cached = await deps.redis.get(cacheKey);
  if (cached && cached !== 'processing') return cached;
  if (cached === 'processing') {
    for (let i = 0; i < 3; i++) {
      await sleep(150);
      const r = await deps.redis.get(cacheKey);
      if (r && r !== 'processing') return r;
    }
    return null;
  }
  const existing = await deps.prisma.message.findFirst({
    where: { workspaceId, externalId: providerMessageId },
    select: { id: true },
  });
  if (existing) {
    await deps.redis.set(cacheKey, existing.id, 'EX', 300);
    return existing.id;
  }
  const locked = await deps.redis.set(cacheKey, 'processing', 'EX', 300, 'NX');
  if (locked !== 'OK') return 'processing';
  return null;
}

// ── isWorkspaceSelfInbound extracted ──
export function isWorkspaceSelfInboundExt(
  settings: Record<string, unknown>,
  from: string,
  phone: string,
): boolean {
  const sessionMeta = (settings?.whatsappApiSession || {}) as Record<string, unknown>;
  const selfPhone = normalizePhone(normalizeUnknownText(sessionMeta.phoneNumber));
  const selfIds = Array.isArray(sessionMeta.selfIds)
    ? (sessionMeta.selfIds as unknown[]).map((v: unknown) => normalizeUnknownText(v))
    : [];
  if (areEquivalentPhones(selfPhone, phone)) return true;
  return selfIds.some(
    (c) =>
      normalizeUnknownText(c) === normalizeUnknownText(from) ||
      areEquivalentPhones(normalizePhone(String(c || '')), phone),
  );
}

// ── isAutonomousEnabled extracted ──
export function isAutonomousEnabledExt(
  settings?: ProviderSettings,
  ingestMode?: InboundIngestMode,
): boolean {
  const mode = String(settings?.autonomy?.mode || '')
    .trim()
    .toUpperCase();
  if (mode === 'LIVE' || mode === 'BACKLOG' || mode === 'FULL') return true;
  if (mode === 'HUMAN_ONLY' || mode === 'SUSPENDED') return false;
  if (mode === 'OFF') return settings?.autopilot?.enabled === true;
  if (mode) return mode === 'LIVE' || mode === 'BACKLOG' || mode === 'FULL';
  if (ingestMode === 'live' && shouldForceLiveAutonomyFallbackExt(settings, ingestMode))
    return true;
  return settings?.autopilot?.enabled === true;
}

export function shouldUseInlineReactiveProcessingExt(
  settings?: ProviderSettings,
  ingestMode?: InboundIngestMode,
): boolean {
  if (ingestMode !== 'live') return false;
  const override = String(process.env.AUTOPILOT_INLINE_REACTIVE || 'true')
    .trim()
    .toLowerCase();
  if (['false', '0', 'off', 'no'].includes(override)) return false;
  if (['true', '1', 'on', 'yes'].includes(override)) return true;
  return settings?.autopilot?.enabled === true;
}

export function shouldForceLiveAutonomyFallbackExt(
  settings?: ProviderSettings,
  ingestMode?: InboundIngestMode,
): boolean {
  if (ingestMode !== 'live') return false;
  const mode = String(settings?.autonomy?.mode || '')
    .trim()
    .toUpperCase();
  if (mode) return false;
  const provider = String(settings?.whatsappProvider || '')
    .trim()
    .toLowerCase();
  const sessionStatus = String(
    settings?.whatsappWebSession?.status ||
      settings?.whatsappApiSession?.status ||
      settings?.connectionStatus ||
      '',
  )
    .trim()
    .toLowerCase();
  const runtimeState = String(settings?.ciaRuntime?.state || '')
    .trim()
    .toUpperCase();
  const wahaWs =
    provider === 'whatsapp-api' ||
    provider === 'whatsapp-web-agent' ||
    Boolean(settings?.whatsappApiSession) ||
    Boolean(settings?.whatsappWebSession);
  const connected =
    sessionStatus === 'connected' ||
    runtimeState === 'LIVE_READY' ||
    runtimeState === 'LIVE_AUTONOMY' ||
    runtimeState === 'EXECUTING_IMMEDIATELY' ||
    runtimeState === 'EXECUTING_BACKLOG';
  return wahaWs && connected;
}

export function shouldBypassHumanLockExt(settings?: ProviderSettings): boolean {
  const override = String(process.env.AUTOPILOT_BYPASS_HUMAN_LOCK || '')
    .trim()
    .toLowerCase();
  if (['true', '1', 'on', 'yes'].includes(override)) return true;
  if (['false', '0', 'off', 'no'].includes(override)) return false;
  return (
    String(settings?.autonomy?.mode || '')
      .trim()
      .toUpperCase() === 'FULL'
  );
}

export function shouldAutoReclaimHumanLockExt(
  settings?: ProviderSettings,
  conversation?: {
    mode?: string | null;
    status?: string | null;
    assignedAgentId?: string | null;
    messages?: Array<{ direction?: string | null; createdAt?: Date | string | null }>;
  } | null,
): boolean {
  const override = String(process.env.AUTOPILOT_RECLAIM_HUMAN_LOCK_ON_INBOUND || 'true')
    .trim()
    .toLowerCase();
  if (['false', '0', 'off', 'no'].includes(override)) return false;
  const autonomyMode = String(settings?.autonomy?.mode || '')
    .trim()
    .toUpperCase();
  if (autonomyMode === 'HUMAN_ONLY' || autonomyMode === 'SUSPENDED') return false;
  const conversationMode = String(conversation?.mode || '')
    .trim()
    .toUpperCase();
  if (!conversation || conversationMode === 'PAUSED') return false;
  const latestMsg = (conversation.messages || [])[0];
  const latestDirection = String(latestMsg?.direction || '')
    .trim()
    .toUpperCase();
  if (latestDirection !== 'INBOUND') return false;
  return conversationMode === 'HUMAN' || Boolean(conversation.assignedAgentId);
}

export function buildInlineFallbackReplyExt(messageContent: string): string {
  const normalized = String(messageContent || '')
    .trim()
    .toLowerCase();
  const topic = extractFallbackTopicExt(messageContent);
  if (PRE_C__O_QUANTO_VALOR_C_RE.test(normalized))
    return topic
      ? `Boa, você foi direto ao ponto. Posso confirmar preço, pagamento e disponibilidade de ${topic}. Quer que eu siga por aí?`
      : 'Boa, sem rodeio fica melhor. Posso confirmar preço, pagamento e disponibilidade. Me diz o produto ou procedimento.';
  if (AGENDAR_AGENDA_REUNI_A_RE.test(normalized))
    return 'Perfeito, organização ainda existe. Me diz o dia ou horário e eu organizo isso com você.';
  if (OL__A__BOM_DIA_BOA_TARD_RE.test(normalized))
    return 'Oi. Vamos pular a cerimônia: me diz o produto ou a dúvida e eu sigo com você.';
  return topic
    ? `Entendi. Você falou de ${topic}. Me diz o que quer confirmar e eu te respondo sem enrolação.`
    : 'Entendi. Me diz o produto, exame ou objetivo e eu sigo com a informação certa, sem teatro.';
}

export function extractFallbackTopicExt(messageContent: string): string | null {
  return extractFallbackTopicValue(messageContent);
}

export function hasOutboundActionExt(
  actions: Array<{ tool?: string; result?: unknown }> = [],
): boolean {
  const outboundTools = new Set([
    'send_message',
    'send_product_info',
    'create_payment_link',
    'send_media',
    'send_document',
    'send_voice_note',
    'send_audio',
  ]);
  return actions.some((a) => {
    if (!outboundTools.has(String(a?.tool || ''))) return false;
    const r =
      a?.result && typeof a.result === 'object' ? (a.result as Record<string, unknown>) : {};
    return r.sent === true || r.success === true || Boolean(r.messageId);
  });
}

// ── buildPendingInboundBatch extracted ──
export async function buildPendingInboundBatchExt(
  deps: Pick<ProcessDeps, 'prisma'>,
  params: {
    workspaceId: string;
    contactId: string;
    phone: string;
    fallbackMessageContent: string;
    fallbackProviderMessageId: string;
  },
) {
  const lastOutbound = await deps.prisma.message.findFirst({
    where: { workspaceId: params.workspaceId, contactId: params.contactId, direction: 'OUTBOUND' },
    orderBy: { createdAt: 'desc' },
    select: { createdAt: true },
  });
  const pending = await deps.prisma.message.findMany({
    take: 50,
    where: {
      workspaceId: params.workspaceId,
      contactId: params.contactId,
      direction: 'INBOUND',
      ...(lastOutbound?.createdAt ? { createdAt: { gt: lastOutbound.createdAt } } : {}),
    },
    orderBy: { createdAt: 'asc' },
    select: { content: true, externalId: true },
  });
  const usable = pending
    .map((m) => ({
      content: String(m.content || '').trim(),
      quotedMessageId: String(m.externalId || '').trim(),
    }))
    .filter((m) => m.content && m.quotedMessageId);
  const fb = {
    content: String(params.fallbackMessageContent || '').trim(),
    quotedMessageId: String(params.fallbackProviderMessageId || '').trim(),
  };
  const messages = usable.length ? usable : fb.content && fb.quotedMessageId ? [fb] : [];
  if (!messages.length) return null;
  const aggregated =
    messages.length === 1
      ? messages[0].content
      : messages.map((m, i) => `[${i + 1}] ${String(m.content || '').trim()}`).join('\n');
  return {
    aggregatedMessage: aggregated,
    latestQuotedMessageId:
      messages[messages.length - 1]?.quotedMessageId || params.fallbackProviderMessageId,
    messages,
  };
}
