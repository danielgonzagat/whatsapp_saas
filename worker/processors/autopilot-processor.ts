import { safeResolve } from '../safe-path';
import { createHash, randomUUID } from 'node:crypto';
import { type Job, Worker } from 'bullmq';
import type { Prisma } from '@prisma/client';
import OpenAI from 'openai';
import {
  AUTOPILOT_SWEEP_UNREAD_CONVERSATIONS_JOB,
  buildSweepUnreadConversationsJobData,
  parseSweepUnreadConversationsJobData,
} from '../contracts/autopilot-jobs';
import {
  deriveOperationalUnreadCount,
  isConversationPendingForAgent,
  resolveConversationOwner,
} from '../conversation-agent-state';
import { prisma } from '../db';
import { buildQueueJobId } from '../job-id';
import { WorkerLogger } from '../logger';
import {
  autopilotDecisionCounter,
  autopilotGhostCloserCounter,
  autopilotPipelineCounter,
} from '../metrics';
import {
  createBacklogRunState,
  finishBacklogRunTask,
  publishAgentEvent,
} from '../providers/agent-events';
import { AIProvider } from '../providers/ai-provider';
import { channelEnabled, logFallback, sendEmail } from '../providers/channel-dispatcher';
import {
  buildBusinessStateSnapshot,
  buildDecisionEnvelope,
  buildHumanTask,
  buildMissionPlan,
  computeDemandState,
  extractMarketSignals,
  persistBusinessSnapshot,
  persistDemandState,
  persistHumanTask,
  persistMarketSignals,
  persistSystemInsight,
  shouldAutonomousSend,
} from '../providers/commercial-intelligence';
import { dispatchOutboundThroughFlow } from '../providers/outbound-dispatcher';
import { PlanLimitsProvider } from '../providers/plan-limits';
import {
  getDelayUntilWorkspaceWindowOpens,
  getWorkspaceLocalHour,
  isWithinWorkspaceWindow,
} from '../providers/timezone';
import {
  extractTextResponse,
  mapUnifiedActionsToAutopilot,
  processWithUnifiedAgent,
  shouldUseUnifiedAgent,
} from '../providers/unified-agent-integrator';
import { unifiedWhatsAppProvider as whatsappApiProvider } from '../providers/unified-whatsapp-provider';
import { WhatsAppEngine } from '../providers/whatsapp-engine';
import { autopilotQueue, connection, flowQueue } from '../queue';
import { redis, redisPub } from '../redis-client';
import { findFirstSequential, forEachSequential } from '../utils/async-sequence';
import { buildSignedLocalStorageUrl } from '../utils/signed-storage-url';
import { planCiaActions, summarizeDecisionCognition } from './cia/brain';
import { buildCiaWorkspaceState, buildCiaWorkspaceStateFromSeed } from './cia/build-state';
import {
  type CognitiveActionType,
  type CustomerCognitiveState,
  buildSeedCognitiveState,
  loadCustomerCognitiveState,
  persistCustomerCognitiveState,
  recordDecisionOutcome,
} from './cia/cognitive-state';
import {
  assertCiaExhaustion,
  assertCiaGuarantees,
  buildCiaExhaustionReport,
  buildCiaGuaranteeReport,
} from './cia/contracts';
import {
  analyzeForActiveListening,
  buildWhatsAppConversationPrompt,
  detectAndFixAntiPatterns,
} from './cia/conversation-policy';
import {
  assertConversationTacticPlan,
  buildConversationTacticPlan,
} from './cia/conversation-tactics';
import {
  type GlobalLearningPattern,
  anonymizeDecisionLog,
  buildGlobalStrategy,
  computeGlobalPatterns,
  inferWorkspaceDomain,
  persistGlobalPatterns,
} from './cia/global-learning';
import {
  computeLearningSnapshot,
  pickVariant,
  recordDecisionLog,
  updateVariantOutcome,
} from './cia/self-improvement';

