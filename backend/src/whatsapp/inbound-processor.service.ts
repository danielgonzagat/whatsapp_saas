import { InjectRedis } from '@nestjs-modules/ioredis';
import { Inject, Injectable, Logger, Optional, forwardRef } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import Redis from 'ioredis';
import { InboxService } from '../inbox/inbox.service';
import { UnifiedAgentService } from '../kloel/unified-agent.service';
import { forEachSequential } from '../common/async-sequence';
import { toPrismaJsonValue } from '../common/prisma/prisma-json.util';
import { OpsAlertService } from '../observability/ops-alert.service';
import { PrismaService } from '../prisma/prisma.service';
import { buildQueueDedupId, buildQueueJobId } from '../queue/job-id.util';
import { autopilotQueue, flowQueue, voiceQueue } from '../queue/queue';
import { AccountAgentService } from './account-agent.service';
import { resolveConversationOwner } from './agent-conversation-state.util';
import {
  areEquivalentPhones,
  getDefaultContent,
  mapMessageType,
  normalizePhone,
} from './inbound-processor.helpers';
import {
  extractFallbackTopic as extractFallbackTopicValue,
  isPlaceholderContactName as isPlaceholderContactNameValue,
} from './whatsapp-normalization.util';
import { WhatsappService } from './whatsapp.service';
import { WorkerRuntimeService } from './worker-runtime.service';
import type { ProviderSettings } from './provider-settings.types';

const PRE_C__O_QUANTO_VALOR_C_RE = /(pre[cç]o|quanto|valor|custa|comprar|boleto|pix|pagamento)/i;
const AGENDAR_AGENDA_REUNI_A_RE = /(agendar|agenda|reuni[aã]o|hor[aá]rio|marcar)/i;
const OL__A__BOM_DIA_BOA_TARD_RE = /(ol[áa]|bom dia|boa tarde|boa noite|oi\b)/i;

function normalizeUnknownText(value: unknown): string {
  if (typeof value === 'string') {
    return value.trim();
  }
  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value).trim();
  }
  return '';
}

/**
 * Tipos de provedores de mensagens
 */
type InboundProvider = 'meta-cloud' | 'whatsapp-api' | 'whatsapp-web-agent';
type InboundIngestMode = 'live' | 'catchup';

/**
 * Mensagem normalizada de entrada
 */
export interface InboundMessage {
  /** Workspace id property. */
  workspaceId: string;
  /** Provider property. */
  provider: InboundProvider;
  /** Ingest mode property. */
  ingestMode?: InboundIngestMode;
  /** Created at property. */
  createdAt?: Date | string | null;

  /** ID único do provedor para idempotência */
  providerMessageId: string;

  /** Telefone E164 ou apenas dígitos */
  from: string;
  /** To property. */
  to?: string;
  /** Sender name property. */
  senderName?: string;

  /** Tipo de mensagem */
  type: 'text' | 'audio' | 'image' | 'document' | 'video' | 'sticker' | 'unknown';

  /** Conteúdo textual */
  text?: string;

  /** URL da mídia (se aplicável) */
  mediaUrl?: string;
  /** Media mime property. */
  mediaMime?: string;

  /** Payload original do provedor */
  raw?: Record<string, unknown>;
}

/**
 * Resultado do processamento
 */
interface ProcessResult {
  deduped: boolean;
  messageId?: string;
  contactId?: string;
}
import "../../../scripts/pulse/__companions__/inbound-processor.service.companion";
