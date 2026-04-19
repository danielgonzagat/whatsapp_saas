import { Injectable, Logger, Optional } from '@nestjs/common';
import { KloelLead, Prisma } from '@prisma/client';
import { Response } from 'express';
import type { ImageGenerateParamsNonStreaming, ImagesResponse } from 'openai/resources/images';
import OpenAI from 'openai';
import { ChatCompletionMessageParam, ChatCompletionTool } from 'openai/resources/chat';
import { PlanLimitsService } from '../billing/plan-limits.service';
import { StripeRuntime } from '../billing/stripe-runtime';
import { filterLegacyProducts, isLegacyProductName } from '../common/products/legacy-products.util';
import { StorageService } from '../common/storage/storage.service';
import { resolveKloelCapabilityModel } from '../lib/ai-models';
import { resolveBackendOpenAIModel } from '../lib/openai-models';
import { PrismaService } from '../prisma/prisma.service';
import { WhatsAppProviderRegistry } from '../whatsapp/providers/provider-registry';
import { WhatsappService } from '../whatsapp/whatsapp.service';
import { AudioService } from './audio.service';
import { KloelContextFormatter } from './kloel-context-formatter';
import { KloelConversationStore } from './kloel-conversation-store';
import {
  createKloelContentEvent,
  type KloelStreamEvent,
  createKloelDoneEvent,
  createKloelErrorEvent,
  createKloelStatusEvent,
  createKloelThreadEvent,
} from './kloel-stream-events';
import { KloelStreamWriter } from './kloel-stream-writer';
import { KloelToolRouter } from './kloel-tool-router';
import {
  KLOEL_ONBOARDING_PROMPT,
  KLOEL_SALES_PROMPT,
  buildKloelResponseEnginePrompt,
} from './kloel.prompts';
import { MarketingSkillService } from './marketing-skills/marketing-skill.service';
import { chatCompletionWithFallback } from './openai-wrapper';
// @@index: optimistic lock via updatedAt — concurrent writes resolved by DB constraint
import { SmartPaymentService } from './smart-payment.service';
import { UnifiedAgentService } from './unified-agent.service';

const WHITESPACE_G_RE = /\s+/g;
const QUOTE_TRIM_RE = /^[“’\u201c\u201d\u2018\u2019]+|[“’\u201c\u201d\u2018\u2019]+$/g;
const TRAILING_PUNCT_G_RE = /[.!?]+$/g;
const SEPARATOR_G_RE = /[_-]+/g;
const NON_SLUG_CHAR_RE = /[^a-z0-9_:-]+/g;
const NON_DIGIT_RE = /\D/g;

const PDRN_GHK_S____S_CU_COREA_RE = /pdrn|ghk\s*-?\s*cu|coreamy/i;
const TRAILING_DOTS_RE = /[.]+$/;
const NEWLINE_RE = /\n/;
const WHITESPACE_RE = /\s+/;
const COMO_ESTRAT_E__GIA_F_RE =
  /[?]|como|estrat[eé]gia|funil|plano|relat[oó]rio|documento|vender|marketing|autom[aá]tica|copy|webhook|api|integra[cç][aã]o|whatsapp/i;
const RELAT_O__RIO_DOCUMENTO_RE =
  /(relat[oó]rio|documento|guia completo|an[aá]lise completa|plano completo|estrat[eé]gia completa|2000|2\.000|sum[aá]rio executivo|diagn[oó]stico)/i;
const CRIE_CADASTRAR_CADASTRE_RE =
  /(crie|cadastrar|cadastre|salve|liste|mostre|remova|delete|apague|ative|desative|ligue|desligue|conecte|conectar|envie|mande|sincronize|pesquise|busque|procure|pesquisar|buscar|abrir|feche|fechar|atualize|consultar|consulte|verifique|verificar|quero|preciso|gere|fa[cç]a|fazer|traga|me d[eê]|o que est[aá]|quais s[aã]o|qual [ée]|tem|existem)/i;
const PRODUTO_CAT_A__LOGO_AUT_RE =
  /(produto|cat[aá]logo|autopilot|marca|voz|brand voice|fluxo|flow|dashboard|painel|whatsapp|contato|contatos|chat|chats|mensagem|mensagens|backlog|hist[oó]rico|presen[cç]a|presence|link de pagamento|pagamento|payment|web|internet|google|site|landing|homepage|copy|email|campanha|campanhas|checkout|carrinho|afiliad|seo|not[ií]cia|noticias|hoje|status)/i;
const MODEL_RE = /model/i;
const INVALID_RE = /invalid/i;

interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

interface ThinkRequest {
  message: string;
  workspaceId?: string;
  userId?: string;
  userName?: string;
  conversationId?: string;
  mode?: 'chat' | 'onboarding' | 'sales';
  companyContext?: string;
  metadata?: Prisma.InputJsonValue;
}

interface ThinkSyncResult {
  response: string;
  conversationId?: string;
  title?: string;
}

type ComposerCapability = 'create_image' | 'create_site' | 'search_web';

interface ComposerAttachmentMetadata {
  id?: string;
  name?: string;
  size?: number;
  mimeType?: string;
  kind?: 'image' | 'document' | 'audio';
  url?: string | null;
}

interface ComposerLinkedProductMetadata {
  id?: string;
  source?: 'owned' | 'affiliate';
  name?: string;
  status?: 'published' | 'draft' | 'affiliate';
  productId?: string | null;
  affiliateProductId?: string | null;
}

interface ComposerMetadata {
  capability?: ComposerCapability | null;
  attachments?: ComposerAttachmentMetadata[];
  linkedProduct?: ComposerLinkedProductMetadata | null;
}

interface CapabilityExecutionResult {
  content: string;
  metadata?: Record<string, unknown>;
  estimatedTokens?: number;
}

interface ThreadConversationState {
  summary?: string;
  recentMessages: ChatMessage[];
  totalMessages: number;
}

type ExpertiseLevel = 'INICIANTE' | 'INTERMEDIÁRIO' | 'AVANÇADO' | 'EXPERT';

interface WebSearchDigest {
  answer: string;
  sources: Array<{ title: string; url: string }>;
  totalTokens?: number;
}

interface StoredProcessingTraceEntry {
  id: string;
  kind: 'status' | 'tool_call' | 'tool_result';
  phase: 'thinking' | 'tool_calling' | 'tool_result' | 'streaming';
  label: string;
  createdAt: string;
  tool?: string;
  success?: boolean;
}

interface StoredResponseVersion {
  id: string;
  content: string;
  createdAt: string;
  source: 'initial' | 'regenerated';
}

type WorkspaceProductContextInput = Parameters<
  KloelContextFormatter['buildWorkspaceProductContext']
>[0];
type UnknownRecord = Record<string, unknown>;

/** Generic tool result shape returned by all tool* methods. */
interface ToolResult {
  success: boolean;
  message?: string;
  error?: string;
  [key: string]: unknown;
}

// ── Tool Argument Interfaces ──

interface ToolSaveProductArgs extends UnknownRecord {
  name: string;
  price: number;
  description?: string;
}

interface ToolDeleteProductArgs extends UnknownRecord {
  productId?: string;
  productName?: string;
}

interface ToolToggleAutopilotArgs extends UnknownRecord {
  enabled: boolean;
}

interface ToolSetBrandVoiceArgs extends UnknownRecord {
  tone: string;
  personality?: string;
}

interface ToolRememberUserInfoArgs extends UnknownRecord {
  key: string;
  value: string;
}

interface ToolSearchWebArgs extends UnknownRecord {
  query: string;
}

interface ToolCreateFlowArgs extends UnknownRecord {
  name: string;
  trigger: string;
  actions?: string[];
}

interface ToolDashboardSummaryArgs extends UnknownRecord {
  period?: 'today' | 'week' | 'month';
}

interface ToolSendWhatsAppMessageArgs extends UnknownRecord {
  phone: string;
  message: string;
}

interface ToolPaginationArgs extends UnknownRecord {
  limit?: number;
}

interface ToolCreateWhatsAppContactArgs extends UnknownRecord {
  phone: string;
  name?: string;
  email?: string;
}

interface ToolGetWhatsAppMessagesArgs extends UnknownRecord {
  chatId?: string;
  phone?: string;
  limit?: number;
  offset?: number;
}

interface ToolSetWhatsAppPresenceArgs extends UnknownRecord {
  chatId?: string;
  phone?: string;
  presence?: 'typing' | 'paused' | 'seen';
}

interface ToolSyncWhatsAppHistoryArgs extends UnknownRecord {
  reason?: string;
}

interface ToolListLeadsArgs extends UnknownRecord {
  limit?: number;
  status?: string;
}

interface ToolGetLeadDetailsArgs extends UnknownRecord {
  phone?: string;
  leadId?: string;
}

interface ToolSaveBusinessInfoArgs extends UnknownRecord {
  businessName?: string;
  description?: string;
  segment?: string;
}

interface ToolSetBusinessHoursArgs extends UnknownRecord {
  weekdayStart?: string;
  weekdayEnd?: string;
  saturdayStart?: string;
  saturdayEnd?: string;
  workOnSunday?: boolean;
}

interface ToolCreateCampaignArgs extends UnknownRecord {
  name: string;
  message: string;
  targetAudience?: string;
}

interface ToolSendAudioArgs extends UnknownRecord {
  phone: string;
  text: string;
  voice?: string;
}

interface ToolSendDocumentArgs extends UnknownRecord {
  phone: string;
  documentName?: string;
  url?: string;
  caption?: string;
}

interface ToolTranscribeAudioArgs extends UnknownRecord {
  audioUrl?: string;
  audioBase64?: string;
  language?: string;
}

interface ToolUpdateBillingInfoArgs extends UnknownRecord {
  returnUrl?: string;
}

interface ToolChangePlanArgs extends UnknownRecord {
  newPlan: string;
  immediate?: boolean;
}

// ── Followup list item shape ──
export interface FollowupListItem {
  id: string;
  key: string;
  phone?: unknown;
  contactId?: unknown;
  message: unknown;
  scheduledFor?: unknown;
  delayMinutes?: unknown;
  status: unknown;
  createdAt: Date;
  executedAt?: unknown;
}

// ── History item shape ──
interface HistoryItem {
  id: string;
  role: string;
  content: string;
  timestamp: Date;
}

// ── OpenAI Responses API extended source (when include web_search_call.action.sources) ──
interface WebSearchSource {
  title?: string;
  name?: string;
  url?: string;
}

interface WebSearchOutputItem {
  action?: {
    sources?: WebSearchSource[];
  };
}

const KLOEL_STREAM_ABORT_REASON_TIMEOUT = 'request_timeout';
const KLOEL_STREAM_ABORT_REASON_CLIENT_DISCONNECTED = 'client_disconnected';
const KLOEL_SEARCH_WEB_MODEL = resolveKloelCapabilityModel('search_web');
const KLOEL_IMAGE_MODEL = resolveKloelCapabilityModel('create_image');
const KLOEL_SITE_MODEL = resolveKloelCapabilityModel('create_site');

function toAssistantCompletionMessage(
  message:
    | {
        content?: string | null;
        tool_calls?: OpenAI.Chat.ChatCompletionAssistantMessageParam['tool_calls'];
      }
    | null
    | undefined,
): OpenAI.Chat.ChatCompletionAssistantMessageParam {
  return {
    role: 'assistant',
    content: typeof message?.content === 'string' ? message.content : '',
    tool_calls: Array.isArray(message?.tool_calls) ? message.tool_calls : undefined,
  };
}

/** Safely coerce unknown values to string — avoids no-base-to-string */
function safeStr(value: unknown, fallback = ''): string {
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  return fallback;
}

function asUnknownRecord(value: unknown): UnknownRecord | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as UnknownRecord)
    : null;
}

function toErrorDescriptor(error: unknown): { message: string; code: string } {
  const errorRecord = asUnknownRecord(error);
  return {
    message: typeof errorRecord?.message === 'string' ? errorRecord.message : '',
    code: typeof errorRecord?.code === 'string' ? errorRecord.code : '',
  };
}

function stringOrNull(value: unknown): string | null {
  return typeof value === 'string' ? value : null;
}

function toToolCompletionMessages(
  messages: Array<{ tool_call_id: string; content: string }>,
): OpenAI.Chat.ChatCompletionToolMessageParam[] {
  return messages.map((message) => ({
    role: 'tool',
    tool_call_id: message.tool_call_id,
    content: message.content,
  }));
}