/**
 * Deeply-indexable record for untyped provider data (settings, configs, remote payloads).
 * Permits arbitrary `?.`-chaining without per-access casts.
 *
 * Why not `Record<string, unknown>`?  Prisma's JsonValue and deeply-nested
 * optional chains (`settings?.openai?.apiKey`) would require hundreds of
 * manual casts throughout the 9 300-line file.  This named alias centralizes
 * the lax indexing into a single auditable declaration so that raw :any
 * annotations are eliminated from every parameter, variable and return type.
 *
 * TODO(KLOEL-002): progressively replace with narrow per-domain interfaces
 * (e.g. AutopilotSettings, WhatsAppSessionSettings).
 */

type UnknownRecord = Record<string, ReturnType<typeof JSON.parse>>;

const WHITESPACE_G_RE = /\s+/g;
const LIST_BULLET_RE = /\s*[-*\u2022]\s+/g;
const EMOJI_GU_RE = /\p{Extended_Pictographic}/gu;
const SENTENCE_SPLIT_RE = /[^.!?]+[.!?]?/g;
const JSON_FENCE_RE = /```json/gi;
const CODE_FENCE_RE = /```/g;
const JSON_FENCE_G_RE = /```json/g;
const DIACRITICS_RE = /[\u0300-\u036f]/g;
const NON_ALNUM_SPACE_RE = /[^a-z0-9\s]/g;
const NON_DIGIT_RE = /\D/g;
const SEPARATOR_G_RE = /[_-]+/g;

const WHITESPACE_RE = /\s+/;
const EMOJI_U_RE = /\p{Extended_Pictographic}/u;
const LINON_DIGIT_RE = /@lid$/i;
const D__D_S____S_DOE_RE = /^\+?\d[\d\s-]*\s+doe$/i;
const MEU_NOME____S_E__S_RE =
  /(?:meu nome(?:\s+e|\s+é)?|me chamo|sou o|sou a|aqui e o|aqui é o|aqui e a|aqui é a|pode me chamar de)\s+([A-Za-zÀ-ÿ][A-Za-zÀ-ÿ'`.-]*(?:\s+[A-Za-zÀ-ÿ][A-Za-zÀ-ÿ'`.-]*){0,3})/iu;
const ASSINADO______S__ATEN_RE =
  /(?:assinado[:,]?\s*|atenciosamente[:,]?\s*)([A-Za-zÀ-ÿ][A-Za-zÀ-ÿ'`.-]*(?:\s+[A-Za-zÀ-ÿ][A-Za-zÀ-ÿ'`.-]*){0,3})/iu;
const N_RE = /[\n!?]+/;
const W________W_______A_ZA_RE = /[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}/;
const RX_55_S__________D_2_RE = /(?:\+?55\s*)?(?:\(?\d{2}\)?\s*)?\d{4,5}[-\s]?\d{4}/;
const PRE_C__O_VALOR_QUANTO_CU_RE = /pre[cç]o|valor|quanto custa|investimento/i;
const PRAZO_ENTREGA_QUANDO_CHE_RE = /prazo|entrega|quando chega|quanto tempo/i;
const PIX_CART_A__O_BOLETO_PAG_RE = /pix|cart[aã]o|boleto|pagamento/i;
const RESULTADO_FUNCIONA_COMO_RE = /resultado|funciona|como funciona|benef[ií]cio/i;
const PROBLEMA_DOR_DIFICULDADE_RE = /problema|dor|dificuldade|obje[cç][aã]o/i;
const S_S_RE = /\{[\s\S]*\}/;
const J__S_COMPREI_JA_S_COMPR_RE =
  /(já\s*comprei|ja\s*comprei|comprei|paguei|pagamento aprovado|pedido confirmado|assinatura ativa)/i;
const PIX_BOLETO_CART_A__O_CA_RE =
  /(pix|boleto|cart[aã]o|cartao|quando virar|assim que cair|me chama amanh[aã]|pagar|pagamento)/i;
const QUERO_VOU_COMPRAR_COMO_RE =
  /(quero|vou comprar|como pago|manda o link|fecha comigo|posso pagar)/i;
const QUANTO_VALOR_PRE_C__O_F_RE =
  /(quanto|valor|pre[cç]o|funciona|tem como|me manda|link|produto|servi[cç]o)/i;
const PAGAMENTO_APROVADO_PAGA_RE =
  /(pagamento aprovado|pagamento confirmado|pix enviado|já paguei|ja paguei|comprei|compra aprovada|assinatura ativa|recebi acesso|recebeu acesso|pedido confirmado|nota fiscal)/i;
const CURSO_PLANO_MENTORIA_PR_RE = /(curso|plano|mentoria|produto|assinatura|consultoria)/i;
const OBRIGAD_VALEU_PERFEITO_RE =
  /(obrigad|valeu|perfeito|ótimo|otimo|gostei|funcionou|recebi acesso|amei)/i;
const OBRIGAD_VALEU_PERFEITO_RE_2 = /(obrigad|valeu|perfeito|ótimo|otimo|gostei)/i;
const PRE_C__O_VALOR_QUANTO_O_RE = /(pre[cç]o|valor|quanto|or[cç]amento|plano|mensalidade)/i;
const QUERO_VOU_COMPRAR_ME_MA_RE =
  /(quero|vou comprar|me manda o link|como pago|pix|boleto|cart[aã]o|fechar|assinar)/i;
const PROBLEMA_ERRO_SUPORTE_A_RE = /(problema|erro|suporte|ajuda|reclama|cancelar)/i;
const PROBLEMA_RUIM_HORR_I__V_RE = /(problema|ruim|horr[ií]vel|cancelar|reclama)/i;
const QUERO_COMPRAR_ASSINAR_F_RE = /(quero|comprar|assinar|fechar|como pago|pix|boleto)/i;
const PROBLEMA_ERRO_SUPORTE_A_RE_2 = /(problema|erro|suporte|ajuda)/i;
const RECLAMA_CANCELAR_RE = /(reclama|cancelar)/i;
const CARO_SEM_DINHEIRO_AGORA_RE = /(caro|sem dinheiro|agora não|agora nao|depois|sem tempo)/i;
const SUMI_SEM_RESPOSTA_DEPOI_RE = /(sumi|sem resposta|depois te chamo|vou ver)/i;
const B_SOU_HOMEM_MEU_MARIDO_RE = /\b(sou homem|meu marido|pai|rapaz)\b/i;
const B_SOU_MULHER_MINHA_ESPO_RE = /\b(sou mulher|minha esposa|mãe|mae|moça|moca)\b/i;
const B__D_2___S_ANOS_B_RE = /\b(\d{2})\s*anos\b/i;
const B___SOU_DE_MORO_EM_AQUI_RE = /\b(?:sou de|moro em|aqui em)\s+([a-zà-ÿ' -]{2,40})/i;

const log = new WorkerLogger('autopilot');
const WORKER_ROLE = (process.env.WORKER_ROLE || 'all').toLowerCase();
const SHOULD_RUN_AUTOPILOT_WORKER = WORKER_ROLE !== 'scheduler';
const OPS_WEBHOOK =
  process.env.AUTOPILOT_ALERT_WEBHOOK || process.env.OPS_WEBHOOK_URL || process.env.DLQ_WEBHOOK_URL;

const CONTACT_DAILY_LIMIT = Math.max(
  1,
  Number.parseInt(process.env.AUTOPILOT_CONTACT_DAILY_LIMIT || '5', 10) || 5,
);
const WORKSPACE_DAILY_LIMIT = Math.max(
  1,
  Number.parseInt(process.env.AUTOPILOT_WORKSPACE_DAILY_LIMIT || '1000', 10) || 1000,
);
const SILENCE_HOURS = Number.parseInt(process.env.AUTOPILOT_SILENCE_HOURS || '24', 10) || 24;
const WINDOW_START = Number.parseInt(process.env.AUTOPILOT_WINDOW_START || '8', 10) || 8;
const WINDOW_END = Number.parseInt(process.env.AUTOPILOT_WINDOW_END || '22', 10) || 22;
const CYCLE_LIMIT = Number.parseInt(process.env.AUTOPILOT_CYCLE_LIMIT || '200', 10) || 200;
const PENDING_MESSAGE_LIMIT = Math.max(
  1,
  Number.parseInt(process.env.AUTOPILOT_PENDING_MESSAGE_LIMIT || '12', 10) || 12,
);
const SHARENON_DIGIT_REPLY_LOCK_MS = Math.max(
  60_000,
  Number.parseInt(process.env.AUTOPILOT_SHARENON_DIGIT_REPLY_LOCK_MS || '300000', 10) || 300_000,
);
const CIA_MAIN_LOOP_LIMIT = Math.max(
  1,
  Number.parseInt(process.env.CIA_MAIN_LOOP_LIMIT || String(CYCLE_LIMIT), 10) || CYCLE_LIMIT,
);
const CIA_MAX_ACTIONS_PER_CYCLE = Math.max(
  1,
  Math.min(10, Number.parseInt(process.env.CIA_MAX_ACTIONS_PER_CYCLE || '5', 10) || 5),
);
const CIA_CONTACT_LOCK_TTL_SECONDS = Math.max(
  5,
  Number.parseInt(process.env.CIA_CONTACT_LOCK_TTL_SECONDS || '20', 10) || 20,
);
const CIA_OPPORTUNITY_LOOKBACK_DAYS = Math.max(
  7,
  Number.parseInt(process.env.CIA_OPPORTUNITY_LOOKBACK_DAYS || '30', 10) || 30,
);
const CIA_OPPORTUNITY_REFRESH_LIMIT = Math.max(
  50,
  Math.min(2000, Number.parseInt(process.env.CIA_OPPORTUNITY_REFRESH_LIMIT || '1000', 10) || 1000),
);
const CIA_OPPORTUNITY_REFRESH_TTL_SECONDS = Math.max(
  120,
  Number.parseInt(process.env.CIA_OPPORTUNITY_REFRESH_TTL_SECONDS || '900', 10) || 900,
);
const CIA_CONTACT_CATALOG_LOOKBACK_DAYS = Math.max(
  7,
  Number.parseInt(process.env.CIA_CONTACT_CATALOG_LOOKBACK_DAYS || '30', 10) || 30,
);
const CIA_CONTACT_CATALOG_MAX_CHATS = Math.max(
  50,
  Math.min(5000, Number.parseInt(process.env.CIA_CONTACT_CATALOG_MAX_CHATS || '1000', 10) || 1000),
);
const CIA_CONTACT_SCORE_MESSAGE_LIMIT = Math.max(
  12,
  Math.min(200, Number.parseInt(process.env.CIA_CONTACT_SCORE_MESSAGE_LIMIT || '40', 10) || 40),
);
const CIA_BACKLOG_CONTINUATION_LIMIT = Math.max(
  50,
  Math.min(2000, Number.parseInt(process.env.CIA_BACKLOG_CONTINUATION_LIMIT || '500', 10) || 500),
);
const CIA_REMOTE_PENDING_PROBE_LIMIT = Math.max(
  10,
  Math.min(200, Number.parseInt(process.env.CIA_REMOTE_PENDING_PROBE_LIMIT || '50', 10) || 50),
);
const CONVERSATION_HISTORY_LIMIT = Math.max(
  0,
  Number.parseInt(process.env.AUTOPILOT_CONVERSATION_HISTORY_LIMIT || '0', 10) || 0,
);
const WORKSPACE_SELF_IDENTITY_TTL_MS = Math.max(
  30_000,
  Number.parseInt(process.env.WAHA_SELF_IDENTITY_TTL_MS || '60000', 10) || 60_000,
);
type RemoteChatSummary = {
  id?: string;
  chatId?: string;
  phone?: string;
  name?: string;
  pushName?: string;
  shortName?: string;
  contact?: {
    phone?: string;
    name?: string;
    pushName?: string;
    _data?: UnknownRecord;
  };
  _data?: UnknownRecord;
  timestamp?: number;
  lastMessageTimestamp?: number;
  [key: string]: unknown;
};

type WorkspaceSelfIdentity = {
  phone: string | null;
  ids: string[];
};
type ConversationHistoryEntry = {
  content: string | null;
  direction: string | null;
  createdAt?: Date | string | null;
};
const workspaceSelfIdentityCache = new Map<
  string,
  { expiresAt: number; identity: WorkspaceSelfIdentity }
>();

async function notifyBillingSuspended(workspaceId?: string) {
  if (!OPS_WEBHOOK || !(global as never as { fetch: typeof fetch }).fetch) {
    return;
  }
  try {
    await (global as never as { fetch: typeof fetch }).fetch(OPS_WEBHOOK, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        type: 'billing_suspended_autopilot_skip',
        workspaceId,
        at: new Date().toISOString(),
        env: process.env.NODE_ENV || 'dev',
      }),
      signal: AbortSignal.timeout(10000),
    });
  } catch (err: unknown) {
    const errInstanceofError =
      err instanceof Error ? err : new Error(typeof err === 'string' ? err : 'unknown error');
    log.warn('billing_suspend_notify_failed', { error: errInstanceofError?.message });
  }
}

type AutopilotDecision = {
  intent: string;
  action: string;
  reason?: string;
  confidence?: number;
  usedHistory?: boolean;
  usedKb?: boolean;
  alreadyExecuted?: boolean;
};

type QuotedCustomerMessage = {
  content: string;
  quotedMessageId?: string;
  createdAt?: string;
};

async function reportSmokeTest(smokeTestId: string | undefined, payload: Record<string, unknown>) {
  if (!smokeTestId) {
    return;
  }
  await redis.set(
    `autopilot:smoke:${smokeTestId}`,
    JSON.stringify({
      smokeTestId,
      updatedAt: new Date().toISOString(),
      ...payload,
    }),
    'EX',
    300,
  );
}

function countReplyWords(value?: string | null): number {
  const words = String(value || '')
    .trim()
    .split(WHITESPACE_RE)
    .filter(Boolean);
  return Math.max(1, words.length);
}

function isRecentLiveConversation(customerMessages: QuotedCustomerMessage[]): boolean {
  if (!Array.isArray(customerMessages) || customerMessages.length === 0) {
    return false;
  }

  const latestTimestamp = customerMessages
    .map((message) => {
      const value = message?.createdAt ? new Date(message.createdAt).getTime() : Number.NaN;
      return Number.isFinite(value) ? value : null;
    })
    .filter((value): value is number => typeof value === 'number')
    .sort((left, right) => right - left)[0];

  if (!latestTimestamp) {
    return false;
  }

  return Date.now() - latestTimestamp <= 24 * 60 * 60 * 1000;
}

function computeReplyStyleBudget(
  message: string,
  historyTurns = 0,
): {
  words: number;
  maxSentences: number;
  maxWords: number;
} {
  const words = countReplyWords(message);
  let maxSentences = words <= 8 ? 2 : words <= 20 ? 3 : 4;
  let maxWords = Math.min(
    140,
    words <= 4 ? 26 : words <= 12 ? Math.max(24, words + 12) : Math.ceil(words * 1.8),
  );

  if (historyTurns >= 6) {
    maxSentences += 1;
    maxWords += 24;
  }

  if (historyTurns >= 10) {
    maxSentences += 1;
    maxWords += 36;
  }

  return {
    words,
    maxSentences,
    maxWords,
  };
}

function finalizeReplyStyle(
  customerMessage: string,
  reply?: string | null,
  historyTurns = 0,
): string | undefined {
  const normalized = String(reply || '')
    .replace(WHITESPACE_G_RE, ' ')
    .replace(LIST_BULLET_RE, ' ')
    .trim();

  if (!normalized) {
    return undefined;
  }

  const budget = computeReplyStyleBudget(customerMessage, historyTurns);
  const allowEmoji = EMOJI_U_RE.test(customerMessage || '');
  const withoutEmoji = allowEmoji ? normalized : normalized.replace(EMOJI_GU_RE, '').trim();
  const sentenceMatches =
    withoutEmoji
      .match(SENTENCE_SPLIT_RE)
      ?.map((part) => part.trim())
      .filter(Boolean) || [];
  const effectiveSentenceBudget =
    sentenceMatches.length > budget.maxSentences &&
    sentenceMatches.length > 1 &&
    countReplyWords(sentenceMatches[0]) <= 2
      ? Math.min(budget.maxSentences + 1, sentenceMatches.length)
      : budget.maxSentences;
  const limitedSentences = (sentenceMatches.length > 0 ? sentenceMatches : [withoutEmoji]).slice(
    0,
    effectiveSentenceBudget,
  );
  const selectedSentences: string[] = [];
  let selectedWords = 0;

  for (const sentence of limitedSentences) {
    const sentenceWords = countReplyWords(sentence);
    if (!selectedSentences.length) {
      selectedSentences.push(sentence);
      selectedWords = sentenceWords;
      continue;
    }

    if (selectedSentences.length >= effectiveSentenceBudget) {
      break;
    }

    if (selectedWords + sentenceWords > budget.maxWords) {
      break;
    }

    selectedSentences.push(sentence);
    selectedWords += sentenceWords;
  }

  return selectedSentences.join(' ').trim() || withoutEmoji;
}

function buildMirroredReplyPlanFallback(
  customerMessages: QuotedCustomerMessage[],
  draftReply: string,
): Array<{ quotedMessageId: string; text: string }> {
  const normalizedDraft =
    finalizeReplyStyle(
      customerMessages[customerMessages.length - 1]?.content || '',
      draftReply,
      customerMessages.length,
    ) || draftReply;
  const sentences = normalizedDraft
    .match(SENTENCE_SPLIT_RE)
    ?.map((item) => item.trim())
    .filter(Boolean) || [normalizedDraft];

  if (customerMessages.length === 1) {
    return [
      {
        quotedMessageId: customerMessages[0].quotedMessageId,
        text:
          finalizeReplyStyle(customerMessages[0].content, normalizedDraft, 0) || normalizedDraft,
      },
    ];
  }

  return customerMessages.map((message, index) => {
    const sentence =
      sentences[index] ||
      (index === customerMessages.length - 1 ? normalizedDraft : `Entendi. ${normalizedDraft}`);

    return {
      quotedMessageId: message.quotedMessageId,
      text: finalizeReplyStyle(message.content, sentence, 0) || sentence,
    };
  });
}

async function buildQuotedReplyPlan(params: {
  draftReply: string;
  customerMessages?: QuotedCustomerMessage[];
  settings?: UnknownRecord;
}): Promise<Array<{ quotedMessageId: string; text: string }>> {
  const normalizedMessages = (params.customerMessages || [])
    .map((message) => ({
      content: String(message.content || '').trim(),
      quotedMessageId: String(message.quotedMessageId || '').trim(),
    }))
    .filter((message) => message.content && message.quotedMessageId);

  if (!normalizedMessages.length) {
    return [];
  }

  const fallback = () => buildMirroredReplyPlanFallback(normalizedMessages, params.draftReply);

  if (normalizedMessages.length === 1) {
    return fallback();
  }

  const apiKey = params.settings?.openai?.apiKey || process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return fallback();
  }

  try {
    const ai = new AIProvider(apiKey);
    const response = await ai.generateChatResponse(
      [
        {
          role: 'system',
          content:
            'Você organiza respostas curtas para WhatsApp. Retorne JSON puro com o formato {"replies":[{"index":1,"text":"..."},...]}. Deve haver exatamente uma resposta por mensagem do cliente, na mesma ordem. Cada resposta deve ser curta, humana e diretamente responsiva.',
        },
        {
          role: 'user',
          content: `Rascunho geral da resposta:\n${params.draftReply}\n\nMensagens do cliente:\n${normalizedMessages
            .map((message, index) => `[${index + 1}] ${message.content}`)
            .join('\n')}`,
        },
      ],
      'writer',
    );
    const raw = String(response?.content || '')
      .replace(JSON_FENCE_RE, '')
      .replace(CODE_FENCE_RE, '')
      .trim();
    // PULSE:OK — inside try/catch; parser confused by multi-line template literal in the arguments above
    const parsed = JSON.parse(raw);
    const replies = Array.isArray(parsed?.replies) ? parsed.replies : [];

    if (replies.length !== normalizedMessages.length) {
      return fallback();
    }

    return normalizedMessages.map((message, index) => ({
      quotedMessageId: message.quotedMessageId,
      text:
        finalizeReplyStyle(message.content, replies[index]?.text || params.draftReply, 0) ||
        params.draftReply,
    }));
  } catch (err: unknown) {
    log.warn('build_reply_variations_error', {
      error: err instanceof Error ? err.message : String(err),
    });
    return fallback();
  }
}
import "../../scripts/pulse/__companions__/autopilot-processor.companion";