// Ferramentas disponíveis no chat principal da KLOEL
const KLOEL_CHAT_TOOLS: ChatCompletionTool[] = [
  // === PRODUTOS ===
  {
    type: 'function',
    function: {
      name: 'save_product',
      description: 'Cadastra um novo produto no catálogo',
      parameters: {
        type: 'object',
        properties: {
          name: { type: 'string', description: 'Nome do produto' },
          price: { type: 'number', description: 'Preço em reais' },
          description: { type: 'string', description: 'Descrição do produto' },
        },
        required: ['name', 'price'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'list_products',
      description: 'Lista todos os produtos cadastrados',
      parameters: { type: 'object', properties: {} },
    },
  },
  {
    type: 'function',
    function: {
      name: 'delete_product',
      description: 'Remove um produto do catálogo',
      parameters: {
        type: 'object',
        properties: {
          productId: { type: 'string', description: 'ID do produto' },
          productName: {
            type: 'string',
            description: 'Nome do produto (alternativa ao ID)',
          },
        },
      },
    },
  },
  // === AUTOMAÇÃO ===
  {
    type: 'function',
    function: {
      name: 'toggle_autopilot',
      description: 'Liga ou desliga o Autopilot (IA de vendas automáticas)',
      parameters: {
        type: 'object',
        properties: {
          enabled: {
            type: 'boolean',
            description: 'true para ligar, false para desligar',
          },
        },
        required: ['enabled'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'set_brand_voice',
      description: 'Define o tom de voz e personalidade da IA',
      parameters: {
        type: 'object',
        properties: {
          tone: {
            type: 'string',
            description: 'Tom de voz (ex: formal, casual, amigável)',
          },
          personality: {
            type: 'string',
            description: 'Descrição da personalidade',
          },
        },
        required: ['tone'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'remember_user_info',
      description:
        'Salva uma informação útil sobre o usuário do dashboard para personalizar conversas futuras',
      parameters: {
        type: 'object',
        properties: {
          key: {
            type: 'string',
            description:
              'Tipo de informação: nome, preferencia, nicho, produto, tom_de_voz, meta, objeção',
          },
          value: {
            type: 'string',
            description: 'Informação concreta revelada pelo usuário',
          },
        },
        required: ['key', 'value'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'search_web',
      description:
        'Pesquisa a web quando a pergunta exige dados atuais, fatos recentes, preços, disponibilidade ou confirmação factual',
      parameters: {
        type: 'object',
        properties: {
          query: {
            type: 'string',
            description: 'Consulta objetiva para pesquisar na web',
          },
        },
        required: ['query'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'create_flow',
      description: 'Cria um fluxo de automação simples',
      parameters: {
        type: 'object',
        properties: {
          name: { type: 'string', description: 'Nome do fluxo' },
          trigger: {
            type: 'string',
            description: 'Gatilho (ex: nova_mensagem, nova_venda)',
          },
          actions: {
            type: 'array',
            items: { type: 'string' },
            description: 'Lista de ações do fluxo',
          },
        },
        required: ['name', 'trigger'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'list_flows',
      description: 'Lista todos os fluxos de automação',
      parameters: { type: 'object', properties: {} },
    },
  },
  // === MÉTRICAS ===
  {
    type: 'function',
    function: {
      name: 'get_dashboard_summary',
      description: 'Retorna resumo de métricas do dashboard',
      parameters: {
        type: 'object',
        properties: {
          period: {
            type: 'string',
            enum: ['today', 'week', 'month'],
            description: 'Período',
          },
        },
      },
    },
  },
  // === PAGAMENTOS ===
  {
    type: 'function',
    function: {
      name: 'create_payment_link',
      description: 'Cria um link de pagamento PIX',
      parameters: {
        type: 'object',
        properties: {
          amount: { type: 'number', description: 'Valor em reais' },
          description: {
            type: 'string',
            description: 'Descrição do pagamento',
          },
          customerName: { type: 'string', description: 'Nome do cliente' },
        },
        required: ['amount', 'description'],
      },
    },
  },
  // === WHATSAPP ===
  {
    type: 'function',
    function: {
      name: 'connect_whatsapp',
      description: 'Inicia o processo de conexão do WhatsApp via QR Code',
      parameters: { type: 'object', properties: {} },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_whatsapp_status',
      description: 'Verifica o status da conexão do WhatsApp',
      parameters: { type: 'object', properties: {} },
    },
  },
  {
    type: 'function',
    function: {
      name: 'send_whatsapp_message',
      description: 'Envia uma mensagem via WhatsApp',
      parameters: {
        type: 'object',
        properties: {
          phone: {
            type: 'string',
            description: 'Número do telefone (apenas números)',
          },
          message: { type: 'string', description: 'Mensagem a enviar' },
        },
        required: ['phone', 'message'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'list_whatsapp_contacts',
      description: 'Lista os contatos reais disponíveis para a IA operar no WhatsApp e no CRM',
      parameters: {
        type: 'object',
        properties: {
          limit: {
            type: 'number',
            description: 'Quantidade máxima de contatos retornados',
          },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'create_whatsapp_contact',
      description:
        'Cria ou atualiza um contato operacional no CRM para uso imediato pela IA no WhatsApp',
      parameters: {
        type: 'object',
        properties: {
          phone: {
            type: 'string',
            description: 'Número do telefone (apenas números ou chatId)',
          },
          name: {
            type: 'string',
            description: 'Nome do contato',
          },
          email: {
            type: 'string',
            description: 'E-mail opcional do contato',
          },
        },
        required: ['phone'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'list_whatsapp_chats',
      description: 'Lista as conversas reais do WhatsApp, incluindo não lidas e pendentes',
      parameters: {
        type: 'object',
        properties: {
          limit: {
            type: 'number',
            description: 'Quantidade máxima de conversas retornadas',
          },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_whatsapp_messages',
      description: 'Busca as mensagens antigas e recentes de uma conversa específica do WhatsApp',
      parameters: {
        type: 'object',
        properties: {
          chatId: {
            type: 'string',
            description: 'ID completo do chat (ex: 5511999999999@c.us)',
          },
          phone: {
            type: 'string',
            description: 'Telefone do contato (alternativa ao chatId)',
          },
          limit: {
            type: 'number',
            description: 'Quantidade máxima de mensagens',
          },
          offset: {
            type: 'number',
            description: 'Paginação',
          },
        },
        required: [],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_whatsapp_backlog',
      description: 'Retorna quantas conversas e mensagens estão pendentes agora no WhatsApp',
      parameters: {
        type: 'object',
        properties: {},
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'set_whatsapp_presence',
      description:
        'Envia um estado operacional no WhatsApp, como digitando, pausado ou visualizado',
      parameters: {
        type: 'object',
        properties: {
          chatId: {
            type: 'string',
            description: 'ID completo do chat',
          },
          phone: {
            type: 'string',
            description: 'Telefone do contato como alternativa ao chatId',
          },
          presence: {
            type: 'string',
            enum: ['typing', 'paused', 'seen'],
            description: 'Estado a ser enviado',
          },
        },
        required: ['presence'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'sync_whatsapp_history',
      description: 'Dispara a sincronização ativa do histórico e backlog do WhatsApp para a IA',
      parameters: {
        type: 'object',
        properties: {
          reason: {
            type: 'string',
            description: 'Motivo operacional da sincronização',
          },
        },
      },
    },
  },
  // === LEADS/CRM ===
  {
    type: 'function',
    function: {
      name: 'list_leads',
      description: 'Lista os leads/contatos recentes',
      parameters: {
        type: 'object',
        properties: {
          limit: { type: 'number', description: 'Quantidade máxima de leads' },
          status: {
            type: 'string',
            description: 'Filtrar por status (new, contacted, qualified, converted)',
          },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_lead_details',
      description: 'Retorna detalhes de um lead específico',
      parameters: {
        type: 'object',
        properties: {
          phone: { type: 'string', description: 'Telefone do lead' },
          leadId: {
            type: 'string',
            description: 'ID do lead (alternativa ao phone)',
          },
        },
      },
    },
  },
  // === CONFIGURAÇÕES ===
  {
    type: 'function',
    function: {
      name: 'save_business_info',
      description: 'Salva informações do negócio',
      parameters: {
        type: 'object',
        properties: {
          businessName: { type: 'string', description: 'Nome do negócio' },
          description: { type: 'string', description: 'Descrição do negócio' },
          segment: {
            type: 'string',
            description: 'Segmento (ecommerce, serviços, etc)',
          },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'set_business_hours',
      description: 'Define o horário de funcionamento',
      parameters: {
        type: 'object',
        properties: {
          weekdayStart: {
            type: 'string',
            description: 'Horário início dias úteis (ex: 09:00)',
          },
          weekdayEnd: {
            type: 'string',
            description: 'Horário fim dias úteis (ex: 18:00)',
          },
          saturdayStart: {
            type: 'string',
            description: 'Horário início sábado',
          },
          saturdayEnd: { type: 'string', description: 'Horário fim sábado' },
          workOnSunday: {
            type: 'boolean',
            description: 'Funciona aos domingos?',
          },
        },
      },
    },
  },
  // === CAMPANHAS ===
  {
    type: 'function',
    function: {
      name: 'create_campaign',
      description: 'Cria uma campanha de mensagens em massa',
      parameters: {
        type: 'object',
        properties: {
          name: { type: 'string', description: 'Nome da campanha' },
          message: { type: 'string', description: 'Mensagem da campanha' },
          targetAudience: {
            type: 'string',
            description: 'Público-alvo (ex: todos, leads_quentes)',
          },
        },
        required: ['name', 'message'],
      },
    },
  },
  // === MÍDIA ===
  {
    type: 'function',
    function: {
      name: 'send_audio',
      description: 'Gera um áudio com a resposta e envia para o contato via WhatsApp',
      parameters: {
        type: 'object',
        properties: {
          text: {
            type: 'string',
            description: 'Texto a ser convertido em áudio',
          },
          phone: {
            type: 'string',
            description: 'Número do telefone do contato',
          },
          voice: {
            type: 'string',
            enum: ['nova', 'alloy', 'echo', 'fable', 'onyx', 'shimmer'],
            description: 'Voz a usar',
          },
        },
        required: ['text', 'phone'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'send_document',
      description: 'Envia um documento (PDF, catálogo, contrato) para o contato via WhatsApp',
      parameters: {
        type: 'object',
        properties: {
          documentName: {
            type: 'string',
            description: 'Nome do documento cadastrado (ex: "catálogo", "contrato")',
          },
          url: {
            type: 'string',
            description: 'URL direta do documento (alternativa ao nome)',
          },
          phone: {
            type: 'string',
            description: 'Número do telefone do contato',
          },
          caption: { type: 'string', description: 'Legenda opcional' },
        },
        required: ['phone'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'send_voice_note',
      description: 'Gera e envia uma nota de voz personalizada para o contato',
      parameters: {
        type: 'object',
        properties: {
          text: { type: 'string', description: 'Texto para converter em voz' },
          phone: { type: 'string', description: 'Número do telefone' },
        },
        required: ['text', 'phone'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'transcribe_audio',
      description: 'Transcreve um áudio recebido (de URL ou base64) para texto usando Whisper',
      parameters: {
        type: 'object',
        properties: {
          audioUrl: {
            type: 'string',
            description: 'URL do áudio para transcrever',
          },
          audioBase64: {
            type: 'string',
            description: 'Áudio em base64 (alternativa à URL)',
          },
          language: {
            type: 'string',
            description: 'Idioma do áudio (pt, en, es)',
            default: 'pt',
          },
        },
      },
    },
  },
  // ============ BILLING TOOLS ============
  {
    type: 'function',
    function: {
      name: 'update_billing_info',
      description:
        'Atualiza as informações de cobrança do cliente. Gera um link seguro do Stripe para adicionar/atualizar cartão de crédito.',
      parameters: {
        type: 'object',
        properties: {
          returnUrl: {
            type: 'string',
            description: 'URL para redirecionar após atualizar (opcional)',
          },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_billing_status',
      description:
        'Retorna o status atual de cobrança: plano ativo, data de renovação, uso, limites e se está suspenso.',
      parameters: {
        type: 'object',
        properties: {},
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'change_plan',
      description:
        'Altera o plano do cliente (upgrade/downgrade). Planos disponíveis: starter, pro, enterprise.',
      parameters: {
        type: 'object',
        properties: {
          newPlan: {
            type: 'string',
            description: 'Novo plano desejado',
            enum: ['starter', 'pro', 'enterprise'],
          },
          immediate: {
            type: 'boolean',
            description: 'Se true, aplica imediatamente. Se false, aplica na próxima renovação.',
          },
        },
        required: ['newPlan'],
      },
    },
  },
];

@Injectable()
export class KloelService {
  private readonly logger = new Logger(KloelService.name);
  private openai: OpenAI;
  private readonly recentThreadMessageLimit = 20;
  private readonly threadSummaryRefreshEvery = 6;
  private readonly workspaceProductContextLimit = 20;
  private readonly workspaceProductPlanLimit = 3;
  private readonly workspaceProductUrlLimit = 3;
  private readonly workspaceProductReviewLimit = 2;
  private readonly workspaceProductCheckoutLimit = 1;
  private readonly workspaceProductCouponLimit = 2;
  private readonly workspaceProductCampaignLimit = 2;
  private readonly workspaceProductCommissionLimit = 3;
  private readonly workspaceAffiliateContextLimit = 10;
  private readonly workspaceInvoiceContextLimit = 3;
  private readonly workspaceExternalLinkContextLimit = 4;
  private readonly workspaceIntegrationContextLimit = 8;
  private readonly workspaceCustomerSubscriptionContextLimit = 4;
  private readonly workspacePhysicalOrderContextLimit = 4;
  private readonly workspacePaymentContextLimit = 4;
  private readonly workspaceAffiliatePartnerContextLimit = 5;
  private readonly contextFormatter = new KloelContextFormatter({
    workspaceProductPlanLimit: this.workspaceProductPlanLimit,
    workspaceProductUrlLimit: this.workspaceProductUrlLimit,
    workspaceProductReviewLimit: this.workspaceProductReviewLimit,
    workspaceProductCheckoutLimit: this.workspaceProductCheckoutLimit,
    workspaceProductCouponLimit: this.workspaceProductCouponLimit,
    workspaceProductCampaignLimit: this.workspaceProductCampaignLimit,
    workspaceProductCommissionLimit: this.workspaceProductCommissionLimit,
    workspaceAffiliateContextLimit: this.workspaceAffiliateContextLimit,
    workspaceInvoiceContextLimit: this.workspaceInvoiceContextLimit,
    workspaceExternalLinkContextLimit: this.workspaceExternalLinkContextLimit,
    workspaceIntegrationContextLimit: this.workspaceIntegrationContextLimit,
    workspaceCustomerSubscriptionContextLimit: this.workspaceCustomerSubscriptionContextLimit,
    workspacePhysicalOrderContextLimit: this.workspacePhysicalOrderContextLimit,
    workspacePaymentContextLimit: this.workspacePaymentContextLimit,
    workspaceAffiliatePartnerContextLimit: this.workspaceAffiliatePartnerContextLimit,
  });
  private readonly toolRouter: KloelToolRouter;
  private readonly conversationStore: KloelConversationStore;

  private readonly unavailableMessage =
    'Eu fiquei sem acesso ao motor de resposta agora. Me chama de novo em instantes que eu retomo sem te fazer repetir tudo.';

  constructor(
    private readonly prisma: PrismaService,
    private readonly smartPaymentService: SmartPaymentService,
    private readonly whatsappService: WhatsappService,
    private readonly providerRegistry: WhatsAppProviderRegistry,
    private readonly unifiedAgentService: UnifiedAgentService,
    private readonly audioService: AudioService,
    private readonly planLimits: PlanLimitsService,
    private readonly storageService: StorageService,
    @Optional() private readonly marketingSkillService?: MarketingSkillService,
  ) {
    this.openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
    });
    this.toolRouter = new KloelToolRouter(this.logger, unifiedAgentService);
    this.conversationStore = new KloelConversationStore(prisma, this.logger);
  }

  private hasOpenAiKey(): boolean {
    return !!String(process.env.OPENAI_API_KEY || '').trim();
  }

  private buildDashboardPrompt(params?: {
    userName?: string | null;
    workspaceName?: string | null;
    expertiseLevel?: ExpertiseLevel;
  }): string {
    return buildKloelResponseEnginePrompt({
      currentDate: new Intl.DateTimeFormat('pt-BR', {
        dateStyle: 'full',
        timeZone: 'America/Sao_Paulo',
      }).format(new Date()),
      userName: this.contextFormatter.sanitizeUserNameForAssistant(params?.userName),
      workspaceName: this.getAssistantWorkspaceLabel(),
      expertiseLevel: params?.expertiseLevel,
    });
  }

  private getAssistantWorkspaceLabel(): string {
    return 'Workspace';
  }

  private async buildMarketingPromptAddendum(
    workspaceId: string | undefined,
    mode: ThinkRequest['mode'],
    message: string,
  ): Promise<string | null> {
    if (mode !== 'chat' || !workspaceId || !this.marketingSkillService) {
      return null;
    }

    try {
      return (
        (await this.marketingSkillService.buildPacket(workspaceId, message))?.promptAddendum || null
      );
    } catch (error: unknown) {
      const errorMessage =
        error instanceof Error
          ? error.message
          : typeof error === 'string'
            ? error
            : 'unknown error';
      this.logger.warn(`Falha ao montar contexto de marketing: ${errorMessage}`);
      return null;
    }
  }

  private buildChatModelMessages(params: {
    systemPrompt: string;
    dynamicContext: string;
    marketingPromptAddendum?: string | null;
    summaryMessage?: ChatCompletionMessageParam | null;
    recentMessages: ChatMessage[];
    userMessage: string;
    assistantMessage?: {
      content?: string | null;
      tool_calls?: OpenAI.Chat.ChatCompletionAssistantMessageParam['tool_calls'];
    };
    toolMessages?: Array<{
      role?: 'tool';
      tool_call_id: string;
      name: string;
      content: string;
    }>;
  }): ChatCompletionMessageParam[] {
    return [
      { role: 'system', content: params.systemPrompt },
      { role: 'system', content: params.dynamicContext },
      ...(params.marketingPromptAddendum
        ? [{ role: 'system' as const, content: params.marketingPromptAddendum }]
        : []),
      ...(params.summaryMessage ? [params.summaryMessage] : []),
      ...params.recentMessages.map((entry) => ({
        role: entry.role as 'user' | 'assistant',
        content: entry.content,
      })),
      { role: 'user', content: params.userMessage },
      ...(params.assistantMessage ? [toAssistantCompletionMessage(params.assistantMessage)] : []),
      ...(params.toolMessages?.length ? toToolCompletionMessages(params.toolMessages) : []),
    ];
  }

  private inferImplicitComposerCapability(
    message: string,
    mode: ThinkRequest['mode'],
  ): ComposerCapability | null {
    if (mode !== 'chat') {
      return null;
    }

    const normalized = String(message || '')
      .trim()
      .toLowerCase();
    if (!normalized) {
      return null;
    }

    const wantsSite = [
      'landing',
      'landing page',
      'pagina de vendas',
      'página de vendas',
      'pagina de captura',
      'página de captura',
      'homepage',
      'home page',
      'site',
    ].some((term) => normalized.includes(term));
    const wantsCreation = [
      'crie',
      'criar',
      'gere',
      'gerar',
      'monte',
      'montar',
      'faça',
      'faca',
      'fazer',
      'construa',
      'construir',
      'desenvolva',
      'desenvolver',
      'quero criar',
      'preciso criar',
    ].some((term) => normalized.includes(term));

    if (wantsSite && wantsCreation) {
      return 'create_site';
    }

    return null;
  }

  private resolveComposerCapability(
    message: string,
    mode: ThinkRequest['mode'],
    explicitCapability?: ComposerCapability | null,
  ): ComposerCapability | null {
    return explicitCapability || this.inferImplicitComposerCapability(message, mode);
  }

  private hasLegacyProductMarker(value: string | null | undefined): boolean {
    const normalized = String(value || '').trim();
    return PDRN_GHK_S____S_CU_COREA_RE.test(normalized);
  }

  private isDefaultThreadTitle(title?: string | null): boolean {
    const normalized = String(title || '')
      .trim()
      .toLowerCase();
    return !normalized || normalized === 'nova conversa';
  }

  private buildFallbackThreadTitle(message: string): string {
    const cleaned = String(message || '')
      .replace(WHITESPACE_G_RE, ' ')
      .trim();

    if (!cleaned) return 'Nova conversa';

    const words = cleaned.split(' ').slice(0, 5);
    const title = words.join(' ').slice(0, 60).trim();
    if (!title) return 'Nova conversa';

    return title.charAt(0).toUpperCase() + title.slice(1);
  }

  private sanitizeGeneratedThreadTitle(value: string | null | undefined): string {
    const sanitized = String(value || '')
      .replace(QUOTE_TRIM_RE, '')
      .replace(TRAILING_PUNCT_G_RE, '')
      .replace(WHITESPACE_G_RE, ' ')
      .trim()
      .slice(0, 60);

    return sanitized || 'Nova conversa';
  }

  private async resolveThread(
    workspaceId: string,
    conversationId?: string,
  ): Promise<{
    id: string;
    title: string;
    summary: string | null;
    summaryUpdatedAt: Date | null;
  } | null> {
    if (!workspaceId) return null;

    if (conversationId) {
      const existing = await this.prisma.chatThread.findFirst({
        where: { id: conversationId, workspaceId },
        select: { id: true, title: true, summary: true, summaryUpdatedAt: true },
      });
      if (existing) return existing;
    }

    return this.prisma.chatThread.create({
      data: {
        workspaceId,
        title: 'Nova conversa',
      },
      select: {
        id: true,
        title: true,
        summary: true,
        summaryUpdatedAt: true,
      },
    });
  }

  private async getThreadConversationHistory(
    threadId: string,
    workspaceId?: string,
    limit = this.recentThreadMessageLimit,
  ): Promise<ChatMessage[]> {
    if (!threadId) return [];

    const messages = await this.prisma.chatMessage.findMany({
      where: workspaceId ? { threadId, thread: { workspaceId } } : { threadId },
      orderBy: { createdAt: 'desc' },
      take: limit,
      select: {
        role: true,
        content: true,
      },
    });

    return messages.reverse().map((message) => ({
      role: message.role as 'user' | 'assistant',
      content: message.content,
    }));
  }

  private async getThreadConversationState(
    threadId?: string | null,
    workspaceId?: string | null,
  ): Promise<ThreadConversationState> {
    if (!threadId || !workspaceId) {
      return { recentMessages: [], totalMessages: 0 };
    }

    const findThread = this.prisma.chatThread.findFirst({
      where: { id: threadId, workspaceId },
      select: { summary: true, summaryUpdatedAt: true },
    });

    const countMessages =
      typeof this.prisma.chatMessage.count === 'function'
        ? this.prisma.chatMessage.count({ where: { threadId, thread: { workspaceId } } })
        : this.prisma.chatMessage
            .findMany({
              where: { threadId, thread: { workspaceId } },
              select: { id: true },
            })
            .then((rows: Array<{ id: string }>) => rows.length);

    const [thread, totalMessages, recentMessages] = await Promise.all([
      findThread,
      countMessages,
      this.getThreadConversationHistory(threadId, workspaceId, this.recentThreadMessageLimit),
    ]);

    return {
      summary:
        thread?.summary && String(thread.summary).trim().length > 0
          ? String(thread.summary)
          : undefined,
      recentMessages,
      totalMessages,
    };
  }

  private async buildAssistantReply(params: {
    message: string;
    workspaceId?: string;
    userId?: string;
    userName?: string;
    mode?: 'chat' | 'onboarding' | 'sales';
    companyContext?: string;
    conversationState?: ThreadConversationState;
    onTraceEvent?: (event: KloelStreamEvent) => void;
  }): Promise<string> {
    const {
      message,
      workspaceId,
      userId,
      userName: requestedUserName,
      mode = 'chat',
      companyContext,
      conversationState,
      onTraceEvent,
    } = params;

    if (!this.hasOpenAiKey() && !process.env.ANTHROPIC_API_KEY) {
      return this.unavailableMessage;
    }

    let context = companyContext || '';
    let companyName = 'sua empresa';
    let userName = 'Usuário';

    if (workspaceId) {
      const [workspace, agent] = await Promise.all([
        this.prisma.workspace.findUnique({
          where: { id: workspaceId },
        }),
        userId
          ? this.prisma.agent.findFirst({
              where: { id: userId, workspaceId },
              select: { name: true },
            })
          : Promise.resolve(null),
      ]);

      if (workspace) {
        companyName = 'sua empresa';
        context = await this.getWorkspaceContext(workspaceId, userId);
      }

      userName = this.contextFormatter.sanitizeUserNameForAssistant(
        requestedUserName || agent?.name || userName,
      );
    }

    const historyState = conversationState || { recentMessages: [], totalMessages: 0 };
    const expertiseLevel = this.detectExpertiseLevel(message, historyState.recentMessages);
    const dynamicContext = await this.buildDynamicRuntimeContext({
      workspaceId,
      userId,
      userName,
      expertiseLevel,
      companyContext,
    });
    const summaryMessage = this.buildThreadSummarySystemMessage(historyState.summary);
    const marketingPromptAddendum = await this.buildMarketingPromptAddendum(
      workspaceId,
      mode,
      message,
    );
    const usesLongFormBudget = this.shouldUseLongFormBudget(message);
    const responseTemperature = 0.7;
    const responseMaxTokens = usesLongFormBudget ? 4096 : 2048;

    let systemPrompt: string;
    switch (mode) {
      case 'onboarding':
        systemPrompt = KLOEL_ONBOARDING_PROMPT;
        break;
      case 'sales':
        systemPrompt = KLOEL_SALES_PROMPT(companyName, context);
        break;
      default:
        systemPrompt = this.buildDashboardPrompt({
          userName,
          workspaceName: companyName,
          expertiseLevel,
        });
    }

    const messages = this.buildChatModelMessages({
      systemPrompt,
      dynamicContext,
      marketingPromptAddendum,
      summaryMessage,
      recentMessages: historyState.recentMessages,
      userMessage: message,
    });
    onTraceEvent?.(createKloelStatusEvent('thinking'));

    if (workspaceId) {
      await this.planLimits.ensureTokenBudget(workspaceId);
    }

    const response = await chatCompletionWithFallback(
      this.openai,
      {
        model:
          mode === 'chat'
            ? resolveBackendOpenAIModel('brain')
            : resolveBackendOpenAIModel('writer'),
        messages,
        tools: mode === 'chat' ? KLOEL_CHAT_TOOLS : undefined,
        tool_choice: mode === 'chat' ? 'auto' : undefined,
        temperature: responseTemperature,
        top_p: 0.95,
        frequency_penalty: 0.3,
        presence_penalty: 0.2,
        max_tokens: responseMaxTokens,
      },
      mode === 'chat'
        ? resolveBackendOpenAIModel('brain_fallback')
        : resolveBackendOpenAIModel('writer_fallback'),
    );

    if (workspaceId) {
      await this.planLimits
        .trackAiUsage(workspaceId, response?.usage?.total_tokens ?? 500)
        .catch(() => {});
    }

    const initialAssistantMessage = response.choices[0]?.message;
    let assistantMessage = initialAssistantMessage?.content || this.unavailableMessage;

    if (
      mode === 'chat' &&
      initialAssistantMessage?.tool_calls &&
      initialAssistantMessage.tool_calls.length > 0 &&
      workspaceId
    ) {
      onTraceEvent?.(createKloelStatusEvent('thinking'));

      const { toolMessages, usedSearchWeb } = await this.toolRouter.executeAssistantToolCalls({
        assistantMessage: initialAssistantMessage as {
          tool_calls?: Array<{
            id?: string;
            function?: { name?: string; arguments?: string };
          }>;
        },
        workspaceId,
        userId,
        safeWrite: onTraceEvent,
        executeLocalTool: this.executeTool.bind(this),
      });

      const finalResponseTemperature = usedSearchWeb ? 0.1 : responseTemperature;

      onTraceEvent?.(createKloelStatusEvent('tool_result'));

      await this.planLimits.ensureTokenBudget(workspaceId);
      const finalResponse = await chatCompletionWithFallback(
        this.openai,
        {
          model: resolveBackendOpenAIModel('writer'),
          messages: this.buildChatModelMessages({
            systemPrompt,
            dynamicContext,
            marketingPromptAddendum,
            summaryMessage,
            recentMessages: historyState.recentMessages,
            userMessage: message,
            assistantMessage: initialAssistantMessage,
            toolMessages,
          }),
          temperature: finalResponseTemperature,
          top_p: 0.95,
          frequency_penalty: 0.3,
          presence_penalty: 0.2,
          max_tokens: responseMaxTokens,
        },
        resolveBackendOpenAIModel('writer_fallback'),
      );

      await this.planLimits
        .trackAiUsage(workspaceId, finalResponse?.usage?.total_tokens ?? 500)
        .catch(() => {});

      assistantMessage = finalResponse.choices[0]?.message?.content || assistantMessage;
      onTraceEvent?.(createKloelStatusEvent('streaming_token'));
      return assistantMessage;
    }

    onTraceEvent?.(createKloelStatusEvent('streaming_token'));

    return assistantMessage;
  }

  private buildThreadMessageMetadata(
    baseMetadata?: Prisma.InputJsonValue,
    extraFields?: Record<string, unknown>,
  ): Prisma.InputJsonValue | undefined {
    const normalizedBase = this.normalizeThreadMessageMetadataRecord(baseMetadata);

    const normalizedExtra = Object.fromEntries(
      Object.entries(extraFields || {}).filter(([, value]) => value !== undefined),
    );

    const merged = {
      ...normalizedBase,
      ...normalizedExtra,
    };

    return Object.keys(merged).length > 0 ? (merged as Prisma.InputJsonValue) : undefined;
  }

  private normalizeThreadMessageMetadataRecord(
    metadata?: Prisma.InputJsonValue | Prisma.JsonValue | null,
  ): Record<string, unknown> {
    if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) {
      return {};
    }

    return { ...(metadata as Record<string, unknown>) };
  }

  private extractComposerMetadata(
    metadata?: Prisma.InputJsonValue | Prisma.JsonValue | null,
  ): ComposerMetadata {
    const normalizedMetadata = this.normalizeThreadMessageMetadataRecord(metadata);
    const capability =
      normalizedMetadata.capability === 'create_image' ||
      normalizedMetadata.capability === 'create_site' ||
      normalizedMetadata.capability === 'search_web'
        ? (normalizedMetadata.capability as ComposerCapability)
        : null;
    const attachments = Array.isArray(normalizedMetadata.attachments)
      ? (normalizedMetadata.attachments as ComposerAttachmentMetadata[])
      : [];
    const linkedProduct =
      normalizedMetadata.linkedProduct &&
      typeof normalizedMetadata.linkedProduct === 'object' &&
      !Array.isArray(normalizedMetadata.linkedProduct)
        ? (normalizedMetadata.linkedProduct as ComposerLinkedProductMetadata)
        : null;

    return {
      capability,
      attachments,
      linkedProduct,
    };
  }

  private buildAttachmentPromptContext(
    attachments: ComposerAttachmentMetadata[] | null | undefined,
  ): string | null {
    if (!Array.isArray(attachments) || attachments.length === 0) {
      return null;
    }

    const lines = attachments
      .slice(0, 10)
      .map((attachment, index) => {
        const parts = [
          `ANEXO ${index + 1}: ${String(attachment.name || 'arquivo').trim() || 'arquivo'}`,
          attachment.kind ? `tipo ${attachment.kind}` : null,
          attachment.mimeType ? `mime ${attachment.mimeType}` : null,
          Number.isFinite(Number(attachment.size))
            ? `tamanho ${Number(attachment.size)} bytes`
            : null,
          attachment.url ? `url ${attachment.url}` : null,
        ].filter(Boolean);

        return `- ${parts.join(' | ')}`;
      })
      .filter(Boolean);

    if (lines.length === 0) return null;
    return ['ANEXOS VINCULADOS AO PROMPT:', ...lines].join('\n');
  }

  private async fetchWorkspaceProductPromptRecord(workspaceId: string, productId: string) {
    return this.prisma.product.findFirst({
      where: { id: productId, workspaceId },
      select: {
        id: true,
        name: true,
        price: true,
        currency: true,
        description: true,
        category: true,
        sku: true,
        tags: true,
        format: true,
        paymentLink: true,
        active: true,
        featured: true,
        status: true,
        stockQuantity: true,
        trackStock: true,
        salesPageUrl: true,
        thankyouUrl: true,
        thankyouBoletoUrl: true,
        thankyouPixUrl: true,
        reclameAquiUrl: true,
        supportEmail: true,
        warrantyDays: true,
        isSample: true,
        shippingType: true,
        shippingValue: true,
        affiliateEnabled: true,
        affiliateVisible: true,
        affiliateAutoApprove: true,
        commissionType: true,
        commissionCookieDays: true,
        commissionPercent: true,
        merchandContent: true,
        affiliateTerms: true,
        afterPayDuplicateAddress: true,
        afterPayAffiliateCharge: true,
        afterPayChargeValue: true,
        afterPayShippingProvider: true,
        aiConfig: {
          select: {
            customerProfile: true,
            positioning: true,
            objections: true,
            salesArguments: true,
            upsellConfig: true,
            downsellConfig: true,
            tone: true,
            persistenceLevel: true,
            messageLimit: true,
            followUpConfig: true,
            technicalInfo: true,
          },
        },
        plans: {
          where: { active: true },
          orderBy: [{ salesCount: 'desc' }, { updatedAt: 'desc' }],
          take: this.workspaceProductPlanLimit,
          select: {
            name: true,
            price: true,
            currency: true,
            billingType: true,
            maxInstallments: true,
            recurringInterval: true,
            trialEnabled: true,
            trialDays: true,
            trialPrice: true,
            salesCount: true,
            termsUrl: true,
            aiConfig: true,
          },
        },
        checkouts: {
          where: { active: true },
          orderBy: [{ conversionRate: 'desc' }, { updatedAt: 'desc' }],
          take: this.workspaceProductCheckoutLimit,
          select: {
            name: true,
            code: true,
            uniqueVisits: true,
            totalVisits: true,
            abandonRate: true,
            cancelRate: true,
            conversionRate: true,
          },
        },
        coupons: {
          where: { active: true },
          orderBy: { createdAt: 'desc' },
          take: this.workspaceProductCouponLimit,
          select: {
            code: true,
            discountType: true,
            discountValue: true,
            maxUses: true,
            usedCount: true,
            expiresAt: true,
          },
        },
        campaigns: {
          orderBy: [{ paidCount: 'desc' }, { updatedAt: 'desc' }],
          take: this.workspaceProductCampaignLimit,
          select: {
            name: true,
            code: true,
            salesCount: true,
            paidCount: true,
          },
        },
        commissions: {
          orderBy: { createdAt: 'desc' },
          take: this.workspaceProductCommissionLimit,
          select: {
            role: true,
            percentage: true,
            agentName: true,
            agentEmail: true,
          },
        },
        urls: {
          where: { active: true },
          orderBy: [{ salesFromUrl: 'desc' }, { updatedAt: 'desc' }],
          take: this.workspaceProductUrlLimit,
          select: {
            description: true,
            url: true,
            isPrivate: true,
            aiLearning: true,
            chatEnabled: true,
            salesFromUrl: true,
          },
        },
        reviews: {
          orderBy: { createdAt: 'desc' },
          take: this.workspaceProductReviewLimit,
          select: {
            rating: true,
            comment: true,
            authorName: true,
            verified: true,
          },
        },
      },
    });
  }

  private async resolveProductOwnerWorkspaceId(productId: string): Promise<string | null> {
    if (!productId) return null;

    const product = await this.prisma.product.findFirst({
      where: { id: productId },
      select: { workspaceId: true },
    });

    return product?.workspaceId || null;
  }

  private async buildLinkedProductPromptContext(
    workspaceId: string,
    linkedProduct: ComposerLinkedProductMetadata | null | undefined,
  ): Promise<string | null> {
    if (!linkedProduct) return null;

    const linkedSource = linkedProduct.source === 'affiliate' ? 'affiliate' : 'owned';

    if (linkedSource === 'owned') {
      const ownedProductId = String(linkedProduct.productId || linkedProduct.id || '').trim();
      if (!ownedProductId) return null;

      const product = await this.fetchWorkspaceProductPromptRecord(workspaceId, ownedProductId);
      if (!product) return null;

      return [
        'PRODUTO VINCULADO AO PROMPT:',
        '- Origem: catálogo próprio do workspace',
        this.contextFormatter.buildWorkspaceProductContext(
          product as WorkspaceProductContextInput,
          0,
        ),
      ].join('\n');
    }

    const affiliateProductId = String(
      linkedProduct.affiliateProductId || linkedProduct.id || '',
    ).trim();
    if (!affiliateProductId) return null;

    const [request, link] = await Promise.all([
      this.prisma.affiliateRequest.findFirst({
        where: {
          affiliateWorkspaceId: workspaceId,
          affiliateProductId,
        },
        include: {
          affiliateProduct: true,
        },
      }),
      this.prisma.affiliateLink.findFirst({
        where: {
          affiliateWorkspaceId: workspaceId,
          affiliateProductId,
        },
        include: {
          affiliateProduct: true,
        },
      }),
    ]);

    const affiliateProductRecord = request?.affiliateProduct || link?.affiliateProduct;
    const affiliateProduct = affiliateProductRecord as UnknownRecord | null;
    const affiliateProductProductId = stringOrNull(affiliateProduct?.productId);
    const targetProductId = String(
      affiliateProductProductId || linkedProduct.productId || '',
    ).trim();
    const producerWorkspaceId = targetProductId
      ? await this.resolveProductOwnerWorkspaceId(targetProductId)
      : null;
    const catalogProduct =
      producerWorkspaceId && targetProductId
        ? await this.fetchWorkspaceProductPromptRecord(producerWorkspaceId, targetProductId).catch(
            () => null,
          )
        : null;

    const affiliateLines = [
      'PRODUTO VINCULADO AO PROMPT:',
      '- Origem: catálogo de afiliados do workspace',
      request?.status ? `- Status da afiliação: ${request.status}` : null,
      affiliateProduct?.commissionPct
        ? `- Comissão disponível: ${Number(affiliateProduct.commissionPct)}%`
        : null,
      stringOrNull(affiliateProduct?.approvalMode)
        ? `- Modo de aprovação: ${stringOrNull(affiliateProduct?.approvalMode)}`
        : null,
      link?.code ? `- Código de afiliado: ${link.code}` : null,
      Number.isFinite(Number(link?.clicks)) ? `- Cliques do link: ${Number(link?.clicks)}` : null,
      Number.isFinite(Number(link?.sales)) ? `- Vendas do link: ${Number(link?.sales)}` : null,
      catalogProduct
        ? this.contextFormatter.buildWorkspaceProductContext(
            catalogProduct as WorkspaceProductContextInput,
            0,
          )
        : null,
    ].filter(Boolean);

    return affiliateLines.length > 2 ? affiliateLines.join('\n') : null;
  }

  private async buildComposerContext(params: {
    workspaceId?: string;
    metadata?: Prisma.InputJsonValue | Prisma.JsonValue | null;
    companyContext?: string;
  }): Promise<string | undefined> {
    const { workspaceId, metadata, companyContext } = params;
    const composerMetadata = this.extractComposerMetadata(metadata);
    const blocks: string[] = [];

    if (companyContext) {
      blocks.push(companyContext);
    }

    const attachmentBlock = this.buildAttachmentPromptContext(composerMetadata.attachments);
    if (attachmentBlock) {
      blocks.push(attachmentBlock);
    }

    if (workspaceId && composerMetadata.linkedProduct) {
      const linkedProductBlock = await this.buildLinkedProductPromptContext(
        workspaceId,
        composerMetadata.linkedProduct,
      );
      if (linkedProductBlock) {
        blocks.push(linkedProductBlock);
      }
    }

    return blocks.length > 0 ? blocks.join('\n\n') : undefined;
  }

  private buildStoredResponseVersions(
    metadata: Prisma.InputJsonValue | Prisma.JsonValue | null | undefined,
    fallbackContent?: string,
    fallbackVersionId?: string,
  ): StoredResponseVersion[] {
    const normalizedMetadata = this.normalizeThreadMessageMetadataRecord(metadata);
    const versions = Array.isArray(normalizedMetadata.responseVersions)
      ? normalizedMetadata.responseVersions
          .map((entry) => {
            if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
              return null;
            }

            const candidate = entry as Record<string, unknown>;
            const content = typeof candidate.content === 'string' ? candidate.content : '';
            if (!content.trim()) {
              return null;
            }

            const createdAt =
              typeof candidate.createdAt === 'string' && candidate.createdAt.trim()
                ? candidate.createdAt
                : new Date().toISOString();
            const source = candidate.source === 'regenerated' ? 'regenerated' : 'initial';
            const id =
              typeof candidate.id === 'string' && candidate.id.trim()
                ? candidate.id
                : `resp_${createdAt}`;

            return {
              id,
              content,
              createdAt,
              source,
            } satisfies StoredResponseVersion;
          })
          .filter((entry): entry is StoredResponseVersion => !!entry)
      : [];

    if (versions.length > 0) {
      return versions;
    }

    const normalizedFallback = String(fallbackContent || '');
    if (!normalizedFallback.trim()) {
      return [];
    }

    return [
      {
        id: fallbackVersionId || `resp_${Date.now()}`,
        content: normalizedFallback,
        createdAt: new Date().toISOString(),
        source: 'initial',
      },
    ];
  }

  private buildStoredProcessingTraceEntry(
    event: KloelStreamEvent,
  ): StoredProcessingTraceEntry | null {
    if (event.type === 'status') {
      const phase = event.phase === 'streaming_token' ? 'streaming' : event.phase;
      const label = String(event.message || '').trim();
      if (!label) {
        return null;
      }

      return {
        id: `trace_${phase}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
        kind: 'status',
        phase,
        label,
        createdAt: new Date().toISOString(),
      };
    }

    if (event.type === 'tool_call') {
      return {
        id: event.callId || `trace_tool_call_${Date.now()}`,
        kind: 'tool_call',
        phase: 'tool_calling',
        label: `Executando ${this.formatTraceToolLabel(event.tool)}.`,
        createdAt: new Date().toISOString(),
        tool: event.tool,
      };
    }

    if (event.type === 'tool_result') {
      return {
        id: event.callId || `trace_tool_result_${Date.now()}`,
        kind: 'tool_result',
        phase: 'tool_result',
        label: event.success
          ? `Concluiu ${this.formatTraceToolLabel(event.tool)}.`
          : `Falhou ao executar ${this.formatTraceToolLabel(event.tool)}.`,
        createdAt: new Date().toISOString(),
        tool: event.tool,
        success: event.success,
      };
    }

    return null;
  }

  private appendStoredProcessingTraceEntry(
    entries: StoredProcessingTraceEntry[],
    event: KloelStreamEvent,
  ) {
    const nextEntry = this.buildStoredProcessingTraceEntry(event);
    if (!nextEntry) {
      return;
    }

    const previousEntry = entries[entries.length - 1];
    if (
      previousEntry &&
      previousEntry.phase === nextEntry.phase &&
      previousEntry.label === nextEntry.label &&
      previousEntry.kind === nextEntry.kind
    ) {
      return;
    }

    entries.push(nextEntry);
    if (entries.length > 16) {
      entries.splice(0, entries.length - 16);
    }
  }

  private buildProcessingTraceSummary(entries: StoredProcessingTraceEntry[]): string | undefined {
    const labels = Array.from(
      new Set(
        entries
          .map((entry) =>
            String(entry.label || '')
              .replace(WHITESPACE_G_RE, ' ')
              .trim()
              .replace(TRAILING_DOTS_RE, ''),
          )
          .filter(Boolean),
      ),
    );

    if (labels.length === 0) {
      return undefined;
    }

    if (labels.length === 1) {
      return `${labels[0]}.`;
    }

    if (labels.length === 2) {
      return `${labels[0]} e ${this.lowercaseLeadingCharacter(labels[1])}.`;
    }

    const first = labels[0];
    const second = this.lowercaseLeadingCharacter(labels[1]);
    const last = this.lowercaseLeadingCharacter(labels[labels.length - 1]);
    return `${first}, ${second} e ${last}.`;
  }

  private lowercaseLeadingCharacter(value: string): string {
    if (!value) return value;
    return value.charAt(0).toLowerCase() + value.slice(1);
  }

  private touchThread(threadId: string, workspaceId: string) {
    if (typeof this.prisma.chatThread.updateMany === 'function') {
      return this.prisma.chatThread.updateMany({
        where: { id: threadId, workspaceId },
        data: { updatedAt: new Date() },
      });
    }

    return this.prisma.chatThread.update({
      where: { id: threadId },
      data: { updatedAt: new Date() },
    });
  }

  private formatTraceToolLabel(toolName?: string | null): string {
    const raw = String(toolName || 'ferramenta')
      .trim()
      .replace(SEPARATOR_G_RE, ' ')
      .replace(WHITESPACE_G_RE, ' ');

    if (!raw) {
      return 'a ferramenta';
    }

    const normalized = raw
      .split(' ')
      .map((segment) => segment.toLowerCase())
      .join(' ');

    return normalized;
  }

  private async persistUserThreadMessage(
    threadId: string,
    workspaceId: string,
    userMessage: string,
    metadata?: Prisma.InputJsonValue,
  ): Promise<{ id: string } | null> {
    if (!threadId) return null;

    const createdMessage = await this.prisma.chatMessage.create({
      data: {
        threadId,
        role: 'user',
        content: userMessage,
        metadata,
      },
      select: { id: true },
    });

    await this.touchThread(threadId, workspaceId);

    return createdMessage;
  }

  private async persistAssistantThreadMessage(
    threadId: string,
    workspaceId: string,
    assistantMessage: string,
    metadata?: Prisma.InputJsonValue,
  ): Promise<{ id: string } | null> {
    if (!threadId) return null;

    const createdMessage = await this.prisma.chatMessage.create({
      data: {
        threadId,
        role: 'assistant',
        content: assistantMessage,
        metadata,
      },
      select: { id: true },
    });

    await this.touchThread(threadId, workspaceId);

    return createdMessage;
  }

  private resolveClientRequestId(metadata?: Prisma.InputJsonValue): string | undefined {
    if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) {
      return undefined;
    }

    const rawClientRequestId = (metadata as Record<string, unknown>).clientRequestId;
    const clientRequestId = typeof rawClientRequestId === 'string' ? rawClientRequestId.trim() : '';
    return clientRequestId || undefined;
  }

  private buildStreamAbortMessage(reason: unknown, timeoutMs?: number): string {
    if (reason === KLOEL_STREAM_ABORT_REASON_TIMEOUT) {
      const timeoutSeconds =
        typeof timeoutMs === 'number' && Number.isFinite(timeoutMs)
          ? Math.max(1, Math.round(timeoutMs / 1000))
          : null;

      return timeoutSeconds
        ? `A resposta demorou mais de ${timeoutSeconds}s e eu interrompi a tentativa para não travar sua conversa. Sua mensagem foi preservada. Tente dividir o pedido em partes ou enviar de novo.`
        : 'A resposta demorou demais e eu interrompi a tentativa para não travar sua conversa. Sua mensagem foi preservada. Tente novamente.';
    }

    if (reason === KLOEL_STREAM_ABORT_REASON_CLIENT_DISCONNECTED) {
      return 'client_disconnected';
    }

    return this.unavailableMessage;
  }

  private async generateConversationTitle(message: string, workspaceId?: string): Promise<string> {
    const fallbackTitle = this.buildFallbackThreadTitle(message);

    if (!this.hasOpenAiKey() && !process.env.ANTHROPIC_API_KEY) {
      return fallbackTitle;
    }

    try {
      if (workspaceId) {
        await this.planLimits.ensureTokenBudget(workspaceId);
      }
      const response = await chatCompletionWithFallback(
        this.openai,
        {
          model: resolveBackendOpenAIModel('writer'),
          messages: [
            {
              role: 'system',
              content:
                'Crie um título curto para uma conversa. Regras: máximo 5 palavras, sem aspas, sem pontuação final, em português e objetivo.',
            },
            {
              role: 'user',
              content: `Mensagem inicial da conversa:\n${message}`,
            },
          ],
          temperature: 0.2,
          max_tokens: 24,
        },
        resolveBackendOpenAIModel('writer_fallback'),
      );
      if (workspaceId) {
        await this.planLimits
          .trackAiUsage(workspaceId, response?.usage?.total_tokens ?? 64)
          .catch(() => {});
      }

      return this.sanitizeGeneratedThreadTitle(response.choices[0]?.message?.content);
    } catch (error) {
      this.logger.warn(`Falha ao gerar título da conversa: ${String(error)}`);
      return fallbackTitle;
    }
  }

  private async maybeGenerateThreadTitle(
    threadId: string,
    currentTitle: string,
    firstUserMessage: string,
    workspaceId: string,
  ): Promise<string> {
    if (!this.isDefaultThreadTitle(currentTitle)) {
      return currentTitle;
    }

    if (!this.isSubstantiveMessage(firstUserMessage)) {
      return currentTitle;
    }

    const title = await this.generateConversationTitle(firstUserMessage, workspaceId);

    await this.prisma.chatThread.updateMany({
      where: { id: threadId, workspaceId },
      data: {
        title,
        updatedAt: new Date(),
      },
    });

    return title;
  }

  private isSubstantiveMessage(message: string): boolean {
    const normalized = String(message || '').trim();
    if (!normalized) return false;
    if (normalized.length >= 40) return true;
    if (NEWLINE_RE.test(normalized)) return true;
    if (normalized.split(WHITESPACE_RE).length >= 8) return true;
    return COMO_ESTRAT_E__GIA_F_RE.test(normalized);
  }

  private shouldUseLongFormBudget(message: string): boolean {
    const normalized = String(message || '')
      .trim()
      .toLowerCase();
    return RELAT_O__RIO_DOCUMENTO_RE.test(normalized);
  }

  private shouldAttemptToolPlanningPass(message: string): boolean {
    const normalized = String(message || '')
      .trim()
      .toLowerCase();

    if (!normalized) return false;
    if (/ideias?/.test(normalized)) return false;

    const explicitToolIntent =
      CRIE_CADASTRAR_CADASTRE_RE.test(normalized) && PRODUTO_CAT_A__LOGO_AUT_RE.test(normalized);
    return explicitToolIntent;
  }

  private detectExpertiseLevel(message: string, history: ChatMessage[] = []): ExpertiseLevel {
    const combined = [message, ...history.slice(-6).map((entry) => entry.content || '')]
      .join(' ')
      .toLowerCase();

    const expertSignals = [
      'latência',
      'backpressure',
      'idempot',
      'throughput',
      'benchmark',
      'trade-off',
      'event-driven',
      'sse',
      'webhook',
      'prisma',
      'postgres',
      'fallback',
      'observabilidade',
    ];
    const advancedSignals = [
      'api',
      'integra',
      'crm',
      'automa',
      'segmenta',
      'conversão',
      'cta',
      'pipeline',
      'copilot',
      'autopilot',
      'checkout',
      'upsell',
    ];

    const expertScore = expertSignals.filter((signal) => combined.includes(signal)).length;
    const advancedScore = advancedSignals.filter((signal) => combined.includes(signal)).length;

    if (expertScore >= 3) return 'EXPERT';
    if (expertScore >= 1 || advancedScore >= 5) return 'AVANÇADO';
    if (
      advancedScore >= 2 ||
      String(message || '')
        .trim()
        .split(WHITESPACE_RE).length >= 14
    ) {
      return 'INTERMEDIÁRIO';
    }

    return 'INICIANTE';
  }

  private buildThreadSummarySystemMessage(summary?: string): ChatCompletionMessageParam | null {
    const normalized = String(summary || '').trim();
    if (!normalized) return null;

    return {
      role: 'system',
      content: `<conversation_memory>\nResumo persistido da conversa até aqui:\n${normalized}\nUse isso para manter continuidade sem repetir perguntas já respondidas.\n</conversation_memory>`,
    };
  }

  private async buildDynamicRuntimeContext(params: {
    workspaceId?: string;
    userId?: string;
    userName?: string;
    expertiseLevel: ExpertiseLevel;
    companyContext?: string;
  }): Promise<string> {
    const { workspaceId, userId, userName, expertiseLevel, companyContext } = params;
    const baseContext = workspaceId ? await this.getWorkspaceContext(workspaceId, userId) : '';

    if (!workspaceId) {
      return [
        '<user_context>',
        `Nível de expertise detectado: ${expertiseLevel}`,
        companyContext ? `Contexto adicional: ${companyContext}` : null,
        baseContext ? `Contexto conhecido:\n${baseContext}` : null,
        '</user_context>',
      ]
        .filter(Boolean)
        .join('\n');
    }

    const countThreads =
      typeof this.prisma.chatThread.count === 'function'
        ? this.prisma.chatThread.count({ where: { workspaceId } })
        : this.prisma.chatThread
            .findFirst({
              where: { workspaceId },
              select: { id: true },
            })
            .then((thread: { id: string } | null) => (thread ? 1 : 0));

    const [workspace, agent, threadCount] = await Promise.all([
      this.prisma.workspace.findUnique({
        where: { id: workspaceId },
        select: {
          id: true,
          name: true,
          providerSettings: true,
          updatedAt: true,
        },
      }),
      userId
        ? this.prisma.agent.findFirst({
            where: { id: userId, workspaceId },
            select: {
              id: true,
              name: true,
              email: true,
              phone: true,
              provider: true,
              avatarUrl: true,
              publicName: true,
              bio: true,
              website: true,
              instagram: true,
              role: true,
              displayRole: true,
              isOnline: true,
              emailVerified: true,
              kycStatus: true,
              kycSubmittedAt: true,
              kycApprovedAt: true,
              kycRejectedReason: true,
              permissions: true,
              persona: {
                select: {
                  name: true,
                  role: true,
                },
              },
            },
          })
        : Promise.resolve(null),
      countThreads,
    ]);

    const providerSettings =
      workspace?.providerSettings && typeof workspace.providerSettings === 'object'
        ? (workspace.providerSettings as Record<string, unknown>)
        : {};
    const autopilotSettings =
      providerSettings.autopilot && typeof providerSettings.autopilot === 'object'
        ? (providerSettings.autopilot as Record<string, unknown>)
        : {};
    const whatsappConnected =
      providerSettings.whatsappConnected === true ||
      asUnknownRecord(providerSettings.whatsapp)?.connected === true ||
      asUnknownRecord(providerSettings.connection)?.status === 'connected' ||
      providerSettings.status === 'connected';

    const resolvedUserName = this.contextFormatter.sanitizeUserNameForAssistant(
      userName || agent?.name || 'Usuário',
    );
    const contextParts = [
      '<user_context>',
      `Nome do usuário: ${resolvedUserName}`,
      `Email do usuário: ${agent?.email || 'não informado'}`,
      `Workspace: ${this.getAssistantWorkspaceLabel()}`,
      `Nível de expertise detectado: ${expertiseLevel}`,
      `WhatsApp conectado: ${whatsappConnected ? 'Sim' : 'Não'}`,
      `Autopilot ativo: ${autopilotSettings.enabled === true ? 'Sim' : 'Não'}`,
      `Conversas registradas: ${threadCount}`,
      this.contextFormatter.buildAgentProfileContext(
        agent as Record<string, unknown> | null | undefined,
      ),
      `Quando fizer sentido, trate o usuário pelo primeiro nome "${resolvedUserName}" de forma natural ao longo da conversa.`,
      companyContext ? `Contexto adicional enviado pelo frontend:\n${companyContext}` : null,
      baseContext ? `Base de contexto do workspace:\n${baseContext}` : null,
      '</user_context>',
    ];

    return contextParts.filter(Boolean).join('\n');
  }

  private async maybeRefreshThreadSummary(
    threadId?: string | null,
    workspaceId?: string,
  ): Promise<void> {
    if (!threadId || !workspaceId) return;

    const findThread = this.prisma.chatThread.findFirst({
      where: { id: threadId, workspaceId },
      select: { id: true, summary: true, summaryUpdatedAt: true },
    });

    const countMessages =
      typeof this.prisma.chatMessage.count === 'function'
        ? this.prisma.chatMessage.count({ where: { threadId, thread: { workspaceId } } })
        : this.prisma.chatMessage
            .findMany({
              where: { threadId, thread: { workspaceId } },
              select: { id: true },
            })
            .then((rows: Array<{ id: string }>) => rows.length);

    const [thread, totalMessages] = await Promise.all([findThread, countMessages]);

    if (!thread || totalMessages <= this.recentThreadMessageLimit) {
      return;
    }

    const olderCount = totalMessages - this.recentThreadMessageLimit;
    const shouldRefresh =
      !thread.summary ||
      olderCount % this.threadSummaryRefreshEvery === 0 ||
      !thread.summaryUpdatedAt;

    if (!shouldRefresh) {
      return;
    }

    const olderMessages = await this.prisma.chatMessage.findMany({
      where: { threadId, thread: { workspaceId } },
      orderBy: { createdAt: 'asc' },
      take: olderCount,
      select: {
        role: true,
        content: true,
      },
    });

    if (!olderMessages.length) return;

    const transcript = olderMessages
      .map(
        (entry) =>
          `${entry.role === 'user' ? 'Usuário' : 'Kloel'}: ${String(entry.content || '').trim()}`,
      )
      .filter(Boolean)
      .join('\n');

    const fallbackSummary = transcript.slice(-2200);
    let summary = fallbackSummary;

    if (this.hasOpenAiKey()) {
      try {
        await this.planLimits.ensureTokenBudget(workspaceId);
        const response = await chatCompletionWithFallback(
          this.openai,
          {
            model: resolveBackendOpenAIModel('writer'),
            messages: [
              {
                role: 'system',
                content:
                  'Resuma a conversa em um único bloco curto, em português brasileiro, preservando fatos, preferências, objeções, decisões, itens prometidos e próximos passos. Não invente nada.',
              },
              {
                role: 'user',
                content: `Conversa para resumir:\n${transcript}`,
              },
            ],
            temperature: 0.2,
            top_p: 0.95,
            max_tokens: 320,
          },
          resolveBackendOpenAIModel('writer_fallback'),
        );
        await this.planLimits
          .trackAiUsage(workspaceId, response?.usage?.total_tokens ?? 120)
          .catch(() => {});

        summary =
          String(response.choices[0]?.message?.content || fallbackSummary).trim() ||
          fallbackSummary;
      } catch (error) {
        this.logger.warn(`Falha ao atualizar resumo da thread ${threadId}: ${String(error)}`);
      }
    }

    await this.prisma.chatThread.updateMany({
      where: { id: threadId, workspaceId },
      data: {
        summary,
        summaryUpdatedAt: new Date(),
      },
    });
  }

  private async searchWeb(query: string): Promise<WebSearchDigest> {
    const normalizedQuery = String(query || '').trim();
    if (!normalizedQuery) {
      return { answer: '', sources: [] };
    }

    // PULSE:OK — toolSearchWeb(workspaceId, ...) enforces PlanLimitsService.ensureTokenBudget()
    // before delegating to this helper; searchWeb intentionally only encapsulates provider I/O.
    const response = await this.openai.responses.create({
      model: KLOEL_SEARCH_WEB_MODEL,
      input: normalizedQuery,
      tools: [
        {
          type: 'web_search_preview',
          search_context_size: 'medium',
          user_location: {
            type: 'approximate',
            country: 'BR',
            region: 'São Paulo',
            timezone: 'America/Sao_Paulo',
          },
        },
      ],
      include: ['web_search_call.action.sources'],
    });

    const outputText = String(response.output_text || '').trim();
    const rawSources = Array.isArray(response.output)
      ? (response.output as WebSearchOutputItem[]).flatMap((item) =>
          Array.isArray(item?.action?.sources) ? item.action.sources : [],
        )
      : [];

    const seen = new Set<string>();
    const sources = rawSources
      .map((source: WebSearchSource) => ({
        title: String(source?.title || source?.name || source?.url || '').trim(),
        url: String(source?.url || '').trim(),
      }))
      .filter((source: { title: string; url: string }) => source.url)
      .filter((source: { title: string; url: string }) => {
        if (seen.has(source.url)) return false;
        seen.add(source.url);
        return true;
      })
      .slice(0, 6);

    const responseUsage = response as { usage?: { total_tokens?: number | null } };

    return {
      answer: outputText,
      sources,
      totalTokens:
        typeof responseUsage.usage?.total_tokens === 'number'
          ? responseUsage.usage.total_tokens
          : 0,
    };
  }

  private buildCapabilityPrompt(message: string, composerContext?: string) {
    const blocks = [String(message || '').trim(), composerContext?.trim()].filter(Boolean);
    return blocks.join('\n\n');
  }

  private async persistGeneratedImageAsset(params: {
    response: ImagesResponse;
    workspaceId?: string;
    filename: string;
  }): Promise<string | null> {
    const { response, workspaceId, filename } = params;
    const folder = workspaceId ? `kloel/${workspaceId}/generated-images` : 'kloel/generated-images';
    const imageBase64 = String(response?.data?.[0]?.b64_json || '').trim();

    if (imageBase64) {
      const stored = await this.storageService.upload(Buffer.from(imageBase64, 'base64'), {
        filename,
        mimeType: 'image/png',
        folder,
        workspaceId,
      });
      return stored.url;
    }

    const remoteImageUrl = String(response?.data?.[0]?.url || '').trim();
    if (!remoteImageUrl) {
      return null;
    }

    const stored = await this.storageService.uploadFromUrl(remoteImageUrl, {
      filename,
      mimeType: 'image/png',
      folder,
      workspaceId,
    });
    return stored.url;
  }

  private formatSearchDigestAsMarkdown(digest: WebSearchDigest) {
    const body = String(digest.answer || '').trim() || 'Nenhum resultado confiável foi encontrado.';
    if (!Array.isArray(digest.sources) || digest.sources.length === 0) {
      return body;
    }

    const sourcesBlock = digest.sources
      .map((source, index) => `- [${index + 1}] ${source.title || source.url} — ${source.url}`)
      .join('\n');

    return `${body}\n\nFontes:\n${sourcesBlock}`;
  }

  private async executeComposerCapability(input: {
    capability: ComposerCapability;
    message: string;
    workspaceId?: string;
    metadata?: Prisma.InputJsonValue | Prisma.JsonValue | null;
    composerContext?: string;
    signal?: AbortSignal;
  }): Promise<CapabilityExecutionResult> {
    const {
      capability,
      message,
      workspaceId,
      metadata: _metadata,
      composerContext,
      signal,
    } = input;
    const prompt = this.buildCapabilityPrompt(message, composerContext);

    if (capability === 'search_web') {
      if (workspaceId) {
        await this.planLimits.ensureTokenBudget(workspaceId);
      }

      const digest = await this.searchWeb(prompt);
      const content = this.formatSearchDigestAsMarkdown(digest);
      const usageTokens = Number(digest.totalTokens || 0);

      if (workspaceId && Number.isFinite(usageTokens) && usageTokens > 0) {
        await this.planLimits.trackAiUsage(workspaceId, usageTokens).catch(() => {});
      }

      return {
        content,
        metadata: {
          capability,
          webSources: digest.sources,
        },
        estimatedTokens: Number.isFinite(usageTokens) && usageTokens > 0 ? usageTokens : 0,
      };
    }

    if (capability === 'create_image') {
      if (!this.hasOpenAiKey()) {
        throw new Error('OPENAI_API_KEY não configurada para criar imagens.');
      }

      if (workspaceId) {
        await this.planLimits.ensureTokenBudget(workspaceId);
      }

      let response: ImagesResponse;

      try {
        const imageRequest: ImageGenerateParamsNonStreaming = {
          model: KLOEL_IMAGE_MODEL as OpenAI.Images.ImageModel,
          prompt,
          size: '1024x1024',
          n: 1,
        };
        const requestOptions: OpenAI.RequestOptions | undefined = signal ? { signal } : undefined;
        response = await this.openai.images.generate(imageRequest, requestOptions);
      } catch (error: unknown) {
        const { message: errorMessage, code: errorCode } = toErrorDescriptor(error);

        this.logger.warn(`Falha ao gerar imagem no composer: ${errorMessage || errorCode}`);

        if (
          MODEL_RE.test(errorMessage) ||
          MODEL_RE.test(errorCode) ||
          INVALID_RE.test(errorMessage)
        ) {
          throw new Error('Não foi possível gerar a imagem agora. Tente novamente.');
        }

        throw new Error('Não foi possível gerar a imagem. Tente novamente.');
      }

      const rawImageUrl = String(
        response?.data?.[0]?.url ||
          (response?.data?.[0]?.b64_json
            ? `data:image/png;base64,${response.data[0].b64_json}`
            : ''),
      ).trim();

      if (!rawImageUrl) {
        throw new Error('Não foi possível gerar a imagem. Tente novamente.');
      }

      const generatedImageFilename = `kloel-image-${workspaceId || 'workspace'}-${Date.now()}.png`;
      let imageUrl = rawImageUrl;

      try {
        const persistedImageUrl = await this.persistGeneratedImageAsset({
          response,
          workspaceId,
          filename: generatedImageFilename,
        });
        if (persistedImageUrl) {
          imageUrl = persistedImageUrl;
        }
      } catch (error: unknown) {
        const reason =
          error instanceof Error
            ? error.message
            : typeof error === 'string'
              ? error
              : 'unknown storage error';
        this.logger.warn(`Falha ao persistir imagem gerada no storage: ${reason}`);
      }

      const usageTokens = Number(response?.usage?.total_tokens || 0);

      if (workspaceId && Number.isFinite(usageTokens) && usageTokens > 0) {
        await this.planLimits.trackAiUsage(workspaceId, usageTokens).catch(() => {});
      }

      return {
        content: 'Imagem gerada e pronta para revisão.',
        metadata: {
          capability,
          generatedImageUrl: imageUrl,
          generatedImageFilename,
        },
        estimatedTokens: Number.isFinite(usageTokens) && usageTokens > 0 ? usageTokens : 0,
      };
    }

    if (capability === 'create_site') {
      if (!process.env.ANTHROPIC_API_KEY) {
        throw new Error('ANTHROPIC_API_KEY não configurada para criar sites.');
      }

      if (workspaceId) {
        await this.planLimits.ensureTokenBudget(workspaceId);
      }

      // Not SSRF: hardcoded Anthropic API endpoint
      const response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': process.env.ANTHROPIC_API_KEY,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
          model: KLOEL_SITE_MODEL,
          max_tokens: 4096,
          system: [
            'Return only valid HTML for a complete landing page.',
            'The output must be production-grade HTML with inline CSS.',
            'Keep the design aligned with Kloel: restrained, premium, ember accent, strong whitespace.',
            composerContext ? `Additional runtime context:\n${composerContext}` : null,
          ]
            .filter(Boolean)
            .join('\n'),
          messages: [{ role: 'user', content: prompt }],
        }),
        signal,
      });

      if (!response.ok) {
        const errorText = await response.text().catch(() => '');
        throw new Error(`Anthropic API error ${response.status}: ${errorText}`);
      }

      const result = await response.json();
      const html = String(result?.content?.[0]?.text || '').trim();
      if (!html) {
        throw new Error('A geração do site não retornou HTML.');
      }

      const usageTokens =
        Number(result?.usage?.input_tokens || 0) + Number(result?.usage?.output_tokens || 0);

      if (workspaceId && Number.isFinite(usageTokens) && usageTokens > 0) {
        await this.planLimits.trackAiUsage(workspaceId, usageTokens).catch(() => {});
      }

      return {
        content: 'Site gerado e pronto para revisão.',
        metadata: {
          capability,
          generatedSiteHtml: html,
        },
        estimatedTokens: Number.isFinite(usageTokens) && usageTokens > 0 ? usageTokens : 0,
      };
    }

    throw new Error('Capacidade do composer não suportada.');
  }

  /**
   * 🧠 KLOEL THINKER - Processa mensagens com streaming
   * Retorna resposta em tempo real via SSE
   */
  async think(
    request: ThinkRequest,
    res: Response,
    opts?: { signal?: AbortSignal; timeoutMs?: number },
  ): Promise<void> {
    const {
      message,
      workspaceId,
      userId,
      userName: requestedUserName,
      conversationId,
      mode = 'chat',
      companyContext,
      metadata,
    } = request;

    const signal = opts?.signal;
    const isAborted = () => !!signal?.aborted;
    const abortReason = () => signal?.reason;
    const isClientDisconnected = () =>
      abortReason() === KLOEL_STREAM_ABORT_REASON_CLIENT_DISCONNECTED;
    const streamWriter = new KloelStreamWriter(res, {
      signal,
      logger: this.logger,
    });
    const processingTraceEntries: StoredProcessingTraceEntry[] = [];
    const safeWrite = (event: KloelStreamEvent) => {
      this.appendStoredProcessingTraceEntry(processingTraceEntries, event);
      streamWriter.write(event);
    };
    streamWriter.init();

    try {
      // If no AI key is configured, return a helpful message instead of 500
      if (!this.hasOpenAiKey() && !process.env.ANTHROPIC_API_KEY) {
        safeWrite(
          createKloelErrorEvent({
            content:
              'Assistente IA não disponível no momento. Configure OPENAI_API_KEY ou ANTHROPIC_API_KEY para habilitar o Kloel.',
            error: 'ai_api_key_missing',
            done: true,
          }),
        );
        streamWriter.close();
        return;
      }

      if (isAborted()) {
        if (!isClientDisconnected()) {
          safeWrite(
            createKloelErrorEvent({
              content: this.buildStreamAbortMessage(abortReason(), opts?.timeoutMs),
              error:
                typeof abortReason() === 'string' ? abortReason() : 'request_aborted_before_start',
              done: true,
            }),
          );
        }
        streamWriter.close();
        return;
      }

      // Buscar contexto da empresa se tiver workspaceId
      const composerMetadata = this.extractComposerMetadata(metadata);
      const composerCapability = this.resolveComposerCapability(
        message,
        mode,
        composerMetadata.capability,
      );
      const enrichedCompanyContext = await this.buildComposerContext({
        workspaceId,
        metadata,
        companyContext,
      });
      const marketingPromptAddendum = await this.buildMarketingPromptAddendum(
        workspaceId,
        mode,
        message,
      );
      const effectiveCompanyContext =
        [enrichedCompanyContext, marketingPromptAddendum].filter(Boolean).join('\n\n') || undefined;
      let context = enrichedCompanyContext || '';
      let companyName = 'sua empresa';
      let userName = 'Usuário';
      const thread =
        workspaceId && mode === 'chat'
          ? await this.resolveThread(workspaceId, conversationId)
          : null;

      if (workspaceId) {
        const [workspace, agent] = await Promise.all([
          this.prisma.workspace.findUnique({
            where: { id: workspaceId },
          }),
          userId
            ? this.prisma.agent.findFirst({
                where: { id: userId, workspaceId },
                select: { name: true },
              })
            : Promise.resolve(null),
        ]);
        if (workspace) {
          companyName = 'sua empresa';
          // Buscar memória/contexto salvo
          context = await this.getWorkspaceContext(workspaceId, userId);
          if (enrichedCompanyContext) {
            context = [context, enrichedCompanyContext].filter(Boolean).join('\n\n');
          }
        }
        userName = this.contextFormatter.sanitizeUserNameForAssistant(
          requestedUserName || agent?.name || userName,
        );
      }

      const historyState = thread?.id
        ? await this.getThreadConversationState(thread.id, workspaceId)
        : { recentMessages: [], totalMessages: 0 };
      const expertiseLevel = this.detectExpertiseLevel(message, historyState.recentMessages);
      const dynamicContext = await this.buildDynamicRuntimeContext({
        workspaceId,
        userId,
        userName,
        expertiseLevel,
        companyContext: enrichedCompanyContext,
      });
      const summaryMessage = this.buildThreadSummarySystemMessage(historyState.summary);
      const shouldPlanWithTools =
        mode === 'chat' && !!workspaceId && this.shouldAttemptToolPlanningPass(message);
      const usesLongFormBudget = this.shouldUseLongFormBudget(message);
      const responseTemperature = 0.7;
      const responseMaxTokens = usesLongFormBudget ? 4096 : 2048;
      const clientRequestId = this.resolveClientRequestId(metadata);

      // Selecionar o system prompt baseado no modo
      let systemPrompt: string;
      switch (mode) {
        case 'onboarding':
          systemPrompt = KLOEL_ONBOARDING_PROMPT;
          break;
        case 'sales':
          systemPrompt = KLOEL_SALES_PROMPT(companyName, context);
          break;
        default:
          systemPrompt = this.buildDashboardPrompt({
            userName,
            workspaceName: companyName,
            expertiseLevel,
          });
      }

      if (thread?.id) {
        safeWrite(createKloelThreadEvent(thread.id, thread.title));
      }

      const persistedUserMessage = thread?.id
        ? await this.persistUserThreadMessage(
            thread.id,
            workspaceId,
            message,
            this.buildThreadMessageMetadata(metadata, {
              clientRequestId,
              mode,
              transport: 'sse',
              requestState: 'accepted',
            }),
          )
        : null;

      if (mode === 'chat' && composerCapability) {
        safeWrite(createKloelStatusEvent('thinking'));

        const capabilityResult = await this.executeComposerCapability({
          capability: composerCapability,
          message,
          workspaceId,
          metadata,
          composerContext: effectiveCompanyContext,
          signal,
        });

        safeWrite(createKloelStatusEvent('streaming_token'));
        safeWrite(createKloelContentEvent(capabilityResult.content));

        if (thread?.id && workspaceId) {
          await this.persistAssistantThreadMessage(
            thread.id,
            workspaceId,
            capabilityResult.content,
            this.buildThreadMessageMetadata(undefined, {
              clientRequestId,
              mode,
              transport: 'sse',
              requestState: 'completed',
              replyToMessageId: persistedUserMessage?.id,
              capability: composerCapability,
              ...(capabilityResult.metadata || {}),
            }),
          );
          await this.maybeRefreshThreadSummary(thread.id, workspaceId);
          const title = await this.maybeGenerateThreadTitle(
            thread.id,
            thread.title,
            message,
            workspaceId,
          );
          safeWrite(createKloelThreadEvent(thread.id, title));
        }

        if (workspaceId) {
          await this.conversationStore.saveMessage(workspaceId, 'user', message);
          await this.conversationStore.saveMessage(
            workspaceId,
            'assistant',
            capabilityResult.content,
          );
        }

        safeWrite(createKloelDoneEvent());
        streamWriter.close();
        return;
      }

      // Montar mensagens para a API
      const messages = this.buildChatModelMessages({
        systemPrompt,
        dynamicContext,
        marketingPromptAddendum,
        summaryMessage,
        recentMessages: historyState.recentMessages,
        userMessage: message,
      });

      const streamWriterResponse = (
        writerMessages: ChatCompletionMessageParam[],
        temperature: number,
        labels?: { thinkingLabel?: string; streamingLabel?: string },
      ) =>
        streamWriter.streamModelResponse({
          openai: this.openai,
          writerMessages,
          temperature,
          responseMaxTokens,
          thinkingLabel: labels?.thinkingLabel,
          streamingLabel: labels?.streamingLabel,
        });

      const finalizeSuccessfulReply = async (assistantText: string, estimatedTokens: number) => {
        const normalizedAssistantText = assistantText.trim() || this.unavailableMessage;
        const completedAt = new Date().toISOString();
        const responseVersions: StoredResponseVersion[] = [
          {
            id: clientRequestId
              ? `resp_${clientRequestId}`
              : `resp_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
            content: normalizedAssistantText,
            createdAt: completedAt,
            source: 'initial',
          },
        ];

        if (workspaceId) {
          await this.planLimits.trackAiUsage(workspaceId, estimatedTokens).catch(() => {});
        }

        if (thread?.id && workspaceId) {
          await this.persistAssistantThreadMessage(
            thread.id,
            workspaceId,
            normalizedAssistantText,
            this.buildThreadMessageMetadata(undefined, {
              clientRequestId,
              mode,
              transport: 'sse',
              requestState: 'completed',
              replyToMessageId: persistedUserMessage?.id,
              responseVersions,
              activeResponseVersionIndex: Math.max(responseVersions.length - 1, 0),
              processingTrace: processingTraceEntries,
              processingSummary: this.buildProcessingTraceSummary(processingTraceEntries),
            }),
          );
          await this.maybeRefreshThreadSummary(thread.id, workspaceId);
          const title = await this.maybeGenerateThreadTitle(
            thread.id,
            thread.title,
            message,
            workspaceId,
          );
          safeWrite(createKloelThreadEvent(thread.id, title));
        }

        if (workspaceId) {
          await this.conversationStore.saveMessage(workspaceId, 'user', message);
          await this.conversationStore.saveMessage(
            workspaceId,
            'assistant',
            normalizedAssistantText,
          );
        }

        safeWrite(createKloelDoneEvent());
        streamWriter.close();
      };

      // No modo 'chat', habilitar tool-calling para executar ações
      if (mode === 'chat' && workspaceId && shouldPlanWithTools) {
        // Só paga o custo do planning pass quando a mensagem realmente parece pedir ação/tool use.
        safeWrite(createKloelStatusEvent('thinking'));
        await this.planLimits.ensureTokenBudget(workspaceId);
        const initialResponse = await chatCompletionWithFallback(
          this.openai,
          {
            model: resolveBackendOpenAIModel('brain'),
            messages,
            tools: KLOEL_CHAT_TOOLS,
            tool_choice: 'auto',
            temperature: responseTemperature,
            top_p: 0.95,
            frequency_penalty: 0.3,
            presence_penalty: 0.2,
            max_tokens: responseMaxTokens,
          },
          resolveBackendOpenAIModel('brain_fallback'),
          { maxRetries: 3, initialDelayMs: 500 }, // idempotent: LLM calls are safe to retry (no side effects)
          signal ? { signal } : undefined,
        );
        await this.planLimits
          .trackAiUsage(workspaceId, initialResponse?.usage?.total_tokens ?? 500)
          .catch(() => {});

        const assistantMessage = initialResponse.choices[0]?.message;
        const assistantText = assistantMessage?.content || '';

        // Se houver tool_calls, executá-las e depois pedir ao modelo a resposta final usando os resultados
        if (assistantMessage?.tool_calls && assistantMessage.tool_calls.length > 0) {
          const { toolMessages, usedSearchWeb } = await this.toolRouter.executeAssistantToolCalls({
            assistantMessage,
            workspaceId,
            userId,
            safeWrite,
            executeLocalTool: this.executeTool.bind(this),
          });

          const finalResponseTemperature = usedSearchWeb ? 0.1 : responseTemperature;

          if (workspaceId) await this.planLimits.ensureTokenBudget(workspaceId);
          const streamedFinal = await streamWriterResponse(
            this.buildChatModelMessages({
              systemPrompt,
              dynamicContext,
              marketingPromptAddendum,
              summaryMessage,
              recentMessages: historyState.recentMessages,
              userMessage: message,
              assistantMessage,
              toolMessages,
            }),
            finalResponseTemperature,
            {},
          );
          if (!streamedFinal) {
            return;
          }

          let finalResponse = streamedFinal.fullResponse.trim();
          if (!finalResponse) {
            finalResponse =
              'Fechei a ação, mas a resposta veio vazia. Me chama de novo que eu continuo do ponto certo.';
            safeWrite(
              createKloelErrorEvent({
                content: finalResponse,
                error: 'empty_stream',
                done: false,
              }),
            );
          }
          await finalizeSuccessfulReply(finalResponse, streamedFinal.estimatedTokens);
          return;
        }

        // Sem tool_calls: usar stream real da resposta final para manter digitação progressiva
        await this.planLimits.ensureTokenBudget(workspaceId);
        const streamedReply = await streamWriterResponse(messages, responseTemperature, {});
        if (!streamedReply) {
          return;
        }

        let fallbackAssistantText = streamedReply.fullResponse.trim();
        if (!fallbackAssistantText) {
          fallbackAssistantText =
            assistantText ||
            'Eu li o que você mandou, mas a resposta saiu vazia aqui. Manda de novo que eu sigo.';
          safeWrite(
            createKloelErrorEvent({
              content: fallbackAssistantText,
              error: 'empty_stream',
              done: false,
            }),
          );
        }
        await finalizeSuccessfulReply(fallbackAssistantText, streamedReply.estimatedTokens);
        return;
      }

      // Chamar OpenAI com streaming para a resposta final
      if (workspaceId) await this.planLimits.ensureTokenBudget(workspaceId);
      safeWrite(createKloelStatusEvent('thinking'));
      const streamedReply = await streamWriterResponse(messages, responseTemperature, {});
      if (!streamedReply) {
        return;
      }

      let fullResponse = streamedReply.fullResponse;

      // Sinalizar fim do stream
      if (!fullResponse.trim()) {
        safeWrite(
          createKloelErrorEvent({
            content: this.unavailableMessage,
            error: 'empty_stream',
            done: false,
          }),
        );
        fullResponse = this.unavailableMessage;
      }
      await finalizeSuccessfulReply(fullResponse, streamedReply.estimatedTokens);
    } catch (error) {
      this.logger.error('Erro no KLOEL Thinker:', error);
      if (!isClientDisconnected()) {
        const errorCode =
          typeof abortReason() === 'string' ? String(abortReason()) : 'Erro ao processar mensagem';
        const errorContent = isAborted()
          ? this.buildStreamAbortMessage(abortReason(), opts?.timeoutMs)
          : this.unavailableMessage;

        safeWrite(
          createKloelErrorEvent({
            content: errorContent,
            error: errorCode,
            done: true,
          }),
        );
      }
      streamWriter.close();
    }
  }

  /**
   * 🔧 Executa uma ferramenta do chat
   */
  private async executeTool(
    workspaceId: string,
    toolName: string,
    args: UnknownRecord,
    userId?: string,
  ): Promise<ToolResult> {
    this.logger.log(`Executando ferramenta: ${toolName}`, args);

    try {
      switch (toolName) {
        case 'save_product':
          return await this.toolSaveProduct(workspaceId, args as ToolSaveProductArgs);

        case 'list_products':
          return await this.toolListProducts(workspaceId);

        case 'delete_product':
          return await this.toolDeleteProduct(workspaceId, args as ToolDeleteProductArgs);

        case 'toggle_autopilot':
          return await this.toolToggleAutopilot(workspaceId, args as ToolToggleAutopilotArgs);

        case 'set_brand_voice':
          return await this.toolSetBrandVoice(workspaceId, args as ToolSetBrandVoiceArgs);

        case 'remember_user_info':
          return await this.toolRememberUserInfo(
            workspaceId,
            args as ToolRememberUserInfoArgs,
            userId,
          );

        case 'search_web':
          return await this.toolSearchWeb(workspaceId, args as ToolSearchWebArgs);

        case 'create_flow':
          return await this.toolCreateFlow(workspaceId, args as ToolCreateFlowArgs);

        case 'list_flows':
          return await this.toolListFlows(workspaceId);

        case 'get_dashboard_summary':
          return await this.toolGetDashboardSummary(workspaceId, args as ToolDashboardSummaryArgs);

        case 'create_payment_link': {
          const paymentResult = await this.smartPaymentService.createSmartPayment({
            workspaceId,
            amount: Number(args.amount) || 0,
            productName: typeof args.description === 'string' ? args.description : '',
            customerName: typeof args.customerName === 'string' ? args.customerName : 'Cliente',
            phone: '',
          });
          return { success: true, ...paymentResult };
        }

        case 'connect_whatsapp':
          return await this.toolConnectWhatsapp(workspaceId);

        case 'get_whatsapp_status':
          return await this.toolGetWhatsAppStatus(workspaceId);

        case 'send_whatsapp_message':
          return await this.toolSendWhatsAppMessage(
            workspaceId,
            args as ToolSendWhatsAppMessageArgs,
          );

        case 'list_whatsapp_contacts':
          return await this.toolListWhatsAppContacts(workspaceId, args as ToolPaginationArgs);

        case 'create_whatsapp_contact':
          return await this.toolCreateWhatsAppContact(
            workspaceId,
            args as ToolCreateWhatsAppContactArgs,
          );

        case 'list_whatsapp_chats':
          return await this.toolListWhatsAppChats(workspaceId, args as ToolPaginationArgs);

        case 'get_whatsapp_messages':
          return await this.toolGetWhatsAppMessages(
            workspaceId,
            args as ToolGetWhatsAppMessagesArgs,
          );

        case 'get_whatsapp_backlog':
          return await this.toolGetWhatsAppBacklog(workspaceId);

        case 'set_whatsapp_presence':
          return await this.toolSetWhatsAppPresence(
            workspaceId,
            args as ToolSetWhatsAppPresenceArgs,
          );

        case 'sync_whatsapp_history':
          return await this.toolSyncWhatsAppHistory(
            workspaceId,
            args as ToolSyncWhatsAppHistoryArgs,
          );

        case 'list_leads':
          return await this.toolListLeads(workspaceId, args as ToolListLeadsArgs);

        case 'get_lead_details':
          return await this.toolGetLeadDetails(workspaceId, args as ToolGetLeadDetailsArgs);

        case 'save_business_info':
          return await this.toolSaveBusinessInfo(workspaceId, args as ToolSaveBusinessInfoArgs);

        case 'set_business_hours':
          return await this.toolSetBusinessHours(workspaceId, args as ToolSetBusinessHoursArgs);

        case 'create_campaign':
          return await this.toolCreateCampaign(workspaceId, args as ToolCreateCampaignArgs);

        // === MÍDIA (AUDIO/DOCUMENTO/VOZ) ===
        case 'send_audio':
          return await this.toolSendAudio(workspaceId, args as ToolSendAudioArgs);

        case 'send_document':
          return await this.toolSendDocument(workspaceId, args as ToolSendDocumentArgs);

        case 'send_voice_note':
          return await this.toolSendVoiceNote(workspaceId, args as ToolSendAudioArgs);

        case 'transcribe_audio':
          return await this.toolTranscribeAudio(workspaceId, args as ToolTranscribeAudioArgs);

        // === BILLING ===
        case 'update_billing_info':
          return await this.toolUpdateBillingInfo(workspaceId, args as ToolUpdateBillingInfoArgs);

        case 'get_billing_status':
          return await this.toolGetBillingStatus(workspaceId);

        case 'change_plan':
          return await this.toolChangePlan(workspaceId, args as ToolChangePlanArgs);

        default:
          return {
            success: false,
            error: `Ferramenta desconhecida: ${toolName}`,
          };
      }
    } catch (error: unknown) {
      const errorInstanceofError =
        error instanceof Error
          ? error
          : new Error(typeof error === 'string' ? error : 'unknown error');
      this.logger.error(`Erro ao executar ferramenta ${toolName}:`, error);
      return { success: false, error: errorInstanceofError.message };
    }
  }

  /**
   * 📦 Cadastrar produto
   */
  private async toolSaveProduct(
    workspaceId: string,
    args: ToolSaveProductArgs,
  ): Promise<ToolResult> {
    const product = await this.prisma.product.create({
      data: {
        workspaceId,
        name: args.name,
        price: args.price,
        description: args.description || '',
        active: true,
      },
    });
    return {
      success: true,
      product,
      message: `Produto "${args.name}" cadastrado com sucesso!`,
    };
  }

  /**
   * 📋 Listar produtos
   */
  private async toolListProducts(workspaceId: string): Promise<ToolResult> {
    const products = filterLegacyProducts(
      await this.prisma.product.findMany({
        where: { workspaceId, active: true },
        select: {
          id: true,
          name: true,
          price: true,
          description: true,
          status: true,
        },
        orderBy: { name: 'asc' },
        take: 100,
      }),
    );

    if (products.length === 0) {
      return { success: true, message: 'Nenhum produto cadastrado ainda.' };
    }

    const list = products.map((p) => `- ${p.name}: R$ ${p.price}`).join('\n');
    return {
      success: true,
      products,
      message: `Aqui estão seus produtos:\n\n${list}`,
    };
  }

  /**
   * 🗑️ Deletar produto
   */
  private async toolDeleteProduct(
    workspaceId: string,
    args: ToolDeleteProductArgs,
  ): Promise<ToolResult> {
    const { productId, productName } = args;

    const where: Prisma.ProductWhereInput = { workspaceId };
    if (productId) where.id = productId;
    else if (productName) where.name = { contains: productName, mode: 'insensitive' };

    const product = await this.prisma.product.findFirst({ where });

    if (!product) {
      return { success: false, error: 'Produto não encontrado.' };
    }

    await this.prisma.product.updateMany({
      where: { id: product.id, workspaceId },
      data: { active: false }, // Soft delete
    });

    return {
      success: true,
      message: `Produto "${product.name}" removido com sucesso.`,
    };
  }

  /**
   * 🤖 Toggle Autopilot
   */
  private async toolToggleAutopilot(
    workspaceId: string,
    args: ToolToggleAutopilotArgs,
  ): Promise<ToolResult> {
    const workspace = await this.prisma.workspace.findUnique({
      where: { id: workspaceId },
      select: { providerSettings: true },
    });

    const currentSettings = (workspace?.providerSettings as Record<string, unknown>) || {};

    if (args.enabled && currentSettings.billingSuspended === true) {
      return {
        success: false,
        enabled: false,
        error: 'Autopilot suspenso: regularize cobrança para ativar.',
      };
    }

    const newSettings = {
      ...currentSettings,
      autopilot: {
        ...((currentSettings.autopilot as Record<string, unknown>) || {}),
        enabled: args.enabled,
      },
      autopilotEnabled: args.enabled, // compat
    };

    await this.prisma.workspace.update({
      where: { id: workspaceId },
      data: { providerSettings: newSettings as Prisma.InputJsonValue },
    });

    return {
      success: true,
      enabled: args.enabled,
      message: args.enabled ? 'Autopilot ativado.' : 'Autopilot desativado.',
    };
  }

  /**
   * 🎭 Definir tom de voz
   */
  private async toolSetBrandVoice(
    workspaceId: string,
    args: ToolSetBrandVoiceArgs,
  ): Promise<ToolResult> {
    await this.prisma.kloelMemory.upsert({
      where: {
        workspaceId_key: {
          workspaceId,
          key: 'brandVoice',
        },
      },
      update: {
        value: {
          style: args.tone,
          personality: args.personality || '',
        },
        category: 'preferences',
        type: 'persona',
        content: `Tom: ${args.tone}. ${args.personality || ''}`.trim(),
        metadata: { tone: args.tone, personality: args.personality || '' },
      },
      create: {
        workspaceId,
        key: 'brandVoice',
        value: {
          style: args.tone,
          personality: args.personality || '',
        },
        category: 'preferences',
        type: 'persona',
        content: `Tom: ${args.tone}. ${args.personality || ''}`.trim(),
        metadata: { tone: args.tone, personality: args.personality || '' },
      },
    });
    return {
      success: true,
      message: `Tom de voz definido como "${args.tone}"`,
    };
  }

  private async toolRememberUserInfo(
    workspaceId: string,
    args: ToolRememberUserInfoArgs,
    userId?: string,
  ): Promise<ToolResult> {
    const normalizedKey = String(args?.key || '')
      .trim()
      .toLowerCase()
      .replace(NON_SLUG_CHAR_RE, '_')
      .slice(0, 80);
    const value = String(args?.value || '').trim();

    if (!normalizedKey || !value) {
      return {
        success: false,
        error: 'missing_user_memory_payload',
      };
    }

    const profileKey = `user_profile:${userId || 'workspace_owner'}`;

    const existing = await this.prisma.kloelMemory.findUnique({
      where: {
        workspaceId_key: {
          workspaceId,
          key: profileKey,
        },
      },
    });

    const currentValue =
      existing?.value && typeof existing.value === 'object'
        ? (existing.value as Record<string, Prisma.JsonValue>)
        : {};

    const nextValue: Record<string, Prisma.JsonValue> = {
      ...currentValue,
      [normalizedKey]: value,
      updatedAt: new Date().toISOString(),
      userId: userId || null,
    };

    await this.prisma.kloelMemory.upsert({
      where: {
        workspaceId_key: {
          workspaceId,
          key: profileKey,
        },
      },
      update: {
        value: nextValue,
        category: 'user_preferences',
        type: 'user_profile',
        content: Object.entries(nextValue)
          .filter(([key]) => !['updatedAt', 'userId'].includes(key))
          .map(([key, current]) => key + ': ' + safeStr(current))
          .join('\n'),
        metadata: {
          ...((existing?.metadata as Record<string, unknown>) || {}),
          userId: userId || null,
          source: 'remember_user_info',
        },
      },
      create: {
        workspaceId,
        key: profileKey,
        value: nextValue,
        category: 'user_preferences',
        type: 'user_profile',
        content: Object.entries(nextValue)
          .filter(([key]) => !['updatedAt', 'userId'].includes(key))
          .map(([key, current]) => key + ': ' + safeStr(current))
          .join('\n'),
        metadata: {
          userId: userId || null,
          source: 'remember_user_info',
        },
      },
    });

    return {
      success: true,
      message: `Memória "${normalizedKey}" salva.`,
    };
  }

  private async toolSearchWeb(workspaceId: string, args: ToolSearchWebArgs): Promise<ToolResult> {
    const query = String(args?.query || '').trim();
    if (!query) {
      return { success: false, error: 'missing_query' };
    }

    try {
      await this.planLimits.ensureTokenBudget(workspaceId);
      const digest = await this.searchWeb(query);
      await this.planLimits
        .trackAiUsage(workspaceId, Math.max(180, Math.ceil(digest.answer.length / 4)))
        .catch(() => {});

      return {
        success: true,
        query,
        summary: digest.answer,
        sources: digest.sources,
      };
    } catch (error: unknown) {
      const errorInstanceofError =
        error instanceof Error
          ? error
          : new Error(typeof error === 'string' ? error : 'unknown error');
      this.logger.warn(
        `Falha em search_web para "${query}": ${String(errorInstanceofError.message)}`,
      );
      return {
        success: false,
        error: errorInstanceofError?.message || 'web_search_failed',
      };
    }
  }

  /**
   * ⚡ Criar fluxo simples
   */
  private async toolCreateFlow(workspaceId: string, args: ToolCreateFlowArgs): Promise<ToolResult> {
    // Criar um fluxo básico com nó de mensagem
    const nodes = [
      {
        id: 'start',
        type: 'trigger',
        position: { x: 100, y: 100 },
        data: { trigger: args.trigger },
      },
      {
        id: 'msg1',
        type: 'message',
        position: { x: 100, y: 200 },
        data: { message: args.actions?.[0] || 'Olá!' },
      },
    ];

    const edges = [{ id: 'e1', source: 'start', target: 'msg1' }];

    const flow = await this.prisma.flow.create({
      data: {
        workspaceId,
        name: args.name,
        description: `Fluxo criado via chat: ${args.trigger}`,
        nodes,
        edges,
        isActive: true,
      },
    });

    return {
      success: true,
      flow,
      message: `Fluxo "${args.name}" criado com sucesso!`,
    };
  }

  /**
   * 📊 Resumo do dashboard
   */
  private async toolGetDashboardSummary(
    workspaceId: string,
    args: ToolDashboardSummaryArgs,
  ): Promise<ToolResult> {
    const period = args.period || 'today';
    let dateFilter: Date;

    switch (period) {
      case 'week':
        dateFilter = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
        break;
      case 'month':
        dateFilter = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
        break;
      default:
        dateFilter = new Date();
        dateFilter.setHours(0, 0, 0, 0);
    }

    const [contacts, messages, flows] = await Promise.all([
      this.prisma.contact.count({
        where: { workspaceId, createdAt: { gte: dateFilter } },
      }),
      this.prisma.message.count({
        where: { workspaceId, createdAt: { gte: dateFilter } },
      }),
      this.prisma.flow.count({ where: { workspaceId, isActive: true } }),
    ]);

    return {
      success: true,
      period,
      stats: {
        newContacts: contacts,
        messages,
        activeFlows: flows,
      },
    };
  }

  /**
   * 📋 Lista fluxos de automação
   */
  private async toolListFlows(workspaceId: string): Promise<ToolResult> {
    const flows = await this.prisma.flow.findMany({
      where: { workspaceId },
      select: {
        id: true,
        name: true,
        isActive: true,
        createdAt: true,
        _count: { select: { executions: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: 10,
    });

    return {
      success: true,
      flows: flows.map((f) => ({
        id: f.id,
        name: f.name,
        active: f.isActive,
        executions: f._count.executions,
      })),
      message: `Você tem ${flows.length} fluxo(s) cadastrado(s).`,
    };
  }

  /**
   * 📱 Conectar WhatsApp (Gera QR Code)
   */
  private async toolConnectWhatsapp(workspaceId: string): Promise<ToolResult> {
    try {
      const result = await this.providerRegistry.startSession(workspaceId);

      if (result.message === 'already_connected') {
        return {
          success: true,
          connected: true,
          message: 'WhatsApp já conectado.',
        };
      }

      if (result.success && result.authUrl) {
        return {
          success: true,
          connectionRequired: true,
          authUrl: result.authUrl,
          message: 'Conclua a conexão oficial da Meta para ativar o canal do WhatsApp.',
        };
      }

      return {
        success: !!result.success,
        message:
          result.message ||
          'Não foi possível iniciar a conexão oficial da Meta. Tente novamente em instantes.',
      };
    } catch (error: unknown) {
      const errorInstanceofError =
        error instanceof Error
          ? error
          : new Error(typeof error === 'string' ? error : 'unknown error');
      this.logger.error('Erro ao conectar WhatsApp:', error);
      return { success: false, error: errorInstanceofError.message };
    }
  }

  /**
   * 📱 Status do WhatsApp
   */
  private async toolGetWhatsAppStatus(workspaceId: string): Promise<ToolResult> {
    const connStatus = await this.providerRegistry.getSessionStatus(workspaceId);
    const connected = connStatus?.connected === true;

    if (connected) {
      return {
        success: true,
        connected: true,
        phoneNumber: connStatus?.phoneNumber || null,
        status: connStatus?.status,
        message: `WhatsApp conectado${connStatus?.phoneNumber ? ` (${connStatus.phoneNumber})` : ''}.`,
      };
    }

    return {
      success: true,
      connected: false,
      status: connStatus?.status || 'disconnected',
      authUrl: connStatus?.authUrl || null,
      phoneNumberId: connStatus?.phoneNumberId || null,
      degradedReason: connStatus?.degradedReason || null,
      connectionRequired: true,
      message: 'WhatsApp não conectado. Conclua a conexão oficial da Meta para ativar o canal.',
    };
  }

  /**
   * 💬 Enviar mensagem WhatsApp
   */
  private async toolSendWhatsAppMessage(
    workspaceId: string,
    args: ToolSendWhatsAppMessageArgs,
  ): Promise<ToolResult> {
    const { phone, message } = args;

    // Normalizar telefone
    const normalizedPhone = phone.replace(NON_DIGIT_RE, '');

    const status = await this.providerRegistry.getSessionStatus(workspaceId);
    if (!status.connected) {
      return {
        success: false,
        error: 'WhatsApp não está conectado. Conclua a conexão oficial da Meta antes de enviar.',
        authUrl: status.authUrl || null,
      };
    }

    // Buscar ou criar contato
    let contact = await this.prisma.contact.findFirst({
      where: { workspaceId, phone: { contains: normalizedPhone } },
    });

    if (!contact) {
      contact = await this.prisma.contact.create({
        data: { workspaceId, phone: normalizedPhone, name: 'Via KLOEL' },
      });
    }

    // Criar mensagem no banco
    const msg = await this.prisma.message.create({
      data: {
        workspaceId,
        contactId: contact.id,
        direction: 'OUTBOUND',
        type: 'TEXT',
        content: message,
        status: 'PENDING',
      },
    });

    // Enviar via WhatsappService (que coloca na fila)
    // messageLimit: enforced via PlanLimitsService.trackMessageSend
    try {
      await this.whatsappService.sendMessage(workspaceId, normalizedPhone, message);

      await this.prisma.message.updateMany({
        where: { id: msg.id, workspaceId },
        data: { status: 'SENT' },
      });

      return {
        success: true,
        messageId: msg.id,
        message: `Mensagem enviada para ${normalizedPhone}.`,
      };
    } catch (error: unknown) {
      const errorInstanceofError =
        error instanceof Error
          ? error
          : new Error(typeof error === 'string' ? error : 'unknown error');
      await this.prisma.message.updateMany({
        where: { id: msg.id, workspaceId },
        data: { status: 'FAILED' },
      });

      return {
        success: false,
        error: `Falha ao enviar mensagem: ${errorInstanceofError.message}`,
      };
    }
  }

  /**
   * 👥 Lista contatos operacionais do WhatsApp/CRM
   */
  private async toolListWhatsAppContacts(
    workspaceId: string,
    args: ToolPaginationArgs,
  ): Promise<ToolResult> {
    const limit = Math.max(1, Math.min(200, Number(args?.limit || 50) || 50));
    const contacts = await this.whatsappService.listContacts(workspaceId);
    const sliced = contacts.slice(0, limit);

    return {
      success: true,
      count: contacts.length,
      contacts: sliced,
      message:
        contacts.length > 0
          ? `Encontrei ${contacts.length} contato(s) acessíveis no WhatsApp/CRM.`
          : 'Não encontrei contatos acessíveis no momento.',
    };
  }

  /**
   * ➕ Cria/atualiza contato operacional
   */
  private async toolCreateWhatsAppContact(
    workspaceId: string,
    args: ToolCreateWhatsAppContactArgs,
  ): Promise<ToolResult> {
    const contact = await this.whatsappService.createContact(workspaceId, {
      phone: args?.phone,
      name: args?.name,
      email: args?.email,
    });

    return {
      success: true,
      contact,
      message: `Contato ${contact.name || contact.phone} pronto para uso pela IA.`,
    };
  }

  /**
   * 💬 Lista chats reais do WhatsApp
   */
  private async toolListWhatsAppChats(
    workspaceId: string,
    args: ToolPaginationArgs,
  ): Promise<ToolResult> {
    const limit = Math.max(1, Math.min(200, Number(args?.limit || 50) || 50));
    const chats = await this.whatsappService.listChats(workspaceId);
    const sliced = chats.slice(0, limit);
    const pending = chats.filter((chat) => Number(chat.unreadCount || 0) > 0);

    return {
      success: true,
      count: chats.length,
      pendingConversations: pending.length,
      pendingMessages: pending.reduce((sum, chat) => sum + (Number(chat.unreadCount || 0) || 0), 0),
      chats: sliced,
      message:
        chats.length > 0
          ? `Encontrei ${chats.length} conversa(s), com ${pending.length} pendente(s).`
          : 'Não encontrei conversas no WhatsApp.',
    };
  }

  /**
   * 🕘 Lê histórico completo de uma conversa
   */
  private async toolGetWhatsAppMessages(
    workspaceId: string,
    args: ToolGetWhatsAppMessagesArgs,
  ): Promise<ToolResult> {
    const chatId = String(args?.chatId || args?.phone || '').trim();
    if (!chatId) {
      return {
        success: false,
        error: 'Informe chatId ou phone para ler as mensagens.',
      };
    }

    const messages = await this.whatsappService.getChatMessages(workspaceId, chatId, {
      limit: Number(args?.limit || 100) || 100,
      offset: Number(args?.offset || 0) || 0,
    });

    return {
      success: true,
      count: messages.length,
      chatId,
      messages,
      message:
        messages.length > 0
          ? `Recuperei ${messages.length} mensagem(ns) da conversa ${chatId}.`
          : `Não encontrei mensagens para ${chatId}.`,
    };
  }

  /**
   * 📊 Conta backlog real do WhatsApp
   */
  private async toolGetWhatsAppBacklog(workspaceId: string): Promise<ToolResult> {
    const backlog = await this.whatsappService.getBacklog(workspaceId);
    return {
      success: true,
      ...backlog,
      message: backlog.connected
        ? `Há ${backlog.pendingConversations} conversa(s) e ${backlog.pendingMessages} mensagem(ns) pendente(s) no WhatsApp.`
        : 'O WhatsApp ainda não está conectado, então não consigo medir o backlog.',
    };
  }

  /**
   * 👁️ Presença operacional no WhatsApp
   */
  private async toolSetWhatsAppPresence(
    workspaceId: string,
    args: ToolSetWhatsAppPresenceArgs,
  ): Promise<ToolResult> {
    const chatId = String(args?.chatId || args?.phone || '').trim();
    const presence = String(args?.presence || '').trim() as 'typing' | 'paused' | 'seen';

    if (!chatId) {
      return {
        success: false,
        error: 'Informe chatId ou phone para enviar presença.',
      };
    }

    const result = await this.whatsappService.setPresence(workspaceId, chatId, presence);

    return {
      success: true,
      ...result,
      message: `Presença ${presence} enviada para ${chatId}.`,
    };
  }

  /**
   * 🔄 Dispara sincronização ativa do WhatsApp
   */
  private async toolSyncWhatsAppHistory(
    workspaceId: string,
    args: ToolSyncWhatsAppHistoryArgs,
  ): Promise<ToolResult> {
    const sync = await this.whatsappService.triggerSync(
      workspaceId,
      args?.reason || 'kloel_tool_sync',
    );
    return {
      success: true,
      ...sync,
      message: sync.scheduled
        ? 'Sincronização do WhatsApp agendada com sucesso.'
        : `A sincronização não foi agendada: ${sync.reason || 'sem motivo informado'}.`,
    };
  }

  /**
   * 👥 Listar leads
   */
  private async toolListLeads(workspaceId: string, args: ToolListLeadsArgs): Promise<ToolResult> {
    const { limit = 10, status } = args;

    const where: Prisma.ContactWhereInput = { workspaceId };
    // Filtrar por score ao invés de status (Contact não tem campo status)
    if (status === 'qualified' || status === 'hot') {
      where.leadScore = { gte: 70 };
    } else if (status === 'cold') {
      where.leadScore = { lt: 30 };
    }

    const contacts = await this.prisma.contact.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: limit,
      select: {
        id: true,
        name: true,
        phone: true,
        leadScore: true,
        sentiment: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    return {
      success: true,
      count: contacts.length,
      leads: contacts.map((c) => ({
        id: c.id,
        name: c.name || 'Sem nome',
        phone: c.phone,
        score: c.leadScore || 0,
        sentiment: c.sentiment,
        lastUpdate: c.updatedAt,
      })),
      message: `Encontrei ${contacts.length} lead(s).`,
    };
  }

  /**
   * 👤 Detalhes do lead
   */
  private async toolGetLeadDetails(
    workspaceId: string,
    args: ToolGetLeadDetailsArgs,
  ): Promise<ToolResult> {
    const { phone, leadId } = args;

    const contactInclude = {
      tags: true,
      conversations: {
        take: 1,
        orderBy: { updatedAt: 'desc' as const },
        include: { messages: { take: 5, orderBy: { createdAt: 'desc' as const } } },
      },
    } as const;
    type ContactWithRelations = Prisma.ContactGetPayload<{ include: typeof contactInclude }>;

    let contact: ContactWithRelations | null = null;
    if (leadId) {
      contact = await this.prisma.contact.findFirst({
        where: { id: leadId, workspaceId },
        include: contactInclude,
      });
    } else if (phone) {
      const normalizedPhone = phone.replace(NON_DIGIT_RE, '');
      contact = await this.prisma.contact.findFirst({
        where: { phone: { contains: normalizedPhone }, workspaceId },
        include: contactInclude,
      });
    }

    if (!contact) {
      return { success: false, error: 'Lead não encontrado.' };
    }

    return {
      success: true,
      lead: {
        id: contact.id,
        name: contact.name,
        phone: contact.phone,
        email: contact.email,
        sentiment: contact.sentiment,
        score: contact.leadScore,
        tags: contact.tags.map((t) => t.name),
        recentMessages:
          contact.conversations[0]?.messages.map((m) => ({
            content: m.content?.substring(0, 100),
            direction: m.direction,
            date: m.createdAt,
          })) || [],
      },
    };
  }

  /**
   * 🏢 Salvar info do negócio
   */
  private async toolSaveBusinessInfo(
    workspaceId: string,
    args: ToolSaveBusinessInfoArgs,
  ): Promise<ToolResult> {
    const { businessName, description, segment } = args;

    const updateData: Prisma.WorkspaceUpdateInput = {};
    if (businessName) updateData.name = businessName;

    if (description || segment) {
      const workspace = await this.prisma.workspace.findUnique({
        where: { id: workspaceId },
      });
      const currentSettings = (workspace?.providerSettings as Record<string, unknown>) || {};
      updateData.providerSettings = {
        ...currentSettings,
        businessDescription: description,
        businessSegment: segment,
      };
    }

    await this.prisma.workspace.update({
      where: { id: workspaceId },
      data: updateData,
    });

    return {
      success: true,
      message: 'Informações do negócio salvas com sucesso.',
    };
  }

  /**
   * 🕐 Definir horário de funcionamento
   */
  private async toolSetBusinessHours(
    workspaceId: string,
    args: ToolSetBusinessHoursArgs,
  ): Promise<ToolResult> {
    const workspace = await this.prisma.workspace.findUnique({
      where: { id: workspaceId },
    });

    const currentSettings = (workspace?.providerSettings as Record<string, unknown>) || {};
    const businessHours = {
      weekday: {
        start: args.weekdayStart || '09:00',
        end: args.weekdayEnd || '18:00',
      },
      saturday: args.saturdayStart ? { start: args.saturdayStart, end: args.saturdayEnd } : null,
      sunday: args.workOnSunday ? { start: '09:00', end: '13:00' } : null,
    };

    await this.prisma.workspace.update({
      where: { id: workspaceId },
      data: {
        providerSettings: {
          ...currentSettings,
          businessHours,
        },
      },
    });

    return {
      success: true,
      businessHours,
      message: 'Horário de funcionamento configurado.',
    };
  }

  /**
   * 📢 Criar campanha
   */
  private async toolCreateCampaign(
    workspaceId: string,
    args: ToolCreateCampaignArgs,
  ): Promise<ToolResult> {
    const { name, message, targetAudience } = args;

    // Buscar contatos baseado no público-alvo
    const contactFilter: Prisma.ContactWhereInput = { workspaceId };
    if (targetAudience === 'leads_quentes') {
      contactFilter.leadScore = { gte: 70 };
    } else if (targetAudience === 'novos') {
      contactFilter.createdAt = {
        gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000),
      };
    }

    const contactCount = await this.prisma.contact.count({
      where: contactFilter,
    });

    const campaign = await this.prisma.campaign.create({
      data: {
        workspaceId,
        name,
        messageTemplate: message,
        status: 'DRAFT',
        scheduledAt: null,
        filters: {
          targetAudience: targetAudience || 'all',
          createdByKloel: true,
          estimatedRecipients: contactCount,
        },
      },
    });

    return {
      success: true,
      campaign: {
        id: campaign.id,
        name: campaign.name,
        estimatedRecipients: contactCount,
      },
      message: `Campanha "${name}" criada. Atingirá aproximadamente ${contactCount} contato(s). Acesse /campaigns para agendar ou enviar.`,
    };
  }

  // ============ MÍDIA TOOLS ============

  /**
   * 🔊 Gera e envia áudio via TTS
   */
  private async toolSendAudio(workspaceId: string, args: ToolSendAudioArgs): Promise<ToolResult> {
    const { phone, text, voice = 'nova' } = args;

    if (!phone || !text) {
      return { success: false, error: 'Parâmetros obrigatórios: phone e text' };
    }

    try {
      // Gerar áudio com TTS
      const audioBuffer = await this.audioService.textToSpeech(text, voice, workspaceId);
      const audioBase64 = audioBuffer.toString('base64');
      const dataUri = `data:audio/mpeg;base64,${audioBase64}`;

      // Normalizar telefone
      const normalizedPhone = phone.replace(NON_DIGIT_RE, '');

      // messageLimit: enforced via PlanLimitsService.trackMessageSend
      // Enviar via WhatsApp usando sendMessage com opts de mídia
      await this.whatsappService.sendMessage(workspaceId, normalizedPhone, '', {
        mediaUrl: dataUri,
        mediaType: 'audio',
      });

      return {
        success: true,
        message: `Áudio enviado para ${normalizedPhone}`,
      };
    } catch (error: unknown) {
      const errorInstanceofError =
        error instanceof Error
          ? error
          : new Error(typeof error === 'string' ? error : 'unknown error');
      this.logger.error('Erro ao enviar áudio:', error);
      return { success: false, error: errorInstanceofError.message };
    }
  }

  /**
   * 📄 Envia documento/PDF
   */
  private async toolSendDocument(
    workspaceId: string,
    args: ToolSendDocumentArgs,
  ): Promise<ToolResult> {
    const { phone, documentName, url, caption } = args;

    if (!phone) {
      return { success: false, error: 'Parâmetro obrigatório: phone' };
    }

    try {
      const normalizedPhone = phone.replace(NON_DIGIT_RE, '');
      let documentUrl = url;

      // Se não tem URL direta, buscar documento por nome
      if (!documentUrl && documentName) {
        const doc = await this.prisma.document?.findFirst({
          where: {
            workspaceId,
            name: { contains: documentName, mode: 'insensitive' },
          },
        });
        documentUrl = doc?.filePath;
      }

      if (!documentUrl) {
        return {
          success: false,
          error: 'Documento não encontrado. Forneça URL ou nome cadastrado.',
        };
      }

      // messageLimit: enforced via PlanLimitsService.trackMessageSend
      await this.whatsappService.sendMessage(workspaceId, normalizedPhone, caption || '', {
        mediaUrl: documentUrl,
        mediaType: 'document',
        caption: caption,
      });

      return {
        success: true,
        message: `Documento enviado para ${normalizedPhone}`,
      };
    } catch (error: unknown) {
      const errorInstanceofError =
        error instanceof Error
          ? error
          : new Error(typeof error === 'string' ? error : 'unknown error');
      this.logger.error('Erro ao enviar documento:', error);
      return { success: false, error: errorInstanceofError.message };
    }
  }

  /**
   * 🎤 Envia nota de voz (voice note)
   */
  private async toolSendVoiceNote(
    workspaceId: string,
    args: ToolSendAudioArgs,
  ): Promise<ToolResult> {
    // Voice note é essencialmente um áudio curto
    return this.toolSendAudio(workspaceId, args);
  }

  /**
   * 🎧 Transcreve áudio para texto
   */
  private async toolTranscribeAudio(
    workspaceId: string,
    args: ToolTranscribeAudioArgs,
  ): Promise<ToolResult> {
    const { audioUrl, audioBase64, language = 'pt' } = args;

    try {
      let result: { text: string; duration?: number; language: string };

      if (audioUrl) {
        result = await this.audioService.transcribeFromUrl(audioUrl, language, workspaceId);
      } else if (audioBase64) {
        result = await this.audioService.transcribeFromBase64(audioBase64, language, workspaceId);
      } else {
        return { success: false, error: 'Forneça audioUrl ou audioBase64' };
      }

      return {
        success: true,
        transcript: result.text,
        language: result.language,
      };
    } catch (error: unknown) {
      const errorInstanceofError =
        error instanceof Error
          ? error
          : new Error(typeof error === 'string' ? error : 'unknown error');
      this.logger.error('Erro ao transcrever áudio:', error);
      return { success: false, error: errorInstanceofError.message };
    }
  }

  // ============ BILLING TOOLS ============

  /**
   * 💳 Atualiza informações de cobrança
   */
  private async toolUpdateBillingInfo(
    workspaceId: string,
    args: ToolUpdateBillingInfoArgs,
  ): Promise<ToolResult> {
    const { returnUrl } = args;

    try {
      // Gerar link do Stripe para atualizar cartão
      const workspace = await this.prisma.workspace.findUnique({
        where: { id: workspaceId },
        select: { stripeCustomerId: true },
      });

      if (workspace?.stripeCustomerId) {
        const stripe = new StripeRuntime(process.env.STRIPE_SECRET_KEY || '');
        const session = await stripe.billingPortal.sessions.create({
          customer: workspace.stripeCustomerId,
          return_url: returnUrl || `${process.env.FRONTEND_URL || 'http://localhost:3000'}/billing`,
        });

        return {
          success: true,
          url: session.url,
          message: 'Acesse o link para atualizar seus dados de pagamento.',
        };
      }

      return {
        success: false,
        error: 'Nenhum método de pagamento configurado ainda. Acesse /billing para configurar.',
      };
    } catch (error: unknown) {
      const errorInstanceofError =
        error instanceof Error
          ? error
          : new Error(typeof error === 'string' ? error : 'unknown error');
      this.logger.error('Erro ao gerar link de billing:', error);
      return { success: false, error: errorInstanceofError.message };
    }
  }

  /**
   * 📊 Retorna status de cobrança
   */
  private async toolGetBillingStatus(workspaceId: string): Promise<ToolResult> {
    try {
      const workspace = await this.prisma.workspace.findUnique({
        where: { id: workspaceId },
        select: {
          stripeCustomerId: true,
          providerSettings: true,
          subscription: {
            select: { plan: true, stripeId: true },
          },
        },
      });

      if (!workspace) {
        return { success: false, error: 'Workspace não encontrado' };
      }

      const settings = (workspace.providerSettings as Record<string, unknown>) || {};
      const plan = String(workspace.subscription?.plan || 'FREE');
      const subscriptionId = workspace.subscription?.stripeId || null;

      return {
        success: true,
        plan,
        status: settings.billingSuspended ? 'SUSPENDED' : 'ACTIVE',
        hasPaymentMethod: !!workspace.stripeCustomerId,
        subscriptionId,
        message: settings.billingSuspended
          ? 'Cobrança suspensa. Regularize para continuar usando.'
          : `Plano ${plan} ativo`,
      };
    } catch (error: unknown) {
      const errorInstanceofError =
        error instanceof Error
          ? error
          : new Error(typeof error === 'string' ? error : 'unknown error');
      this.logger.error('Erro ao buscar status billing:', error);
      return { success: false, error: errorInstanceofError.message };
    }
  }

  /**
   * 🔄 Altera plano (upgrade/downgrade)
   */
  private async toolChangePlan(workspaceId: string, args: ToolChangePlanArgs): Promise<ToolResult> {
    const { newPlan, immediate: _immediate = true } = args;

    if (!newPlan) {
      return {
        success: false,
        error: 'Parâmetro obrigatório: newPlan (starter, pro, enterprise)',
      };
    }

    const validPlans = ['starter', 'pro', 'enterprise', 'free'];
    if (!validPlans.includes(newPlan.toLowerCase())) {
      return {
        success: false,
        error: `Plano inválido. Opções: ${validPlans.join(', ')}`,
      };
    }

    try {
      const workspace = await this.prisma.workspace.findUnique({
        where: { id: workspaceId },
        select: {
          subscription: {
            select: { plan: true, stripeId: true },
          },
        },
      });

      const currentPlan = workspace?.subscription?.plan || 'FREE';
      const targetPlan = newPlan.toUpperCase();

      // Se tem subscription Stripe, redirecionar para portal
      if (workspace?.subscription?.stripeId) {
        return {
          success: true,
          requiresAction: true,
          currentPlan,
          targetPlan,
          message: `Para alterar de ${currentPlan} para ${targetPlan}, acesse /billing e use o portal de pagamento.`,
        };
      }

      // Se não tem Stripe, atualizar direto (free → paid precisa checkout)
      if (targetPlan !== 'FREE' && currentPlan === 'FREE') {
        return {
          success: true,
          requiresCheckout: true,
          targetPlan,
          message: `Para assinar o plano ${targetPlan}, acesse /pricing e complete o checkout.`,
        };
      }

      // Atualizar no banco (downgrade para free) via subscription upsert
      await this.prisma.subscription.upsert({
        where: { workspaceId },
        update: { plan: targetPlan },
        create: {
          workspaceId,
          plan: targetPlan,
          status: 'ACTIVE',
          currentPeriodEnd: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
        },
      });

      return {
        success: true,
        previousPlan: currentPlan,
        newPlan: targetPlan,
        message: `Plano alterado de ${currentPlan} para ${targetPlan}`,
      };
    } catch (error: unknown) {
      const errorInstanceofError =
        error instanceof Error
          ? error
          : new Error(typeof error === 'string' ? error : 'unknown error');
      this.logger.error('Erro ao alterar plano:', error);
      return { success: false, error: errorInstanceofError.message };
    }
  }

  /**
   * 🧠 KLOEL THINKER (versão sem streaming para APIs internas)
   */
  async thinkSync(request: ThinkRequest): Promise<ThinkSyncResult> {
    const {
      message,
      workspaceId,
      userId,
      userName: requestedUserName,
      conversationId,
      mode = 'chat',
      companyContext,
      metadata,
    } = request;

    try {
      // If no AI key is configured, return a helpful message instead of 500
      if (!this.hasOpenAiKey() && !process.env.ANTHROPIC_API_KEY) {
        return {
          response:
            'Assistente IA não disponível no momento. Configure OPENAI_API_KEY ou ANTHROPIC_API_KEY para habilitar o Kloel.',
        };
      }

      const thread =
        workspaceId && mode === 'chat'
          ? await this.resolveThread(workspaceId, conversationId)
          : null;
      const composerMetadata = this.extractComposerMetadata(metadata);
      const composerCapability = this.resolveComposerCapability(
        message,
        mode,
        composerMetadata.capability,
      );
      const enrichedCompanyContext = await this.buildComposerContext({
        workspaceId,
        metadata,
        companyContext,
      });
      const marketingPromptAddendum = await this.buildMarketingPromptAddendum(
        workspaceId,
        mode,
        message,
      );
      const effectiveCompanyContext =
        [enrichedCompanyContext, marketingPromptAddendum].filter(Boolean).join('\n\n') || undefined;

      const historyState = thread?.id
        ? await this.getThreadConversationState(thread.id, workspaceId)
        : { recentMessages: [], totalMessages: 0 };
      const capabilityResult =
        mode === 'chat' && composerCapability
          ? await this.executeComposerCapability({
              capability: composerCapability,
              message,
              workspaceId,
              metadata,
              composerContext: effectiveCompanyContext,
            })
          : null;
      const assistantMessage =
        capabilityResult?.content ||
        (await this.buildAssistantReply({
          message,
          workspaceId,
          userId,
          userName: requestedUserName,
          mode,
          companyContext: effectiveCompanyContext,
          conversationState: historyState,
        }));

      let resolvedTitle = thread?.title;

      if (workspaceId) {
        if (thread?.id) {
          const clientRequestId = this.resolveClientRequestId(metadata);
          const persistedUserMessage = await this.persistUserThreadMessage(
            thread.id,
            workspaceId,
            message,
            this.buildThreadMessageMetadata(metadata, {
              clientRequestId,
              mode,
              transport: 'sync',
              requestState: 'accepted',
            }),
          );
          const completedAt = new Date().toISOString();
          const responseVersions: StoredResponseVersion[] = [
            {
              id: clientRequestId
                ? `resp_${clientRequestId}`
                : `resp_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
              content: assistantMessage,
              createdAt: completedAt,
              source: 'initial',
            },
          ];

          await this.persistAssistantThreadMessage(
            thread.id,
            workspaceId,
            assistantMessage,
            this.buildThreadMessageMetadata(undefined, {
              clientRequestId,
              mode,
              transport: 'sync',
              requestState: 'completed',
              replyToMessageId: persistedUserMessage?.id,
              responseVersions,
              activeResponseVersionIndex: 0,
              capability: composerCapability,
              ...(capabilityResult?.metadata || {}),
            }),
          );
          await this.maybeRefreshThreadSummary(thread.id, workspaceId);
          resolvedTitle = await this.maybeGenerateThreadTitle(
            thread.id,
            thread.title,
            message,
            workspaceId,
          );
        }

        await this.conversationStore.saveMessage(workspaceId, 'user', message);
        await this.conversationStore.saveMessage(workspaceId, 'assistant', assistantMessage);
      }

      return {
        response: assistantMessage,
        conversationId: thread?.id,
        title: resolvedTitle,
      };
    } catch (error) {
      this.logger.error('Erro no KLOEL Thinker Sync:', error);
      throw error;
    }
  }

  async regenerateThreadAssistantResponse(params: {
    workspaceId: string;
    conversationId: string;
    assistantMessageId: string;
    userId?: string;
    userName?: string;
  }): Promise<{
    id: string;
    threadId: string;
    role: string;
    content: string;
    metadata: Prisma.JsonValue | null;
    createdAt: Date;
    deletedMessageIds: string[];
  }> {
    const { workspaceId, conversationId, assistantMessageId, userId, userName } = params;

    const thread = await this.prisma.chatThread.findFirst({
      where: { id: conversationId, workspaceId },
      select: {
        id: true,
        summary: true,
      },
    });

    if (!thread) {
      throw new Error('Conversa não encontrada.');
    }

    const messages = await this.prisma.chatMessage.findMany({
      where: { threadId: conversationId },
      orderBy: { createdAt: 'asc' },
      select: {
        id: true,
        threadId: true,
        role: true,
        content: true,
        metadata: true,
        createdAt: true,
      },
    });

    const assistantIndex = messages.findIndex(
      (message) => message.id === assistantMessageId && message.role === 'assistant',
    );

    if (assistantIndex === -1) {
      throw new Error('Mensagem do assistente não encontrada.');
    }

    const sourceUserIndex = [...messages.slice(0, assistantIndex)]
      .map((message, index) => ({ message, index }))
      .reverse()
      .find((entry) => entry.message.role === 'user')?.index;

    if (sourceUserIndex === undefined) {
      throw new Error('Não existe mensagem do usuário para regenerar esta resposta.');
    }

    const sourceUserMessage = messages[sourceUserIndex];
    const historyBeforeUser = messages
      .slice(Math.max(0, sourceUserIndex - this.recentThreadMessageLimit), sourceUserIndex)
      .filter((message) => String(message.content || '').trim().length > 0)
      .map(
        (message): ChatMessage => ({
          role: message.role === 'assistant' ? 'assistant' : 'user',
          content: message.content,
        }),
      );

    const regeneratedTraceEntries: StoredProcessingTraceEntry[] = [];
    const captureTraceEvent = (event: KloelStreamEvent) => {
      this.appendStoredProcessingTraceEntry(regeneratedTraceEntries, event);
    };

    const regeneratedContent = await this.buildAssistantReply({
      message: sourceUserMessage.content,
      workspaceId,
      userId,
      userName,
      mode: 'chat',
      conversationState: {
        summary: thread.summary ?? undefined,
        recentMessages: historyBeforeUser,
        totalMessages: sourceUserIndex,
      },
      onTraceEvent: captureTraceEvent,
    });

    const deletedMessageIds = messages.slice(assistantIndex + 1).map((message) => message.id);
    const currentAssistantMessage = messages[assistantIndex];
    const currentMetadata = this.normalizeThreadMessageMetadataRecord(
      currentAssistantMessage.metadata,
    );
    const versionCreatedAt = new Date().toISOString();
    const responseVersions = [
      ...this.buildStoredResponseVersions(
        currentAssistantMessage.metadata,
        currentAssistantMessage.content,
        currentAssistantMessage.id,
      ),
      {
        id: `regen_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
        content: regeneratedContent,
        createdAt: versionCreatedAt,
        source: 'regenerated',
      } satisfies StoredResponseVersion,
    ];

    const operations: Prisma.PrismaPromise<unknown>[] = [
      this.prisma.chatMessage.update({
        where: { id: assistantMessageId },
        data: {
          content: regeneratedContent,
          metadata: this.buildThreadMessageMetadata(currentMetadata as Prisma.InputJsonValue, {
            regeneratedAt: new Date().toISOString(),
            regeneratedFromUserMessageId: sourceUserMessage.id,
            responseVersions,
            activeResponseVersionIndex: Math.max(responseVersions.length - 1, 0),
            processingTrace: regeneratedTraceEntries,
            processingSummary: this.buildProcessingTraceSummary(regeneratedTraceEntries),
          }),
        },
      }),
    ];

    if (deletedMessageIds.length > 0) {
      operations.push(
        this.prisma.chatMessage.deleteMany({
          where: { id: { in: deletedMessageIds } },
        }),
      );
    }

    operations.push(this.touchThread(conversationId, workspaceId));

    const [updatedMessage] = await this.prisma.$transaction(
      operations as [
        ReturnType<typeof this.prisma.chatMessage.update>,
        ...Prisma.PrismaPromise<unknown>[],
      ],
    );

    await this.maybeRefreshThreadSummary(conversationId, workspaceId);

    return {
      id: updatedMessage.id,
      threadId: updatedMessage.threadId,
      role: updatedMessage.role,
      content: updatedMessage.content,
      metadata: updatedMessage.metadata,
      createdAt: updatedMessage.createdAt,
      deletedMessageIds,
    };
  }

  /**
   * 📚 Buscar contexto do workspace (produtos, memória, etc)
   */
  private async getWorkspaceContext(workspaceId: string, userId?: string): Promise<string> {
    try {
      const [
        workspace,
        rawProducts,
        rawProductCount,
        subscription,
        invoices,
        externalPaymentLinks,
        integrations,
        affiliateRequests,
        affiliateLinks,
        affiliatePartners,
        customerSubscriptions,
        physicalOrders,
        payments,
        memories,
        userProfile,
      ] = await Promise.all([
        this.prisma.workspace.findUnique({
          where: { id: workspaceId },
          select: {
            providerSettings: true,
            customDomain: true,
            branding: true,
            stripeCustomerId: true,
          },
        }),
        this.prisma.product.findMany({
          where: { workspaceId },
          select: {
            id: true,
            name: true,
            price: true,
            currency: true,
            description: true,
            category: true,
            sku: true,
            tags: true,
            format: true,
            paymentLink: true,
            active: true,
            featured: true,
            status: true,
            stockQuantity: true,
            trackStock: true,
            salesPageUrl: true,
            thankyouUrl: true,
            thankyouBoletoUrl: true,
            thankyouPixUrl: true,
            reclameAquiUrl: true,
            supportEmail: true,
            warrantyDays: true,
            isSample: true,
            shippingType: true,
            shippingValue: true,
            affiliateEnabled: true,
            affiliateVisible: true,
            affiliateAutoApprove: true,
            commissionType: true,
            commissionCookieDays: true,
            commissionPercent: true,
            merchandContent: true,
            affiliateTerms: true,
            afterPayDuplicateAddress: true,
            afterPayAffiliateCharge: true,
            afterPayChargeValue: true,
            afterPayShippingProvider: true,
            aiConfig: {
              select: {
                customerProfile: true,
                positioning: true,
                objections: true,
                salesArguments: true,
                upsellConfig: true,
                downsellConfig: true,
                tone: true,
                persistenceLevel: true,
                messageLimit: true,
                followUpConfig: true,
                technicalInfo: true,
              },
            },
            plans: {
              where: { active: true },
              orderBy: [{ salesCount: 'desc' }, { updatedAt: 'desc' }],
              take: this.workspaceProductPlanLimit,
              select: {
                name: true,
                price: true,
                currency: true,
                billingType: true,
                maxInstallments: true,
                recurringInterval: true,
                trialEnabled: true,
                trialDays: true,
                trialPrice: true,
                salesCount: true,
                termsUrl: true,
                aiConfig: true,
              },
            },
            checkouts: {
              where: { active: true },
              orderBy: [{ conversionRate: 'desc' }, { updatedAt: 'desc' }],
              take: this.workspaceProductCheckoutLimit,
              select: {
                name: true,
                code: true,
                uniqueVisits: true,
                totalVisits: true,
                abandonRate: true,
                cancelRate: true,
                conversionRate: true,
              },
            },
            coupons: {
              where: { active: true },
              orderBy: { createdAt: 'desc' },
              take: this.workspaceProductCouponLimit,
              select: {
                code: true,
                discountType: true,
                discountValue: true,
                maxUses: true,
                usedCount: true,
                expiresAt: true,
              },
            },
            campaigns: {
              orderBy: [{ paidCount: 'desc' }, { updatedAt: 'desc' }],
              take: this.workspaceProductCampaignLimit,
              select: {
                name: true,
                code: true,
                salesCount: true,
                paidCount: true,
              },
            },
            commissions: {
              orderBy: { createdAt: 'desc' },
              take: this.workspaceProductCommissionLimit,
              select: {
                role: true,
                percentage: true,
                agentName: true,
                agentEmail: true,
              },
            },
            urls: {
              where: { active: true },
              orderBy: [{ salesFromUrl: 'desc' }, { updatedAt: 'desc' }],
              take: this.workspaceProductUrlLimit,
              select: {
                description: true,
                url: true,
                isPrivate: true,
                aiLearning: true,
                chatEnabled: true,
                salesFromUrl: true,
              },
            },
            reviews: {
              orderBy: { createdAt: 'desc' },
              take: this.workspaceProductReviewLimit,
              select: {
                rating: true,
                comment: true,
                authorName: true,
                verified: true,
              },
            },
          },
          orderBy: [{ active: 'desc' }, { featured: 'desc' }, { updatedAt: 'desc' }],
          take: this.workspaceProductContextLimit,
        }),
        this.prisma.product.count({
          where: { workspaceId },
        }),
        this.prisma.subscription.findUnique({
          where: { workspaceId },
          select: {
            status: true,
            plan: true,
            currentPeriodEnd: true,
            cancelAtPeriodEnd: true,
            updatedAt: true,
          },
        }),
        this.prisma.invoice.findMany({
          where: { workspaceId },
          orderBy: { createdAt: 'desc' },
          take: this.workspaceInvoiceContextLimit,
          select: {
            amount: true,
            status: true,
            createdAt: true,
          },
        }),
        this.prisma.externalPaymentLink.findMany({
          where: { workspaceId, isActive: true },
          orderBy: [{ totalRevenue: 'desc' }, { updatedAt: 'desc' }],
          take: this.workspaceExternalLinkContextLimit,
          select: {
            platform: true,
            productName: true,
            price: true,
            paymentUrl: true,
            totalSales: true,
            totalRevenue: true,
            lastSaleAt: true,
          },
        }),
        this.prisma.integration.findMany({
          where: { workspaceId },
          orderBy: [{ isActive: 'desc' }, { updatedAt: 'desc' }],
          take: this.workspaceIntegrationContextLimit,
          select: {
            type: true,
            name: true,
            isActive: true,
          },
        }),
        this.prisma.affiliateRequest.findMany({
          where: { affiliateWorkspaceId: workspaceId },
          orderBy: { updatedAt: 'desc' },
          take: this.workspaceAffiliateContextLimit,
          select: {
            affiliateProductId: true,
            status: true,
            updatedAt: true,
            affiliateProduct: {
              select: {
                productId: true,
                category: true,
                tags: true,
                commissionPct: true,
                commissionType: true,
                cookieDays: true,
                approvalMode: true,
                totalAffiliates: true,
                totalSales: true,
                totalRevenue: true,
                temperature: true,
                thumbnailUrl: true,
                promoMaterials: true,
              },
            },
          },
        }),
        this.prisma.affiliateLink.findMany({
          where: { affiliateWorkspaceId: workspaceId },
          orderBy: { createdAt: 'desc' },
          take: this.workspaceAffiliateContextLimit,
          select: {
            affiliateProductId: true,
            code: true,
            clicks: true,
            sales: true,
            revenue: true,
            commissionEarned: true,
            active: true,
            affiliateProduct: {
              select: {
                productId: true,
                category: true,
                tags: true,
                commissionPct: true,
                commissionType: true,
                cookieDays: true,
                approvalMode: true,
                totalAffiliates: true,
                totalSales: true,
                totalRevenue: true,
                temperature: true,
                thumbnailUrl: true,
                promoMaterials: true,
              },
            },
          },
        }),
        this.prisma.affiliatePartner.findMany({
          where: { workspaceId },
          orderBy: [{ totalSales: 'desc' }, { updatedAt: 'desc' }],
          take: this.workspaceAffiliatePartnerContextLimit,
          select: {
            partnerName: true,
            type: true,
            status: true,
            commissionRate: true,
            totalSales: true,
            totalCommission: true,
          },
        }),
        this.prisma.customerSubscription.findMany({
          where: { workspaceId },
          orderBy: { updatedAt: 'desc' },
          take: this.workspaceCustomerSubscriptionContextLimit,
          select: {
            productId: true,
            planName: true,
            amount: true,
            currency: true,
            interval: true,
            status: true,
            nextBillingAt: true,
          },
        }),
        this.prisma.physicalOrder.findMany({
          where: { workspaceId },
          orderBy: { updatedAt: 'desc' },
          take: this.workspacePhysicalOrderContextLimit,
          select: {
            productName: true,
            status: true,
            paymentStatus: true,
            shippingMethod: true,
            createdAt: true,
          },
        }),
        this.prisma.payment.findMany({
          where: { workspaceId },
          orderBy: { updatedAt: 'desc' },
          take: this.workspacePaymentContextLimit,
          select: {
            provider: true,
            method: true,
            status: true,
            amount: true,
            currency: true,
            paidAt: true,
            createdAt: true,
          },
        }),
        typeof this.prisma.kloelMemory?.findMany === 'function'
          ? this.prisma.kloelMemory.findMany({
              where: { workspaceId },
              select: {
                id: true,
                key: true,
                value: true,
                category: true,
                type: true,
                content: true,
                createdAt: true,
              },
              orderBy: { createdAt: 'desc' },
              take: 20,
            })
          : Promise.resolve([]),
        userId
          ? this.prisma.kloelMemory?.findUnique?.({
              where: {
                workspaceId_key: {
                  workspaceId,
                  key: `user_profile:${userId}`,
                },
              },
            })
          : Promise.resolve(null),
      ]);
      const products = filterLegacyProducts(Array.isArray(rawProducts) ? rawProducts : []);
      const providerSettings =
        workspace?.providerSettings && typeof workspace.providerSettings === 'object'
          ? (workspace.providerSettings as Record<string, unknown>)
          : {};
      const branding =
        workspace?.branding && typeof workspace.branding === 'object'
          ? (workspace.branding as Record<string, unknown>)
          : {};
      const verifiedBusinessDescription = safeStr(providerSettings.businessDescription).trim();
      const verifiedBusinessSegment = safeStr(providerSettings.businessSegment).trim();
      const businessHours = this.contextFormatter.buildWorkspaceBusinessHoursContext(
        providerSettings.businessHours as Record<string, unknown> | undefined,
      );

      const affiliateProductIds = new Set<string>();
      for (const request of affiliateRequests || []) {
        const productId = request?.affiliateProduct?.productId;
        if (productId) affiliateProductIds.add(productId);
      }
      for (const link of affiliateLinks || []) {
        const productId = link?.affiliateProduct?.productId;
        if (productId) affiliateProductIds.add(productId);
      }

      const affiliateCatalogProducts = affiliateProductIds.size
        ? await this.prisma.product.findMany({
            where: { id: { in: Array.from(affiliateProductIds) } },
            select: {
              id: true,
              name: true,
              description: true,
              price: true,
              currency: true,
              category: true,
            },
          })
        : [];
      const affiliateCatalogProductMap = new Map(
        affiliateCatalogProducts.map((product) => [product.id, product]),
      );
      const affiliateRequestMap = new Map(
        (affiliateRequests || []).map((request) => [request.affiliateProductId, request]),
      );
      const affiliateLinkMap = new Map(
        (affiliateLinks || []).map((link) => [link.affiliateProductId, link]),
      );
      const affiliateEntries = Array.from(
        new Set([
          ...(affiliateRequests || []).map((request) => request.affiliateProductId),
          ...(affiliateLinks || []).map((link) => link.affiliateProductId),
        ]),
      )
        .map((affiliateProductId) => {
          const request = affiliateRequestMap.get(affiliateProductId);
          const link = affiliateLinkMap.get(affiliateProductId);
          const affiliateProduct = (request?.affiliateProduct ||
            link?.affiliateProduct ||
            {}) as Record<string, unknown>;
          const linkedProduct = affiliateCatalogProductMap.get(safeStr(affiliateProduct.productId));
          if (linkedProduct?.name && isLegacyProductName(linkedProduct.name)) {
            return null;
          }

          return {
            productName:
              linkedProduct?.name ||
              this.contextFormatter.truncatePromptText(
                safeStr(affiliateProduct.productId, 'Produto afiliado'),
                48,
              ),
            description: linkedProduct?.description,
            price: linkedProduct?.price,
            currency: linkedProduct?.currency || 'BRL',
            category: affiliateProduct.category || linkedProduct?.category,
            status: request?.status || (link?.active ? 'APPROVED' : 'LINK_DESATIVADO'),
            commissionPct: affiliateProduct.commissionPct,
            commissionType: affiliateProduct.commissionType,
            cookieDays: affiliateProduct.cookieDays,
            approvalMode: affiliateProduct.approvalMode,
            temperature: affiliateProduct.temperature,
            promoMaterials: affiliateProduct.promoMaterials,
            affiliateCode: link?.code,
            linkClicks: link?.clicks,
            linkSales: link?.sales,
            linkRevenue: link?.revenue,
            linkCommissionEarned: link?.commissionEarned,
          };
        })
        .filter(Boolean) as Array<Record<string, unknown>>;

      const contextParts: string[] = [];

      const accountConfigParts = [
        workspace?.customDomain ? `- Domínio customizado: ${workspace.customDomain}` : null,
        branding?.primaryColor ? `- Cor principal: ${safeStr(branding.primaryColor)}` : null,
        branding?.logoUrl ? '- Logo configurada: sim' : null,
        businessHours ? `- Horário comercial: ${businessHours}` : null,
      ].filter(Boolean);
      const integrationsBlock = this.contextFormatter.buildWorkspaceIntegrationContext(
        integrations as Array<Record<string, unknown>>,
      );
      if (accountConfigParts.length > 0 || integrationsBlock) {
        contextParts.push(
          [
            'CONFIGURAÇÃO VERIFICADA DA CONTA E DA MARCA:',
            ...accountConfigParts,
            integrationsBlock ? `- Integrações conectadas:\n${integrationsBlock}` : null,
          ]
            .filter(Boolean)
            .join('\n'),
        );
      }

      if (verifiedBusinessDescription || verifiedBusinessSegment) {
        contextParts.push(
          [
            'DADOS OPERACIONAIS VERIFICADOS DO NEGÓCIO:',
            verifiedBusinessSegment ? `- Segmento: ${verifiedBusinessSegment}` : null,
            verifiedBusinessDescription ? `- Descrição: ${verifiedBusinessDescription}` : null,
          ]
            .filter(Boolean)
            .join('\n'),
        );
      }

      const billingContext = this.contextFormatter.buildWorkspaceBillingContext({
        subscription: subscription as Record<string, unknown> | null | undefined,
        invoices: invoices as Array<Record<string, unknown>>,
        providerSettings,
        stripeCustomerId: workspace?.stripeCustomerId,
      });
      if (billingContext) {
        contextParts.push(`STATUS DA CONTA E DA ASSINATURA:\n${billingContext}`);
      }

      const externalLinksContext = this.contextFormatter.buildWorkspaceExternalPaymentLinkContext(
        externalPaymentLinks as Array<Record<string, unknown>>,
      );
      if (externalLinksContext) {
        contextParts.push(`LINKS EXTERNOS DE VENDA:\n${externalLinksContext}`);
      }

      if (products.length > 0) {
        contextParts.push(
          [
            `CATÁLOGO REAL DO WORKSPACE (${products.length} produto(s) carregado(s)${
              rawProductCount > products.length ? ` de ${rawProductCount} cadastrado(s)` : ''
            }):`,
            ...products.map((product, index) =>
              this.contextFormatter.buildWorkspaceProductContext(product, index),
            ),
          ].join('\n\n'),
        );
      } else {
        contextParts.push(
          'STATUS DE CATÁLOGO: nenhum produto real cadastrado no workspace. Não invente produtos.',
        );
      }

      if (affiliateEntries.length > 0) {
        const affiliateContext =
          this.contextFormatter.buildWorkspaceAffiliateContext(affiliateEntries);
        if (affiliateContext) {
          contextParts.push(`PRODUTOS EM QUE O WORKSPACE SE AFILIOU:\n${affiliateContext}`);
        }
      }

      const affiliatePartnerContext = this.contextFormatter.buildWorkspaceAffiliatePartnerContext(
        affiliatePartners as Array<Record<string, unknown>>,
      );
      if (affiliatePartnerContext) {
        contextParts.push(
          `REDE DE PARCEIROS E AFILIADOS DO WORKSPACE:\n${affiliatePartnerContext}`,
        );
      }

      const customerSubscriptionContext =
        this.contextFormatter.buildWorkspaceCustomerSubscriptionContext(
          customerSubscriptions as Array<Record<string, unknown>>,
        );
      const physicalOrderContext = this.contextFormatter.buildWorkspacePhysicalOrderContext(
        physicalOrders as Array<Record<string, unknown>>,
      );
      const paymentContext = this.contextFormatter.buildWorkspacePaymentContext(
        payments as Array<Record<string, unknown>>,
      );
      if (customerSubscriptionContext || physicalOrderContext || paymentContext) {
        contextParts.push(
          [
            'PÓS-VENDA E FINANCEIRO RECENTE:',
            customerSubscriptionContext,
            physicalOrderContext,
            paymentContext,
          ]
            .filter(Boolean)
            .join('\n'),
        );
      }

      for (const memory of memories) {
        if (this.hasLegacyProductMarker(memory.content)) {
          continue;
        }

        switch (memory.type) {
          case 'product':
            if (!memory.content || isLegacyProductName(memory.content)) {
              continue;
            }
            break;
          case 'persona':
            contextParts.push(`PERSONA/TOM DE VOZ: ${memory.content}`);
            break;
          case 'user_profile':
            contextParts.push(`PERFIL DO USUÁRIO: ${memory.content}`);
            break;
          case 'objection':
            contextParts.push(`OBJEÇÃO COMUM: ${memory.content}`);
            break;
          case 'script':
            contextParts.push(`SCRIPT DE VENDA: ${memory.content}`);
            break;
          case 'contact_context':
            contextParts.push(`CONTEXTO DE CONTATO: ${memory.content}`);
            break;
          default:
            if (memory.content) {
              contextParts.push(memory.content);
            }
        }
      }

      if (userProfile?.content) {
        contextParts.unshift(`PERFIL DO USUÁRIO ATUAL:\n${userProfile.content}`);
      }

      return contextParts.filter(Boolean).join('\n\n');
    } catch (error) {
      this.logger.warn('Erro ao buscar contexto:', error);
      return '';
    }
  }

  /**
   * 📜 Public API to get history
   */
  async getHistory(workspaceId: string): Promise<HistoryItem[]> {
    if (!workspaceId) return [];
    try {
      const messages = await this.prisma.kloelMessage.findMany({
        where: { workspaceId },
        orderBy: { createdAt: 'asc' },
        take: 50,
        select: { id: true, role: true, content: true, createdAt: true },
      });
      return messages.map((m) => ({
        id: m.id,
        role: m.role,
        content: m.content,
        timestamp: m.createdAt,
      }));
    } catch (_error) {
      return [];
    }
  }

  /**
   * 🧠 Salvar memória/aprendizado
   */
  async saveMemory(
    workspaceId: string,
    type: string,
    content: string,
    metadata?: Prisma.InputJsonValue,
  ): Promise<void> {
    await this.conversationStore.saveMemory(workspaceId, type, content, metadata);
  }

  /**
   * 📄 Processar PDF e extrair informações
   */
  async processPdf(workspaceId: string, pdfContent: string): Promise<string> {
    try {
      const extractionPrompt = `Analise o seguinte conteúdo de um PDF e extraia:
1. Lista de produtos com preços
2. Benefícios principais
3. Diferenciais da empresa
4. Políticas importantes (troca, garantia, frete)
5. Tom de voz/estilo de comunicação

Retorne em formato estruturado.

CONTEÚDO:
${pdfContent}`;

      if (workspaceId) await this.planLimits.ensureTokenBudget(workspaceId);
      const response = await chatCompletionWithFallback(
        this.openai,
        {
          model: resolveBackendOpenAIModel('brain'),
          messages: [
            {
              role: 'system',
              content: 'Você é um assistente de análise de documentos comerciais.',
            },
            { role: 'user', content: extractionPrompt },
          ],
          temperature: 0.3,
        },
        resolveBackendOpenAIModel('brain_fallback'),
      );
      if (workspaceId)
        await this.planLimits
          .trackAiUsage(workspaceId, response?.usage?.total_tokens ?? 500)
          .catch(() => {});

      const analysis = response.choices[0]?.message?.content || '';

      // Salvar na memória
      await this.saveMemory(workspaceId, 'pdf_analysis', analysis, {
        source: 'pdf',
      });

      return analysis;
    } catch (error) {
      this.logger.error('Erro ao processar PDF:', error);
      throw error;
    }
  }

  /**
   * 📱 Processar mensagem WhatsApp recebida e responder autonomamente
   * Este é o core da KLOEL - vendedor autônomo
   */
  async processWhatsAppMessage(
    workspaceId: string,
    senderPhone: string,
    message: string,
  ): Promise<string> {
    this.logger.log(`KLOEL processando mensagem de ${senderPhone}`);

    try {
      const normalizedPhone = String(senderPhone || '').replace(NON_DIGIT_RE, '');

      // 1) Buscar workspace e checar se autopilot está habilitado
      const workspace = await this.prisma.workspace.findUnique({
        where: { id: workspaceId },
        select: { providerSettings: true, name: true },
      });
      const providerSettings = (workspace?.providerSettings ?? {}) as Record<string, unknown>;
      const autonomyMode = safeStr(asUnknownRecord(providerSettings.autonomy)?.mode).toUpperCase();
      const autopilotEnabled =
        autonomyMode === 'LIVE' ||
        autonomyMode === 'BACKLOG' ||
        autonomyMode === 'FULL' ||
        asUnknownRecord(providerSettings.autopilot)?.enabled === true ||
        providerSettings.autopilotEnabled === true;

      // 2) Buscar/criar lead e registrar mensagem inbound
      const lead = await this.getOrCreateLead(workspaceId, normalizedPhone || senderPhone);
      await this.saveLeadMessage(lead.id, 'user', message);

      // 3) Garantir Contact (tabela padrão) para contexto do UnifiedAgent
      let contactId: string | null = null;
      try {
        if (normalizedPhone) {
          const contact = await this.prisma.contact.upsert({
            where: {
              workspaceId_phone: { workspaceId, phone: normalizedPhone },
            },
            update: {},
            create: {
              workspaceId,
              phone: normalizedPhone,
              name: `Contato ${normalizedPhone.slice(-4)}`,
            },
            select: { id: true },
          });
          contactId = contact.id;
        }
      } catch (err: unknown) {
        const errInstanceofError =
          err instanceof Error ? err : new Error(typeof err === 'string' ? err : 'unknown error');
        // PULSE:OK — Contact upsert non-critical; conversation still handled without contactId
        this.logger.warn(`Falha ao upsert contact: ${errInstanceofError?.message}`);
      }

      // 4) Se autopilot habilitado: delega ao UnifiedAgentService
      if (autopilotEnabled) {
        try {
          const unifiedResult = await this.unifiedAgentService.processIncomingMessage({
            workspaceId,
            contactId: contactId || undefined,
            phone: normalizedPhone || senderPhone,
            message,
            channel: 'whatsapp',
          });

          const agentResponse =
            unifiedResult?.reply || unifiedResult?.response || 'Olá! Como posso ajudar?';

          await this.saveLeadMessage(lead.id, 'assistant', agentResponse);
          await this.updateLeadFromConversation(workspaceId, lead.id, message, agentResponse);

          return agentResponse;
        } catch (agentErr: unknown) {
          const agentErrInstanceofError =
            agentErr instanceof Error
              ? agentErr
              : new Error(typeof agentErr === 'string' ? agentErr : 'unknown error');
          // PULSE:OK — UnifiedAgent failure falls back to traditional sales prompt below
          this.logger.warn(`UnifiedAgentService falhou: ${agentErrInstanceofError?.message}`);
        }
      }

      // ===== Fallback tradicional (prompt de vendas) =====
      const conversationHistory = await this.getLeadConversationHistory(lead.id);
      const context = await this.getWorkspaceContext(workspaceId);

      const salesSystemPrompt = KLOEL_SALES_PROMPT(workspace?.name || 'nossa empresa', context);

      const messages: ChatMessage[] = [
        { role: 'system', content: salesSystemPrompt },
        ...conversationHistory,
        { role: 'user', content: message },
      ];

      if (workspaceId) await this.planLimits.ensureTokenBudget(workspaceId);
      const response = await chatCompletionWithFallback(
        this.openai,
        {
          model: resolveBackendOpenAIModel('writer'),
          messages,
          temperature: 0.7,
          max_tokens: 1000,
        },
        resolveBackendOpenAIModel('writer_fallback'),
      );
      if (workspaceId)
        await this.planLimits
          .trackAiUsage(workspaceId, response?.usage?.total_tokens ?? 500)
          .catch(() => {});

      const kloelResponse =
        response.choices[0]?.message?.content || 'Olá! Como posso ajudá-lo hoje?';

      await this.saveLeadMessage(lead.id, 'assistant', kloelResponse);
      await this.updateLeadFromConversation(workspaceId, lead.id, message, kloelResponse);

      return kloelResponse;
    } catch (error: unknown) {
      const errorInstanceofError =
        error instanceof Error
          ? error
          : new Error(typeof error === 'string' ? error : 'unknown error');
      this.logger.error(`Erro processando mensagem WhatsApp: ${errorInstanceofError?.message}`);
      return 'Olá! Tive um pequeno problema técnico. Pode repetir sua mensagem?';
    }
  }

  /**
   * 📋 Buscar ou criar lead pelo telefone
   */
  private async getOrCreateLead(workspaceId: string, phone: string): Promise<KloelLead> {
    let lead = await this.prisma.kloelLead.findFirst({
      where: { workspaceId, phone },
    });

    if (!lead) {
      lead = await this.prisma.kloelLead.create({
        data: {
          workspaceId,
          phone,
          name: `Lead ${phone.slice(-4)}`,
          stage: 'new',
          score: 0,
        },
      });
      this.logger.log(`Novo lead criado: ${lead.id}`);
    }

    return lead;
  }

  /**
   * 💬 Buscar histórico de conversa do lead
   */
  private async getLeadConversationHistory(leadId: string): Promise<ChatMessage[]> {
    try {
      const messages = await this.prisma.kloelConversation.findMany({
        where: { leadId },
        orderBy: { createdAt: 'asc' },
        take: 30, // Últimas 30 mensagens
        select: { role: true, content: true },
      });

      return messages.map((m) => ({
        role: m.role as 'user' | 'assistant',
        content: m.content,
      }));
    } catch (_error) {
      return [];
    }
  }

  /**
   * 💾 Salvar mensagem do lead
   */
  private async saveLeadMessage(leadId: string, role: string, content: string): Promise<void> {
    try {
      await this.prisma.kloelConversation.create({
        data: {
          leadId,
          role,
          content,
        },
      });
    } catch (error) {
      // PULSE:OK — Lead message persist non-critical; conversation flow continues without it
      this.logger.warn('Erro ao salvar mensagem do lead:', error);
    }
  }

  /**
   * 📊 Atualizar lead baseado na conversa (score, stage)
   */
  private async updateLeadFromConversation(
    workspaceId: string,
    leadId: string,
    userMessage: string,
    _assistantResponse: string,
  ): Promise<void> {
    try {
      // Detectar intenção de compra
      const buyIntent = this.detectBuyIntent(userMessage);

      // Atualizar score e stage
      const updateData: Prisma.KloelLeadUpdateManyMutationInput = {
        lastMessage: userMessage,
        lastIntent: buyIntent,
        updatedAt: new Date(),
      };

      if (buyIntent === 'high') {
        updateData.score = { increment: 20 };
        updateData.stage = 'negotiation';
      } else if (buyIntent === 'medium') {
        updateData.score = { increment: 10 };
        updateData.stage = 'interested';
      } else if (buyIntent === 'objection') {
        updateData.stage = 'objection';
      }

      await this.prisma.kloelLead.updateMany({
        where: { id: leadId, workspaceId },
        data: updateData,
      });
    } catch (error) {
      // PULSE:OK — Lead score update non-critical; best-effort from conversation analysis
      this.logger.warn('Erro ao atualizar lead:', error);
    }
  }

  /**
   * 💳 Gerar link de pagamento automaticamente quando detectar intenção de compra
   * Integração direta com SmartPaymentService
   */
  async generatePaymentForLead(
    workspaceId: string,
    leadId: string,
    phone: string,
    productName: string,
    amount: number,
    conversation: string,
  ): Promise<{
    paymentUrl: string;
    pixQrCode?: string;
    message: string;
  } | null> {
    try {
      const lead = await this.prisma.kloelLead.findFirst({
        where: { id: leadId, workspaceId },
      });

      const result = await this.smartPaymentService.createSmartPayment({
        workspaceId,
        contactId: leadId,
        phone,
        customerName: lead?.name || 'Cliente',
        productName,
        amount,
        conversation,
      });

      this.logger.log(`Pagamento gerado para lead ${leadId}: ${result.paymentUrl}`);

      return {
        paymentUrl: result.paymentUrl,
        pixQrCode: result.pixQrCode,
        message: result.suggestedMessage,
      };
    } catch (error: unknown) {
      const errorInstanceofError =
        error instanceof Error
          ? error
          : new Error(typeof error === 'string' ? error : 'unknown error');
      this.logger.error(`Erro ao gerar pagamento para lead: ${errorInstanceofError.message}`);
      return null;
    }
  }

  /**
   * 🤖 Processar mensagem WhatsApp com suporte automático a pagamentos
   * Versão aprimorada que detecta intenção de compra e gera link de pagamento
   */
  async processWhatsAppMessageWithPayment(
    workspaceId: string,
    senderPhone: string,
    message: string,
  ): Promise<{ response: string; paymentLink?: string; pixQrCode?: string }> {
    const baseResponse = await this.processWhatsAppMessage(workspaceId, senderPhone, message);

    // Verificar se há intenção de compra alta
    const buyIntent = this.detectBuyIntent(message);

    if (buyIntent === 'high') {
      // Tentar buscar produto mencionado e gerar pagamento
      const productMention = await this.extractProductFromMessage(workspaceId, message);

      if (productMention) {
        const lead = await this.prisma.kloelLead.findFirst({
          where: { workspaceId, phone: senderPhone },
        });

        if (lead) {
          const paymentResult = await this.generatePaymentForLead(
            workspaceId,
            lead.id,
            senderPhone,
            productMention.name,
            productMention.price,
            message,
          );

          if (paymentResult) {
            return {
              response: `${baseResponse}\n\nAqui está o link para finalizar sua compra:\n${paymentResult.paymentUrl}`,
              paymentLink: paymentResult.paymentUrl,
              pixQrCode: paymentResult.pixQrCode,
            };
          }
        }
      }
    }

    return { response: baseResponse };
  }

  /**
   * 🔍 Extrair produto mencionado na mensagem
   */
  private async extractProductFromMessage(
    workspaceId: string,
    message: string,
  ): Promise<{ name: string; price: number } | null> {
    try {
      // Buscar produtos do workspace
      const products = await this.prisma.kloelMemory.findMany({
        where: { workspaceId, type: 'product' },
        select: { id: true, value: true },
        take: 100,
      });

      const lowerMessage = message.toLowerCase();

      for (const product of products) {
        const productData = product.value as Record<string, unknown>;
        const productName = safeStr(productData.name).toLowerCase();

        if (productName && lowerMessage.includes(productName)) {
          return {
            name: safeStr(productData.name),
            price: Number(productData.price) || 0,
          };
        }
      }

      // Se não encontrou, tentar buscar do modelo Product
      const dbProducts = await this.prisma.product
        ?.findMany?.({
          where: { workspaceId, active: true },
          select: { id: true, name: true, price: true },
          take: 100,
        })
        .catch(() => []);

      for (const product of dbProducts || []) {
        if (lowerMessage.includes(product.name.toLowerCase())) {
          return {
            name: product.name,
            price: product.price,
          };
        }
      }

      return null;
    } catch (_error) {
      return null;
    }
  }

  /**
   * 🎯 Detectar intenção de compra
   */
  private detectBuyIntent(message: string): 'high' | 'medium' | 'low' | 'objection' {
    const lowerMessage = message.toLowerCase();

    // Alta intenção de compra
    const highIntentKeywords = [
      'quero comprar',
      'vou comprar',
      'pode enviar',
      'manda o link',
      'aceito',
      'fechado',
      'como pago',
      'pix',
      'cartão',
      'boleto',
      'quero esse',
      'vou levar',
      'me envia',
      'pode mandar',
    ];

    // Média intenção
    const mediumIntentKeywords = [
      'quanto custa',
      'qual o valor',
      'tem desconto',
      'parcelado',
      'como funciona',
      'me conta mais',
      'interessado',
      'gostei',
    ];

    // Objeções
    const objectionKeywords = [
      'tá caro',
      'muito caro',
      'não tenho',
      'vou pensar',
      'depois',
      'não sei',
      'não posso',
      'não quero',
      'sem interesse',
    ];

    for (const keyword of highIntentKeywords) {
      if (lowerMessage.includes(keyword)) return 'high';
    }

    for (const keyword of mediumIntentKeywords) {
      if (lowerMessage.includes(keyword)) return 'medium';
    }

    for (const keyword of objectionKeywords) {
      if (lowerMessage.includes(keyword)) return 'objection';
    }

    return 'low';
  }

  /**
   * 📅 Lista follow-ups programados do workspace
   * @param workspaceId ID do workspace
   * @param contactId Opcional - filtrar por contato específico
   */
  async listFollowups(workspaceId: string, contactId?: string) {
    try {
      // Buscar da tabela KloelMemory onde category = 'followups'
      const whereClause: Prisma.KloelMemoryWhereInput = {
        workspaceId,
        category: 'followups',
      };

      // Se tiver contactId, filtrar no metadata
      if (contactId) {
        whereClause.metadata = {
          path: ['contactId'],
          equals: contactId,
        };
      }

      const followups = await this.prisma.kloelMemory.findMany({
        where: whereClause,
        orderBy: { createdAt: 'desc' },
        take: 100,
        select: {
          id: true,
          key: true,
          value: true,
          metadata: true,
          createdAt: true,
        },
      });

      // Formatar resposta
      return {
        total: followups.length,
        followups: followups.map((f): FollowupListItem => {
          const meta = (f.metadata as Record<string, unknown>) || {};
          return {
            id: f.id,
            key: f.key,
            phone: meta.phone,
            contactId: meta.contactId,
            message: meta.message || f.value,
            scheduledFor: meta.scheduledFor,
            delayMinutes: meta.delayMinutes,
            status: meta.status || 'pending',
            createdAt: f.createdAt,
            executedAt: meta.executedAt,
          };
        }),
      };
    } catch (error: unknown) {
      const errorInstanceofError =
        error instanceof Error
          ? error
          : new Error(typeof error === 'string' ? error : 'unknown error');
      this.logger.error(`Erro ao listar follow-ups: ${errorInstanceofError.message}`);
      return { total: 0, followups: [] };
    }
  }

  // ── Persona Management ──

  async listPersonas(workspaceId: string) {
    return this.prisma.persona.findMany({
      where: { workspaceId },
      orderBy: { createdAt: 'desc' },
      take: 50,
      select: {
        id: true,
        name: true,
        role: true,
        basePrompt: true,
        voiceId: true,
        knowledgeBaseId: true,
        workspaceId: true,
        createdAt: true,
      },
    });
  }

  createPersona(
    workspaceId: string,
    data: {
      name: string;
      role?: string;
      basePrompt?: string;
      description?: string;
      systemPrompt?: string;
      temperature?: number;
    },
  ) {
    return this.prisma.persona.create({
      data: {
        workspaceId,
        name: data.name,
        role: data.role || 'SALES',
        basePrompt: data.basePrompt || data.systemPrompt || '',
      },
    });
  }

  // ── Integration Management ──

  async listIntegrations(workspaceId: string) {
    return this.prisma.integration.findMany({
      where: { workspaceId },
      orderBy: { createdAt: 'desc' },
      take: 50,
      select: {
        id: true,
        type: true,
        name: true,
        credentials: true,
        isActive: true,
        workspaceId: true,
        createdAt: true,
        updatedAt: true,
      },
    });
  }

  async createIntegration(
    workspaceId: string,
    data: { type: string; name: string; credentials: Prisma.InputJsonValue },
  ) {
    return this.prisma.integration.create({
      data: { workspaceId, ...data },
    });
  }
}
