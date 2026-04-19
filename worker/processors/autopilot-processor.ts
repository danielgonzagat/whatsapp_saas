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
 * TODO: progressively replace with narrow per-domain interfaces
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
  if (!OPS_WEBHOOK || !(global as unknown as { fetch: typeof fetch }).fetch) return;
  try {
    await (global as unknown as { fetch: typeof fetch }).fetch(OPS_WEBHOOK, {
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
  if (!smokeTestId) return;
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
  } catch {
    return fallback();
  }
}

export const autopilotWorker = SHOULD_RUN_AUTOPILOT_WORKER
  ? new Worker(
      'autopilot-jobs',
      async (job: Job) => {
        try {
          if (job.name === 'cycle-all') {
            return await runCycleAll();
          }

          // PULSE:OK — cia-cycle-all is a reserved future producer; disabled while observer-only mode is active
          if (job.name === 'cia-cycle-all') {
            return await runCiaCycleAll();
          }

          // PULSE:OK — cycle-workspace is triggered internally by cycle-all; not a direct queue.add producer
          if (job.name === 'cycle-workspace') {
            const workspaceId = job.data?.workspaceId;
            if (workspaceId) {
              return await runCycleWorkspace(workspaceId);
            }
            return;
          }

          // PULSE:OK — cia-cycle-workspace is triggered internally by cia-cycle-all; not a direct queue.add producer
          if (job.name === 'cia-cycle-workspace') {
            const workspaceId = job.data?.workspaceId;
            if (workspaceId) {
              return await runCiaCycleWorkspace(workspaceId);
            }
            return;
          }

          if (job.name === 'followup-contact') {
            return await runFollowupContact(job.data);
          }

          if (job.name === 'scan-contact') {
            return await runScanContact(job.data);
          }

          if (job.name === AUTOPILOT_SWEEP_UNREAD_CONVERSATIONS_JOB) {
            return await runSweepUnreadConversations(job.data);
          }

          if (job.name === 'catalog-contacts-30d') {
            return await runCatalogContacts(job.data);
          }

          if (job.name === 'score-contact') {
            return await runScoreContact(job.data);
          }

          if (job.name === 'cia-action') {
            return await runCiaAction(job.data);
          }

          // PULSE:OK — cia-self-improve is disabled while stabilizing; producer intentionally commented out
          if (job.name === 'cia-self-improve') {
            const workspaceId = job.data?.workspaceId;
            if (workspaceId) {
              return await runCiaSelfImproveWorkspace(workspaceId);
            }
            return await runCiaSelfImproveAll();
          }

          // PULSE:OK — cia-global-learn is disabled while stabilizing; producer intentionally commented out
          if (job.name === 'cia-global-learn') {
            return await runCiaGlobalLearningAll();
          }

          // Compatibilidade legada: scan-message vira processamento consolidado por contato
          return await runScanContact(job.data);
        } catch (err: unknown) {
          const errInstanceofError =
            err instanceof Error ? err : new Error(typeof err === 'string' ? err : 'unknown error');
          log.error('autopilot_error', { error: errInstanceofError.message });
          autopilotDecisionCounter.inc({
            workspaceId: job.data?.workspaceId || 'unknown',
            intent: 'ERROR',
            action: 'NONE',
            result: 'error',
          });
        }
      },
      { connection, concurrency: 4, lockDuration: 60000 },
    )
  : null;

async function decideActionSafe(params: {
  workspaceId?: string;
  contactId?: string;
  phone?: string;
  messageContent: string;
  settings: UnknownRecord;
}): Promise<AutopilotDecision> {
  const { workspaceId, contactId, phone, messageContent, settings } = params;
  const text = (messageContent || '').toLowerCase();

  // Rule-based defaults (no AI required)
  const hasKeyword = (...keys: string[]) => keys.some((k) => text.includes(k));

  if (hasKeyword('preco', 'preço', 'price', 'valor')) {
    // Dispara GhostCloser direto em sinais de preço para maximizar conversão imediata
    return { intent: 'BUYING', action: 'GHOST_CLOSER', reason: 'price inquiry', confidence: 0.72 };
  }
  if (hasKeyword('agendar', 'agenda', 'calend', 'marcar', 'schedule')) {
    return {
      intent: 'SCHEDULING',
      action: 'SEND_CALENDAR',
      reason: 'scheduling intent',
      confidence: 0.68,
    };
  }
  if (hasKeyword('reclama', 'problema', 'erro', 'suporte', 'ajuda')) {
    return {
      intent: 'COMPLAINT',
      action: 'TRANSFER_AGENT',
      reason: 'complaint/support',
      confidence: 0.7,
    };
  }
  if (hasKeyword('cancelar', 'desistir', 'parei', 'não quero', 'nao quero')) {
    return {
      intent: 'CHURN_RISK',
      action: 'ANTI_CHURN',
      reason: 'churn_language',
      confidence: 0.7,
    };
  }
  if (hasKeyword('oi', 'ola', 'olá', 'bom dia', 'boa tarde', 'boa noite')) {
    return { intent: 'GREET', action: 'QUALIFY', reason: 'greeting', confidence: 0.55 };
  }
  if (hasKeyword('teste', 'sim', 'ok', 'certo')) {
    return { intent: 'FOLLOW_UP', action: 'FOLLOW_UP', reason: 'generic_follow', confidence: 0.5 };
  }

  // If OpenAI key is configured, attempt AI classification (optional)
  const apiKey = settings?.openai?.apiKey || process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return { intent: 'IDLE', action: 'NONE', reason: 'no_ai_key', confidence: 0.3 };
  }

  try {
    const ai = new AIProvider(apiKey);
    const history = await fetchConversationHistory(
      workspaceId,
      contactId,
      phone,
      CONVERSATION_HISTORY_LIMIT,
    );
    const compressedContext = await fetchCompressedContactContext(workspaceId, contactId, phone);
    const kbContext = await getKbContext(workspaceId, messageContent, apiKey);
    const ledger = buildConversationLedger(history);

    const systemPrompt = `Você é o Autopilot de vendas. Classifique intenção e ação para WhatsApp.
Retorne JSON com: intent (BUYING|SCHEDULING|SUPPORT|OBJECTION|CHURN_RISK|UPSELL|FOLLOW_UP|IDLE), action (SEND_OFFER|SEND_PRICE|SEND_CALENDAR|HANDLE_OBJECTION|TRANSFER_AGENT|FOLLOW_UP|FOLLOW_UP_STRONG|ANTI_CHURN|QUALIFY|NONE), confidence (0-1), reason.`;

    const userMessage = `Mensagem atual: "${messageContent}"
Historico integral do contato:
${ledger.transcript || 'sem historico'}

Ledger acumulado do contato:
${ledger.factsText}

Resumo persistente do contato:
${compressedContext || 'n/d'}

Contexto da base de conhecimento:
${kbContext || 'n/d'}

Responda somente o JSON.`;

    const response = await ai.generateResponse(systemPrompt, userMessage, 'brain');
    const parsed = JSON.parse(response.replace(JSON_FENCE_G_RE, '').replace(CODE_FENCE_RE, ''));
    const normalizedAction = normalizeAction(parsed.action);
    return {
      intent: parsed.intent || 'IDLE',
      action: normalizedAction,
      reason: parsed.reason || 'ai_decision',
      confidence: typeof parsed.confidence === 'number' ? parsed.confidence : 0.55,
      usedHistory: history.length > 0,
      usedKb: !!kbContext,
    };
  } catch (err: unknown) {
    const errInstanceofError =
      err instanceof Error ? err : new Error(typeof err === 'string' ? err : 'unknown error');
    log.warn('autopilot_ai_fallback', { error: errInstanceofError.message });
    return { intent: 'IDLE', action: 'NONE', reason: 'ai_error', confidence: 0.3 };
  }
}

function normalizeAction(raw: string): string {
  const val = (raw || '').toUpperCase();
  const allowed = new Set([
    'SEND_OFFER',
    'SEND_PRICE',
    'SEND_CALENDAR',
    'HANDLE_OBJECTION',
    'TRANSFER_AGENT',
    'FOLLOW_UP',
    'FOLLOW_UP_STRONG',
    'ANTI_CHURN',
    'QUALIFY',
    'GHOST_CLOSER',
    'LEAD_UNLOCKER',
  ]);
  if (allowed.has(val)) return val;
  if (val === 'OFFER') return 'SEND_OFFER';
  if (val === 'OBJECTION') return 'HANDLE_OBJECTION';
  if (val === 'UPSELL') return 'FOLLOW_UP';
  return 'FOLLOW_UP';
}

function isAutonomousEnabled(settings: UnknownRecord): boolean {
  const mode = String(settings?.autonomy?.mode || '').toUpperCase();
  if (mode === 'LIVE' || mode === 'BACKLOG' || mode === 'FULL') {
    return true;
  }
  if (mode === 'HUMAN_ONLY' || mode === 'SUSPENDED') {
    return false;
  }
  if (mode === 'OFF') {
    return settings?.autopilot?.enabled === true;
  }
  if (mode) {
    return mode === 'LIVE' || mode === 'BACKLOG' || mode === 'FULL';
  }
  return settings?.autopilot?.enabled === true;
}

function isCiaAutonomyMode(settings: UnknownRecord): boolean {
  const mode = String(settings?.autonomy?.mode || '').toUpperCase();
  return mode === 'LIVE' || mode === 'BACKLOG' || mode === 'FULL';
}

function isExplicitProactiveOutreachAllowed(settings: UnknownRecord): boolean {
  const envGate = String(process.env.ALLOW_PROACTIVE_OUTREACH || 'false')
    .trim()
    .toLowerCase();

  if (!['true', '1', 'on', 'yes'].includes(envGate)) {
    return false;
  }

  return (
    settings?.autonomy?.proactiveEnabled === true || settings?.autopilot?.proactiveEnabled === true
  );
}

function isCiaProactiveCycleEnabled(settings: UnknownRecord): boolean {
  if (!isExplicitProactiveOutreachAllowed(settings)) {
    return false;
  }

  const override = String(process.env.CIA_ENABLE_PROACTIVE_CYCLE || 'false')
    .trim()
    .toLowerCase();

  if (['true', '1', 'on', 'yes'].includes(override)) {
    return settings?.autonomy?.proactiveEnabled === true;
  }

  if (['false', '0', 'off', 'no'].includes(override)) {
    return false;
  }

  return settings?.autonomy?.proactiveEnabled === true;
}

async function loadWorkspaceGlobalStrategy(input: {
  settings: UnknownRecord;
  intentHint?: string;
}) {
  const domain = inferWorkspaceDomain(input.settings || {});
  const raw = await redis.get('cia:global-patterns:v1').catch(() => null /* not found */);
  if (!raw) {
    return buildGlobalStrategy({
      patterns: [],
      domain,
      intent: input.intentHint || 'generic',
    });
  }

  try {
    const parsed = JSON.parse(raw) as {
      patterns?: GlobalLearningPattern[];
    };
    return buildGlobalStrategy({
      patterns: parsed?.patterns || [],
      domain,
      intent: input.intentHint || 'generic',
    });
  } catch {
    return buildGlobalStrategy({
      patterns: [],
      domain,
      intent: input.intentHint || 'generic',
    });
  }
}

function normalizeMatchableText(value: string): string {
  return (value || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(DIACRITICS_RE, '')
    .replace(NON_ALNUM_SPACE_RE, ' ')
    .replace(WHITESPACE_G_RE, ' ')
    .trim();
}

function messageMatchesProductText(normalizedMessage: string, candidateText: string): boolean {
  const normalizedCandidate = normalizeMatchableText(candidateText);
  if (!normalizedCandidate) {
    return false;
  }

  if (normalizedMessage.includes(normalizedCandidate)) {
    return true;
  }

  const keywords = normalizedCandidate.split(' ').filter((token) => token.length >= 4);

  return keywords.some((token) => normalizedMessage.includes(token));
}

async function findWorkspaceProductMatches(
  workspaceId: string,
  messageContent: string,
): Promise<string[]> {
  const normalizedMessage = normalizeMatchableText(messageContent);
  if (!normalizedMessage) return [];

  const [products, memoryProducts] = await Promise.all([
    prisma.product.findMany({
      where: { workspaceId, active: true },
      select: { name: true, description: true },
      take: 50,
    }),
    prisma.kloelMemory.findMany({
      where: {
        workspaceId,
        OR: [{ type: 'product' }, { category: 'products' }],
      },
      select: { value: true },
      take: 50,
    }),
  ]);

  const candidates = [
    ...products.flatMap((product: UnknownRecord) => [
      { label: product.name, matchText: product.name },
      { label: product.name, matchText: product.description },
    ]),
    ...memoryProducts.flatMap((memory: UnknownRecord) => [
      { label: memory?.value?.name, matchText: memory?.value?.name },
      { label: memory?.value?.name, matchText: memory?.value?.description },
    ]),
  ];

  return Array.from(
    new Set(
      candidates
        .filter(({ label, matchText }) => {
          return Boolean(
            label && messageMatchesProductText(normalizedMessage, String(matchText || '')),
          );
        })
        .map(({ label }) => String(label)),
    ),
  );
}

async function buildPendingMessageBatch(params: {
  workspaceId: string;
  contactId?: string;
  phone?: string;
  chatId?: string;
  fallbackMessageContent?: string;
  selfIdentity?: WorkspaceSelfIdentity | null;
}) {
  const { workspaceId, contactId, phone, chatId, fallbackMessageContent, selfIdentity } = params;

  let contact = contactId
    ? await prisma.contact.findFirst({
        where: { id: contactId, workspaceId },
        select: {
          id: true,
          phone: true,
          leadScore: true,
          name: true,
          customFields: true,
        },
      })
    : null;

  if (!contact && phone) {
    contact = await prisma.contact.findFirst({
      where: { workspaceId, phone },
      select: {
        id: true,
        phone: true,
        leadScore: true,
        name: true,
        customFields: true,
      },
    });
  }

  const resolvedContactId = contact?.id || contactId;
  const resolvedPhone = contact?.phone || phone;

  if (!resolvedContactId || !resolvedPhone) {
    return null;
  }

  if (
    isWorkspaceSelfTarget({
      phone: resolvedPhone,
      chatId,
      selfIdentity,
    })
  ) {
    return null;
  }

  const lastOutbound = await prisma.message.findFirst({
    where: {
      workspaceId,
      contactId: resolvedContactId,
      direction: 'OUTBOUND',
    },
    orderBy: { createdAt: 'desc' },
    select: { createdAt: true },
  });

  const inboundMessages = await prisma.message.findMany({
    where: {
      workspaceId,
      contactId: resolvedContactId,
      direction: 'INBOUND',
      ...(lastOutbound?.createdAt
        ? {
            createdAt: {
              gt: lastOutbound.createdAt,
            },
          }
        : {}),
    },
    orderBy: { createdAt: 'asc' },
    take: PENDING_MESSAGE_LIMIT,
    select: {
      id: true,
      externalId: true,
      content: true,
      createdAt: true,
    },
  });

  const usableMessages = inboundMessages.filter(
    (message) => String(message.content || '').trim().length > 0,
  );
  let effectiveMessages = usableMessages.length
    ? usableMessages
    : fallbackMessageContent
      ? [
          {
            id: undefined,
            externalId: undefined,
            content: fallbackMessageContent,
            createdAt: new Date(),
          },
        ]
      : [];

  const storedCustomFields = normalizeJsonObject(contact?.customFields);
  let resolvedContactName = resolveTrustedCatalogName(
    resolvedPhone,
    contact?.name,
    storedCustomFields.remotePushName,
  );
  const remoteChatCandidates = Array.from(
    new Set(
      [
        String(chatId || '').trim(),
        String(storedCustomFields.lastRemoteChatId || '').trim(),
        String(storedCustomFields.lastCatalogChatId || '').trim(),
        String(storedCustomFields.lastResolvedChatId || '').trim(),
        `${resolvedPhone}@c.us`,
      ].filter(Boolean),
    ),
  );

  let resolvedRemoteChatId =
    remoteChatCandidates.find((candidate) => candidate.includes('@')) || `${resolvedPhone}@c.us`;

  if (!effectiveMessages.length && resolvedPhone) {
    await findFirstSequential(remoteChatCandidates, async (remoteChatId) => {
      const remoteMessages = await whatsappApiProvider
        .getChatMessages(workspaceId, remoteChatId, {
          limit: Math.max(PENDING_MESSAGE_LIMIT * 4, 20),
          offset: 0,
          downloadMedia: false,
        })
        .catch(() => []);

      if (!Array.isArray(remoteMessages) || remoteMessages.length === 0) {
        return undefined;
      }

      const normalizedRemoteMessages = (remoteMessages as UnknownRecord[])
        .map((message) => ({
          id: undefined,
          externalId:
            String(
              message?.externalId ||
                message?.id ||
                message?.key?.id ||
                message?.key?._serialized ||
                '',
            ).trim() || undefined,
          direction:
            String(message?.direction || '')
              .trim()
              .toUpperCase() ||
            (message?.fromMe === true ||
            message?.key?.fromMe === true ||
            message?.id?.fromMe === true
              ? 'OUTBOUND'
              : 'INBOUND'),
          content: String(
            message?.content || message?.body || message?.text?.body || message?.caption || '',
          ).trim(),
          createdAt:
            message?.createdAt || message?.timestamp || message?.messageTimestamp || new Date(),
        }))
        .filter((message) => message.content)
        .sort(
          (left, right) =>
            new Date(left.createdAt as string | number | Date).getTime() -
            new Date(right.createdAt as string | number | Date).getTime(),
        );

      for (const remoteMessage of Array.isArray(remoteMessages) ? remoteMessages : []) {
        const remoteTrustedName = extractTrustedNameFromRemoteMessage(remoteMessage, resolvedPhone);
        if (remoteTrustedName) {
          resolvedContactName = remoteTrustedName;
          break;
        }
      }

      const latestRemoteMessage =
        normalizedRemoteMessages[normalizedRemoteMessages.length - 1] || null;
      if (latestRemoteMessage?.direction === 'OUTBOUND') {
        return undefined;
      }

      const remoteInboundAfterLastOutbound = normalizedRemoteMessages.filter(
        (message) =>
          message.direction === 'INBOUND' &&
          (!lastOutbound?.createdAt ||
            new Date(message.createdAt as string | number | Date).getTime() >
              lastOutbound.createdAt.getTime()),
      );

      const trailingInbound: typeof normalizedRemoteMessages = [];
      for (let index = normalizedRemoteMessages.length - 1; index >= 0; index -= 1) {
        const message = normalizedRemoteMessages[index];
        if (message.direction === 'OUTBOUND') {
          break;
        }
        if (message.direction === 'INBOUND') {
          trailingInbound.unshift(message);
        }
        if (trailingInbound.length >= PENDING_MESSAGE_LIMIT) {
          break;
        }
      }

      const remotePendingMessages = (
        remoteInboundAfterLastOutbound.length ? remoteInboundAfterLastOutbound : trailingInbound
      ).slice(-PENDING_MESSAGE_LIMIT);

      if (remotePendingMessages.length > 0) {
        effectiveMessages = remotePendingMessages;
        resolvedRemoteChatId = remoteChatId;
        return true;
      }
      return undefined;
    });
  }

  if (!effectiveMessages.length) {
    return null;
  }

  const aggregatedMessage =
    effectiveMessages.length === 1
      ? String(effectiveMessages[0].content)
      : effectiveMessages
          .map((message, index: number) => `[${index + 1}] ${String(message.content || '').trim()}`)
          .join('\n');

  return {
    contactId: resolvedContactId,
    phone: resolvedPhone,
    chatId: resolvedRemoteChatId,
    contactName: resolvedContactName || resolvedPhone,
    leadScore: contact?.leadScore,
    messageContent: aggregatedMessage,
    messageCount: effectiveMessages.length,
    messageIds: effectiveMessages.map((message) => message.id).filter(Boolean),
    providerMessageIds: effectiveMessages.map((message) => message.externalId).filter(Boolean),
    customerMessages: effectiveMessages
      .map((message) => ({
        content: String(message.content || '').trim(),
        quotedMessageId: String(message.externalId || '').trim() || undefined,
        createdAt: message.createdAt?.toISOString?.() || null,
      }))
      .filter((message: QuotedCustomerMessage) => message.content.length > 0),
  };
}

async function resolveLatestQuotedMessageId(input: {
  workspaceId: string;
  contactId?: string;
  conversationId?: string;
  phone?: string;
  providerMessageIds?: string[];
}): Promise<string | undefined> {
  const fromContext =
    Array.isArray(input.providerMessageIds) && input.providerMessageIds.length > 0
      ? String(input.providerMessageIds[input.providerMessageIds.length - 1] || '').trim() ||
        undefined
      : undefined;
  if (fromContext) {
    return fromContext;
  }

  const message = await prisma.message.findFirst({
    where: {
      workspaceId: input.workspaceId,
      direction: 'INBOUND',
      externalId: { not: null },
      ...(input.conversationId
        ? { conversationId: input.conversationId }
        : input.contactId
          ? { contactId: input.contactId }
          : input.phone
            ? { contact: { phone: input.phone } }
            : {}),
    },
    orderBy: { createdAt: 'desc' },
    select: { externalId: true },
  });

  const externalId = String(message?.externalId || '').trim();
  return externalId || undefined;
}

export async function runSweepUnreadConversations(data: unknown) {
  const payload = parseSweepUnreadConversationsJobData(data);
  const { workspaceId, runId, limit, mode } = payload;
  const workspace = await prisma.workspace.findUnique({
    where: { id: workspaceId },
    select: { providerSettings: true },
  });
  const settings = (workspace?.providerSettings as UnknownRecord) || {};
  const selfIdentity = await resolveWorkspaceSelfIdentity(workspaceId, settings);

  const fetchLimit = Math.max(limit, Math.min(limit * 5, 5000));
  const remoteUnreadChats = await getRemoteUnreadChatSnapshot(
    workspaceId,
    fetchLimit,
    selfIdentity,
  ).catch(() => []);

  if (remoteUnreadChats.length > 0) {
    await seedRemoteUnreadConversationShells({
      workspaceId,
      selfIdentity,
      chats: remoteUnreadChats,
    }).catch((err) => {
      log.warn('seed_remote_unread_shells_failed', { error: err?.message });
      return 0;
    });
  }

  const rawConversations = await prisma.conversation.findMany({
    where: {
      workspaceId,
      status: { not: 'CLOSED' },
    },
    orderBy: [{ lastMessageAt: 'desc' }],
    take: fetchLimit,
    select: {
      id: true,
      contactId: true,
      status: true,
      mode: true,
      assignedAgentId: true,
      unreadCount: true,
      lastMessageAt: true,
      messages: {
        select: {
          direction: true,
          createdAt: true,
        },
        orderBy: { createdAt: 'desc' },
        take: 5,
      },
      contact: {
        select: {
          id: true,
          name: true,
          phone: true,
          customFields: true,
        },
      },
    },
  });
  const conversations = rawConversations
    .filter(
      (conversation: UnknownRecord) =>
        !isWorkspaceSelfTarget({
          phone: conversation.contact?.phone,
          selfIdentity,
        }),
    )
    .filter((conversation: UnknownRecord) => isConversationPendingForAgent(conversation))
    .sort((left: UnknownRecord, right: UnknownRecord) => {
      const leftTimestamp = new Date(left.lastMessageAt || 0).getTime();
      const rightTimestamp = new Date(right.lastMessageAt || 0).getTime();
      if (mode === 'prioritize_hot') {
        const unreadDiff = deriveOperationalUnreadCount(right) - deriveOperationalUnreadCount(left);
        if (unreadDiff !== 0) {
          return unreadDiff;
        }
      }
      return rightTimestamp - leftTimestamp;
    })
    .slice(0, limit);

  await createBacklogRunState({
    workspaceId,
    runId,
    total: conversations.length,
    mode,
  });

  if (!conversations.length) {
    await finishBacklogRunTask({
      workspaceId,
      runId,
      status: 'skipped',
      summary: 'Nenhuma conversa pendente encontrada.',
    });
    await finalizeBacklogIntoSilentCatalog({
      workspaceId,
      runId,
      reason: 'backlog_empty',
    });
    return { queued: 0, runId };
  }

  await publishAgentEvent({
    type: 'status',
    workspaceId,
    runId,
    phase: 'queue_start',
    persistent: true,
    message:
      mode === 'prioritize_hot'
        ? `Separei ${conversations.length} conversas e vou priorizar as mais recentes com maior volume de mensagens.`
        : `Separei ${conversations.length} conversas e vou responder por ordem dos mais recentes primeiro.`,
    meta: {
      total: conversations.length,
      mode,
    },
  });

  await forEachSequential(Array.from(conversations.entries()), async ([index, conversation]) => {
    const displayName = conversation.contact?.name || conversation.contact?.phone || 'contato';

    await publishAgentEvent({
      type: 'thought',
      workspaceId,
      runId,
      phase: 'queue_contact',
      message: `Preparando ${displayName} (${index + 1}/${conversations.length})`,
      meta: {
        contactId: conversation.contactId,
        contactName: conversation.contact?.name || null,
        phone: conversation.contact?.phone || null,
        unreadCount: deriveOperationalUnreadCount(conversation),
      },
    });

    await autopilotQueue.add(
      'scan-contact',
      {
        workspaceId,
        runId,
        deliveryMode: 'reactive',
        contactId: conversation.contactId,
        phone: conversation.contact?.phone || undefined,
        contactName: conversation.contact?.name || undefined,
        chatId:
          String(
            normalizeJsonObject((conversation.contact as UnknownRecord | undefined)?.customFields)
              .lastRemoteChatId ||
              normalizeJsonObject((conversation.contact as UnknownRecord | undefined)?.customFields)
                .lastCatalogChatId ||
              '',
          ).trim() || undefined,
        backlogIndex: index + 1,
        backlogTotal: conversations.length,
      },
      {
        jobId: buildQueueJobId('scan-contact', workspaceId, conversation.contactId, 'run', runId),
        removeOnComplete: true,
      },
    );
  });

  return {
    queued: conversations.length,
    runId,
  };
}

function normalizeCatalogPhone(phone: string): string {
  return String(phone || '')
    .replace(NON_DIGIT_RE, '')
    .replace('@c.us', '')
    .replace('@s.whatsapp.net', '');
}

function expandComparablePhoneVariants(value: string | null | undefined): string[] {
  const digits = normalizeCatalogPhone(String(value || ''));
  if (!digits) {
    return [];
  }

  const variants = new Set<string>([digits]);
  if (digits.startsWith('55') && digits.length > 11) {
    variants.add(digits.slice(2));
  }
  if (!digits.startsWith('55') && digits.length >= 10 && digits.length <= 11) {
    variants.add(`55${digits}`);
  }

  return Array.from(variants);
}

async function resolveWorkspaceSelfIdentity(
  workspaceId: string,
  settings?: UnknownRecord,
): Promise<WorkspaceSelfIdentity> {
  const testRuntime = process.env.NODE_ENV === 'test' || process.env.VITEST === 'true';
  const cached = testRuntime ? null : workspaceSelfIdentityCache.get(workspaceId);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.identity;
  }

  const storedPhone = normalizeCatalogPhone(
    String(settings?.whatsappApiSession?.phoneNumber || ''),
  );
  const storedIds = Array.isArray(settings?.whatsappApiSession?.selfIds)
    ? settings.whatsappApiSession.selfIds.map((value: UnknownRecord) => String(value || '').trim())
    : [];

  let remoteInfo: UnknownRecord | null = null;
  if (!testRuntime) {
    remoteInfo = await whatsappApiProvider
      .getClientInfo(workspaceId)
      .catch(() => null /* not found */);
  }

  const remoteCandidates = [
    remoteInfo?.me?.id,
    remoteInfo?.me?.lid,
    remoteInfo?.me?._serialized,
    remoteInfo?.phone,
    remoteInfo?.phoneNumber,
    remoteInfo?.me?.phone,
  ]
    .map((value: UnknownRecord) => String(value || '').trim())
    .filter(Boolean);

  const resolvedPhone =
    storedPhone ||
    normalizeCatalogPhone(
      String(
        remoteInfo?.me?.phone ||
          remoteInfo?.phone ||
          remoteInfo?.phoneNumber ||
          remoteInfo?.me?.id ||
          '',
      ),
    ) ||
    null;

  const identity: WorkspaceSelfIdentity = {
    phone: resolvedPhone,
    ids: Array.from(new Set([...storedIds, ...remoteCandidates].filter(Boolean))),
  };

  if (!testRuntime) {
    workspaceSelfIdentityCache.set(workspaceId, {
      expiresAt: Date.now() + WORKSPACE_SELF_IDENTITY_TTL_MS,
      identity,
    });
  }

  return identity;
}

function isWorkspaceSelfPhone(
  phone: string | null | undefined,
  workspaceSelfPhone?: string | null,
): boolean {
  const phoneVariants = expandComparablePhoneVariants(phone);
  const selfVariants = expandComparablePhoneVariants(workspaceSelfPhone);

  return phoneVariants.some((candidate) => selfVariants.includes(candidate));
}

function isWorkspaceSelfTarget(input: {
  phone?: string | null;
  chatId?: string | null;
  selfIdentity?: WorkspaceSelfIdentity | null;
}): boolean {
  const selfIdentity = input.selfIdentity;
  if (!selfIdentity) {
    return false;
  }

  if (isWorkspaceSelfPhone(input.phone, selfIdentity.phone)) {
    return true;
  }

  const normalizedChatId = String(input.chatId || '').trim();
  if (!normalizedChatId) {
    return false;
  }

  return selfIdentity.ids.some((candidate) => {
    const normalizedCandidate = String(candidate || '').trim();
    if (!normalizedCandidate) {
      return false;
    }

    return (
      normalizedCandidate === normalizedChatId ||
      expandComparablePhoneVariants(normalizedCandidate).some((candidate) =>
        expandComparablePhoneVariants(normalizedChatId).includes(candidate),
      )
    );
  });
}

function buildLidMap(
  mappings: Array<{ lid?: string | null; pn?: string | null }>,
): Map<string, string> {
  const normalized = new Map<string, string>();

  for (const mapping of mappings || []) {
    const lid = String(mapping?.lid || '').trim();
    const pn = String(mapping?.pn || '').trim();
    if (!lid || !pn) {
      continue;
    }

    normalized.set(lid, pn);
    normalized.set(lid.replace(LINON_DIGIT_RE, ''), pn);
  }

  return normalized;
}

function resolveCanonicalChatId(chatId: string, lidMap?: Map<string, string>): string {
  const normalizedChatId = String(chatId || '').trim();
  if (!normalizedChatId) {
    return '';
  }

  if (LINON_DIGIT_RE.test(normalizedChatId) && lidMap) {
    const mapped =
      lidMap.get(normalizedChatId) ||
      lidMap.get(normalizedChatId.replace(LINON_DIGIT_RE, '')) ||
      '';
    if (mapped) {
      return mapped;
    }
  }

  return normalizedChatId;
}

function resolveCatalogPhoneFromChatId(chatId: string, lidMap?: Map<string, string>): string {
  return normalizeCatalogPhone(resolveCanonicalChatId(chatId, lidMap));
}

function resolveLastMessageFromMe(chat: UnknownRecord): boolean | null {
  if (typeof chat?.lastMessage?.fromMe === 'boolean') {
    return chat.lastMessage.fromMe;
  }
  if (typeof chat?.lastMessage?._data?.id?.fromMe === 'boolean') {
    return chat.lastMessage._data.id.fromMe;
  }
  if (typeof chat?.lastMessage?.id?.fromMe === 'boolean') {
    return chat.lastMessage.id.fromMe;
  }
  return null;
}

function isIndividualWahaChatId(chatId: string): boolean {
  const normalized = String(chatId || '')
    .trim()
    .toLowerCase();
  if (!normalized) return false;
  if (normalized.includes('@g.us')) return false;
  if (normalized.includes('@newsletter')) return false;
  if (normalized === 'status@broadcast') return false;
  return true;
}

function resolveCatalogChatActivityTimestamp(chat: UnknownRecord): number {
  const candidates = [
    chat?._chat?.conversationTimestamp,
    chat?._chat?.lastMessageRecvTimestamp,
    chat?.lastMessage?.timestamp,
    chat?.lastMessage?._data?.messageTimestamp,
    chat?.timestamp,
    chat?.lastMessageTimestamp,
    chat?.conversationTimestamp,
    chat?.lastMessageRecvTimestamp,
    chat?.last_time,
  ];

  for (const candidate of candidates) {
    if (candidate === null || candidate === undefined || candidate === '') {
      continue;
    }
    const numeric = Number(candidate);
    if (Number.isFinite(numeric) && numeric > 0) {
      return numeric > 1e12 ? numeric : numeric * 1000;
    }

    const parsed = new Date(String(candidate)).getTime();
    if (Number.isFinite(parsed) && parsed > 0) {
      return parsed;
    }
  }

  return 0;
}

function extractCatalogChatName(chat: UnknownRecord, fallbackPhone?: string | null): string {
  const phoneDigits = String(fallbackPhone || '').replace(NON_DIGIT_RE, '');
  const candidates = [
    chat?.name,
    chat?.contact?.pushName,
    chat?.contact?.name,
    chat?.pushName,
    chat?.notifyName,
    chat?.lastMessage?._data?.notifyName,
    chat?.lastMessage?._data?.verifiedBizName,
  ];

  for (const candidate of candidates) {
    const normalized = String(candidate || '').trim();
    const lowered = normalized.toLowerCase();
    const isPlaceholder =
      !normalized ||
      lowered === 'doe' ||
      lowered === 'unknown' ||
      lowered === 'desconhecido' ||
      D__D_S____S_DOE_RE.test(normalized) ||
      (!!phoneDigits && lowered === `${phoneDigits} doe`) ||
      (!!phoneDigits && normalized.replace(NON_DIGIT_RE, '') === phoneDigits);
    if (!isPlaceholder) {
      return normalized;
    }
  }

  return '';
}

function isPlaceholderCatalogName(value: unknown, fallbackPhone?: string | null): boolean {
  const normalized = String(value || '').trim();
  const lowered = normalized.toLowerCase();
  const phoneDigits = String(fallbackPhone || '').replace(NON_DIGIT_RE, '');

  if (!normalized) {
    return true;
  }

  if (lowered === 'doe' || lowered === 'unknown' || lowered === 'desconhecido') {
    return true;
  }

  if (D__D_S____S_DOE_RE.test(normalized)) {
    return true;
  }

  if (phoneDigits && lowered === `${phoneDigits} doe`) {
    return true;
  }

  if (phoneDigits && normalized.replace(NON_DIGIT_RE, '') === phoneDigits) {
    return true;
  }

  return false;
}

function resolveTrustedCatalogName(
  fallbackPhone?: string | null,
  ...candidates: unknown[]
): string {
  for (const candidate of candidates) {
    const normalized = String(candidate || '').trim();
    if (!isPlaceholderCatalogName(normalized, fallbackPhone)) {
      return normalized;
    }
  }

  return '';
}

function extractTrustedNameFromRemoteMessage(
  message: UnknownRecord,
  fallbackPhone?: string | null,
): string {
  return resolveTrustedCatalogName(
    fallbackPhone,
    message?.pushName,
    message?.notifyName,
    message?.senderName,
    message?.contact?.pushName,
    message?.contact?.name,
    message?.author?.pushName,
    message?.author?.name,
    message?.sender?.pushName,
    message?.sender?.name,
    message?._data?.notifyName,
    message?._data?.verifiedBizName,
  );
}

function extractTrustedNameFromMessageText(value: unknown, fallbackPhone?: string | null): string {
  const text = String(value || '')
    .replace(WHITESPACE_G_RE, ' ')
    .trim();
  if (!text) {
    return '';
  }

  const matchers = [MEU_NOME____S_E__S_RE, ASSINADO______S__ATEN_RE];

  for (const matcher of matchers) {
    const matched = text.match(matcher);
    if (!matched?.[1]) {
      continue;
    }

    const trusted = resolveTrustedCatalogName(fallbackPhone, matched[1]);
    if (trusted) {
      return trusted;
    }
  }

  return '';
}

function extractRemoteMessageText(message: UnknownRecord): string {
  return String(
    message?.body ||
      message?.content ||
      message?.text ||
      message?.caption ||
      message?.message?.conversation ||
      message?.message?.extendedTextMessage?.text ||
      message?.message?.imageMessage?.caption ||
      message?.message?.videoMessage?.caption ||
      message?._data?.body ||
      '',
  )
    .replace(WHITESPACE_G_RE, ' ')
    .trim();
}

function buildConversationLedger(history: ConversationHistoryEntry[]): {
  transcript: string;
  factsText: string;
} {
  if (!Array.isArray(history) || history.length === 0) {
    return {
      transcript: '',
      factsText: 'Sem fatos acumulados.',
    };
  }

  const askedQuestions = new Set<string>();
  const informedFacts = new Set<string>();
  const coveredTopics = new Set<string>();

  const transcript = history
    .map((entry) => {
      const content = String(entry?.content || '')
        .replace(WHITESPACE_G_RE, ' ')
        .trim();
      if (!content) {
        return '';
      }

      const direction = String(entry?.direction || '').toUpperCase();
      const speaker = direction === 'INBOUND' ? 'Cliente' : 'Conta';
      const timestamp = entry?.createdAt
        ? new Date(entry.createdAt).toISOString()
        : 'sem_timestamp';

      if (direction === 'OUTBOUND') {
        const questions = content
          .split(N_RE)
          .map((part) => part.trim())
          .filter(Boolean);
        for (const question of questions) {
          if (content.includes('?')) {
            askedQuestions.add(question);
          }
        }
      }

      const extractedName = extractTrustedNameFromMessageText(content);
      if (extractedName) {
        informedFacts.add(`nome: ${extractedName}`);
      }

      const emailMatch = content.match(W________W_______A_ZA_RE);
      if (emailMatch?.[0]) {
        informedFacts.add(`email: ${emailMatch[0]}`);
      }

      const phoneMatch = content.match(RX_55_S__________D_2_RE);
      if (phoneMatch?.[0]) {
        informedFacts.add(`telefone: ${phoneMatch[0]}`);
      }

      if (PRE_C__O_VALOR_QUANTO_CU_RE.test(content)) {
        coveredTopics.add('preco');
      }
      if (PRAZO_ENTREGA_QUANDO_CHE_RE.test(content)) {
        coveredTopics.add('prazo');
      }
      if (PIX_CART_A__O_BOLETO_PAG_RE.test(content)) {
        coveredTopics.add('pagamento');
      }
      if (RESULTADO_FUNCIONA_COMO_RE.test(content)) {
        coveredTopics.add('resultado');
      }
      if (PROBLEMA_DOR_DIFICULDADE_RE.test(content)) {
        coveredTopics.add('problema');
      }

      return `[${timestamp}] ${speaker}: ${content}`;
    })
    .filter(Boolean)
    .join('\n');

  const factsText = [
    informedFacts.size > 0
      ? `DADOS JA INFORMADOS:\n- ${Array.from(informedFacts).join('\n- ')}`
      : 'DADOS JA INFORMADOS:\n- nenhum dado estruturado detectado',
    askedQuestions.size > 0
      ? `PERGUNTAS JA FEITAS PELA CONTA:\n- ${Array.from(askedQuestions).join('\n- ')}`
      : 'PERGUNTAS JA FEITAS PELA CONTA:\n- nenhuma pergunta anterior detectada',
    coveredTopics.size > 0
      ? `TOPICOS JA COBERTOS:\n- ${Array.from(coveredTopics).join('\n- ')}`
      : 'TOPICOS JA COBERTOS:\n- nenhum topico detectado',
  ].join('\n\n');

  return {
    transcript,
    factsText,
  };
}

async function ensureTrustedContactProfile(input: {
  workspaceId: string;
  contactId?: string | null;
  phone?: string | null;
  chatId?: string | null;
  contactName?: string | null;
  existingContact?: {
    id?: string | null;
    name?: string | null;
    customFields?: UnknownRecord;
  } | null;
}) {
  const normalizedPhone = normalizeCatalogPhone(String(input.phone || ''));
  const contactId = String(input.contactId || input.existingContact?.id || '').trim();

  if (!normalizedPhone || !contactId) {
    const seededContact = normalizedPhone
      ? await prisma.contact
          .upsert({
            where: {
              workspaceId_phone: {
                workspaceId: input.workspaceId,
                phone: normalizedPhone,
              },
            },
            update: {
              customFields: {
                lastRemoteChatId: String(input.chatId || '').trim() || undefined,
                lastResolvedChatId: String(input.chatId || '').trim() || undefined,
                nameResolutionStatus: 'pending',
              },
            },
            create: {
              workspaceId: input.workspaceId,
              phone: normalizedPhone,
              name: null,
              customFields: {
                lastRemoteChatId: String(input.chatId || '').trim() || undefined,
                lastResolvedChatId: String(input.chatId || '').trim() || undefined,
                nameResolutionStatus: 'pending',
              },
            },
            select: {
              id: true,
              name: true,
              customFields: true,
            },
          })
          .catch(() => null /* not found */)
      : null;

    if (!normalizedPhone || !seededContact?.id) {
      return {
        contactId: '',
        trustedName: '',
        savedToWhatsapp: false,
      };
    }

    input = {
      ...input,
      contactId: seededContact.id,
      existingContact: seededContact,
    };
  }

  const existingContact =
    input.existingContact ||
    (await prisma.contact
      .findUnique({
        where: { id: contactId },
        select: {
          id: true,
          name: true,
          customFields: true,
        },
      })
      .catch(() => null /* not found */));
  const ensuredContactId = String(input.contactId || existingContact?.id || '').trim();

  const existingCustomFields = normalizeJsonObject(existingContact?.customFields);
  let trustedName = resolveTrustedCatalogName(
    normalizedPhone,
    input.contactName,
    existingContact?.name,
    existingCustomFields.remotePushName,
    existingCustomFields.remoteContactName,
    existingCustomFields.verifiedBizName,
  );

  const chatCandidates = Array.from(
    new Set(
      [
        String(input.chatId || '').trim(),
        String(existingCustomFields.lastRemoteChatId || '').trim(),
        String(existingCustomFields.lastCatalogChatId || '').trim(),
        String(existingCustomFields.lastResolvedChatId || '').trim(),
        `${normalizedPhone}@c.us`,
        `${normalizedPhone}@s.whatsapp.net`,
      ].filter(Boolean),
    ),
  );

  if (!trustedName) {
    await findFirstSequential(chatCandidates, async (candidate) => {
      const remoteMessages = await whatsappApiProvider
        .getChatMessages(input.workspaceId, candidate, {
          limit: 5,
          offset: 0,
          downloadMedia: false,
        })
        .catch(() => []);

      if (!Array.isArray(remoteMessages) || remoteMessages.length === 0) {
        return undefined;
      }

      for (const remoteMessage of remoteMessages) {
        const remoteTrustedName = extractTrustedNameFromRemoteMessage(
          remoteMessage,
          normalizedPhone,
        );
        const textTrustedName = extractTrustedNameFromMessageText(
          extractRemoteMessageText(remoteMessage),
          normalizedPhone,
        );
        if (remoteTrustedName || textTrustedName) {
          trustedName = remoteTrustedName || textTrustedName;
          break;
        }
      }

      if (trustedName) {
        return true;
      }
      return undefined;
    });
  }

  if (!trustedName) {
    const phoneVariants = expandComparablePhoneVariants(normalizedPhone);
    const remoteChats: RemoteChatSummary[] = (await whatsappApiProvider
      .getChats(input.workspaceId)
      .catch((): RemoteChatSummary[] => [])) as RemoteChatSummary[];

    for (const chat of Array.isArray(remoteChats) ? remoteChats : []) {
      const remoteChatId = String(chat?.id || chat?.chatId || '').trim();
      const remotePhoneCandidates = [
        String(chat?.phone || '').trim(),
        String(chat?.contact?.phone || '').trim(),
        normalizeCatalogPhone(remoteChatId),
      ].filter(Boolean);
      const matchesCandidateChat = !!remoteChatId && chatCandidates.includes(remoteChatId);
      const matchesPhone = remotePhoneCandidates.some((candidate) =>
        expandComparablePhoneVariants(candidate).some((variant) => phoneVariants.includes(variant)),
      );

      if (!matchesCandidateChat && !matchesPhone) {
        continue;
      }

      trustedName = resolveTrustedCatalogName(
        normalizedPhone,
        extractCatalogChatName(chat, normalizedPhone),
        chat?.name,
        chat?.pushName,
        chat?.shortName,
        chat?.contact?.name,
        chat?.contact?.pushName,
        chat?._data?.notifyName,
        chat?._data?.verifiedBizName,
      );

      if (trustedName) {
        break;
      }
    }
  }

  if (!trustedName) {
    await prisma.contact
      .update({
        where: { id: ensuredContactId },
        data: {
          customFields: {
            ...existingCustomFields,
            lastRemoteChatId:
              String(input.chatId || '').trim() ||
              String(existingCustomFields.lastRemoteChatId || '').trim() ||
              undefined,
            lastResolvedChatId:
              String(input.chatId || '').trim() ||
              String(existingCustomFields.lastResolvedChatId || '').trim() ||
              undefined,
            nameResolutionStatus: 'pending',
            contactProfileEnsuredAt: new Date().toISOString(),
          },
        },
      })
      .catch((err) => {
        log.warn('contact_upsert_pending_failed', { error: err?.message });
        return undefined;
      });

    return {
      contactId: ensuredContactId,
      trustedName: '',
      savedToWhatsapp: false,
    };
  }

  await prisma.contact
    .update({
      where: { id: ensuredContactId },
      data: {
        name: trustedName,
        customFields: {
          ...existingCustomFields,
          remotePushName: trustedName,
          remotePushNameUpdatedAt: new Date().toISOString(),
          lastRemoteChatId:
            String(input.chatId || '').trim() ||
            String(existingCustomFields.lastRemoteChatId || '').trim() ||
            undefined,
          lastResolvedChatId:
            String(input.chatId || '').trim() ||
            String(existingCustomFields.lastResolvedChatId || '').trim() ||
            undefined,
          nameResolutionStatus: 'resolved',
          contactProfileEnsuredAt: new Date().toISOString(),
        },
      },
    })
    .catch((err) => {
      log.warn('contact_update_resolved_failed', { error: err?.message });
      return undefined;
    });

  const savedToWhatsapp = await whatsappApiProvider
    .upsertContactProfile(input.workspaceId, {
      phone: normalizedPhone,
      name: trustedName,
    })
    .catch((err) => {
      log.warn('upsert_contact_profile_failed', { error: err?.message, phone: normalizedPhone });
      return false;
    });

  if (savedToWhatsapp) {
    await prisma.contact
      .update({
        where: { id: ensuredContactId },
        data: {
          customFields: {
            ...existingCustomFields,
            remotePushName: trustedName,
            remotePushNameUpdatedAt: new Date().toISOString(),
            whatsappSavedAt: new Date().toISOString(),
            lastRemoteChatId:
              String(input.chatId || '').trim() ||
              String(existingCustomFields.lastRemoteChatId || '').trim() ||
              undefined,
            lastResolvedChatId:
              String(input.chatId || '').trim() ||
              String(existingCustomFields.lastResolvedChatId || '').trim() ||
              undefined,
            nameResolutionStatus: 'resolved',
            contactProfileEnsuredAt: new Date().toISOString(),
          },
        },
      })
      .catch(() => undefined);
  }

  return {
    contactId: ensuredContactId,
    trustedName,
    savedToWhatsapp,
  };
}

function scoreToProbabilityBucket(score: number): 'LOW' | 'MEDIUM' | 'HIGH' | 'VERY_HIGH' {
  if (score >= 85) return 'VERY_HIGH';
  if (score >= 65) return 'HIGH';
  if (score >= 40) return 'MEDIUM';
  return 'LOW';
}

function normalizeJsonObject(value: unknown): UnknownRecord {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return { ...value };
  }
  return {};
}

function extractFirstJsonObject(raw: string): UnknownRecord | null {
  const text = String(raw || '').trim();
  if (!text) return null;

  try {
    return JSON.parse(text);
  } catch {
    const match = text.match(S_S_RE);
    if (!match) return null;
    try {
      return JSON.parse(match[0]);
    } catch {
      return null;
    }
  }
}

async function scheduleCatalogContactsJob(
  workspaceId: string,
  reason: string,
): Promise<{ scheduled: boolean; reason?: string }> {
  try {
    await autopilotQueue.add(
      'catalog-contacts-30d',
      {
        workspaceId,
        days: CIA_CONTACT_CATALOG_LOOKBACK_DAYS,
        reason,
      },
      {
        jobId: buildQueueJobId('catalog-contacts-30d', workspaceId),
        removeOnComplete: true,
      },
    );
    return { scheduled: true };
  } catch (error: unknown) {
    const errorInstanceofError =
      error instanceof Error
        ? error
        : new Error(typeof error === 'string' ? error : 'unknown error');
    const message = String(errorInstanceofError?.message || '');
    if (message.includes('Job is already waiting')) {
      return { scheduled: false, reason: 'already_waiting' };
    }
    return { scheduled: false, reason: message || 'schedule_failed' };
  }
}

async function getRemoteUnreadChatSnapshot(
  workspaceId: string,
  limit = CIA_BACKLOG_CONTINUATION_LIMIT,
  selfIdentity?: WorkspaceSelfIdentity | null,
): Promise<
  Array<{
    chatId: string;
    canonicalChatId: string;
    phone: string;
    name: string;
    unreadCount: number;
    activityTimestamp: number;
    lastMessageFromMe: boolean | null;
    chat: UnknownRecord;
  }>
> {
  const chats: RemoteChatSummary[] = (await whatsappApiProvider
    .getChats(workspaceId)
    .catch((): RemoteChatSummary[] => [])) as RemoteChatSummary[];
  const lidMap = buildLidMap(await whatsappApiProvider.getLidMappings(workspaceId).catch(() => []));

  const normalizedChats = (Array.isArray(chats) ? chats : [])
    .map((chat: UnknownRecord) => {
      const chatId = String(chat?.id || '').trim();
      const canonicalChatId = resolveCanonicalChatId(chatId, lidMap);
      const lastMessageFromMe = resolveLastMessageFromMe(chat);
      const unreadCount = Number(chat?.unreadCount || chat?.unread || 0) || 0;
      const activityTimestamp = resolveCatalogChatActivityTimestamp(chat);

      return {
        chatId,
        canonicalChatId,
        phone: resolveCatalogPhoneFromChatId(chatId, lidMap),
        name: extractCatalogChatName(chat, canonicalChatId || chatId),
        unreadCount,
        activityTimestamp,
        lastMessageFromMe,
        chat,
      };
    })
    .filter(
      (item) =>
        item.phone &&
        !isWorkspaceSelfTarget({
          phone: item.phone,
          chatId: item.chatId,
          selfIdentity,
        }) &&
        isIndividualWahaChatId(item.chatId) &&
        item.activityTimestamp > 0,
    );

  const pending = new Map<
    string,
    {
      chatId: string;
      canonicalChatId: string;
      phone: string;
      name: string;
      unreadCount: number;
      activityTimestamp: number;
      lastMessageFromMe: boolean | null;
      chat: UnknownRecord;
    }
  >();

  for (const item of normalizedChats) {
    if (item.unreadCount > 0 || item.lastMessageFromMe === false) {
      pending.set(item.phone, {
        ...item,
        unreadCount:
          item.unreadCount > 0 ? item.unreadCount : item.lastMessageFromMe === false ? 1 : 0,
      });
    }
  }

  if (pending.size === 0) {
    const probeCandidates = normalizedChats
      .filter((item) => item.lastMessageFromMe === null && item.activityTimestamp > 0)
      .sort((left, right) => right.activityTimestamp - left.activityTimestamp)
      .slice(0, CIA_REMOTE_PENDING_PROBE_LIMIT);

    await forEachSequential(probeCandidates, async (candidate) => {
      const probeChatId = candidate.canonicalChatId || candidate.chatId;
      const messages = await whatsappApiProvider
        .getChatMessages(workspaceId, probeChatId, {
          limit: 3,
          offset: 0,
          downloadMedia: false,
        })
        .catch(() => []);

      const latestMessage = (Array.isArray(messages) ? messages : ([] as UnknownRecord[]))
        .map((message: UnknownRecord) => ({
          fromMe: message?.fromMe === true,
          timestamp: Number(message?.timestamp || message?.t || 0) || 0,
        }))
        .sort((left, right) => right.timestamp - left.timestamp)[0];

      if (!latestMessage || latestMessage.fromMe) {
        return;
      }

      pending.set(candidate.phone, {
        ...candidate,
        unreadCount: Math.max(1, candidate.unreadCount || 0),
        lastMessageFromMe: false,
      });
    });
  }

  return Array.from(pending.values())
    .sort((left, right) => {
      if (right.activityTimestamp !== left.activityTimestamp) {
        return right.activityTimestamp - left.activityTimestamp;
      }
      return right.unreadCount - left.unreadCount;
    })
    .slice(0, Math.max(1, limit));
}

async function seedRemoteUnreadConversationShells(input: {
  workspaceId: string;
  selfIdentity?: WorkspaceSelfIdentity | null;
  chats: Array<{
    chatId: string;
    phone: string;
    name: string;
    unreadCount: number;
    activityTimestamp: number;
    chat: UnknownRecord;
  }>;
}) {
  let seeded = 0;
  await forEachSequential(input.chats, async (item) => {
    if (
      !item.phone ||
      isWorkspaceSelfTarget({
        phone: item.phone,
        chatId: item.chatId,
        selfIdentity: input.selfIdentity,
      })
    ) {
      return;
    }

    const existing = await prisma.contact
      .findFirst({
        where: {
          workspaceId: input.workspaceId,
          phone: item.phone,
        },
        select: {
          customFields: true,
        },
      })
      .catch(() => null /* not found */);

    const contact = await prisma.contact.upsert({
      where: {
        workspaceId_phone: {
          workspaceId: input.workspaceId,
          phone: item.phone,
        },
      },
      update: {
        name: item.name || item.phone,
        customFields: {
          ...normalizeJsonObject(existing?.customFields),
          backlogSeededAt: new Date().toISOString(),
          lastCatalogChatId: item.chatId,
          lastRemoteChatId: item.chatId,
          lastResolvedChatId: item.chatId,
        },
      },
      create: {
        workspaceId: input.workspaceId,
        phone: item.phone,
        name: item.name || item.phone,
        customFields: {
          backlogSeededAt: new Date().toISOString(),
          lastCatalogChatId: item.chatId,
          lastRemoteChatId: item.chatId,
          lastResolvedChatId: item.chatId,
        },
      },
      select: {
        id: true,
      },
    });

    await upsertCatalogConversationShell({
      workspaceId: input.workspaceId,
      contactId: contact.id,
      lastMessageAt: item.activityTimestamp > 0 ? new Date(item.activityTimestamp) : new Date(),
      unreadCount: item.unreadCount,
    });

    seeded += 1;
  });

  return seeded;
}

async function scheduleBacklogContinuation(input: {
  workspaceId: string;
  reason: string;
  limit?: number;
  mode?: string;
}) {
  const runId = randomUUID();
  const payload = buildSweepUnreadConversationsJobData({
    workspaceId: input.workspaceId,
    runId,
    limit: Number(input.limit || CIA_BACKLOG_CONTINUATION_LIMIT) || CIA_BACKLOG_CONTINUATION_LIMIT,
    mode:
      input.mode === 'prioritize_hot' || input.mode === 'reply_only_new'
        ? input.mode
        : 'reply_all_recent_first',
  });

  try {
    await autopilotQueue.add(AUTOPILOT_SWEEP_UNREAD_CONVERSATIONS_JOB, payload, {
      jobId: buildQueueJobId('cia-backlog-continuation', input.workspaceId, runId),
      removeOnComplete: true,
    });
    return { scheduled: true as const, runId, limit: payload.limit };
  } catch (error: unknown) {
    const errorInstanceofError =
      error instanceof Error
        ? error
        : new Error(typeof error === 'string' ? error : 'unknown error');
    return {
      scheduled: false as const,
      runId,
      limit: payload.limit,
      reason: String(errorInstanceofError?.message || 'schedule_failed'),
    };
  }
}

async function setWorkspaceSilentLiveMode(input: {
  workspaceId: string;
  reason: string;
  catalogStatus?: string;
}) {
  const workspace = await prisma.workspace.findUnique({
    where: { id: input.workspaceId },
    select: { providerSettings: true },
  });
  if (!workspace) {
    return;
  }

  const settings = (workspace.providerSettings as UnknownRecord) || {};
  const autonomy = (settings.autonomy || {}) as Record<string, unknown>;

  await prisma.workspace.update({
    where: { id: input.workspaceId },
    data: {
      providerSettings: {
        ...settings,
        autopilot: {
          ...(settings.autopilot || {}),
          enabled: true,
          enabledByOwnerDecision: true,
          lastMode: 'reply_only_new',
          lastTrigger: input.reason,
          lastModeAt: new Date().toISOString(),
        },
        autonomy: {
          ...autonomy,
          mode: 'FULL',
          reason: input.reason,
          reactiveEnabled: true,
          proactiveEnabled: false,
          autoBootstrapOnConnected: autonomy.autoBootstrapOnConnected !== false,
          lastTransitionAt: new Date().toISOString(),
        },
        ciaRuntime: {
          ...((settings.ciaRuntime as UnknownRecord) || {}),
          state: 'LIVE_READY',
          currentRunId: null,
          mode: 'reply_only_new',
          autoStarted: false,
          catalogStatus: input.catalogStatus || 'idle',
          lastCatalogScheduledAt: new Date().toISOString(),
          lastCatalogScheduleReason: input.reason,
        },
      },
    },
  });
}

async function finalizeBacklogIntoSilentCatalog(input: {
  workspaceId: string;
  runId?: string;
  reason: string;
}) {
  if (!input.workspaceId) {
    return;
  }

  const lockKey = `cia:post-backlog:${input.workspaceId}:${input.runId || 'default'}`;
  const reserved = await redis.set(lockKey, input.reason, 'EX', 30, 'NX');
  if (reserved !== 'OK') {
    return;
  }

  const workspace = await prisma.workspace.findUnique({
    where: { id: input.workspaceId },
    select: { providerSettings: true },
  });
  const selfIdentity = await resolveWorkspaceSelfIdentity(
    input.workspaceId,
    (workspace?.providerSettings as UnknownRecord) || {},
  );

  let localPending = 0;
  try {
    const conversations = await prisma.conversation.findMany({
      where: {
        workspaceId: input.workspaceId,
        status: { not: 'CLOSED' },
      },
      select: {
        id: true,
        status: true,
        mode: true,
        assignedAgentId: true,
        unreadCount: true,
        contact: {
          select: {
            phone: true,
          },
        },
        messages: {
          select: {
            direction: true,
            createdAt: true,
          },
          orderBy: { createdAt: 'desc' },
          take: 5,
        },
      },
    });
    localPending = conversations.filter(
      (conversation) =>
        !isWorkspaceSelfTarget({
          phone: conversation.contact?.phone,
          selfIdentity,
        }) && isConversationPendingForAgent(conversation),
    ).length;
  } catch {
    localPending = 0;
  }

  const remoteUnreadChats = await getRemoteUnreadChatSnapshot(
    input.workspaceId,
    CIA_BACKLOG_CONTINUATION_LIMIT,
    selfIdentity,
  ).catch(() => []);
  const pending = Math.max(localPending, remoteUnreadChats.length);

  if (pending > 0) {
    if (remoteUnreadChats.length > 0) {
      await seedRemoteUnreadConversationShells({
        workspaceId: input.workspaceId,
        selfIdentity,
        chats: remoteUnreadChats,
      }).catch(() => 0);
    }

    const continuation = await scheduleBacklogContinuation({
      workspaceId: input.workspaceId,
      reason: 'backlog_continue_until_waha_zero',
      limit: Math.max(remoteUnreadChats.length, Math.min(CIA_BACKLOG_CONTINUATION_LIMIT, pending)),
      mode: 'reply_all_recent_first',
    });

    await publishAgentEvent({
      type: 'status',
      workspaceId: input.workspaceId,
      runId: input.runId,
      phase: 'backlog_continue',
      persistent: true,
      message:
        remoteUnreadChats.length > 0
          ? `Ainda restam ${remoteUnreadChats.length} conversa(s) pendentes no WAHA. Vou continuar o backlog até zerar tudo.`
          : `Ainda restam ${localPending} conversa(s) pendentes localmente. Vou continuar o backlog até zerar tudo.`,
      meta: {
        localPending,
        remotePending: remoteUnreadChats.length,
        continuation,
      },
    });
    return;
  }

  const catalog = await scheduleCatalogContactsJob(input.workspaceId, input.reason);
  await setWorkspaceSilentLiveMode({
    workspaceId: input.workspaceId,
    reason: input.reason,
    catalogStatus: catalog.scheduled ? 'scheduled' : catalog.reason || 'idle',
  });
  await publishAgentEvent({
    type: 'status',
    workspaceId: input.workspaceId,
    runId: input.runId,
    phase: 'live_ready',
    persistent: true,
    message: catalog.scheduled
      ? 'Backlog concluído. Vou manter a resposta ao vivo e iniciar a catalogação silenciosa dos contatos recentes.'
      : 'Backlog concluído. Vou manter a resposta ao vivo e permanecer em modo silencioso.',
    meta: {
      catalog,
    },
  });
}

async function maybeEscalateToHumanControl(input: {
  workspaceId: string;
  contactId?: string;
  contactName?: string;
  phone?: string;
  runId?: string;
  decisionEnvelope: ReturnType<typeof buildDecisionEnvelope>;
  messageContent?: string;
  intent?: string;
  action?: string;
}) {
  if (input.action === 'AUTONOMOUS_FALLBACK' && input.decisionEnvelope.riskFlags.length === 0) {
    return { blocked: false as const };
  }

  const allowedToSend = shouldAutonomousSend(input.decisionEnvelope, 'AUTONOMOUS');

  if (allowedToSend) {
    return { blocked: false as const };
  }

  const humanTask = buildHumanTask({
    workspaceId: input.workspaceId,
    contactId: input.contactId,
    phone: input.phone,
    decision: input.decisionEnvelope,
    messageContent: input.messageContent,
  });

  if (humanTask) {
    const lockedConversation = await lockConversationForHumanReview({
      workspaceId: input.workspaceId,
      contactId: input.contactId,
      phone: input.phone,
    });
    const taskPayload = {
      ...humanTask,
      conversationId: lockedConversation?.id || null,
      status: 'OPEN' as const,
    };

    await persistHumanTask(prisma, {
      workspaceId: input.workspaceId,
      task: taskPayload,
    });

    await persistSystemInsight(prisma, {
      workspaceId: input.workspaceId,
      type: 'CIA_HUMAN_TASK',
      title: `Validação humana necessária para ${input.contactName || input.phone || 'contato'}`,
      description: humanTask.reason,
      severity: humanTask.urgency === 'CRITICAL' ? 'CRITICAL' : 'WARNING',
      metadata: {
        contactId: input.contactId,
        phone: input.phone,
        taskType: humanTask.taskType,
        urgency: humanTask.urgency,
        riskFlags: input.decisionEnvelope.riskFlags,
      },
    });

    const transferExecution = await beginAutonomyExecution({
      workspaceId: input.workspaceId,
      actionType: 'TRANSFER_HUMAN',
      contactId: input.contactId,
      idempotencyKey: buildAutonomyExecutionKey({
        workspaceId: input.workspaceId,
        actionType: 'TRANSFER_HUMAN',
        contactId: input.contactId,
        phone: input.phone,
        payload: {
          reason: humanTask.reason,
          urgency: humanTask.urgency,
          riskFlags: input.decisionEnvelope.riskFlags,
          nextAction: input.decisionEnvelope.nextAction,
        },
      }),
      request: {
        phone: input.phone || null,
        reason: humanTask.reason,
        urgency: humanTask.urgency,
        riskFlags: input.decisionEnvelope.riskFlags,
        nextAction: input.decisionEnvelope.nextAction,
      },
    });
    if (transferExecution.allowed) {
      await finishAutonomyExecution(transferExecution.record?.id, 'SUCCESS', {
        response: {
          humanTaskId: humanTask.id,
          conversationId: lockedConversation?.id || null,
          status: 'conversation_locked_human',
        },
      });
    }
  }

  await publishAgentEvent({
    type: 'status',
    workspaceId: input.workspaceId,
    runId: input.runId,
    phase: 'human_validation',
    persistent: true,
    message: `Preciso de validação humana para ${input.contactName || input.phone || 'este contato'}. Motivo: ${
      humanTask?.reason || 'risco operacional identificado'
    }`,
    meta: {
      contactId: input.contactId,
      contactName: input.contactName || null,
      phone: input.phone || null,
      riskFlags: input.decisionEnvelope.riskFlags,
      urgency: humanTask?.urgency || null,
      nextAction: input.decisionEnvelope.nextAction,
    },
  });

  await logAutopilotAction({
    workspaceId: input.workspaceId,
    contactId: input.contactId,
    phone: input.phone,
    action: input.action || 'HUMAN_REVIEW_REQUIRED',
    intent: input.intent,
    status: 'skipped',
    reason: humanTask?.reason || 'human_validation_required',
    meta: {
      humanTaskId: humanTask?.id,
      riskFlags: input.decisionEnvelope.riskFlags,
      confidence: input.decisionEnvelope.confidence,
      capabilities: input.decisionEnvelope.capabilities,
    },
  });

  return {
    blocked: true as const,
    summary: humanTask?.reason || 'A IA decidiu escalar este caso para validação humana.',
  };
}

async function findConversationAutomationState(input: {
  workspaceId: string;
  contactId?: string;
  phone?: string;
}) {
  if (!input.contactId && !input.phone) {
    return null;
  }

  return prisma.conversation.findFirst({
    where: {
      workspaceId: input.workspaceId,
      ...(input.contactId
        ? { contactId: input.contactId }
        : input.phone
          ? { contact: { phone: input.phone } }
          : {}),
    },
    orderBy: [{ updatedAt: 'desc' }],
    select: {
      id: true,
      mode: true,
      status: true,
      assignedAgentId: true,
    },
  });
}

async function lockConversationForHumanReview(input: {
  workspaceId: string;
  contactId?: string;
  phone?: string;
}) {
  const conversation = await findConversationAutomationState(input);
  if (!conversation || conversation.mode === 'HUMAN') {
    return conversation;
  }

  await prisma.conversation.updateMany({
    where: { id: conversation.id, workspaceId: input.workspaceId },
    data: { mode: 'HUMAN' },
  });

  return {
    ...conversation,
    mode: 'HUMAN',
  };
}

function resolveScanDeliveryMode(data: {
  messageId?: string;
  runId?: string;
  deliveryMode?: 'reactive' | 'proactive';
}): 'reactive' | 'proactive' {
  if (data?.deliveryMode === 'reactive' || data?.deliveryMode === 'proactive') {
    return data.deliveryMode;
  }
  return data?.messageId && !data?.runId ? 'reactive' : 'proactive';
}

function getSharedReplyLockKey(
  workspaceId: string,
  contactId?: string | null,
  phone?: string | null,
) {
  const normalizedPhone = String(phone || '').replace(NON_DIGIT_RE, '');
  return `autopilot:reply:${workspaceId}:${contactId || normalizedPhone}`;
}

export async function runScanContact(data: UnknownRecord) {
  const { workspaceId } = data || {};
  if (!workspaceId) return;
  const smokeTestId = data?.smokeTestId as string | undefined;
  const smokeMode = data?.smokeMode === 'live' ? 'live' : 'dry-run';
  const runId = data?.runId as string | undefined;
  const requestedDeliveryMode = resolveScanDeliveryMode(data || {});

  const workspace = await prisma.workspace.findUnique({ where: { id: workspaceId } });
  const settings = (workspace?.providerSettings ?? {}) as UnknownRecord;
  const selfIdentity = await resolveWorkspaceSelfIdentity(workspaceId, settings);
  const aggregated = await buildPendingMessageBatch({
    workspaceId,
    contactId: data?.contactId,
    phone: data?.phone,
    chatId: data?.chatId,
    fallbackMessageContent: data?.messageContent,
    selfIdentity,
  });

  let finalStatus: 'sent' | 'failed' | 'skipped' = 'skipped';
  let finalSummary = 'sem ação';
  let finalContactId = data?.contactId as string | undefined;
  let finalPhone = data?.phone as string | undefined;
  let finalContactName = data?.contactName as string | undefined;
  let finalChatId = data?.chatId as string | undefined;
  let replyLockKey: string | null = null;
  let keepReplyLock = false;

  try {
    if (!aggregated) {
      log.info('autopilot_scan_contact_empty', {
        workspaceId,
        contactId: data?.contactId,
        phone: data?.phone,
      });
      autopilotPipelineCounter.inc({
        workspaceId,
        stage: 'scan_contact',
        result: 'empty',
      });
      await reportSmokeTest(smokeTestId, {
        status: 'empty',
        workspaceId,
        contactId: data?.contactId,
        phone: data?.phone,
      });
      finalSummary = 'Nenhuma mensagem pendente para este contato.';
      return;
    }

    const {
      contactId,
      phone,
      chatId,
      contactName,
      leadScore,
      messageContent,
      messageCount,
      messageIds,
      providerMessageIds,
      customerMessages,
    } = aggregated;
    const effectiveDeliveryMode: 'reactive' | 'proactive' =
      requestedDeliveryMode === 'reactive'
        ? 'reactive'
        : isRecentLiveConversation(customerMessages || [])
          ? 'reactive'
          : 'proactive';

    finalContactId = contactId;
    finalPhone = phone;
    finalContactName = contactName;
    finalChatId = chatId;
    if (contactId && chatId) {
      const existingContact = await prisma.contact
        .findUnique({
          where: { id: contactId },
          select: { customFields: true },
        })
        .catch(() => null /* not found */);
      const existingCustomFields = normalizeJsonObject(existingContact?.customFields);
      await prisma.contact
        .update({
          where: { id: contactId },
          data: {
            customFields: {
              ...existingCustomFields,
              lastRemoteChatId: chatId,
              lastResolvedChatId: chatId,
            },
          },
        })
        .catch((err) => {
          log.warn('contact_update_chatid_failed', { error: err?.message, contactId });
          return undefined;
        });
    }
    if (
      isWorkspaceSelfTarget({
        phone,
        chatId,
        selfIdentity,
      })
    ) {
      finalSummary = 'O agente ignorou o próprio número da sessão.';
      await logAutopilotAction({
        workspaceId,
        contactId,
        phone,
        action: 'SCAN_CONTACT',
        intent: 'SELF_CONTACT',
        status: 'skipped',
        reason: 'workspace_self_contact',
        meta: {
          source: 'scan_contact',
          chatId: chatId || null,
        },
      });
      return;
    }
    replyLockKey = getSharedReplyLockKey(workspaceId, contactId, phone);
    const replyReserved = await redis.set(
      replyLockKey,
      String(data?.messageId || runId || 'scan-contact'),
      'PX',
      SHARENON_DIGIT_REPLY_LOCK_MS,
      'NX',
    );
    if (replyReserved !== 'OK') {
      finalSummary = 'Contato já está sendo respondido por outro pipeline.';
      return;
    }

    const conversation = await findConversationAutomationState({
      workspaceId,
      contactId,
      phone,
    });
    if (conversation && resolveConversationOwner(conversation) !== 'AGENT') {
      const blockedReason = conversation.assignedAgentId ? 'assigned_to_human' : 'human_mode_lock';
      await logAutopilotAction({
        workspaceId,
        contactId,
        phone,
        action: 'SCAN_CONTACT',
        intent: 'HUMAN_REVIEW_REQUIRED',
        status: 'skipped',
        reason: blockedReason,
        meta: {
          source: 'scan_contact',
          conversationId: conversation.id,
          conversationMode: conversation.mode,
          conversationStatus: conversation.status,
          assignedAgentId: conversation.assignedAgentId || null,
          owner: resolveConversationOwner(conversation),
        },
      });
      autopilotPipelineCounter.inc({
        workspaceId,
        stage: 'scan_contact',
        result: blockedReason,
      });
      await publishAgentEvent({
        type: 'status',
        workspaceId,
        runId,
        phase: 'human_mode_lock',
        persistent: true,
        message: `A conversa com ${contactName || phone} está aguardando ação humana.`,
        meta: {
          contactId,
          contactName,
          phone,
          conversationId: conversation.id,
          conversationMode: conversation.mode,
          assignedAgentId: conversation.assignedAgentId || null,
          owner: resolveConversationOwner(conversation),
        },
      });
      finalSummary = 'Conversa travada em modo humano.';
      return;
    }

    log.info('autopilot_scan_contact', {
      workspaceId,
      contactId,
      phone,
      messageCount,
    });
    autopilotPipelineCounter.inc({
      workspaceId,
      stage: 'scan_contact',
      result: 'processing',
    });
    await reportSmokeTest(smokeTestId, {
      status: 'processing',
      workspaceId,
      contactId,
      phone,
      messageCount,
    });

    await publishAgentEvent({
      type: 'thought',
      workspaceId,
      runId,
      phase: 'open_contact',
      message: `Abrindo conversa com ${contactName || phone}`,
      meta: {
        contactId,
        contactName,
        phone,
        backlogIndex: data?.backlogIndex,
        backlogTotal: data?.backlogTotal,
      },
    });

    if (!isAutonomousEnabled(settings)) {
      autopilotDecisionCounter.inc({
        workspaceId,
        intent: 'DISABLED',
        action: 'NONE',
        result: 'skipped',
      });
      autopilotPipelineCounter.inc({
        workspaceId,
        stage: 'scan_contact',
        result: 'disabled',
      });
      await reportSmokeTest(smokeTestId, {
        status: 'disabled',
        workspaceId,
        contactId,
        phone,
      });
      finalSummary = 'Autopilot desativado para este workspace.';
      return;
    }

    if (settings?.billingSuspended === true) {
      log.info('autopilot_skip_billing_suspended', { workspaceId });
      try {
        await prisma.autopilotEvent.create({
          data: {
            workspaceId,
            contactId,
            intent: 'BILLING',
            action: 'SUSPENDED',
            status: 'skipped',
            reason: 'billing_suspended',
            meta: { source: 'autopilot_worker' },
          },
        });
      } catch (err: unknown) {
        const errInstanceofError =
          err instanceof Error ? err : new Error(typeof err === 'string' ? err : 'unknown error');
        log.warn('autopilot_event_billing_skip_failed', { error: errInstanceofError?.message });
      }
      await notifyBillingSuspended(workspaceId);
      autopilotDecisionCounter.inc({
        workspaceId,
        intent: 'BILLING_SUSPENDED',
        action: 'NONE',
        result: 'skipped',
      });
      autopilotPipelineCounter.inc({
        workspaceId,
        stage: 'scan_contact',
        result: 'billing_suspended',
      });
      await reportSmokeTest(smokeTestId, {
        status: 'billing_suspended',
        workspaceId,
        contactId,
        phone,
      });
      finalSummary = 'Billing suspenso. O contato não pode ser atendido automaticamente.';
      return;
    }

    const productMatches = await findWorkspaceProductMatches(workspaceId, messageContent);

    await publishAgentEvent({
      type: 'thought',
      workspaceId,
      runId,
      phase: 'analyze_contact',
      message:
        productMatches.length > 0
          ? `Identifiquei interesse em ${productMatches.join(', ')}.`
          : 'Lendo o histórico recente e entendendo a intenção do contato.',
      meta: {
        contactId,
        contactName,
        phone,
        matchedProducts: productMatches,
      },
    });

    const demandState = computeDemandState({
      lastMessageAt: new Date(),
      unreadCount: messageCount,
      leadScore: leadScore || 0,
      lastMessageText: messageContent,
    });

    if (contactId) {
      await persistDemandState(prisma, {
        workspaceId,
        contactId,
        state: demandState,
        contactName,
      });
    }

    const cognitiveState = await computePersistentCognitiveState({
      workspaceId,
      conversationId: conversation?.id,
      contactId,
      phone,
      contactName,
      messageContent,
      unreadCount: messageCount,
      lastMessageAt: new Date(),
      leadScore: leadScore || 0,
      demandState,
      source: 'scan_contact',
    });

    await publishAgentEvent({
      type: 'thought',
      workspaceId,
      runId,
      phase: 'cognitive_state',
      message: `Estado cognitivo de ${contactName || phone}: ${cognitiveState.summary}`,
      meta: {
        contactId,
        contactName,
        phone,
        nextBestAction: cognitiveState.nextBestAction,
        intent: cognitiveState.intent,
        stage: cognitiveState.stage,
        confidence: cognitiveState.classificationConfidence,
      },
    });

    if (cognitiveState.nextBestAction === 'WAIT') {
      await publishAgentEvent({
        type: 'status',
        workspaceId,
        runId,
        phase: 'cognitive_wait',
        message: `Vou esperar mais sinais antes de agir com ${contactName || phone}.`,
        meta: {
          contactId,
          phone,
          nextBestAction: cognitiveState.nextBestAction,
          summary: cognitiveState.summary,
        },
      });
      await logAutopilotAction({
        workspaceId,
        contactId,
        phone,
        action: 'SCAN_CONTACT',
        intent: cognitiveState.intent,
        status: 'skipped',
        reason: 'cognitive_wait',
        meta: {
          source: 'scan_contact',
          nextBestAction: cognitiveState.nextBestAction,
          cognitiveSummary: cognitiveState.summary,
        },
      });
      await recordDecisionOutcome(prisma, {
        workspaceId,
        contactId,
        conversationId: conversation?.id,
        phone,
        action: cognitiveState.nextBestAction,
        outcome: 'WAITED',
        reward: computeCognitiveRewardSignal(cognitiveState.nextBestAction, cognitiveState),
        message: cognitiveState.summary,
        metadata: {
          source: 'scan_contact',
        },
      });
      finalSummary = 'Estado cognitivo indicou espera antes da próxima ação.';
      return;
    }

    if (cognitiveState.nextBestAction === 'ESCALATE_HUMAN') {
      const cognitiveEnvelope = buildDecisionEnvelope({
        intent: cognitiveState.intent,
        action: 'COGNITIVE_ESCALATION',
        confidence: cognitiveState.classificationConfidence,
        messageContent,
        demandState,
        matchedProducts: productMatches,
      });
      const humanGate = await maybeEscalateToHumanControl({
        workspaceId,
        contactId,
        contactName,
        phone,
        runId,
        decisionEnvelope: cognitiveEnvelope,
        messageContent,
        intent: cognitiveState.intent,
        action: 'COGNITIVE_ESCALATION',
      });
      await recordDecisionOutcome(prisma, {
        workspaceId,
        contactId,
        conversationId: conversation?.id,
        phone,
        action: cognitiveState.nextBestAction,
        outcome: humanGate.blocked ? 'ESCALATED' : 'SKIPPED',
        reward: computeCognitiveRewardSignal(cognitiveState.nextBestAction, cognitiveState),
        message: cognitiveState.summary,
        metadata: {
          source: 'scan_contact',
          blocked: humanGate.blocked,
        },
      });
      if (humanGate.blocked) {
        finalSummary = humanGate.summary;
        return;
      }
    }

    if (
      [
        'ASK_CLARIFYING',
        'SOCIAL_PROOF',
        'OFFER',
        'PAYMENT_RECOVERY',
        'FOLLOWUP_SOFT',
        'FOLLOWUP_URGENT',
      ].includes(cognitiveState.nextBestAction)
    ) {
      const conversationTacticPlan = buildConversationTacticPlan({
        action: cognitiveState.nextBestAction,
        state: cognitiveState,
      });
      assertConversationTacticPlan(conversationTacticPlan);
      const text = buildCognitiveMessage({
        action: cognitiveState.nextBestAction,
        state: cognitiveState,
        contactName,
        matchedProducts: productMatches,
        tactic: conversationTacticPlan.selectedTactic,
      });

      const cognitiveEnvelope = buildDecisionEnvelope({
        intent: cognitiveState.intent,
        action: cognitiveState.nextBestAction,
        confidence: cognitiveState.classificationConfidence,
        messageContent,
        demandState,
        matchedProducts: productMatches,
      });
      const humanGate = await maybeEscalateToHumanControl({
        workspaceId,
        contactId,
        contactName,
        phone,
        runId,
        decisionEnvelope: cognitiveEnvelope,
        messageContent,
        intent: cognitiveState.intent,
        action: cognitiveState.nextBestAction,
      });
      if (humanGate.blocked) {
        await recordDecisionOutcome(prisma, {
          workspaceId,
          contactId,
          conversationId: conversation?.id,
          phone,
          action: cognitiveState.nextBestAction,
          outcome: 'ESCALATED',
          reward: computeCognitiveRewardSignal(cognitiveState.nextBestAction, cognitiveState),
          message: text,
          metadata: {
            source: 'scan_contact',
            blocked: true,
          },
        });
        finalSummary = humanGate.summary;
        return;
      }

      if (smokeTestId && smokeMode !== 'live') {
        autopilotPipelineCounter.inc({
          workspaceId,
          stage: 'reply',
          result: 'preview',
        });
        await reportSmokeTest(smokeTestId, {
          status: 'completed',
          mode: smokeMode,
          workspaceId,
          contactId,
          phone,
          decision: {
            intent: cognitiveState.intent,
            action: cognitiveState.nextBestAction,
          },
          responseText: text,
          matchedProducts: productMatches,
        });
        finalSummary = 'Resposta cognitiva gerada em modo preview.';
        return;
      }

      const sendResult = await sendDirectAutopilotText({
        workspaceId,
        contactId,
        conversationId: conversation?.id,
        phone,
        contactName,
        text,
        settings,
        intent: cognitiveState.intent,
        reason: 'cognitive_next_best_action',
        workspaceRecord: workspace,
        intentConfidence: cognitiveState.classificationConfidence,
        actionLabel: cognitiveState.nextBestAction,
        usedHistory: true,
        usedKb: productMatches.length > 0,
        deliveryMode: effectiveDeliveryMode,
        smokeTestId,
        smokeMode,
        runId,
        customerMessages,
        idempotencyContext: {
          source: 'scan_contact_cognitive_action',
          action: cognitiveState.nextBestAction,
          conversationTactic: conversationTacticPlan.selectedTactic || null,
          conversationTacticUniverse: conversationTacticPlan.candidates,
          messageIds,
          providerMessageIds,
          runId: runId || null,
        },
      });
      finalStatus = sendResult === 'executed' ? 'sent' : 'skipped';
      await recordDecisionOutcome(prisma, {
        workspaceId,
        contactId,
        conversationId: conversation?.id,
        phone,
        action: cognitiveState.nextBestAction,
        outcome: sendResult === 'executed' ? 'SENT' : 'SKIPPED',
        reward: computeCognitiveRewardSignal(cognitiveState.nextBestAction, cognitiveState),
        message: text,
        metadata: {
          source: 'scan_contact',
          matchedProducts: productMatches,
        },
      });
      finalSummary =
        sendResult === 'executed'
          ? 'Resposta cognitiva enviada com sucesso.'
          : 'Ação cognitiva pulada por política operacional.';
      return;
    }

    const useUnifiedAgent =
      cognitiveState.nextBestAction === 'RESPOND' ||
      productMatches.length > 0 ||
      shouldUseUnifiedAgent({
        messageContent,
        leadScore: leadScore || undefined,
        settings,
      });

    let decision: AutopilotDecision;
    let unifiedAgentResponse: string | null = null;

    if (useUnifiedAgent) {
      log.info('autopilot_using_unified_agent', {
        workspaceId,
        contactId,
        messageCount,
        matchedProducts: productMatches,
      });

      const unifiedResult = await processWithUnifiedAgent({
        workspaceId,
        contactId,
        phone,
        message: messageContent,
        context: {
          source: 'autopilot_worker',
          aggregatedPendingMessages: messageCount,
          pendingMessageIds: messageIds,
          matchedProducts: productMatches,
        },
      });

      if (unifiedResult) {
        decision = mapUnifiedActionsToAutopilot(unifiedResult.actions);
        unifiedAgentResponse = extractTextResponse(unifiedResult);

        log.info('autopilot_unified_decision', {
          decision,
          hasResponse: !!unifiedAgentResponse,
        });

        if (decision.alreadyExecuted) {
          const observedExecution = await beginAutonomyExecution({
            workspaceId,
            actionType: 'UNIFIED_AGENT_EXECUTED',
            contactId,
            conversationId: conversation?.id,
            idempotencyKey: buildAutonomyExecutionKey({
              workspaceId,
              actionType: 'UNIFIED_AGENT_EXECUTED',
              contactId,
              conversationId: conversation?.id,
              phone,
              payload: {
                source: 'unified_agent_already_executed',
                actions: unifiedResult.actions,
                response: unifiedAgentResponse || null,
                messageIds,
                runId: runId || null,
              },
            }),
            request: {
              phone,
              actions: unifiedResult.actions,
              response: unifiedAgentResponse || null,
              source: 'unified_agent_already_executed',
              messageIds,
              runId: runId || null,
            },
          });
          if (observedExecution.allowed) {
            await finishAutonomyExecution(observedExecution.record?.id, 'SUCCESS', {
              response: {
                channel: 'UNIFIED_AGENT_TOOL',
                actions: unifiedResult.actions,
                response: unifiedAgentResponse || null,
              },
            });
          }
          keepReplyLock = true;

          autopilotDecisionCounter.inc({
            workspaceId,
            intent: decision.intent,
            action: 'UNIFIED_AGENT',
            result: 'success',
          });
          autopilotPipelineCounter.inc({
            workspaceId,
            stage: 'unified_agent',
            result: 'already_executed',
          });
          await reportSmokeTest(smokeTestId, {
            status: 'already_executed',
            workspaceId,
            contactId,
            phone,
            decision,
          });
          finalSummary = 'A resposta já havia sido executada.';
          return;
        }

        if (unifiedAgentResponse && !decision.alreadyExecuted) {
          const decisionEnvelope = buildDecisionEnvelope({
            intent: decision.intent,
            action: 'UNIFIED_AGENT_TEXT',
            confidence: decision.confidence,
            messageContent,
            demandState,
            matchedProducts: productMatches,
          });

          const humanGate = await maybeEscalateToHumanControl({
            workspaceId,
            contactId,
            contactName,
            phone,
            runId,
            decisionEnvelope,
            messageContent,
            intent: decision.intent,
            action: 'UNIFIED_AGENT_TEXT',
          });
          if (humanGate.blocked) {
            finalSummary = humanGate.summary;
            return;
          }

          await publishAgentEvent({
            type: 'thought',
            workspaceId,
            runId,
            phase: 'compose_reply',
            message: `Preparando resposta para ${contactName || phone}.`,
            meta: {
              contactId,
              contactName,
              phone,
              intent: decision.intent,
            },
          });

          if (smokeTestId && smokeMode !== 'live') {
            autopilotPipelineCounter.inc({
              workspaceId,
              stage: 'reply',
              result: 'preview',
            });
            await reportSmokeTest(smokeTestId, {
              status: 'completed',
              mode: smokeMode,
              workspaceId,
              contactId,
              phone,
              decision,
              responseText: unifiedAgentResponse,
              matchedProducts: productMatches,
            });
            finalSummary = 'Resposta gerada em modo preview.';
            return;
          }

          const sendResult = await sendDirectAutopilotText({
            workspaceId,
            contactId,
            conversationId: conversation?.id,
            phone,
            contactName,
            text: unifiedAgentResponse,
            settings,
            intent: decision.intent,
            reason: decision.reason,
            workspaceRecord: workspace,
            intentConfidence: decision.confidence,
            actionLabel: 'UNIFIED_AGENT_TEXT',
            usedHistory: true,
            usedKb: productMatches.length > 0,
            deliveryMode: effectiveDeliveryMode,
            smokeTestId,
            smokeMode,
            runId,
            customerMessages,
            idempotencyContext: {
              source: 'scan_contact_unified_agent_text',
              messageIds,
              providerMessageIds,
              runId: runId || null,
            },
          });

          finalStatus = sendResult === 'executed' ? 'sent' : 'skipped';
          keepReplyLock = sendResult === 'executed';
          finalSummary =
            sendResult === 'executed'
              ? 'Resposta enviada com texto gerado pelo Unified Agent.'
              : 'A resposta foi pulada por política operacional.';
          return;
        }
      } else {
        log.warn('autopilot_unified_fallback', { workspaceId });
        decision = await decideActionSafe({
          workspaceId,
          contactId,
          phone,
          messageContent,
          settings,
        });
      }
    } else {
      decision = await decideActionSafe({
        workspaceId,
        contactId,
        phone,
        messageContent,
        settings,
      });
    }

    log.info('autopilot_decision', { decision });

    if (!decision.action || decision.action === 'NONE') {
      const decisionEnvelope = buildDecisionEnvelope({
        intent: decision.intent || 'GENERAL_ASSISTANCE',
        action: 'AUTONOMOUS_FALLBACK',
        confidence: decision.confidence,
        messageContent,
        demandState,
        matchedProducts: productMatches,
      });

      const humanGate = await maybeEscalateToHumanControl({
        workspaceId,
        contactId,
        contactName,
        phone,
        runId,
        decisionEnvelope,
        messageContent,
        intent: decision.intent || 'GENERAL_ASSISTANCE',
        action: 'AUTONOMOUS_FALLBACK',
      });
      if (humanGate.blocked) {
        finalSummary = humanGate.summary;
        return;
      }

      const fallbackText = await generateAutonomousFallbackResponse({
        workspaceId,
        messageContent,
        settings,
        matchedProducts: productMatches,
        contactId,
        phone,
        deliveryMode: effectiveDeliveryMode,
        contactName,
        cognitiveState,
      });

      await publishAgentEvent({
        type: 'thought',
        workspaceId,
        runId,
        phase: 'compose_reply',
        message: `Preparando uma resposta útil para ${contactName || phone}.`,
        meta: {
          contactId,
          contactName,
          phone,
        },
      });

      if (smokeTestId && smokeMode !== 'live') {
        autopilotPipelineCounter.inc({
          workspaceId,
          stage: 'reply',
          result: 'preview',
        });
        await reportSmokeTest(smokeTestId, {
          status: 'completed',
          mode: smokeMode,
          workspaceId,
          contactId,
          phone,
          decision,
          responseText: fallbackText,
          matchedProducts: productMatches,
        });
        finalSummary = 'Fallback gerado em modo preview.';
        return;
      }

      const sendResult = await sendDirectAutopilotText({
        workspaceId,
        contactId,
        conversationId: conversation?.id,
        phone,
        contactName,
        text: fallbackText,
        settings,
        intent: decision.intent || 'GENERAL_ASSISTANCE',
        reason: decision.reason || 'autonomous_fallback',
        workspaceRecord: workspace,
        intentConfidence: decision.confidence,
        actionLabel: 'AUTONOMOUS_FALLBACK',
        usedHistory: true,
        usedKb: productMatches.length > 0 || decision.usedKb,
        deliveryMode: effectiveDeliveryMode,
        smokeTestId,
        smokeMode,
        runId,
        customerMessages,
        idempotencyContext: {
          source: 'scan_contact_autonomous_fallback',
          messageIds,
          providerMessageIds,
          runId: runId || null,
        },
      });

      finalStatus = sendResult === 'executed' ? 'sent' : 'skipped';
      keepReplyLock = sendResult === 'executed';
      finalSummary =
        sendResult === 'executed'
          ? 'Resposta enviada com fallback autônomo.'
          : 'Fallback pulado por política operacional.';
      return;
    }

    const decisionEnvelope = buildDecisionEnvelope({
      intent: decision.intent,
      action: decision.action,
      confidence: decision.confidence,
      messageContent,
      demandState,
      matchedProducts: productMatches,
    });

    const humanGate = await maybeEscalateToHumanControl({
      workspaceId,
      contactId,
      contactName,
      phone,
      runId,
      decisionEnvelope,
      messageContent,
      intent: decision.intent,
      action: decision.action,
    });
    if (humanGate.blocked) {
      finalSummary = humanGate.summary;
      return;
    }

    await publishAgentEvent({
      type: 'thought',
      workspaceId,
      runId,
      phase: 'compose_reply',
      message: `Executando a ação ${decision.action} para ${contactName || phone}.`,
      meta: {
        contactId,
        contactName,
        phone,
        action: decision.action,
        intent: decision.intent,
      },
    });

    const executeResult = await executeAction(decision.action, {
      workspaceId,
      contactId,
      conversationId: conversation?.id,
      phone,
      chatId,
      contactName,
      messageContent,
      settings,
      intent: decision.intent,
      reason: decision.reason,
      workspaceRecord: workspace,
      intentConfidence: decision.confidence,
      usedHistory: true,
      usedKb: productMatches.length > 0 || decision.usedKb,
      deliveryMode: effectiveDeliveryMode,
      smokeTestId,
      smokeMode,
      runId,
      customerMessages,
      idempotencyContext: {
        source: 'scan_contact_action',
        messageIds,
        providerMessageIds,
        runId: runId || null,
      },
    });

    finalStatus = executeResult === 'executed' ? 'sent' : 'skipped';
    keepReplyLock = executeResult === 'executed';
    finalSummary =
      executeResult === 'executed'
        ? `Ação ${decision.action} executada com sucesso.`
        : `Ação ${decision.action} pulada por política operacional.`;
  } catch (err: unknown) {
    const errInstanceofError =
      err instanceof Error ? err : new Error(typeof err === 'string' ? err : 'unknown error');
    finalStatus = 'failed';
    finalSummary = errInstanceofError?.message || 'Erro ao processar contato';
    throw err;
  } finally {
    if (finalStatus === 'sent') {
      const finalContactRecord = finalContactId
        ? await prisma.contact
            .findUnique({
              where: { id: finalContactId },
              select: {
                id: true,
                name: true,
                customFields: true,
              },
            })
            .catch(() => null /* not found */)
        : null;
      const finalCustomFields = normalizeJsonObject(finalContactRecord?.customFields);

      if (finalPhone) {
        const trustedProfile = await ensureTrustedContactProfile({
          workspaceId,
          contactId: finalContactId,
          phone: finalPhone,
          chatId:
            String(finalChatId || '').trim() ||
            String(finalCustomFields.lastRemoteChatId || '').trim() ||
            String(finalCustomFields.lastCatalogChatId || '').trim() ||
            String(finalCustomFields.lastResolvedChatId || '').trim() ||
            undefined,
          contactName: finalContactName,
          existingContact: finalContactRecord,
        }).catch(() => ({
          contactId: '',
          trustedName: '',
          savedToWhatsapp: false,
        }));

        if (trustedProfile.contactId) {
          finalContactId = trustedProfile.contactId;
        }
        if (trustedProfile.trustedName) {
          finalContactName = trustedProfile.trustedName;
        }
      }

      const readCandidates = Array.from(
        new Set(
          [
            String(finalChatId || '').trim(),
            String(finalCustomFields.lastRemoteChatId || '').trim(),
            String(finalCustomFields.lastCatalogChatId || '').trim(),
            String(finalCustomFields.lastResolvedChatId || '').trim(),
            finalPhone ? `${String(finalPhone).trim()}@c.us` : '',
            finalPhone ? `${String(finalPhone).trim()}@s.whatsapp.net` : '',
          ].filter(Boolean),
        ),
      );

      await forEachSequential(readCandidates, async (candidate) => {
        await whatsappApiProvider.readChatMessages(workspaceId, candidate).catch((err) => {
          log.warn('read_chat_messages_failed', { error: err?.message, candidate });
          return undefined;
        });
      });

      if (finalContactId && finalPhone) {
        await Promise.resolve(
          autopilotQueue.add(
            'score-contact',
            {
              workspaceId,
              contactId: finalContactId,
              phone: finalPhone,
              contactName: finalContactName,
              chatId: finalChatId || `${finalPhone}@c.us`,
              reason: 'post_reply_score',
            },
            {
              jobId: buildQueueJobId('score-contact', workspaceId, finalContactId),
              removeOnComplete: true,
            },
          ),
        ).catch((err) => {
          log.warn('score_contact_queue_add_failed', { error: err?.message });
          return undefined;
        });
      }
    }

    if (replyLockKey && !keepReplyLock) {
      await redis.del(replyLockKey).catch(() => undefined);
    }
    if (runId) {
      const runState = await finishBacklogRunTask({
        workspaceId,
        runId,
        contactId: finalContactId,
        contactName: finalContactName,
        phone: finalPhone,
        status: finalStatus,
        summary: finalSummary,
      });
      if (runState && runState.finished >= runState.total) {
        await finalizeBacklogIntoSilentCatalog({
          workspaceId,
          runId,
          reason: 'backlog_completed',
        });
      }
    }
  }
}

async function fetchConversationHistory(
  workspaceId?: string,
  contactId?: string,
  phone?: string,
  limit = CONVERSATION_HISTORY_LIMIT,
) {
  if (!workspaceId) return [];
  let contact = contactId
    ? await prisma.contact.findFirst({
        where: { id: contactId, workspaceId },
        select: { id: true, phone: true },
      })
    : null;
  if (!contact && phone) {
    contact = await prisma.contact.findFirst({
      where: { workspaceId, phone },
      select: { id: true, phone: true },
    });
  }
  if (!contact) return [];

  const messages = await prisma.message.findMany({
    where: { workspaceId, contactId: contact.id },
    orderBy: { createdAt: 'desc' },
    ...(limit > 0 ? { take: limit } : {}),
    select: { content: true, direction: true, createdAt: true },
  });
  return messages.reverse();
}

async function fetchCompressedContactContext(
  workspaceId?: string,
  contactId?: string,
  phone?: string,
) {
  if (!workspaceId) return '';

  const normalizedPhone = String(phone || '').trim();
  const keys = [
    contactId ? `compressed_context:${contactId}` : '',
    normalizedPhone ? `compressed_context:${normalizedPhone}` : '',
  ].filter(Boolean);

  if (!keys.length) return '';

  const memory = await prisma.kloelMemory.findFirst({
    where: {
      workspaceId,
      category: 'compressed_context',
      key: { in: keys },
    },
    orderBy: { updatedAt: 'desc' },
    select: {
      content: true,
      value: true,
    },
  });

  return String(
    memory?.content ||
      (typeof memory?.value === 'object'
        ? (memory?.value as Record<string, unknown> | null)?.summary
        : '') ||
      '',
  ).trim();
}

async function getKbContext(workspaceId?: string, text?: string, apiKey?: string) {
  if (!workspaceId || !text || !apiKey) return '';
  try {
    const openai = new OpenAI({ apiKey });
    const cleaned = text.slice(0, 2000);
    const embedding = await openai.embeddings.create({
      model: 'text-embedding-3-small',
      input: cleaned,
    });
    const vectorString = `[${embedding.data[0].embedding.join(',')}]`;
    const rows: UnknownRecord[] = await prisma.$queryRaw`
      SELECT v.content, (v.embedding <=> ${vectorString}::vector) AS distance
      FROM "Vector" v
      JOIN "KnowledgeSource" s ON v."sourceId" = s.id
      JOIN "KnowledgeBase" kb ON s."knowledgeBaseId" = kb.id
      WHERE kb."workspaceId" = ${workspaceId}
      ORDER BY distance ASC
      LIMIT 3
    `;
    if (!rows || rows.length === 0) return '';
    return rows
      .map((r: UnknownRecord) => r.content)
      .join('\n---\n')
      .slice(0, 1500);
  } catch (err: unknown) {
    const errInstanceofError =
      err instanceof Error ? err : new Error(typeof err === 'string' ? err : 'unknown error');
    log.warn('kb_context_error', { error: errInstanceofError.message });
    return '';
  }
}

async function generatePitchSafe(messageContent: string, settings: UnknownRecord) {
  const apiKey = settings?.openai?.apiKey || process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return 'Tem interesse? Consigo te fazer uma oferta especial se fecharmos ainda hoje.';
  }
  try {
    const ai = new AIProvider(apiKey);
    const pitchPrompt = `Generate a short, high-converting offer message for a lead who said: "${messageContent}". Be direct.`;
    return await ai.generateResponse(
      'You are a concise sales copywriter. Return plain text.',
      pitchPrompt,
    );
  } catch (err: unknown) {
    const errInstanceofError =
      err instanceof Error ? err : new Error(typeof err === 'string' ? err : 'unknown error');
    log.warn('autopilot_pitch_fallback', { error: errInstanceofError.message });
    return 'Posso te fazer uma oferta exclusiva. Quer fechar agora?';
  }
}

async function generateAutonomousFallbackResponse(params: {
  workspaceId: string;
  messageContent: string;
  settings: UnknownRecord;
  matchedProducts?: string[];
  contactId?: string;
  phone?: string;
  contactName?: string;
  cognitiveState?: CustomerCognitiveState | null;
  deliveryMode?: string;
}) {
  const {
    workspaceId,
    messageContent,
    settings,
    matchedProducts = [],
    contactId,
    phone,
    contactName,
    cognitiveState,
    deliveryMode,
  } = params;
  const apiKey = settings?.openai?.apiKey || process.env.OPENAI_API_KEY;

  const workspace = await prisma.workspace.findUnique({
    where: { id: workspaceId },
    select: { name: true },
  });
  const products = await prisma.product.findMany({
    where: { workspaceId, active: true },
    select: { name: true, description: true, price: true, currency: true },
    take: 10,
  });

  const workspaceName = workspace?.name || 'empresa';
  const compressedContext = await fetchCompressedContactContext(workspaceId, contactId, phone);
  const history = await fetchConversationHistory(
    workspaceId,
    contactId,
    phone,
    CONVERSATION_HISTORY_LIMIT,
  );
  const ledger = buildConversationLedger(history);
  const listeningSignals = analyzeForActiveListening(messageContent, contactName);
  const productSummary = products.length
    ? products
        .map((product: UnknownRecord) => {
          const price =
            typeof product.price === 'number'
              ? ` (${product.currency || 'BRL'} ${product.price})`
              : '';
          const description = product.description
            ? ` - ${String(product.description).slice(0, 120)}`
            : '';
          return `${product.name}${price}${description}`;
        })
        .join('\n')
    : 'Nenhum produto cadastrado.';

  if (!apiKey) {
    if (matchedProducts.length > 0) {
      return detectAndFixAntiPatterns(
        `${contactName ? `${contactName.split(WHITESPACE_RE)[0]}, ` : ''}posso te ajudar com ${matchedProducts.join(', ')}. ${
          listeningSignals.validationNeeded
            ? 'Antes de qualquer coisa, faz sentido a sua dúvida.'
            : ''
        } ${cognitiveState?.nextBestQuestion || 'O que faz mais sentido ver primeiro?'}`,
      );
    }

    return detectAndFixAntiPatterns(
      `${
        listeningSignals.validationNeeded ? 'Faz sentido o que voce trouxe. ' : ''
      }Posso te ajudar por aqui. ${
        cognitiveState?.nextBestQuestion || 'O que voce precisa resolver primeiro?'
      }`,
    );
  }

  try {
    const ai = new AIProvider(apiKey);
    const systemPrompt = buildWhatsAppConversationPrompt({
      workspaceName,
      contactName,
      compressedContext,
      conversationHistory: ledger.transcript,
      conversationLedger: ledger.factsText,
      productSummary,
      matchedProducts,
      cognitiveState,
      listeningSignals,
      deliveryMode,
      action: cognitiveState?.nextBestAction || 'RESPOND',
      tactic:
        cognitiveState?.nextBestAction === 'RESPOND' && listeningSignals.validationNeeded
          ? 'EMPATHETIC_ECHO'
          : null,
    });

    const userPrompt = `Mensagem do cliente:
${messageContent}
Gere uma unica mensagem pronta para WhatsApp.
Se houver emocao, valide antes de conduzir.
Nao use listas.
Nao use emoji por padrao.
Nao use mais de uma pergunta.
Evite frases de vendedor-script.
Se a mensagem permitir, termine com um gancho curto que convide resposta.`;

    const response = await ai.generateResponse(systemPrompt, userPrompt, 'writer');

    return detectAndFixAntiPatterns(String(response || '').trim());
  } catch (err: unknown) {
    const errInstanceofError =
      err instanceof Error ? err : new Error(typeof err === 'string' ? err : 'unknown error');
    log.warn('autopilot_generic_fallback_ai_error', {
      workspaceId,
      error: errInstanceofError?.message,
    });
    return detectAndFixAntiPatterns(
      matchedProducts.length > 0
        ? `Posso te ajudar com ${matchedProducts.join(', ')}. ${
            cognitiveState?.nextBestQuestion || 'Qual ponto voce quer ver primeiro?'
          }`
        : `${
            listeningSignals.validationNeeded ? 'Faz sentido o que voce trouxe. ' : ''
          }${cognitiveState?.nextBestQuestion || 'Me diz o que voce precisa resolver primeiro.'}`,
    );
  }
}

async function computePersistentCognitiveState(input: {
  workspaceId: string;
  conversationId?: string | null;
  contactId?: string | null;
  phone?: string | null;
  contactName?: string | null;
  messageContent: string;
  unreadCount: number;
  lastMessageAt?: Date | string | null;
  leadScore?: number | null;
  demandState: ReturnType<typeof computeDemandState>;
  source: string;
}) {
  const previous = await loadCustomerCognitiveState(prisma, {
    workspaceId: input.workspaceId,
    conversationId: input.conversationId,
    contactId: input.contactId,
    phone: input.phone,
  });

  const state = buildSeedCognitiveState({
    conversationId: input.conversationId,
    contactId: input.contactId,
    phone: input.phone,
    contactName: input.contactName,
    lastMessageText: input.messageContent,
    unreadCount: input.unreadCount,
    lastMessageAt: input.lastMessageAt,
    leadScore: input.leadScore,
    previousState: previous,
    demandState: input.demandState,
  });

  return persistCustomerCognitiveState(prisma, {
    workspaceId: input.workspaceId,
    conversationId: input.conversationId,
    contactId: input.contactId,
    phone: input.phone,
    contactName: input.contactName,
    state,
    source: input.source,
  });
}

function computeCognitiveRewardSignal(
  action: CognitiveActionType,
  state?: CustomerCognitiveState | null,
) {
  if (!state) return 0;
  const stageBoost = state.stage === 'CHECKOUT' ? 1.2 : state.stage === 'HOT' ? 0.85 : 0.4;
  const trustBoost = state.trustScore * 0.6;
  const urgencyBoost = state.urgencyScore * 0.9;

  switch (action) {
    case 'PAYMENT_RECOVERY':
      return Number((stageBoost + urgencyBoost + 0.9).toFixed(3));
    case 'OFFER':
      return Number((stageBoost + trustBoost + 0.55).toFixed(3));
    case 'SOCIAL_PROOF':
      return Number((trustBoost + 0.45).toFixed(3));
    case 'ASK_CLARIFYING':
      return Number((0.55 + urgencyBoost * 0.35).toFixed(3));
    case 'FOLLOWUP_URGENT':
      return Number((0.75 + urgencyBoost).toFixed(3));
    case 'FOLLOWUP_SOFT':
      return Number((0.45 + trustBoost * 0.5).toFixed(3));
    case 'RESPOND':
      return Number((0.7 + urgencyBoost * 0.45).toFixed(3));
    default:
      return Number((0.1 + trustBoost * 0.2).toFixed(3));
  }
}

function buildCognitiveMessage(params: {
  action: CognitiveActionType;
  state?: CustomerCognitiveState | null;
  contactName?: string;
  matchedProducts?: string[];
  tactic?: string | null;
}) {
  const leadFirstName = String(params.contactName || '')
    .trim()
    .split(WHITESPACE_RE)
    .filter(Boolean)[0];
  const productText = params.matchedProducts?.length
    ? ` sobre ${params.matchedProducts.join(', ')}`
    : '';
  const tactic = String(params.tactic || '');
  const prefix =
    leadFirstName && (tactic === 'EMPATHETIC_ECHO' || tactic === 'STORYTELLING_HOOK')
      ? `${leadFirstName}, `
      : '';

  switch (params.action) {
    case 'ASK_CLARIFYING':
      if (tactic === 'EMPATHETIC_ECHO') {
        return `${prefix}faz sentido querer entender isso melhor${productText}. O que pesa mais pra você agora?`;
      }
      if (tactic === 'PAIN_PROBING') {
        return `${prefix}pra eu te orientar certo${productText}, o que mais te trava hoje?`;
      }
      if (tactic === 'QUALIFY_NEED') {
        return `Pra eu te orientar certo${productText}, qual necessidade você quer resolver primeiro?`;
      }
      return `Pra eu te ajudar melhor${productText}, sua prioridade é valor, resultado ou próximo passo?`;
    case 'SOCIAL_PROOF':
      if (tactic === 'TRUST_REASSURANCE') {
        return `Faz sentido ter essa dúvida${productText}. Se quiser, eu te explico o ponto principal de forma direta.`;
      }
      return `Faz sentido ter essa dúvida${productText}. Se quiser, eu te mostro o que costuma destravar essa decisão.`;
    case 'OFFER':
      if (tactic === 'EMPATHETIC_ECHO') {
        return `${prefix}pelo que você trouxe${productText}, faz sentido buscar um caminho simples e seguro. Se quiser, eu te mostro a melhor opção agora.`;
      }
      if (tactic === 'EPIPHANY_DROP') {
        return `${prefix}tem um detalhe${productText} que costuma mudar a decisão: a melhor opção nem sempre é a mais barata, e sim a que resolve com menos atrito. Se quiser, eu te mostro qual faz mais sentido aqui.`;
      }
      if (tactic === 'STORYTELLING_HOOK') {
        return `${prefix}isso me lembra gente que quase travou nessa etapa${productText} e destravou quando viu o caminho mais simples. Se quiser, eu te mostro direto.`;
      }
      if (tactic === 'CHECKOUT_SIMPLIFICATION') {
        return `Pelo que você me disse${productText}, eu posso te mostrar a opção mais simples pra avançar agora.`;
      }
      if (tactic === 'PRICE_VALUE_REFRAME') {
        return `Aqui${productText}, o ponto não é só preço. Se fizer sentido, eu te mostro a opção com melhor custo-benefício.`;
      }
      return `Pelo que você me disse${productText}, eu já posso te mostrar a melhor opção pra seguir.`;
    case 'FOLLOWUP_URGENT':
      if (tactic === 'SAFE_URGENCY') {
        return `Ainda dá pra priorizar isso hoje${productText}. Se fizer sentido, eu já te passo o próximo passo.`;
      }
      return `Sua conversa está perto de avançar${productText}. Se ainda fizer sentido, eu sigo com você agora.`;
    case 'FOLLOWUP_SOFT':
      if (tactic === 'EMPATHETIC_ECHO') {
        return `${prefix}sua conversa ficou em aberto${productText}, e tudo bem. Se ainda fizer sentido, eu continuo daqui sem te fazer repetir nada.`;
      }
      if (tactic === 'CHECKOUT_SIMPLIFICATION') {
        return `Sua conversa ficou em aberto${productText}. Se ainda fizer sentido, eu te resumo o caminho mais simples.`;
      }
      return `Sua conversa ficou em aberto${productText}. Se quiser, eu continuo daqui.`;
    case 'PAYMENT_RECOVERY':
      if (tactic === 'CHECKOUT_SIMPLIFICATION') {
        return `Seu pagamento ficou pendente${productText}. Se quiser, eu te passo o próximo passo agora.`;
      }
      return `Seu pagamento ficou pendente${productText}. Se quiser, eu reativo isso agora.`;
    default:
      if (tactic === 'TRUST_REASSURANCE') {
        return `Estou acompanhando sua conversa${productText}. Se quiser, eu te digo o melhor próximo passo.`;
      }
      if (tactic === 'EMPATHETIC_ECHO') {
        return `${prefix}eu acompanhei o que você trouxe${productText}. Se fizer sentido, eu te digo o próximo passo mais leve daqui.`;
      }
      return `Estou acompanhando sua conversa${productText}. Posso seguir com você por aqui.`;
  }
}

function normalizeAutonomyLedgerValue(value: unknown): unknown {
  if (value instanceof Date) {
    return value.toISOString();
  }

  if (Array.isArray(value)) {
    return value.map((item) => normalizeAutonomyLedgerValue(item));
  }

  if (value && typeof value === 'object') {
    return Object.keys(value)
      .sort()
      .reduce<Record<string, unknown>>((acc, key) => {
        acc[key] = normalizeAutonomyLedgerValue(value[key]);
        return acc;
      }, {});
  }

  return value ?? null;
}

function buildAutonomyExecutionKey(input: {
  workspaceId: string;
  actionType: string;
  contactId?: string;
  conversationId?: string;
  phone?: string;
  payload: Record<string, unknown>;
}) {
  const hash = createHash('sha256');
  hash.update(
    JSON.stringify(
      normalizeAutonomyLedgerValue({
        workspaceId: input.workspaceId,
        actionType: input.actionType,
        contactId: input.contactId || null,
        conversationId: input.conversationId || null,
        phone: input.phone || null,
        payload: input.payload,
      }),
    ),
  );
  return hash.digest('hex');
}

function isAutonomyExecutionDuplicate(err: unknown) {
  const e = err as UnknownRecord | undefined;
  return (
    e?.code === 'P2002' ||
    String(e?.message || '')
      .toLowerCase()
      .includes('unique constraint')
  );
}

async function beginAutonomyExecution(input: {
  workspaceId: string;
  actionType: string;
  contactId?: string;
  conversationId?: string;
  workItemId?: string | null;
  proofId?: string | null;
  capabilityCode?: string | null;
  tacticCode?: string | null;
  idempotencyKey: string;
  request: Record<string, unknown>;
}) {
  const client = prisma as unknown as UnknownRecord;
  if (!client.autonomyExecution) {
    return { allowed: true as const, record: null };
  }

  try {
    const record = await client.autonomyExecution.create({
      data: {
        workspaceId: input.workspaceId,
        contactId: input.contactId,
        conversationId: input.conversationId,
        workItemId: input.workItemId || null,
        proofId: input.proofId || null,
        capabilityCode: input.capabilityCode || input.actionType,
        tacticCode: input.tacticCode || null,
        idempotencyKey: input.idempotencyKey,
        actionType: input.actionType,
        request: input.request,
        status: 'PENDING',
      },
    });
    return { allowed: true as const, record };
  } catch (err: unknown) {
    if (!isAutonomyExecutionDuplicate(err)) {
      throw err;
    }

    const existing = await client.autonomyExecution.findFirst({
      where: {
        workspaceId: input.workspaceId,
        idempotencyKey: input.idempotencyKey,
      },
    });

    if (existing?.status === 'FAILED') {
      const record = await client.autonomyExecution.update({
        where: { id: existing.id },
        data: {
          request: input.request,
          workItemId: input.workItemId || null,
          proofId: input.proofId || null,
          capabilityCode: input.capabilityCode || input.actionType,
          tacticCode: input.tacticCode || null,
          response: null,
          error: null,
          status: 'PENDING',
        },
      });
      return {
        allowed: true as const,
        record,
        replay: true as const,
      };
    }

    return {
      allowed: false as const,
      record: existing || null,
      reason:
        existing?.status === 'SUCCESS'
          ? 'duplicate_execution_success'
          : 'duplicate_execution_pending',
    };
  }
}

async function finishAutonomyExecution(
  recordId: string | undefined,
  status: 'SUCCESS' | 'FAILED' | 'SKIPPED',
  payload?: {
    response?: Record<string, unknown> | null;
    error?: string | null;
  },
) {
  if (!recordId) return;

  const client = prisma as unknown as UnknownRecord;
  if (!client.autonomyExecution) return;

  await client.autonomyExecution.update({
    where: { id: recordId },
    data: {
      status,
      response: payload?.response ?? undefined,
      error: payload?.error ?? undefined,
    },
  });
}

async function dispatchAutonomousTextMessage(input: {
  workspaceId: string;
  phone: string;
  chatId?: string;
  message: string;
  idempotencyKey: string;
  quotedMessageId?: string;
}) {
  const result = await dispatchOutboundThroughFlow({
    workspaceId: input.workspaceId,
    to: input.phone,
    chatId: input.chatId,
    message: input.message,
    jobId: buildQueueJobId('autonomy-send', input.idempotencyKey),
    externalId: input.idempotencyKey,
    quotedMessageId: input.quotedMessageId,
  });

  if (result?.error) {
    throw new Error(String(result.reason || 'send_error'));
  }

  return result;
}

function normalizeOutboundMessageForDedupe(content: string): string {
  return String(content || '')
    .normalize('NFKC')
    .replace(WHITESPACE_G_RE, ' ')
    .trim()
    .toLowerCase()
    .slice(0, 500);
}

async function findRecentDuplicateOutbound(params: {
  workspaceId: string;
  contactId?: string | null;
  content: string;
  windowMs?: number;
}) {
  const normalizedTarget = normalizeOutboundMessageForDedupe(params.content);
  if (!normalizedTarget || !params.contactId) {
    return null;
  }

  const recentMessagesRaw = await prisma.message.findMany({
    where: {
      workspaceId: params.workspaceId,
      contactId: params.contactId,
      direction: 'OUTBOUND',
      createdAt: {
        gte: new Date(Date.now() - (params.windowMs || 3 * 60_000)),
      },
    },
    orderBy: { createdAt: 'desc' },
    take: 5,
    select: {
      id: true,
      content: true,
      createdAt: true,
      externalId: true,
    },
  });
  const recentMessages = Array.isArray(recentMessagesRaw) ? recentMessagesRaw : [];

  return (
    recentMessages.find(
      (message) => normalizeOutboundMessageForDedupe(message.content) === normalizedTarget,
    ) || null
  );
}

async function dispatchAutonomousReplyPlan(input: {
  workspaceId: string;
  phone: string;
  chatId?: string;
  message: string;
  idempotencyKey: string;
  quotedMessageId?: string;
  customerMessages?: QuotedCustomerMessage[];
  settings?: UnknownRecord;
  mirrorReplies?: boolean;
}): Promise<Array<{ quotedMessageId?: string; text: string }>> {
  const normalizedCustomerMessages = (input.customerMessages || [])
    .map((message) => ({
      content: String(message.content || '').trim(),
      quotedMessageId: String(message.quotedMessageId || '').trim(),
      createdAt: message.createdAt,
    }))
    .filter((message) => message.content && message.quotedMessageId);

  const replyPlan =
    input.mirrorReplies === true && normalizedCustomerMessages.length > 0
      ? await buildQuotedReplyPlan({
          draftReply: input.message,
          customerMessages: normalizedCustomerMessages,
          settings: input.settings,
        })
      : [
          {
            quotedMessageId: input.quotedMessageId,
            text: input.message,
          },
        ];

  if (!replyPlan.length) {
    replyPlan.push({
      quotedMessageId: input.quotedMessageId,
      text: input.message,
    });
  }

  await forEachSequential(Array.from(replyPlan.entries()), async ([index, reply]) => {
    const effectiveQuotedMessageId = reply.quotedMessageId || input.quotedMessageId;
    await dispatchAutonomousTextMessage({
      workspaceId: input.workspaceId,
      phone: input.phone,
      chatId: input.chatId,
      message: reply.text,
      idempotencyKey: `${input.idempotencyKey}:${index + 1}`,
      quotedMessageId: effectiveQuotedMessageId,
    });
  });

  return replyPlan.map((reply) => ({
    quotedMessageId: reply.quotedMessageId || input.quotedMessageId,
    text: reply.text,
  }));
}

async function executeAction(
  action: string,
  input: {
    workspaceId: string;
    contactId?: string;
    conversationId?: string;
    phone?: string;
    chatId?: string;
    contactName?: string;
    messageContent?: string;
    settings?: UnknownRecord;
    intent?: string;
    reason?: string;
    workspaceRecord?: UnknownRecord;
    intentConfidence?: number;
    usedHistory?: boolean;
    usedKb?: boolean;
    deliveryMode?: 'reactive' | 'proactive';
    smokeTestId?: string;
    smokeMode?: 'dry-run' | 'live';
    runId?: string;
    idempotencyContext?: Record<string, unknown>;
    customerMessages?: QuotedCustomerMessage[];
  },
) {
  if (!action || action === 'NONE') return 'skipped';

  let contactEmail: string | undefined;
  let contactRecord: UnknownRecord | undefined;

  let targetPhone = input.phone;
  if (!targetPhone && input.contactId) {
    const contact = await prisma.contact.findUnique({
      where: { id: input.contactId },
      select: {
        phone: true,
        email: true,
        customFields: true,
        optIn: true,
        optedOutAt: true,
        id: true,
        workspaceId: true,
        name: true,
        tags: { select: { name: true } },
      },
    });
    contactRecord = contact;
    targetPhone = contact?.phone || input.contactId;
    contactEmail = contact?.email || undefined;
  }

  if (!targetPhone) return 'skipped';
  const selfIdentity = await resolveWorkspaceSelfIdentity(
    input.workspaceId,
    input.settings || input.workspaceRecord?.providerSettings,
  );
  if (
    isWorkspaceSelfTarget({
      phone: targetPhone,
      selfIdentity,
    })
  ) {
    await logAutopilotAction({
      workspaceId: input.workspaceId,
      contactId: input.contactId,
      phone: targetPhone,
      action,
      intent: input.intent,
      status: 'skipped',
      reason: 'workspace_self_contact',
      intentConfidence: input.intentConfidence,
      meta: {
        source: 'execute_action',
      },
    });
    return 'skipped';
  }

  if (!contactEmail && input.workspaceId) {
    const byPhone = await prisma.contact.findFirst({
      where: { workspaceId: input.workspaceId, phone: targetPhone },
      select: {
        id: true,
        email: true,
        customFields: true,
        optIn: true,
        optedOutAt: true,
        workspaceId: true,
        name: true,
        tags: { select: { name: true } },
      },
    });
    if (byPhone) {
      contactRecord = byPhone;
      contactEmail = byPhone.email || undefined;
      input.contactId = input.contactId || byPhone.id;
    }
  }

  const displayName = input.contactName || contactRecord?.name || targetPhone || 'contato';
  const latestQuotedMessageId = await resolveLatestQuotedMessageId({
    workspaceId: input.workspaceId,
    contactId: input.contactId,
    conversationId: input.conversationId,
    phone: targetPhone,
    providerMessageIds: input.idempotencyContext?.providerMessageIds as string[] | undefined,
  });

  const compliance = await ensureCompliance(
    input.workspaceId,
    targetPhone,
    input.settings,
    contactRecord,
    input.deliveryMode || 'proactive',
  );
  if (!compliance.allowed) {
    await logAutopilotAction({
      workspaceId: input.workspaceId,
      contactId: input.contactId,
      phone: targetPhone,
      action,
      intent: input.intent,
      status: 'skipped',
      reason: compliance.reason,
      intentConfidence: input.intentConfidence,
      meta: { compliance: true },
    });
    autopilotDecisionCounter.inc({
      workspaceId: input.workspaceId,
      intent: input.intent || 'UNKNOWN',
      action,
      result: 'skipped_compliance',
    });
    autopilotPipelineCounter.inc({
      workspaceId: input.workspaceId,
      stage: 'reply',
      result: 'skipped_compliance',
    });
    await reportSmokeTest(input.smokeTestId, {
      status: 'skipped',
      workspaceId: input.workspaceId,
      contactId: input.contactId,
      phone: targetPhone,
      action,
      reason: compliance.reason,
    });
    return 'skipped';
  }

  const rate = await checkRateLimits(
    input.workspaceId,
    targetPhone,
    input.deliveryMode || 'proactive',
  );
  if (!rate.allowed) {
    log.info('autopilot_rate_limited', {
      workspaceId: input.workspaceId,
      phone: targetPhone,
      reason: rate.reason,
    });
    await logAutopilotAction({
      workspaceId: input.workspaceId,
      contactId: input.contactId,
      phone: targetPhone,
      action,
      intent: input.intent,
      status: 'skipped',
      reason: rate.reason || 'rate_limit',
    });
    autopilotDecisionCounter.inc({
      workspaceId: input.workspaceId,
      intent: input.intent || 'UNKNOWN',
      action,
      result: 'rate_limited',
    });
    autopilotPipelineCounter.inc({
      workspaceId: input.workspaceId,
      stage: 'reply',
      result: 'rate_limited',
    });
    await reportSmokeTest(input.smokeTestId, {
      status: 'skipped',
      workspaceId: input.workspaceId,
      contactId: input.contactId,
      phone: targetPhone,
      action,
      reason: rate.reason || 'rate_limit',
    });
    if (action === 'GHOST_CLOSER' || action === 'LEAD_UNLOCKER') {
      autopilotGhostCloserCounter.inc({
        workspaceId: input.workspaceId,
        action,
        result: 'rate_limited',
      });
    }
    return 'skipped';
  }

  const canSend = await PlanLimitsProvider.checkMessageLimit(input.workspaceId);
  if (!canSend.allowed) {
    await logAutopilotAction({
      workspaceId: input.workspaceId,
      contactId: input.contactId,
      phone: targetPhone,
      action,
      intent: input.intent,
      status: 'skipped',
      reason: canSend.reason || 'plan_limit',
      intentConfidence: input.intentConfidence,
      meta: {
        usedHistory: input.usedHistory,
        usedKb: input.usedKb,
      },
    });
    autopilotPipelineCounter.inc({
      workspaceId: input.workspaceId,
      stage: 'reply',
      result: 'blocked_plan_limit',
    });
    await reportSmokeTest(input.smokeTestId, {
      status: 'skipped',
      workspaceId: input.workspaceId,
      contactId: input.contactId,
      phone: targetPhone,
      action,
      reason: canSend.reason || 'plan_limit',
    });
    return 'skipped';
  }

  const msg = await buildMessage(action, input.messageContent || '', input.settings);
  if (!msg) return 'skipped';

  const idempotencyKey = buildAutonomyExecutionKey({
    workspaceId: input.workspaceId,
    actionType: action,
    contactId: input.contactId,
    conversationId: input.conversationId,
    phone: targetPhone,
    payload: {
      source: 'execute_action',
      message: msg,
      intent: input.intent,
      reason: input.reason,
      deliveryMode: input.deliveryMode || 'proactive',
      customerMessages: input.customerMessages || null,
      context: input.idempotencyContext || null,
    },
  });
  const idemCtx = input.idempotencyContext || {};
  const execution = await beginAutonomyExecution({
    workspaceId: input.workspaceId,
    actionType: action,
    contactId: input.contactId,
    conversationId: input.conversationId,
    workItemId: (idemCtx.workItemId as string | null) || null,
    proofId:
      (idemCtx.conversationProofId as string | null) ||
      (idemCtx.accountProofId as string | null) ||
      (idemCtx.cycleProofId as string | null) ||
      null,
    capabilityCode: (idemCtx.capabilityCode as string | null) || action,
    tacticCode: (idemCtx.conversationTactic as string | null) || null,
    idempotencyKey,
    request: {
      phone: targetPhone,
      message: msg,
      intent: input.intent,
      reason: input.reason,
      deliveryMode: input.deliveryMode || 'proactive',
      customerMessages: input.customerMessages || null,
      context: input.idempotencyContext || null,
    },
  });

  if (!execution.allowed) {
    await logAutopilotAction({
      workspaceId: input.workspaceId,
      contactId: input.contactId,
      phone: targetPhone,
      action,
      intent: input.intent,
      status: 'skipped',
      reason: execution.reason,
      intentConfidence: input.intentConfidence,
      meta: {
        duplicateExecution: true,
        idempotencyKey,
      },
    });
    autopilotPipelineCounter.inc({
      workspaceId: input.workspaceId,
      stage: 'reply',
      result: 'duplicate_execution',
    });
    await reportSmokeTest(input.smokeTestId, {
      status: 'skipped',
      workspaceId: input.workspaceId,
      contactId: input.contactId,
      phone: targetPhone,
      action,
      reason: execution.reason,
    });
    return 'skipped';
  }

  const recentDuplicate = await findRecentDuplicateOutbound({
    workspaceId: input.workspaceId,
    contactId: input.contactId || contactRecord?.id || null,
    content: msg,
  });
  if (recentDuplicate) {
    await finishAutonomyExecution(execution.record?.id, 'SKIPPED', {
      response: {
        duplicateMessageId: recentDuplicate.id,
        duplicateCreatedAt: recentDuplicate.createdAt?.toISOString?.() || null,
        mode: 'recent_duplicate_outbound',
      },
      error: 'recent_duplicate_outbound',
    });
    await logAutopilotAction({
      workspaceId: input.workspaceId,
      contactId: input.contactId,
      phone: targetPhone,
      action,
      intent: input.intent,
      status: 'skipped',
      reason: 'recent_duplicate_outbound',
      intentConfidence: input.intentConfidence,
      meta: {
        duplicateExecution: true,
        idempotencyKey,
        duplicateMessageId: recentDuplicate.id,
      },
    });
    autopilotPipelineCounter.inc({
      workspaceId: input.workspaceId,
      stage: 'reply',
      result: 'recent_duplicate_outbound',
    });
    return 'skipped';
  }

  await publishAgentEvent({
    type: 'typing',
    workspaceId: input.workspaceId,
    runId: input.runId,
    phase: 'typing',
    message: `Digitando resposta para ${displayName}.`,
    meta: {
      contactId: input.contactId,
      contactName: input.contactName || contactRecord?.name || null,
      conversationId: input.conversationId,
      phone: targetPhone,
      action,
      capabilityCode: (input.idempotencyContext?.capabilityCode as string | null) || action,
      tacticCode: (input.idempotencyContext?.conversationTactic as string | null) || null,
      conversationProofId: (input.idempotencyContext?.conversationProofId as string | null) || null,
      accountProofId: (input.idempotencyContext?.accountProofId as string | null) || null,
      cycleProofId: (input.idempotencyContext?.cycleProofId as string | null) || null,
    },
  });

  let sent = false;
  let sendError: string | undefined;
  let executionResponse: Record<string, unknown> | null = null;
  const followupEligible = action === 'SEND_OFFER' || action === 'GHOST_CLOSER';
  try {
    const started = Date.now();
    const workspaceCfg = buildWorkspaceConfig(
      input.workspaceId,
      input.settings,
      input.workspaceRecord,
    );

    if (action === 'SEND_AUDIO') {
      const audioSent = await sendAudioResponse(
        input.workspaceId,
        targetPhone,
        input.chatId,
        msg,
        input.settings,
        workspaceCfg,
        latestQuotedMessageId,
      );
      if (!audioSent) {
        const replyPlan = await dispatchAutonomousReplyPlan({
          workspaceId: input.workspaceId,
          phone: targetPhone,
          chatId: input.chatId,
          message: msg,
          idempotencyKey,
          customerMessages: input.customerMessages,
          settings: input.settings,
          quotedMessageId: latestQuotedMessageId,
          mirrorReplies:
            input.deliveryMode === 'reactive' &&
            isRecentLiveConversation(input.customerMessages || []),
        });
        executionResponse = {
          channel: 'FLOW_SEND_MESSAGE',
          fallbackFromAudio: true,
          message: msg,
          replyPlan,
        };
      } else {
        executionResponse = {
          channel: 'WHATSAPP_AUDIO',
          message: msg,
        };
      }
    } else {
      const replyPlan = await dispatchAutonomousReplyPlan({
        workspaceId: input.workspaceId,
        phone: targetPhone,
        chatId: input.chatId,
        message: msg,
        idempotencyKey,
        customerMessages: input.customerMessages,
        settings: input.settings,
        quotedMessageId: latestQuotedMessageId,
        mirrorReplies:
          input.deliveryMode === 'reactive' &&
          isRecentLiveConversation(input.customerMessages || []),
      });
      executionResponse = {
        channel: 'FLOW_SEND_MESSAGE',
        message: msg,
        replyPlan,
      };
    }

    await logAutopilotAction({
      workspaceId: input.workspaceId,
      contactId: input.contactId,
      phone: targetPhone,
      action,
      intent: input.intent,
      status: 'executed',
      reason: input.reason,
      latencyMs: Date.now() - started,
      intentConfidence: input.intentConfidence,
      meta: {
        usedHistory: input.usedHistory,
        usedKb: input.usedKb,
        audioMode: action === 'SEND_AUDIO',
      },
    });
    autopilotDecisionCounter.inc({
      workspaceId: input.workspaceId,
      intent: input.intent || 'UNKNOWN',
      action,
      result: 'executed',
    });
    autopilotPipelineCounter.inc({
      workspaceId: input.workspaceId,
      stage: 'reply',
      result: 'sent',
    });
    await reportSmokeTest(input.smokeTestId, {
      status: 'completed',
      mode: input.smokeMode || 'live',
      workspaceId: input.workspaceId,
      contactId: input.contactId,
      phone: targetPhone,
      action,
      responseText: msg,
    });
    if (action === 'GHOST_CLOSER' || action === 'LEAD_UNLOCKER') {
      autopilotGhostCloserCounter.inc({
        workspaceId: input.workspaceId,
        action,
        result: 'executed',
      });
    }
    sent = true;

    if (followupEligible && isExplicitProactiveOutreachAllowed(input.settings)) {
      await autopilotQueue.add(
        'followup-contact',
        {
          workspaceId: input.workspaceId,
          contactId: input.contactId,
          phone: targetPhone,
          reason: 'buying_signal_followup',
          scheduledAt: new Date().toISOString(),
        },
        {
          delay: 45 * 60 * 1000,
          jobId: `followup-${input.contactId || targetPhone}-bs`,
          removeOnComplete: true,
        },
      );
    }
  } catch (err: unknown) {
    const errInstanceofError =
      err instanceof Error ? err : new Error(typeof err === 'string' ? err : 'unknown error');
    log.error('autopilot_send_error', { err: errInstanceofError.message });
    sendError = errInstanceofError?.message || 'send_error';
    await logAutopilotAction({
      workspaceId: input.workspaceId,
      contactId: input.contactId,
      phone: targetPhone,
      action,
      intent: input.intent,
      status: 'error',
      reason: errInstanceofError?.message || 'send_error',
      intentConfidence: input.intentConfidence,
      meta: {
        usedHistory: input.usedHistory,
        usedKb: input.usedKb,
      },
    });
    autopilotDecisionCounter.inc({
      workspaceId: input.workspaceId,
      intent: input.intent || 'UNKNOWN',
      action,
      result: 'error',
    });
    autopilotPipelineCounter.inc({
      workspaceId: input.workspaceId,
      stage: 'reply',
      result: 'failed',
    });
    if (action === 'GHOST_CLOSER' || action === 'LEAD_UNLOCKER') {
      autopilotGhostCloserCounter.inc({
        workspaceId: input.workspaceId,
        action,
        result: 'error',
      });
    }
  }

  if (!sent) {
    const settings = input.settings || {};

    if (channelEnabled(settings, 'email') && contactEmail) {
      try {
        await sendEmail(contactEmail, 'Follow-up automático', msg);
        logFallback('email', 'sent');
        await persistFallbackMessage({
          workspaceId: input.workspaceId,
          contactId: input.contactId,
          channel: 'EMAIL',
          content: msg,
        });
        executionResponse = {
          channel: 'EMAIL_FALLBACK',
          message: msg,
        };
        await logAutopilotAction({
          workspaceId: input.workspaceId,
          contactId: input.contactId,
          phone: targetPhone,
          action: `${action}_EMAIL_FALLBACK`,
          intent: input.intent,
          status: 'executed',
          reason: 'email_fallback',
        });
        autopilotDecisionCounter.inc({
          workspaceId: input.workspaceId,
          intent: input.intent || 'UNKNOWN',
          action: `${action}_EMAIL_FALLBACK`,
          result: 'executed',
        });
        autopilotPipelineCounter.inc({
          workspaceId: input.workspaceId,
          stage: 'reply',
          result: 'sent_email_fallback',
        });
        await reportSmokeTest(input.smokeTestId, {
          status: 'completed',
          mode: input.smokeMode || 'live',
          workspaceId: input.workspaceId,
          contactId: input.contactId,
          phone: targetPhone,
          action: `${action}_EMAIL_FALLBACK`,
          responseText: msg,
        });
        sent = true;
      } catch (err: unknown) {
        const errInstanceofError =
          err instanceof Error ? err : new Error(typeof err === 'string' ? err : 'unknown error');
        logFallback('email', 'error', errInstanceofError?.message);
      }
    }
  }

  if (!sent) {
    await finishAutonomyExecution(execution.record?.id, 'FAILED', {
      error: sendError || 'autopilot_send_failed',
      response: executionResponse,
    });
    await reportSmokeTest(input.smokeTestId, {
      status: 'failed',
      workspaceId: input.workspaceId,
      contactId: input.contactId,
      phone: targetPhone,
      action,
      error: sendError || 'autopilot_send_failed',
    });
    throw new Error(sendError || 'autopilot_send_failed');
  }

  await finishAutonomyExecution(execution.record?.id, 'SUCCESS', {
    response: executionResponse,
  });

  await publishAgentEvent({
    type: 'contact',
    workspaceId: input.workspaceId,
    runId: input.runId,
    phase: 'message_sent',
    message: `Enviei ${action} para ${displayName}.`,
    meta: {
      contactId: input.contactId,
      contactName: input.contactName || contactRecord?.name || null,
      conversationId: input.conversationId,
      phone: targetPhone,
      action,
      capabilityCode: input.idempotencyContext?.capabilityCode || action,
      tacticCode: input.idempotencyContext?.conversationTactic || null,
      conversationProofId: input.idempotencyContext?.conversationProofId || null,
      accountProofId: input.idempotencyContext?.accountProofId || null,
      cycleProofId: input.idempotencyContext?.cycleProofId || null,
      messagePreview: msg.slice(0, 240),
      autonomyExecutionId: execution.record?.id || null,
    },
  });

  if (action === 'SEND_OFFER') {
    const hotFlowId = input.settings?.autopilot?.hotFlowId;
    if (hotFlowId) {
      await flowQueue.add('run-flow', {
        workspaceId: input.workspaceId,
        flowId: hotFlowId,
        user: targetPhone,
        initialVars: { source: 'autopilot_hot', lastMessage: input.messageContent || '' },
      });
    }
  }

  return 'executed';
}

async function sendDirectAutopilotText(input: {
  workspaceId: string;
  contactId?: string;
  conversationId?: string;
  phone?: string;
  chatId?: string;
  contactName?: string;
  text: string;
  settings?: UnknownRecord;
  intent?: string;
  reason?: string;
  workspaceRecord?: UnknownRecord;
  intentConfidence?: number;
  actionLabel?: string;
  usedHistory?: boolean;
  usedKb?: boolean;
  deliveryMode?: 'reactive' | 'proactive';
  smokeTestId?: string;
  smokeMode?: 'dry-run' | 'live';
  runId?: string;
  idempotencyContext?: Record<string, unknown>;
  customerMessages?: QuotedCustomerMessage[];
}) {
  const action = input.actionLabel || 'UNIFIED_AGENT_TEXT';
  const message = String(input.text || '').trim();
  if (!message) return 'skipped';

  let targetPhone = input.phone;
  let contactRecord: UnknownRecord | null = null;

  if (!targetPhone && input.contactId) {
    contactRecord = await prisma.contact.findFirst({
      where: { id: input.contactId, workspaceId: input.workspaceId },
      select: {
        id: true,
        phone: true,
        name: true,
        customFields: true,
        optIn: true,
        optedOutAt: true,
        tags: { select: { name: true } },
      },
    });
    targetPhone = contactRecord?.phone;
  }

  if (!contactRecord && input.contactId) {
    contactRecord = await prisma.contact.findFirst({
      where: { id: input.contactId, workspaceId: input.workspaceId },
      select: {
        id: true,
        phone: true,
        name: true,
        customFields: true,
        optIn: true,
        optedOutAt: true,
        tags: { select: { name: true } },
      },
    });
  }

  const displayName = input.contactName || contactRecord?.name || targetPhone || 'contato';
  if (!targetPhone) return 'skipped';
  const selfIdentity = await resolveWorkspaceSelfIdentity(
    input.workspaceId,
    input.settings || input.workspaceRecord?.providerSettings,
  );
  if (
    isWorkspaceSelfTarget({
      phone: targetPhone,
      selfIdentity,
    })
  ) {
    await logAutopilotAction({
      workspaceId: input.workspaceId,
      contactId: input.contactId,
      phone: targetPhone,
      action,
      intent: input.intent,
      status: 'skipped',
      reason: 'workspace_self_contact',
      intentConfidence: input.intentConfidence,
      meta: {
        source: 'direct_generated_response',
      },
    });
    return 'skipped';
  }
  const contactCustomFields = normalizeJsonObject(contactRecord?.customFields);
  const resolvedChatId =
    String(input.chatId || '').trim() ||
    String(contactCustomFields.lastRemoteChatId || '').trim() ||
    String(contactCustomFields.lastCatalogChatId || '').trim() ||
    String(contactCustomFields.lastResolvedChatId || '').trim() ||
    undefined;
  const trustedProfile = await ensureTrustedContactProfile({
    workspaceId: input.workspaceId,
    contactId: input.contactId,
    phone: targetPhone,
    chatId: resolvedChatId,
    contactName: displayName,
    existingContact: contactRecord,
  }).catch(() => ({
    contactId: '',
    trustedName: '',
    savedToWhatsapp: false,
  }));
  if (trustedProfile.contactId && !input.contactId) {
    input.contactId = trustedProfile.contactId;
  }
  const latestQuotedMessageId = await resolveLatestQuotedMessageId({
    workspaceId: input.workspaceId,
    contactId: input.contactId,
    conversationId: input.conversationId,
    phone: targetPhone,
    providerMessageIds: input.idempotencyContext?.providerMessageIds as string[] | undefined,
  });

  const compliance = await ensureCompliance(
    input.workspaceId,
    targetPhone,
    input.settings,
    contactRecord || undefined,
    input.deliveryMode || 'proactive',
  );
  if (!compliance.allowed) {
    await logAutopilotAction({
      workspaceId: input.workspaceId,
      contactId: input.contactId,
      phone: targetPhone,
      action,
      intent: input.intent,
      status: 'skipped',
      reason: compliance.reason,
      intentConfidence: input.intentConfidence,
      meta: {
        compliance: true,
        usedHistory: input.usedHistory,
        usedKb: input.usedKb,
      },
    });
    autopilotDecisionCounter.inc({
      workspaceId: input.workspaceId,
      intent: input.intent || 'UNKNOWN',
      action,
      result: 'skipped_compliance',
    });
    autopilotPipelineCounter.inc({
      workspaceId: input.workspaceId,
      stage: 'reply',
      result: 'skipped_compliance',
    });
    await reportSmokeTest(input.smokeTestId, {
      status: 'skipped',
      workspaceId: input.workspaceId,
      contactId: input.contactId,
      phone: targetPhone,
      action,
      reason: compliance.reason,
    });
    return 'skipped';
  }

  const rate = await checkRateLimits(
    input.workspaceId,
    targetPhone,
    input.deliveryMode || 'proactive',
  );
  if (!rate.allowed) {
    await logAutopilotAction({
      workspaceId: input.workspaceId,
      contactId: input.contactId,
      phone: targetPhone,
      action,
      intent: input.intent,
      status: 'skipped',
      reason: rate.reason || 'rate_limit',
      intentConfidence: input.intentConfidence,
      meta: {
        usedHistory: input.usedHistory,
        usedKb: input.usedKb,
      },
    });
    autopilotDecisionCounter.inc({
      workspaceId: input.workspaceId,
      intent: input.intent || 'UNKNOWN',
      action,
      result: 'rate_limited',
    });
    autopilotPipelineCounter.inc({
      workspaceId: input.workspaceId,
      stage: 'reply',
      result: 'rate_limited',
    });
    await reportSmokeTest(input.smokeTestId, {
      status: 'skipped',
      workspaceId: input.workspaceId,
      contactId: input.contactId,
      phone: targetPhone,
      action,
      reason: rate.reason || 'rate_limit',
    });
    return 'skipped';
  }

  const canSend = await PlanLimitsProvider.checkMessageLimit(input.workspaceId);
  if (!canSend.allowed) {
    await logAutopilotAction({
      workspaceId: input.workspaceId,
      contactId: input.contactId,
      phone: targetPhone,
      action,
      intent: input.intent,
      status: 'skipped',
      reason: canSend.reason || 'plan_limit',
      intentConfidence: input.intentConfidence,
      meta: {
        usedHistory: input.usedHistory,
        usedKb: input.usedKb,
        mode: 'direct_generated_response',
      },
    });
    autopilotPipelineCounter.inc({
      workspaceId: input.workspaceId,
      stage: 'reply',
      result: 'blocked_plan_limit',
    });
    await reportSmokeTest(input.smokeTestId, {
      status: 'skipped',
      workspaceId: input.workspaceId,
      contactId: input.contactId,
      phone: targetPhone,
      action,
      reason: canSend.reason || 'plan_limit',
    });
    return 'skipped';
  }

  const idempotencyKey = buildAutonomyExecutionKey({
    workspaceId: input.workspaceId,
    actionType: action,
    contactId: input.contactId,
    conversationId: input.conversationId,
    phone: targetPhone,
    payload: {
      source: 'direct_generated_response',
      message,
      intent: input.intent,
      reason: input.reason,
      deliveryMode: input.deliveryMode || 'proactive',
      customerMessages: input.customerMessages || null,
      context: input.idempotencyContext || null,
    },
  });
  const idemCtx2 = input.idempotencyContext || {};
  const execution = await beginAutonomyExecution({
    workspaceId: input.workspaceId,
    actionType: action,
    contactId: input.contactId,
    conversationId: String(input.conversationId ?? ''),
    workItemId: String(idemCtx2.workItemId ?? '') || null,
    proofId:
      String(idemCtx2.conversationProofId ?? '') ||
      String(idemCtx2.accountProofId ?? '') ||
      String(idemCtx2.cycleProofId ?? '') ||
      null,
    capabilityCode: String(idemCtx2.capabilityCode ?? '') || action,
    tacticCode: String(idemCtx2.conversationTactic ?? '') || null,
    idempotencyKey,
    request: {
      phone: targetPhone,
      message,
      intent: input.intent,
      reason: input.reason,
      deliveryMode: input.deliveryMode || 'proactive',
      customerMessages: input.customerMessages || null,
      context: input.idempotencyContext || null,
    },
  });

  if (!execution.allowed) {
    await logAutopilotAction({
      workspaceId: input.workspaceId,
      contactId: input.contactId,
      phone: targetPhone,
      action,
      intent: input.intent,
      status: 'skipped',
      reason: execution.reason,
      intentConfidence: input.intentConfidence,
      meta: {
        duplicateExecution: true,
        idempotencyKey,
        mode: 'direct_generated_response',
      },
    });
    autopilotPipelineCounter.inc({
      workspaceId: input.workspaceId,
      stage: 'reply',
      result: 'duplicate_execution',
    });
    await reportSmokeTest(input.smokeTestId, {
      status: 'skipped',
      workspaceId: input.workspaceId,
      contactId: input.contactId,
      phone: targetPhone,
      action,
      reason: execution.reason,
    });
    return 'skipped';
  }

  const recentDuplicate = await findRecentDuplicateOutbound({
    workspaceId: input.workspaceId,
    contactId: input.contactId || contactRecord?.id || null,
    content: message,
  });
  if (recentDuplicate) {
    await finishAutonomyExecution(execution.record?.id, 'SKIPPED', {
      response: {
        duplicateMessageId: recentDuplicate.id,
        duplicateCreatedAt: recentDuplicate.createdAt?.toISOString?.() || null,
        mode: 'recent_duplicate_outbound',
      },
      error: 'recent_duplicate_outbound',
    });
    await logAutopilotAction({
      workspaceId: input.workspaceId,
      contactId: input.contactId,
      phone: targetPhone,
      action,
      intent: input.intent,
      status: 'skipped',
      reason: 'recent_duplicate_outbound',
      intentConfidence: input.intentConfidence,
      meta: {
        duplicateExecution: true,
        idempotencyKey,
        mode: 'direct_generated_response',
        duplicateMessageId: recentDuplicate.id,
      },
    });
    autopilotPipelineCounter.inc({
      workspaceId: input.workspaceId,
      stage: 'reply',
      result: 'recent_duplicate_outbound',
    });
    return 'skipped';
  }

  try {
    const started = Date.now();
    await publishAgentEvent({
      type: 'typing',
      workspaceId: input.workspaceId,
      runId: input.runId,
      phase: 'typing',
      message: `Digitando resposta para ${displayName}.`,
      meta: {
        contactId: input.contactId,
        contactName: input.contactName || contactRecord?.name || null,
        conversationId: input.conversationId,
        phone: targetPhone,
        action,
        capabilityCode: (input.idempotencyContext?.capabilityCode as string | null) || action,
        tacticCode: (input.idempotencyContext?.conversationTactic as string | null) || null,
        conversationProofId:
          (input.idempotencyContext?.conversationProofId as string | null) || null,
        accountProofId: (input.idempotencyContext?.accountProofId as string | null) || null,
        cycleProofId: input.idempotencyContext?.cycleProofId || null,
      },
    });
    const replyPlan = await dispatchAutonomousReplyPlan({
      workspaceId: input.workspaceId,
      phone: targetPhone,
      chatId: resolvedChatId,
      message,
      idempotencyKey,
      quotedMessageId: latestQuotedMessageId,
      customerMessages: input.customerMessages,
      settings: input.settings,
      mirrorReplies:
        input.deliveryMode === 'reactive' && isRecentLiveConversation(input.customerMessages || []),
    });
    const responseText = replyPlan.map((item) => item.text).join('\n');
    await logAutopilotAction({
      workspaceId: input.workspaceId,
      contactId: input.contactId,
      phone: targetPhone,
      action,
      intent: input.intent,
      status: 'executed',
      reason: input.reason,
      latencyMs: Date.now() - started,
      intentConfidence: input.intentConfidence,
      meta: {
        usedHistory: input.usedHistory,
        usedKb: input.usedKb,
        mode: 'direct_generated_response',
      },
    });
    autopilotDecisionCounter.inc({
      workspaceId: input.workspaceId,
      intent: input.intent || 'UNKNOWN',
      action,
      result: 'executed',
    });
    autopilotPipelineCounter.inc({
      workspaceId: input.workspaceId,
      stage: 'reply',
      result: 'sent',
    });
    await reportSmokeTest(input.smokeTestId, {
      status: 'completed',
      mode: input.smokeMode || 'live',
      workspaceId: input.workspaceId,
      contactId: input.contactId,
      phone: targetPhone,
      action,
      responseText,
    });
    await finishAutonomyExecution(execution.record?.id, 'SUCCESS', {
      response: {
        channel: 'FLOW_SEND_MESSAGE',
        message,
        replyPlan,
        mode: 'direct_generated_response',
      },
    });
    await publishAgentEvent({
      type: 'contact',
      workspaceId: input.workspaceId,
      runId: input.runId,
      phase: 'message_sent',
      message: `Enviei ${action} para ${displayName}.`,
      meta: {
        contactId: input.contactId,
        contactName: trustedProfile.trustedName || input.contactName || contactRecord?.name || null,
        conversationId: input.conversationId,
        phone: targetPhone,
        action,
        capabilityCode: (input.idempotencyContext?.capabilityCode as string | null) || action,
        tacticCode: (input.idempotencyContext?.conversationTactic as string | null) || null,
        conversationProofId:
          (input.idempotencyContext?.conversationProofId as string | null) || null,
        accountProofId: (input.idempotencyContext?.accountProofId as string | null) || null,
        cycleProofId: input.idempotencyContext?.cycleProofId || null,
        messagePreview: responseText.slice(0, 240),
        autonomyExecutionId: execution.record?.id || null,
      },
    });
    return 'executed';
  } catch (err: unknown) {
    const errInstanceofError =
      err instanceof Error ? err : new Error(typeof err === 'string' ? err : 'unknown error');
    await finishAutonomyExecution(execution.record?.id, 'FAILED', {
      error: errInstanceofError?.message || 'send_error',
      response: {
        channel: 'FLOW_SEND_MESSAGE',
        message,
        customerMessages: input.customerMessages || null,
        mode: 'direct_generated_response',
      },
    });
    await logAutopilotAction({
      workspaceId: input.workspaceId,
      contactId: input.contactId,
      phone: targetPhone,
      action,
      intent: input.intent,
      status: 'error',
      reason: errInstanceofError?.message || 'send_error',
      intentConfidence: input.intentConfidence,
      meta: {
        usedHistory: input.usedHistory,
        usedKb: input.usedKb,
        mode: 'direct_generated_response',
      },
    });
    autopilotDecisionCounter.inc({
      workspaceId: input.workspaceId,
      intent: input.intent || 'UNKNOWN',
      action,
      result: 'error',
    });
    autopilotPipelineCounter.inc({
      workspaceId: input.workspaceId,
      stage: 'reply',
      result: 'failed',
    });
    await reportSmokeTest(input.smokeTestId, {
      status: 'failed',
      workspaceId: input.workspaceId,
      contactId: input.contactId,
      phone: targetPhone,
      action,
      error: errInstanceofError?.message || 'direct_send_failed',
    });
    throw err;
  }
}

/**
 * Persiste mensagem de fallback (email) e notifica Inbox via Redis.
 */
async function persistFallbackMessage(params: {
  workspaceId: string;
  contactId?: string;
  channel: 'EMAIL';
  content: string;
}) {
  const { workspaceId, contactId, channel, content } = params;
  if (!contactId) return;

  // Encontra ou cria conversa específica do canal
  let conversation = await prisma.conversation.findFirst({
    where: { workspaceId, contactId, channel },
    orderBy: { updatedAt: 'desc' },
    select: { id: true },
  });

  if (!conversation) {
    conversation = await prisma.conversation.create({
      data: {
        workspaceId,
        contactId,
        channel,
        status: 'OPEN',
        priority: 'MEDIUM',
      },
      select: { id: true },
    });
  }

  const message = await prisma.message.create({
    data: {
      workspaceId,
      contactId,
      conversationId: conversation.id,
      direction: 'OUTBOUND',
      type: 'TEXT',
      content,
      status: 'SENT',
    },
  });

  await prisma.conversation.updateMany({
    where: { id: conversation.id, workspaceId },
    data: { lastMessageAt: new Date(), unreadCount: 0 },
  });

  // Notifica realtime (permitindo que Inbox exiba mensagem do canal)
  await redisPub.publish(
    'ws:inbox',
    JSON.stringify({
      type: 'message:new',
      workspaceId,
      message,
    }),
  );
  await redisPub.publish(
    'ws:inbox',
    JSON.stringify({
      type: 'conversation:update',
      workspaceId,
      conversation: {
        id: conversation.id,
        lastMessageStatus: 'SENT',
        lastMessageAt: message.createdAt,
      },
    }),
  );
  await redisPub.publish(
    'ws:inbox',
    JSON.stringify({
      type: 'message:status',
      workspaceId,
      payload: {
        id: message.id,
        conversationId: conversation.id,
        contactId,
        status: 'SENT',
      },
    }),
  );
}

async function buildMessage(action: string, content: string, settings: UnknownRecord) {
  const defaults: Record<string, string[]> = {
    SEND_PRICE: [
      'Posso te passar os valores de forma direta e te dizer qual faz mais sentido.',
      'Eu te explico o valor sem enrolacao e ja te digo a opcao mais coerente.',
    ],
    FOLLOW_UP: [
      'Fiquei com a sua conversa em aberto por aqui. Se ainda fizer sentido, eu continuo daqui.',
      'Voltei na sua conversa porque tem um proximo passo que pode te poupar tempo.',
    ],
    FOLLOW_UP_STRONG: [
      'Se ainda fizer sentido seguir, eu consigo te mostrar o caminho mais simples agora.',
      'Se a decisao ainda estiver em aberto, eu consigo resumir o que realmente importa agora.',
    ],
    GHOST_CLOSER: [
      'Sua conversa ficou perto de avancar. Se ainda fizer sentido, eu pego exatamente de onde parou.',
      'Ficou um ponto em aberto aqui que pode mudar sua decisao. Se quiser, eu te mostro.',
    ],
    LEAD_UNLOCKER: [
      'Tem um detalhe nisso que costuma destravar a decisao. Se quiser, eu te conto.',
      'Fiquei pensando na sua situacao porque existe um ponto que quase sempre muda a perspectiva.',
    ],
    SEND_CALENDAR: ['Te mando meu link de agenda e a gente resolve isso sem enrolacao.'],
    QUALIFY: [
      'Pra eu te orientar direito, o que voce quer resolver primeiro?',
      'Antes de te indicar algo, me diz qual parte e mais importante agora.',
    ],
    TRANSFER_AGENT: [
      'Vou trazer um especialista humano para assumir daqui com contexto do que voce ja contou.',
    ],
    ANTI_CHURN: [
      'Antes de qualquer ajuste, quero entender o que nao encaixou como deveria.',
      'Quero te ajudar a fazer isso funcionar de verdade. O que mais te incomodou?',
    ],
    HANDLE_OBJECTION: [
      'Faz sentido ter essa preocupacao. Se quiser, eu te mostro por outro angulo sem forcar nada.',
      'Sua ressalva e valida. Posso te explicar o ponto principal de forma direta?',
    ],
  };
  const customTpl = (settings?.autopilot?.templates || {}) as Record<string, string>;
  const apiKey = settings?.openai?.apiKey || process.env.OPENAI_API_KEY;

  const actionDirective: Record<string, string> = {
    SEND_PRICE:
      'O contato quer clareza de preco ou formato. Seja direta, contextualize valor e use no maximo uma pergunta.',
    FOLLOW_UP: 'Retome com leveza e valor. Nao cobre ausencia.',
    FOLLOW_UP_STRONG: 'Retome com mais iniciativa, mas sem pressao barata.',
    GHOST_CLOSER: 'Reabra a conversa usando contexto e curiosidade, sem parecer script.',
    LEAD_UNLOCKER: 'Destrave a conversa com um insight curto ou open loop.',
    SEND_CALENDAR: 'Convide para agenda de forma simples e humana.',
    QUALIFY: 'Descubra a necessidade com pergunta aberta curta.',
    TRANSFER_AGENT: 'Transfira para humano com acolhimento.',
    ANTI_CHURN: 'Priorize escuta, validacao e reducao de friccao. Nao venda.',
    HANDLE_OBJECTION: 'Valide a preocupacao antes de reframe.',
  };

  if (apiKey && action !== 'SEND_OFFER' && action !== 'SEND_AUDIO') {
    try {
      const ai = new AIProvider(apiKey);
      const systemPrompt = [
        'Voce escreve mensagens comerciais para WhatsApp.',
        'Soe humana, breve, viva e consultiva.',
        'Nao finja ser humana. Se perguntarem, diga que e a assistente virtual da empresa.',
        'Nao use listas.',
        'Nao use emoji por padrao.',
        'Nao use mais de uma pergunta.',
        'Nao use frases de vendedor-script.',
      ].join('\n');
      const response = await ai.generateResponse(
        systemPrompt,
        [
          `ACAO: ${actionDirective[action] || 'Responda com utilidade e contexto.'}`,
          `ULTIMO CONTEXTO: ${String(content || '').trim() || 'sem contexto adicional'}`,
          'Escreva uma unica mensagem pronta para WhatsApp.',
        ].join('\n\n'),
        'writer',
      );
      const cleaned = detectAndFixAntiPatterns(String(response || '').trim());
      if (cleaned) {
        return cleaned;
      }
    } catch (error: unknown) {
      const errorInstanceofError =
        error instanceof Error
          ? error
          : new Error(typeof error === 'string' ? error : 'unknown error');
      log.warn('build_message_ai_failed', {
        action,
        error: errorInstanceofError?.message || 'unknown_error',
      });
    }
  }

  switch (action) {
    case 'SEND_OFFER':
      return await generatePitchSafe(content, settings);
    case 'SEND_PRICE':
      return customTpl.SEND_PRICE || defaults.SEND_PRICE[0];
    case 'SEND_CALENDAR':
      return customTpl.SEND_CALENDAR || defaults.SEND_CALENDAR[0];
    case 'QUALIFY':
      return customTpl.QUALIFY || defaults.QUALIFY[0];
    case 'FOLLOW_UP':
      return customTpl.FOLLOW_UP || defaults.FOLLOW_UP[0];
    case 'FOLLOW_UP_STRONG':
      return customTpl.FOLLOW_UP_STRONG || defaults.FOLLOW_UP_STRONG[0];
    case 'GHOST_CLOSER':
      return customTpl.GHOST_CLOSER || defaults.GHOST_CLOSER[0];
    case 'LEAD_UNLOCKER':
      return customTpl.LEAD_UNLOCKER || defaults.LEAD_UNLOCKER[0];
    case 'TRANSFER_AGENT':
      return customTpl.TRANSFER_AGENT || defaults.TRANSFER_AGENT[0];
    case 'ANTI_CHURN':
      return customTpl.ANTI_CHURN || defaults.ANTI_CHURN[0];
    case 'HANDLE_OBJECTION':
      return customTpl.HANDLE_OBJECTION || defaults.HANDLE_OBJECTION[0];
    case 'SEND_AUDIO':
      // Para SEND_AUDIO, retornar o conteúdo que será convertido em áudio
      return content || customTpl.FOLLOW_UP || defaults.FOLLOW_UP[0];
    default:
      return null;
  }
}

async function ensureCompliance(
  workspaceId: string,
  phone: string,
  settings: UnknownRecord,
  contact?: {
    id?: string;
    optIn?: boolean;
    optedOutAt?: Date | string | null;
    customFields?: unknown;
    tags?: { name: string }[];
  },
  deliveryMode: 'reactive' | 'proactive' = 'proactive',
) {
  if (!contact) {
    contact = await prisma.contact.findFirst({
      where: { workspaceId, phone },
      select: {
        id: true,
        optIn: true,
        optedOutAt: true,
        customFields: true,
        tags: { select: { name: true } },
      },
    });
  }

  if (contact && contact.optIn === false) {
    return { allowed: false, reason: 'opted_out' as const };
  }

  if (deliveryMode === 'reactive') {
    return { allowed: true as const };
  }

  const enforceOptIn =
    process.env.ENFORCE_OPTIN === 'true' || settings?.autopilot?.requireOptIn === true;
  const enforce24h = (process.env.AUTOPILOT_ENFORCE_24H ?? 'true') === 'true';

  if (enforceOptIn) {
    const tags = contact?.tags?.map((t) => t.name.toLowerCase()) || [];
    const cf: UnknownRecord = contact?.customFields || {};
    const hasOptIn =
      contact?.optIn === true ||
      tags.includes('optin_whatsapp') ||
      cf.optin === true ||
      cf.optin_whatsapp === true;
    if (!hasOptIn) {
      return { allowed: false, reason: 'optin_required' as const };
    }
  }

  if (enforce24h) {
    const lastInbound = await prisma.message.findFirst({
      where: { workspaceId, contact: { phone }, direction: 'INBOUND' },
      orderBy: { createdAt: 'desc' },
      select: { createdAt: true },
    });
    const cutoff = Date.now() - 24 * 60 * 60 * 1000;
    if (!lastInbound || lastInbound.createdAt.getTime() < cutoff) {
      return { allowed: false, reason: 'session_expired_24h' as const };
    }
  }

  return { allowed: true as const };
}

async function runFollowupContact(data: UnknownRecord) {
  const workspaceId = data?.workspaceId;
  if (!workspaceId) return;

  const contactId = data?.contactId;
  const phone = data?.phone;
  const scheduledAt = data?.scheduledAt ? new Date(data.scheduledAt) : null;
  const jobKey = contactId || phone || workspaceId;

  const workspace = await prisma.workspace.findUnique({
    where: { id: workspaceId },
    select: { providerSettings: true },
  });
  const settings = (workspace?.providerSettings ?? {}) as UnknownRecord;

  if (settings?.billingSuspended === true) {
    log.info('followup_skip_billing_suspended', { workspaceId });
    await notifyBillingSuspended(workspaceId);
    await logAutopilotAction({
      workspaceId,
      contactId,
      phone,
      action: 'FOLLOWUP_CONTACT',
      intent: 'FOLLOW_UP',
      status: 'skipped',
      reason: 'billing_suspended',
      meta: { source: 'followup_contact' },
    });
    return 'skipped';
  }

  if (!isAutonomousEnabled(settings)) {
    log.info('followup_skip_autopilot_disabled', { workspaceId });
    await logAutopilotAction({
      workspaceId,
      contactId,
      phone,
      action: 'FOLLOWUP_CONTACT',
      intent: 'FOLLOW_UP',
      status: 'skipped',
      reason: 'autopilot_disabled',
      meta: { source: 'followup_contact' },
    });
    return 'skipped';
  }

  if (!isExplicitProactiveOutreachAllowed(settings)) {
    log.info('followup_skip_proactive_disabled', { workspaceId });
    await logAutopilotAction({
      workspaceId,
      contactId,
      phone,
      action: 'FOLLOWUP_CONTACT',
      intent: 'FOLLOW_UP',
      status: 'skipped',
      reason: 'proactive_outreach_disabled',
      meta: { source: 'followup_contact' },
    });
    return 'skipped';
  }

  const now = new Date();
  const nowHour = getWorkspaceLocalHour(settings, now);
  const withinWindow = isWithinWorkspaceWindow({
    settings,
    startHour: WINDOW_START,
    endHour: WINDOW_END,
    now,
  });

  if (!withinWindow) {
    const delayMs = getDelayUntilWorkspaceWindowOpens({
      settings,
      startHour: WINDOW_START,
      endHour: WINDOW_END,
      now,
    });

    await autopilotQueue.add(
      'followup-contact',
      {
        ...data,
        workspaceId,
        scheduledAt: data?.scheduledAt || new Date().toISOString(),
      },
      {
        delay: delayMs,
        jobId: `followup-${jobKey}-window`,
        removeOnComplete: true,
      },
    );

    await logAutopilotAction({
      workspaceId,
      contactId,
      phone,
      action: 'FOLLOWUP_CONTACT',
      intent: 'FOLLOW_UP',
      status: 'skipped',
      reason: 'outside_window_rescheduled',
      meta: {
        source: 'followup_contact',
        localHour: nowHour,
        windowStart: WINDOW_START,
        windowEnd: WINDOW_END,
        delayMs,
      },
    });
    return 'skipped';
  }

  // Encontra conversa aberta
  const conv = await prisma.conversation.findFirst({
    where: {
      workspaceId,
      status: 'OPEN',
      ...(contactId ? { contactId } : phone ? { contact: { phone } } : {}),
    },
    include: {
      contact: { select: { id: true, phone: true } },
      messages: { orderBy: { createdAt: 'desc' }, take: 1 },
    },
  });
  if (!conv || !conv.contact?.phone) return 'skipped';
  if (conv.mode && conv.mode !== 'AI') {
    await logAutopilotAction({
      workspaceId,
      contactId: conv.contact.id,
      phone: conv.contact.phone,
      action: 'FOLLOWUP_CONTACT',
      intent: 'FOLLOW_UP',
      status: 'skipped',
      reason: 'human_mode_lock',
      meta: {
        source: 'followup_contact',
        conversationId: conv.id,
        conversationMode: conv.mode,
      },
    });
    return 'skipped';
  }

  const lastMsg = conv.messages[0];
  if (!lastMsg) return 'skipped';

  // Se houve resposta INBOUND após o agendamento, não enviar follow-up
  if (scheduledAt && lastMsg.direction === 'INBOUND' && lastMsg.createdAt > scheduledAt) {
    log.info('followup_skip_inbound_received', { workspaceId, contactId: conv.contact.id });
    await logAutopilotAction({
      workspaceId,
      contactId: conv.contact.id,
      phone: conv.contact.phone,
      action: 'FOLLOWUP_CONTACT',
      intent: 'FOLLOW_UP',
      status: 'skipped',
      reason: 'inbound_after_schedule',
      meta: { source: 'followup_contact' },
    });
    return 'skipped';
  }

  const text = (lastMsg.content || '').toLowerCase();
  const buying = [
    'preco',
    'preço',
    'quanto',
    'valor',
    'pix',
    'boleto',
    'custa',
    'pag',
    'assin',
  ].some((k) => text.includes(k));

  const action = data?.actionOverride || (buying ? 'GHOST_CLOSER' : 'LEAD_UNLOCKER');

  if (data?.messageOverride) {
    return sendDirectAutopilotText({
      workspaceId,
      contactId: conv.contact.id,
      conversationId: conv.id,
      phone: conv.contact.phone,
      text: String(data.messageOverride),
      settings,
      intent: buying ? 'FOLLOW_UP_BUYING' : 'REENGAGE',
      reason: data?.reason || 'cia_followup_override',
      workspaceRecord: { providerSettings: settings },
      actionLabel: action,
      idempotencyContext: {
        source: 'followup_override',
        scheduledAt: data?.scheduledAt || null,
        jobKey,
      },
    });
  }

  return executeAction(action, {
    workspaceId,
    contactId: conv.contact.id,
    conversationId: conv.id,
    phone: conv.contact.phone,
    messageContent: lastMsg.content || '',
    settings,
    intent: buying ? 'FOLLOW_UP_BUYING' : 'REENGAGE',
    reason: data?.reason || 'buying_signal_followup',
    workspaceRecord: { providerSettings: settings },
    idempotencyContext: {
      source: 'followup_contact',
      scheduledAt: data?.scheduledAt || null,
      jobKey,
    },
  });
}

export {
  runFollowupContact,
  runCycleAll,
  runCycleWorkspace,
  runCiaCycleWorkspace,
  runCiaAction,
  runCiaSelfImproveWorkspace,
  runCiaGlobalLearningAll,
};

function buildWorkspaceConfig(
  workspaceId: string,
  settings: UnknownRecord,
  record?: UnknownRecord,
) {
  const providerSettings = (record as UnknownRecord | undefined)?.providerSettings || {};
  const whatsappApiSession = {
    ...(providerSettings?.whatsappApiSession || {}),
    ...(settings?.whatsappApiSession || {}),
  };
  const whatsappProvider = 'meta-cloud';

  return {
    id: workspaceId,
    whatsappProvider,
    jitterMin: (record as UnknownRecord | undefined)?.jitterMin,
    jitterMax: (record as UnknownRecord | undefined)?.jitterMax,
    sessionName: whatsappApiSession?.sessionName,
    providerSettings: {
      ...providerSettings,
      whatsappApiSession,
    },
  };
}

async function checkRateLimits(
  workspaceId: string,
  phone: string,
  deliveryMode: 'reactive' | 'proactive' = 'proactive',
) {
  const bypassReactiveRateLimits =
    (process.env.AUTOPILOT_BYPASS_REACTIVE_RATELIMITS ?? 'true') === 'true';
  if (deliveryMode === 'reactive' && bypassReactiveRateLimits) {
    return { allowed: true as const };
  }
  if (process.env.TEST_AUTOPILOT_SKIP_RATELIMIT === '1') {
    return { allowed: true as const };
  }
  const day = new Date().toISOString().slice(0, 10);
  const contactKey = `autopilot:contact:${phone}:day:${day}`;
  const wsKey = `autopilot:ws:${workspaceId}:day:${day}`;

  const contactCount = await connection.incr(contactKey);
  if (contactCount === 1) await connection.expire(contactKey, 86400);

  const wsCount = await connection.incr(wsKey);
  if (wsCount === 1) await connection.expire(wsKey, 86400);

  if (contactCount > CONTACT_DAILY_LIMIT) {
    return { allowed: false, reason: 'contact_daily_limit' as const };
  }
  if (wsCount > WORKSPACE_DAILY_LIMIT) {
    return { allowed: false, reason: 'workspace_daily_limit' as const };
  }
  return { allowed: true as const };
}

async function logAutopilotAction(input: {
  workspaceId: string;
  contactId?: string;
  phone?: string;
  action: string;
  intent?: string;
  status: 'executed' | 'error' | 'skipped';
  reason?: string;
  latencyMs?: number;
  intentConfidence?: number;
  meta?: Record<string, unknown>;
}) {
  try {
    const details = {
      action: input.action,
      intent: input.intent,
      status: input.status,
      reason: input.reason,
      phone: input.phone,
      latencyMs: input.latencyMs,
      confidence: input.intentConfidence,
      ...((input.meta as UnknownRecord) || {}),
    };

    await prisma.auditLog.create({
      data: {
        workspaceId: input.workspaceId,
        action: 'AUTOPILOT_ACTION',
        resource: 'contact',
        resourceId: input.contactId,
        details,
      },
    });

    const client = prisma as unknown as UnknownRecord;
    if (client.autopilotEvent) {
      await client.autopilotEvent.create({
        data: {
          workspaceId: input.workspaceId,
          contactId: input.contactId,
          intent: input.intent || 'UNKNOWN',
          action: input.action,
          status: input.status,
          reason: input.reason,
          messageSent: input.phone ? `to:${input.phone}` : undefined,
          latencyMs: input.latencyMs,
          meta: details,
        },
      });
    }
  } catch (err: unknown) {
    const errInstanceofError =
      err instanceof Error ? err : new Error(typeof err === 'string' ? err : 'unknown error');
    log.warn('autopilot_audit_error', { error: errInstanceofError.message });
  }
}

async function acquireCiaContactLock(contactId?: string, phone?: string) {
  const keyBase = contactId || phone;
  if (!keyBase) return null;

  const key = `cia:lock:${keyBase}`;
  try {
    const result = await (
      redis as unknown as { set: (...args: unknown[]) => Promise<string | null> }
    ).set(key, '1', 'EX', CIA_CONTACT_LOCK_TTL_SECONDS, 'NX');
    return result ? key : null;
  } catch (err: unknown) {
    const errInstanceofError =
      err instanceof Error ? err : new Error(typeof err === 'string' ? err : 'unknown error');
    // Invariant I6: lock not acquired implies operation does NOT run.
    // Previously this returned the key on Redis failure, causing the
    // caller to believe the lock was acquired and proceed without
    // mutual exclusion. Fail-closed: surface the failure to the caller
    // so the contact is skipped for this cycle.
    log.warn('acquireCiaContactLock redis failure', {
      key,
      error: errInstanceofError?.message || String(err),
    });
    return null;
  }
}

async function releaseCiaContactLock(lockKey: string | null) {
  if (!lockKey) return;
  try {
    await redis.del(lockKey);
  } catch {
    // ignore
  }
}

function mapOpportunityBucket(score: number): 'LOW' | 'MEDIUM' | 'HIGH' {
  if (score >= 75) return 'HIGH';
  if (score >= 45) return 'MEDIUM';
  return 'LOW';
}

function classifyOpportunityCandidate(input: {
  candidate: {
    cluster: string;
    pending: boolean;
    unreadCount: number;
    priority: number;
    silenceMinutes: number;
    suggestedAction: string;
    cognitiveState: CustomerCognitiveState;
  };
  joinedText: string;
  optedOutAt?: Date | string | null;
  customFields?: Record<string, unknown> | null;
}) {
  const text = String(input.joinedText || '').toLowerCase();
  const customFields = (input.customFields || {}) as Record<string, unknown>;
  const customerStatus = String(
    customFields.customerStatus || customFields.status || customFields.stage || '',
  ).toLowerCase();

  const purchased =
    input.optedOutAt ||
    customerStatus.includes('won') ||
    customerStatus.includes('cliente') ||
    customerStatus.includes('customer') ||
    J__S_COMPREI_JA_S_COMPR_RE.test(text);

  if (purchased) {
    return {
      opportunityClass: 'BOUGHT',
      score: 0,
      nextBestAction: 'DO_NOT_CONTACT',
      reason: 'already_converted_or_blocked',
    };
  }

  const waitingMoney =
    input.candidate.cluster === 'PAYMENT' ||
    input.candidate.cognitiveState.paymentState === 'PENDING' ||
    input.candidate.cognitiveState.paymentState === 'READY_TO_PAY' ||
    PIX_BOLETO_CART_A__O_CA_RE.test(text);

  const hotIntent =
    input.candidate.cluster === 'HOT' ||
    ['HOT', 'CHECKOUT'].includes(input.candidate.cognitiveState.stage) ||
    QUERO_VOU_COMPRAR_COMO_RE.test(text);

  const clientWaiting =
    input.candidate.pending ||
    input.candidate.unreadCount > 0 ||
    input.candidate.cognitiveState.nextBestAction === 'RESPOND';

  const askedAndGhosted =
    !clientWaiting &&
    input.candidate.silenceMinutes >= 6 * 60 &&
    QUANTO_VALOR_PRE_C__O_F_RE.test(text);

  const warm =
    !askedAndGhosted &&
    (input.candidate.priority >= 55 ||
      input.candidate.silenceMinutes < 72 * 60 ||
      input.candidate.cognitiveState.trustScore >= 0.45);

  let opportunityClass = 'COLD';
  if (waitingMoney) {
    opportunityClass = 'WAITING_MONEY';
  } else if (hotIntent) {
    opportunityClass = 'HIGH_INTENT';
  } else if (clientWaiting) {
    opportunityClass = 'ASKED_AND_GHOSTED';
  } else if (warm) {
    opportunityClass = 'WARM';
  }

  const baseScore = Math.max(
    0,
    Math.min(
      100,
      Math.round(
        input.candidate.priority +
          input.candidate.cognitiveState.trustScore * 18 +
          input.candidate.cognitiveState.urgencyScore * 22 -
          Math.min(18, input.candidate.silenceMinutes / 180),
      ),
    ),
  );

  const score =
    opportunityClass === 'WAITING_MONEY'
      ? Math.max(88, baseScore)
      : opportunityClass === 'HIGH_INTENT'
        ? Math.max(78, baseScore)
        : opportunityClass === 'ASKED_AND_GHOSTED'
          ? Math.max(62, baseScore)
          : opportunityClass === 'WARM'
            ? Math.max(48, Math.min(74, baseScore))
            : Math.min(44, baseScore);

  return {
    opportunityClass,
    score,
    nextBestAction: input.candidate.suggestedAction || 'FOLLOWUP_SOFT',
    reason: `opportunity_${opportunityClass.toLowerCase()}`,
  };
}

function buildCompressedOpportunityContext(input: {
  contactName?: string | null;
  phone?: string | null;
  candidate: {
    lastMessageText: string;
    unreadCount: number;
    silenceMinutes: number;
    cluster: string;
    suggestedAction: string;
    cognitiveState: CustomerCognitiveState;
  };
  messages: Array<{ direction: string; content?: string | null }>;
  opportunityClass: string;
  score: number;
}) {
  const lastInbound = input.messages.find((message) => message.direction === 'INBOUND');
  const lastOutbound = input.messages.find((message) => message.direction === 'OUTBOUND');

  return [
    `Contato: ${input.contactName || input.phone || 'sem_nome'}`,
    `Classe de oportunidade: ${input.opportunityClass}`,
    `Probabilidade estimada: ${input.score}%`,
    `Cluster CIA: ${input.candidate.cluster}`,
    `Próxima melhor ação: ${input.candidate.suggestedAction}`,
    `Silêncio: ${input.candidate.silenceMinutes} minuto(s)`,
    `Mensagens pendentes: ${input.candidate.unreadCount}`,
    `Resumo cognitivo: ${input.candidate.cognitiveState.summary}`,
    `Última inbound: ${String(lastInbound?.content || input.candidate.lastMessageText || '').slice(0, 280)}`,
    `Última outbound: ${String(lastOutbound?.content || '').slice(0, 280)}`,
  ]
    .filter(Boolean)
    .join('\n');
}

async function upsertCatalogConversationShell(input: {
  workspaceId: string;
  contactId: string;
  lastMessageAt: Date;
  unreadCount?: number;
}) {
  const existing = await prisma.conversation.findFirst({
    where: {
      workspaceId: input.workspaceId,
      contactId: input.contactId,
    },
    orderBy: { updatedAt: 'desc' },
    select: {
      id: true,
      unreadCount: true,
      lastMessageAt: true,
    },
  });

  if (!existing) {
    await prisma.conversation.create({
      data: {
        workspaceId: input.workspaceId,
        contactId: input.contactId,
        status: 'OPEN',
        priority: 'MEDIUM',
        channel: 'WHATSAPP',
        mode: 'AI',
        unreadCount: Math.max(0, Number(input.unreadCount || 0) || 0),
        lastMessageAt: input.lastMessageAt,
      },
    });
    return;
  }

  const currentLastMessageAt =
    existing.lastMessageAt instanceof Date
      ? existing.lastMessageAt
      : new Date(existing.lastMessageAt);

  await prisma.conversation.updateMany({
    where: { id: existing.id, workspaceId: input.workspaceId },
    data: {
      unreadCount: Math.max(
        0,
        Number(existing.unreadCount || 0) || 0,
        Number(input.unreadCount || 0) || 0,
      ),
      lastMessageAt:
        Number.isFinite(currentLastMessageAt.getTime()) &&
        currentLastMessageAt > input.lastMessageAt
          ? currentLastMessageAt
          : input.lastMessageAt,
    },
  });
}

async function maybeScoreContactWithAi(input: {
  contactName?: string | null;
  phone?: string | null;
  history: string;
  wonDealTitle?: string | null;
  wonDealValue?: number | null;
}): Promise<{
  leadScore: number;
  purchaseProbability: 'LOW' | 'MEDIUM' | 'HIGH' | 'VERY_HIGH';
  purchaseProbabilityScore: number;
  sentiment: string;
  intent: string;
  summary: string;
  nextBestAction: string;
  reasons: string[];
  buyerStatus: 'BOUGHT' | 'NOT_BOUGHT' | 'UNKNOWN';
  purchasedProduct: string | null;
  purchaseValue: number | null;
  purchaseReason: string | null;
  notPurchasedReason: string | null;
  preferences: string[];
  importantDetails: string[];
  purchaseProbabilityPercent: number;
  demographics: {
    gender: string;
    ageRange: string;
    location: string;
    confidence: number;
  };
} | null> {
  if (!process.env.OPENAI_API_KEY) {
    return null;
  }

  try {
    const ai = new AIProvider(process.env.OPENAI_API_KEY);
    const response = await ai.generateChatResponse(
      [
        {
          role: 'system',
          content: 'Você é um analista comercial. Responda apenas JSON válido.',
        },
        {
          role: 'user',
          content: [
            `Contato: ${input.contactName || input.phone || 'sem_nome'}`,
            `Negócio ganho conhecido: ${input.wonDealTitle || 'nenhum'}`,
            `Valor já registrado: ${input.wonDealValue || 0}`,
            'Analise a transcrição abaixo e retorne JSON com:',
            'buyerStatus ("BOUGHT" | "NOT_BOUGHT" | "UNKNOWN")',
            'purchasedProduct (string ou null)',
            'purchaseValue (número ou null)',
            'purchaseReason (string curta ou null)',
            'notPurchasedReason (string curta ou null)',
            'leadScore (0-100 inteiro)',
            'purchaseProbability ("LOW" | "MEDIUM" | "HIGH" | "VERY_HIGH")',
            'purchaseProbabilityScore (0-1 número)',
            'purchaseProbabilityPercent (0-100 inteiro, inclusive para recompra de quem já comprou)',
            'sentiment ("POSITIVE" | "NEUTRAL" | "NEGATIVE")',
            'intent ("BUY" | "INFO" | "SUPPORT" | "COMPLAINT" | "COLD")',
            'summary (resumo completo e objetivo, com nome, contexto, interesse, objeções, preferências e próximos passos)',
            'nextBestAction (string curta)',
            'reasons (array de justificativas curtas)',
            'preferences (array de preferências ou interesses)',
            'importantDetails (array de fatos relevantes do lead)',
            'gender (string: masculino, feminino ou unknown)',
            'ageRange (string curta como 18-24, 25-34, 35-44 ou UNKNOWN)',
            'location (string curta ou UNKNOWN)',
            'demographicsConfidence (0-1 número)',
            '',
            'Transcrição:',
            input.history,
          ].join('\n'),
        },
      ],
      'brain',
    );

    const parsed = extractFirstJsonObject(String(response?.content || ''));
    if (!parsed) {
      return null;
    }

    const leadScore = Math.max(
      0,
      Math.min(100, Math.round(Number(parsed.leadScore || parsed.score || 0) || 0)),
    );
    const bucketCandidate = String(parsed.purchaseProbability || parsed.purchase_bucket || '')
      .trim()
      .toUpperCase();
    const purchaseProbability =
      bucketCandidate === 'VERY_HIGH' ||
      bucketCandidate === 'HIGH' ||
      bucketCandidate === 'MEDIUM' ||
      bucketCandidate === 'LOW'
        ? (bucketCandidate as 'LOW' | 'MEDIUM' | 'HIGH' | 'VERY_HIGH')
        : scoreToProbabilityBucket(leadScore);
    const probabilityScore = Math.max(
      0,
      Math.min(
        1,
        Number(
          parsed.purchaseProbabilityScore || parsed.purchase_probability_score || leadScore / 100,
        ) || 0,
      ),
    );
    const purchaseProbabilityPercent = Math.max(
      0,
      Math.min(
        100,
        Math.round(
          Number(
            parsed.purchaseProbabilityPercent ||
              parsed.purchase_probability_percent ||
              probabilityScore * 100,
          ) || 0,
        ),
      ),
    );
    const buyerStatusCandidate = String(parsed.buyerStatus || parsed.customerStatus || '')
      .trim()
      .toUpperCase();
    const buyerStatus =
      buyerStatusCandidate === 'BOUGHT' ||
      buyerStatusCandidate === 'NOT_BOUGHT' ||
      buyerStatusCandidate === 'UNKNOWN'
        ? (buyerStatusCandidate as 'BOUGHT' | 'NOT_BOUGHT' | 'UNKNOWN')
        : 'UNKNOWN';
    const purchasedProduct =
      String(parsed.purchasedProduct || parsed.productBought || parsed.product || '').trim() ||
      null;
    const purchaseValueRaw = Number(
      parsed.purchaseValue || parsed.amountPaid || parsed.valuePaid || 0,
    );
    const purchaseValue =
      Number.isFinite(purchaseValueRaw) && purchaseValueRaw > 0
        ? Number(purchaseValueRaw.toFixed(2))
        : null;

    return {
      leadScore,
      purchaseProbability,
      purchaseProbabilityScore: probabilityScore,
      purchaseProbabilityPercent,
      sentiment:
        String(parsed.sentiment || 'NEUTRAL')
          .trim()
          .toUpperCase() || 'NEUTRAL',
      intent:
        String(parsed.intent || 'INFO')
          .trim()
          .toUpperCase() || 'INFO',
      summary: String(parsed.summary || '').trim(),
      nextBestAction:
        String(parsed.nextBestAction || parsed.next_best_action || '').trim() ||
        (buyerStatus === 'BOUGHT' ? 'CUSTOMER_SUCCESS' : 'REVIEW_MANUALLY'),
      reasons: Array.isArray(parsed.reasons)
        ? parsed.reasons.map((reason: UnknownRecord) => String(reason || '').trim()).filter(Boolean)
        : [],
      buyerStatus,
      purchasedProduct,
      purchaseValue,
      purchaseReason: String(parsed.purchaseReason || parsed.purchase_reason || '').trim() || null,
      notPurchasedReason:
        String(parsed.notPurchasedReason || parsed.not_purchased_reason || '').trim() || null,
      preferences: Array.isArray(parsed.preferences)
        ? parsed.preferences.map((item: UnknownRecord) => String(item || '').trim()).filter(Boolean)
        : [],
      importantDetails: Array.isArray(parsed.importantDetails)
        ? parsed.importantDetails
            .map((item: UnknownRecord) => String(item || '').trim())
            .filter(Boolean)
        : [],
      demographics: {
        gender:
          String(parsed.gender || parsed.demographics?.gender || 'UNKNOWN')
            .trim()
            .toUpperCase() || 'UNKNOWN',
        ageRange:
          String(parsed.ageRange || parsed.demographics?.ageRange || 'UNKNOWN')
            .trim()
            .toUpperCase() || 'UNKNOWN',
        location:
          String(parsed.location || parsed.demographics?.location || 'UNKNOWN').trim() || 'UNKNOWN',
        confidence: Math.max(
          0,
          Math.min(
            1,
            Number(parsed.demographicsConfidence || parsed.demographics?.confidence || 0) || 0,
          ),
        ),
      },
    };
  } catch (error: unknown) {
    const errorInstanceofError =
      error instanceof Error
        ? error
        : new Error(typeof error === 'string' ? error : 'unknown error');
    log.warn('catalog_ai_score_failed', { error: errorInstanceofError?.message || error });
    return null;
  }
}

function buildHeuristicCatalogScore(input: {
  joinedText: string;
  messages: Array<{ direction: string; content: string; createdAt?: Date | string | null }>;
  unreadCount: number;
  optedOutAt?: Date | string | null;
  wonDealTitle?: string | null;
  wonDealValue?: number | null;
}) {
  const text = String(input.joinedText || '').toLowerCase();
  const demographics = inferHeuristicDemographics(text);
  const inboundMessages = input.messages.filter((message) => message.direction === 'INBOUND');
  const lastInbound = inboundMessages[inboundMessages.length - 1];
  const lastInboundAt = lastInbound?.createdAt ? new Date(lastInbound.createdAt) : null;
  const ageHours =
    lastInboundAt && Number.isFinite(lastInboundAt.getTime())
      ? (Date.now() - lastInboundAt.getTime()) / 3600000
      : null;
  const reasons: string[] = [];

  if (input.optedOutAt) {
    return {
      leadScore: 0,
      purchaseProbability: 'LOW' as const,
      purchaseProbabilityScore: 0,
      sentiment: 'NEUTRAL',
      intent: 'COLD',
      summary: 'Contato bloqueado ou já convertido. Não abordar automaticamente.',
      nextBestAction: 'DO_NOT_CONTACT',
      reasons: ['opt_out_or_converted'],
      buyerStatus: 'UNKNOWN' as const,
      purchasedProduct: null,
      purchaseValue: null,
      purchaseReason: null,
      notPurchasedReason: 'opted_out',
      preferences: [],
      importantDetails: [],
      purchaseProbabilityPercent: 0,
      demographics,
    };
  }

  const boughtByDeal =
    String(input.wonDealTitle || '').trim().length > 0 ||
    (Number(input.wonDealValue || 0) || 0) > 0;
  const boughtByConversation = PAGAMENTO_APROVADO_PAGA_RE.test(text);

  if (boughtByDeal || boughtByConversation) {
    const purchaseReason = boughtByDeal
      ? 'won_deal_recorded'
      : 'payment_or_access_confirmed_in_chat';
    const purchasedProduct =
      String(input.wonDealTitle || '').trim() ||
      (CURSO_PLANO_MENTORIA_PR_RE.exec(text)?.[0] ?? null);
    const purchaseValueRaw = Number(input.wonDealValue || 0) || 0;
    const positivePostPurchaseSignal = OBRIGAD_VALEU_PERFEITO_RE.test(text);
    const repurchaseProbabilityScore = positivePostPurchaseSignal ? 0.78 : 0.56;
    const repurchaseLeadScore = Math.round(repurchaseProbabilityScore * 100);
    return {
      leadScore: repurchaseLeadScore,
      purchaseProbability: positivePostPurchaseSignal ? ('HIGH' as const) : ('MEDIUM' as const),
      purchaseProbabilityScore: repurchaseProbabilityScore,
      sentiment: OBRIGAD_VALEU_PERFEITO_RE_2.test(text) ? 'POSITIVE' : 'NEUTRAL',
      intent: 'BUY',
      summary:
        `${String(input.wonDealTitle || 'Cliente convertido').trim() || 'Cliente convertido'} com compra identificada.`.trim(),
      nextBestAction: positivePostPurchaseSignal ? 'RETAIN_AND_UPSELL' : 'CUSTOMER_SUCCESS',
      reasons: [
        purchaseReason,
        positivePostPurchaseSignal ? 'positive_post_purchase_signal' : 'existing_customer',
      ],
      buyerStatus: 'BOUGHT' as const,
      purchasedProduct,
      purchaseValue: purchaseValueRaw > 0 ? Number(purchaseValueRaw.toFixed(2)) : null,
      purchaseReason,
      notPurchasedReason: null,
      preferences: [],
      importantDetails: purchasedProduct ? [`Produto: ${purchasedProduct}`] : [],
      purchaseProbabilityPercent: Math.round(repurchaseProbabilityScore * 100),
      demographics,
    };
  }

  let leadScore = 18;
  if (inboundMessages.length >= 2) {
    leadScore += Math.min(28, inboundMessages.length * 6);
    reasons.push('multiple_recent_inbounds');
  }
  if (input.unreadCount > 0) {
    leadScore += 12;
    reasons.push('has_unread_backlog');
  }
  if (PRE_C__O_VALOR_QUANTO_O_RE.test(text)) {
    leadScore += 16;
    reasons.push('asked_price');
  }
  if (QUERO_VOU_COMPRAR_ME_MA_RE.test(text)) {
    leadScore += 24;
    reasons.push('buying_signal');
  }
  if (PROBLEMA_ERRO_SUPORTE_A_RE.test(text)) {
    leadScore -= 12;
    reasons.push('support_or_complaint');
  }
  if (ageHours !== null && ageHours <= 72) {
    leadScore += 10;
    reasons.push('recent_activity');
  }
  if (ageHours !== null && ageHours > 24 * 7) {
    leadScore -= 10;
    reasons.push('stale_interest');
  }

  leadScore = Math.max(0, Math.min(100, Math.round(leadScore)));

  const purchaseProbability = scoreToProbabilityBucket(leadScore);
  const sentiment = PROBLEMA_RUIM_HORR_I__V_RE.test(text)
    ? 'NEGATIVE'
    : OBRIGAD_VALEU_PERFEITO_RE_2.test(text)
      ? 'POSITIVE'
      : 'NEUTRAL';
  const intent = QUERO_COMPRAR_ASSINAR_F_RE.test(text)
    ? 'BUY'
    : PROBLEMA_ERRO_SUPORTE_A_RE_2.test(text)
      ? 'SUPPORT'
      : RECLAMA_CANCELAR_RE.test(text)
        ? 'COMPLAINT'
        : inboundMessages.length > 0
          ? 'INFO'
          : 'COLD';
  const nextBestAction =
    purchaseProbability === 'VERY_HIGH' || purchaseProbability === 'HIGH'
      ? 'PRIORITIZE_MANUAL_FOLLOWUP'
      : purchaseProbability === 'MEDIUM'
        ? 'NURTURE_LATER'
        : 'MONITOR_ONLY';
  const notPurchasedReason = CARO_SEM_DINHEIRO_AGORA_RE.test(text)
    ? 'objection_or_timing'
    : SUMI_SEM_RESPOSTA_DEPOI_RE.test(text)
      ? 'follow_up_needed'
      : inboundMessages.length > 0
        ? 'still_open'
        : 'insufficient_data';

  return {
    leadScore,
    purchaseProbability,
    purchaseProbabilityScore: Number((leadScore / 100).toFixed(3)),
    sentiment,
    intent,
    summary:
      inboundMessages.length > 0
        ? `Contato com ${inboundMessages.length} mensagem(ns) inbound recente(s). Último tema: ${String(lastInbound?.content || '').slice(0, 140)}`
        : 'Contato catalogado sem histórico suficiente para alta confiança.',
    nextBestAction,
    reasons,
    buyerStatus: 'NOT_BOUGHT' as const,
    purchasedProduct: null,
    purchaseValue: null,
    purchaseReason: null,
    notPurchasedReason,
    preferences: [],
    importantDetails: [],
    purchaseProbabilityPercent: Math.round((leadScore / 100) * 100),
    demographics,
  };
}

function inferHeuristicDemographics(text: string): {
  gender: string;
  ageRange: string;
  location: string;
  confidence: number;
} {
  const normalized = String(text || '').toLowerCase();

  let gender = 'UNKNOWN';
  if (B_SOU_HOMEM_MEU_MARIDO_RE.test(normalized)) {
    gender = 'MASCULINO';
  } else if (B_SOU_MULHER_MINHA_ESPO_RE.test(normalized)) {
    gender = 'FEMININO';
  }

  const explicitAge = normalized.match(B__D_2___S_ANOS_B_RE);
  let ageRange = 'UNKNOWN';
  if (explicitAge) {
    const age = Number(explicitAge[1]);
    if (age >= 18 && age <= 24) ageRange = '18-24';
    else if (age <= 34) ageRange = '25-34';
    else if (age <= 44) ageRange = '35-44';
    else if (age <= 54) ageRange = '45-54';
    else if (age > 54) ageRange = '55+';
  }

  const locationMatch = normalized.match(B___SOU_DE_MORO_EM_AQUI_RE) || null;
  const location = locationMatch?.[1] ? String(locationMatch[1]).trim() : 'UNKNOWN';

  let confidence = 0;
  if (gender !== 'UNKNOWN') confidence = Math.max(confidence, 0.35);
  if (ageRange !== 'UNKNOWN') confidence = Math.max(confidence, 0.55);
  if (location !== 'UNKNOWN') confidence = Math.max(confidence, 0.45);

  return {
    gender,
    ageRange,
    location,
    confidence,
  };
}

async function runCatalogContacts(data: UnknownRecord) {
  const workspaceId = String(data?.workspaceId || '').trim();
  if (!workspaceId) {
    return { cataloged: 0, scoredQueued: 0, reason: 'workspace_missing' };
  }

  const workspace = await prisma.workspace.findUnique({
    where: { id: workspaceId },
    select: { providerSettings: true },
  });
  const settings = (workspace?.providerSettings as UnknownRecord) || {};
  const selfIdentity = await resolveWorkspaceSelfIdentity(workspaceId, settings);
  const remotePendingBeforeCatalog = await getRemoteUnreadChatSnapshot(
    workspaceId,
    CIA_BACKLOG_CONTINUATION_LIMIT,
    selfIdentity,
  ).catch(() => []);

  if (remotePendingBeforeCatalog.length > 0) {
    await seedRemoteUnreadConversationShells({
      workspaceId,
      selfIdentity,
      chats: remotePendingBeforeCatalog,
    }).catch((err) => {
      log.warn('seed_remote_unread_catalog_failed', { error: err?.message });
      return 0;
    });
    await scheduleBacklogContinuation({
      workspaceId,
      reason: 'catalog_blocked_by_remote_backlog',
      limit: Math.max(10, remotePendingBeforeCatalog.length),
      mode: 'reply_all_recent_first',
    }).catch((err) => {
      log.warn('schedule_backlog_continuation_failed', { error: err?.message });
      return undefined;
    });
    await publishAgentEvent({
      type: 'status',
      workspaceId,
      phase: 'contact_catalog',
      persistent: true,
      message: `Ainda existem ${remotePendingBeforeCatalog.length} conversa(s) pendentes no WAHA. Vou zerar o backlog antes de catalogar.`,
      meta: {
        remotePending: remotePendingBeforeCatalog.length,
      },
    });
    return {
      cataloged: 0,
      scoredQueued: 0,
      reason: 'backlog_pending',
    };
  }

  const days = Math.max(
    1,
    Number(data?.days || CIA_CONTACT_CATALOG_LOOKBACK_DAYS) || CIA_CONTACT_CATALOG_LOOKBACK_DAYS,
  );
  const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;
  const chats: RemoteChatSummary[] = (await whatsappApiProvider
    .getChats(workspaceId)
    .catch((): RemoteChatSummary[] => [])) as RemoteChatSummary[];
  const lidMap = buildLidMap(await whatsappApiProvider.getLidMappings(workspaceId).catch(() => []));
  const eligibleChatMap = new Map<string, UnknownRecord>();
  for (const chat of Array.isArray(chats) ? chats : []) {
    const chatId = String(chat?.id || '').trim();
    if (!isIndividualWahaChatId(chatId)) {
      continue;
    }

    const phone = resolveCatalogPhoneFromChatId(chatId, lidMap);
    const activityTimestamp = resolveCatalogChatActivityTimestamp(chat);
    if (
      !phone ||
      isWorkspaceSelfTarget({
        phone,
        chatId,
        selfIdentity,
      }) ||
      activityTimestamp < cutoff
    ) {
      continue;
    }

    const current = eligibleChatMap.get(phone);
    if (!current || activityTimestamp > current.activityTimestamp) {
      eligibleChatMap.set(phone, {
        chat,
        chatId,
        canonicalChatId: resolveCanonicalChatId(chatId, lidMap),
        phone,
        activityTimestamp,
      });
    }
  }

  const eligibleChats = Array.from(eligibleChatMap.values())
    .sort(
      (left: UnknownRecord, right: UnknownRecord) =>
        right.activityTimestamp - left.activityTimestamp,
    )
    .slice(0, CIA_CONTACT_CATALOG_MAX_CHATS);

  let cataloged = 0;
  let scoredQueued = 0;

  await forEachSequential(eligibleChats, async (item) => {
    const chat = item.chat;
    const chatId = item.chatId;
    const canonicalChatId = item.canonicalChatId || chatId;
    const phone = item.phone;
    if (
      !phone ||
      isWorkspaceSelfTarget({
        phone,
        chatId,
        selfIdentity,
      })
    ) {
      return;
    }

    const existingContact = await prisma.contact.findUnique({
      where: {
        workspaceId_phone: {
          workspaceId,
          phone,
        },
      },
      select: {
        name: true,
        customFields: true,
      },
    });
    const existingCustomFields = normalizeJsonObject(existingContact?.customFields);
    const remotePushName = String(existingCustomFields.remotePushName || '').trim();
    const existingStoredName = String(existingContact?.name || '').trim();
    const isPlaceholderName = (value: string) => {
      const normalized = String(value || '').trim();
      const lowered = normalized.toLowerCase();
      return (
        !normalized ||
        lowered === 'doe' ||
        lowered === 'unknown' ||
        lowered === 'desconhecido' ||
        D__D_S____S_DOE_RE.test(normalized) ||
        lowered === `${phone} doe` ||
        normalized.replace(NON_DIGIT_RE, '') === phone
      );
    };
    const remoteName =
      (!isPlaceholderName(remotePushName) ? remotePushName : '') ||
      extractCatalogChatName(chat, phone) ||
      (!isPlaceholderName(existingStoredName) ? existingStoredName : '');
    const contact = await prisma.contact.upsert({
      where: {
        workspaceId_phone: {
          workspaceId,
          phone,
        },
      },
      update: {
        name: remoteName || null,
        customFields: {
          ...existingCustomFields,
          catalogedAt: new Date().toISOString(),
          catalogSource: 'waha_catalog_30d',
          lastCatalogReason: String(data?.reason || 'catalog_job'),
          lastCatalogChatId: chatId,
          lastRemoteChatId: chatId,
          lastResolvedChatId: canonicalChatId,
          remotePushName: remoteName || undefined,
          remotePushNameUpdatedAt: remoteName
            ? new Date().toISOString()
            : existingCustomFields.remotePushNameUpdatedAt || undefined,
        },
      },
      create: {
        workspaceId,
        phone,
        name: remoteName || null,
        customFields: {
          catalogedAt: new Date().toISOString(),
          catalogSource: 'waha_catalog_30d',
          lastCatalogReason: String(data?.reason || 'catalog_job'),
          lastCatalogChatId: chatId,
          lastRemoteChatId: chatId,
          lastResolvedChatId: canonicalChatId,
          remotePushName: remoteName || undefined,
          remotePushNameUpdatedAt: remoteName ? new Date().toISOString() : undefined,
        },
      },
      select: {
        id: true,
      },
    });

    const savedToWhatsapp = remoteName
      ? await whatsappApiProvider
          .upsertContactProfile(workspaceId, {
            phone,
            name: remoteName,
          })
          .catch(() => false)
      : false;

    if (savedToWhatsapp) {
      const existingCustomFields = normalizeJsonObject(
        (
          await prisma.contact
            .findUnique({
              where: {
                workspaceId_phone: {
                  workspaceId,
                  phone,
                },
              },
              select: { customFields: true },
            })
            .catch(() => null /* not found */)
        )?.customFields,
      );

      await prisma.contact.updateMany({
        where: { id: contact.id, workspaceId },
        data: {
          customFields: {
            ...existingCustomFields,
            whatsappSavedAt: new Date().toISOString(),
            catalogedAt: existingCustomFields.catalogedAt || new Date().toISOString(),
            catalogSource: 'waha_catalog_30d',
            lastCatalogReason: String(data?.reason || 'catalog_job'),
            lastCatalogChatId: chatId,
            lastRemoteChatId: chatId,
            lastResolvedChatId: canonicalChatId,
            remotePushName: remoteName || undefined,
            remotePushNameUpdatedAt: remoteName
              ? new Date().toISOString()
              : existingCustomFields.remotePushNameUpdatedAt || undefined,
          },
        },
      });
    }

    await upsertCatalogConversationShell({
      workspaceId,
      contactId: contact.id,
      lastMessageAt: new Date(item.activityTimestamp),
      unreadCount: Math.max(
        Number(chat?.unreadCount || chat?.unread || 0) || 0,
        resolveLastMessageFromMe(chat) === false ? 1 : 0,
      ),
    });

    cataloged += 1;

    try {
      await autopilotQueue.add(
        'score-contact',
        {
          workspaceId,
          contactId: contact.id,
          phone,
          chatId: canonicalChatId,
          reason: data?.reason || 'catalog_job',
        },
        {
          jobId: buildQueueJobId('score-contact', workspaceId, contact.id),
          removeOnComplete: true,
        },
      );
      scoredQueued += 1;
    } catch (error: unknown) {
      const errorInstanceofError =
        error instanceof Error
          ? error
          : new Error(typeof error === 'string' ? error : 'unknown error');
      const message = String(errorInstanceofError?.message || '');
      if (!message.includes('Job is already waiting')) {
        log.warn('catalog_score_enqueue_failed', {
          workspaceId,
          contactId: contact.id,
          error: message,
        });
      }
    }
  });

  await setWorkspaceSilentLiveMode({
    workspaceId,
    reason: String(data?.reason || 'catalog_job'),
    catalogStatus: 'completed',
  });

  await publishAgentEvent({
    type: 'status',
    workspaceId,
    phase: 'contact_catalog',
    persistent: true,
    message: `Catálogo 30d atualizado. ${cataloged} contato(s) verificado(s) e ${scoredQueued} score(s) enfileirado(s).`,
    meta: {
      cataloged,
      scoredQueued,
      days,
    },
  });

  return { cataloged, scoredQueued, days };
}

async function runScoreContact(data: UnknownRecord) {
  const workspaceId = String(data?.workspaceId || '').trim();
  const contactId = String(data?.contactId || '').trim();
  if (!workspaceId || !contactId) {
    return { scored: false, reason: 'missing_input' };
  }

  const cutoff = new Date(Date.now() - CIA_CONTACT_CATALOG_LOOKBACK_DAYS * 24 * 60 * 60 * 1000);
  const contact = await prisma.contact.findUnique({
    where: { id: contactId },
    include: {
      deals: {
        where: { status: 'WON' },
        orderBy: { updatedAt: 'desc' },
        take: 3,
        select: {
          title: true,
          value: true,
          status: true,
          updatedAt: true,
        },
      },
      messages: {
        where: { createdAt: { gte: cutoff } },
        orderBy: { createdAt: 'desc' },
        take: CIA_CONTACT_SCORE_MESSAGE_LIMIT,
        select: {
          direction: true,
          content: true,
          createdAt: true,
        },
      },
      conversations: {
        where: { workspaceId },
        select: {
          unreadCount: true,
          lastMessageAt: true,
        },
        orderBy: { lastMessageAt: 'desc' },
        take: 1,
      },
    },
  });

  if (!contact) {
    return { scored: false, reason: 'contact_missing' };
  }

  let messages = [...(contact.messages || [])]
    .map((message) => ({
      direction: String(message.direction || '').toUpperCase(),
      content: String(message.content || '').trim(),
      createdAt: message.createdAt,
    }))
    .filter((message) => message.content)
    .sort(
      (left: UnknownRecord, right: UnknownRecord) =>
        new Date(left.createdAt).getTime() - new Date(right.createdAt).getTime(),
    );

  if (messages.length < 4 && data?.chatId) {
    const remoteMessages = await whatsappApiProvider
      .getChatMessages(workspaceId, String(data.chatId), {
        limit: CIA_CONTACT_SCORE_MESSAGE_LIMIT,
        offset: 0,
        downloadMedia: false,
      })
      .catch(() => []);
    if (remoteMessages.length) {
      messages = remoteMessages
        .map((message) => ({
          direction:
            message?.fromMe === true ||
            message?.key?.fromMe === true ||
            message?.id?.fromMe === true
              ? 'OUTBOUND'
              : 'INBOUND',
          content: String(message?.body || message?.text?.body || message?.caption || '').trim(),
          createdAt:
            resolveCatalogChatActivityTimestamp(message) > 0
              ? new Date(resolveCatalogChatActivityTimestamp(message))
              : new Date(),
        }))
        .filter((message) => message.content)
        .sort(
          (left: UnknownRecord, right: UnknownRecord) =>
            new Date(left.createdAt).getTime() - new Date(right.createdAt).getTime(),
        );
    }
  }

  const history = messages
    .map((message) => `[${message.direction}] ${String(message.content || '').slice(0, 500)}`)
    .join('\n');
  const unreadCount = Number(contact.conversations?.[0]?.unreadCount || 0) || 0;
  const latestWonDeal = Array.isArray((contact as unknown as { deals?: UnknownRecord[] }).deals)
    ? (contact as unknown as { deals?: UnknownRecord[] }).deals[0]
    : null;
  const heuristic = buildHeuristicCatalogScore({
    joinedText: history,
    messages,
    unreadCount,
    optedOutAt: contact.optedOutAt,
    wonDealTitle: latestWonDeal?.title || null,
    wonDealValue: latestWonDeal?.value || null,
  });
  const aiScore = await maybeScoreContactWithAi({
    contactName: contact.name,
    phone: contact.phone,
    history,
    wonDealTitle: latestWonDeal?.title || null,
    wonDealValue: latestWonDeal?.value || null,
  });
  const score = aiScore || heuristic;
  const probabilityScore = Math.max(
    0,
    Math.min(1, Number(score.purchaseProbabilityScore || score.leadScore / 100) || 0),
  );
  const probabilityPercent = Math.max(
    0,
    Math.min(
      100,
      Math.round(Number(score.purchaseProbabilityPercent || probabilityScore * 100) || 0),
    ),
  );
  const compressedSummary = [
    `Contato: ${contact.name || contact.phone}`,
    `Status do cliente: ${score.buyerStatus}`,
    `Score: ${score.leadScore}/100`,
    score.buyerStatus === 'BOUGHT'
      ? `Probabilidade de recompra: ${score.purchaseProbability} (${probabilityPercent}%)`
      : `Probabilidade de compra: ${score.purchaseProbability} (${probabilityPercent}%)`,
    score.buyerStatus === 'BOUGHT'
      ? `Compra identificada: ${score.purchasedProduct || latestWonDeal?.title || 'produto não identificado'}`
      : null,
    score.purchaseValue ? `Valor pago: ${score.purchaseValue}` : null,
    `Intenção: ${score.intent}`,
    `Sentimento: ${score.sentiment}`,
    `Perfil inferido: ${score.demographics.gender}, ${score.demographics.ageRange}, ${score.demographics.location} (confiança ${Math.round(
      (Number(score.demographics.confidence || 0) || 0) * 100,
    )}%)`,
    `Próxima ação: ${score.nextBestAction}`,
    `Resumo: ${score.summary}`,
    score.purchaseReason ? `Motivo da compra: ${score.purchaseReason}` : null,
    score.notPurchasedReason ? `Motivo de não compra: ${score.notPurchasedReason}` : null,
  ]
    .filter(Boolean)
    .join('\n');

  const existingCustomFields = normalizeJsonObject(contact.customFields);
  await prisma.contact.updateMany({
    where: { id: contact.id, workspaceId },
    data: {
      leadScore: score.leadScore,
      sentiment: score.sentiment,
      purchaseProbability: score.purchaseProbability,
      nextBestAction: score.nextBestAction,
      aiSummary: score.summary,
      customFields: {
        ...existingCustomFields,
        purchaseProbabilityScore: Number(probabilityScore.toFixed(3)),
        purchaseProbabilityPercent: probabilityPercent,
        probabilityReasons: score.reasons,
        catalogedAt: existingCustomFields.catalogedAt || new Date().toISOString(),
        lastScoredAt: new Date().toISOString(),
        lastScoredSource: aiScore ? 'ai_catalog_score' : 'heuristic_catalog_score',
        intent: score.intent,
        buyerStatus: score.buyerStatus,
        purchasedProduct: score.purchasedProduct || latestWonDeal?.title || null,
        purchaseValue:
          score.purchaseValue ||
          ((Number(latestWonDeal?.value || 0) || 0) > 0
            ? Number(Number(latestWonDeal?.value || 0).toFixed(2))
            : null),
        purchaseReason: score.purchaseReason,
        notPurchasedReason: score.notPurchasedReason,
        preferences: score.preferences,
        importantDetails: score.importantDetails,
        demographics: score.demographics,
        fullSummary: score.summary,
      },
    },
  });

  await prisma.kloelMemory.upsert({
    where: {
      workspaceId_key: {
        workspaceId,
        key: `compressed_context:${contact.id}`,
      },
    },
    update: {
      value: {
        contactId: contact.id,
        phone: contact.phone,
        summary: compressedSummary,
        score: score.leadScore,
        purchaseProbability: score.purchaseProbability,
        purchaseProbabilityScore: Number(probabilityScore.toFixed(3)),
        purchaseProbabilityPercent: probabilityPercent,
        intent: score.intent,
        nextBestAction: score.nextBestAction,
        buyerStatus: score.buyerStatus,
        purchasedProduct: score.purchasedProduct || latestWonDeal?.title || null,
        purchaseValue:
          score.purchaseValue ||
          ((Number(latestWonDeal?.value || 0) || 0) > 0
            ? Number(Number(latestWonDeal?.value || 0).toFixed(2))
            : null),
        source: aiScore ? 'ai_catalog_score' : 'heuristic_catalog_score',
      },
      category: 'compressed_context',
      type: 'contact_context',
      content: compressedSummary,
      metadata: {
        contactId: contact.id,
        phone: contact.phone,
        score: score.leadScore,
        purchaseProbability: score.purchaseProbability,
        purchaseProbabilityScore: Number(probabilityScore.toFixed(3)),
        purchaseProbabilityPercent: probabilityPercent,
        intent: score.intent,
        buyerStatus: score.buyerStatus,
        reason: data?.reason || 'catalog_job',
      },
    },
    create: {
      workspaceId,
      key: `compressed_context:${contact.id}`,
      category: 'compressed_context',
      type: 'contact_context',
      content: compressedSummary,
      value: {
        contactId: contact.id,
        phone: contact.phone,
        summary: compressedSummary,
        score: score.leadScore,
        purchaseProbability: score.purchaseProbability,
        purchaseProbabilityScore: Number(probabilityScore.toFixed(3)),
        purchaseProbabilityPercent: probabilityPercent,
        intent: score.intent,
        nextBestAction: score.nextBestAction,
        buyerStatus: score.buyerStatus,
        purchasedProduct: score.purchasedProduct || latestWonDeal?.title || null,
        purchaseValue:
          score.purchaseValue ||
          ((Number(latestWonDeal?.value || 0) || 0) > 0
            ? Number(Number(latestWonDeal?.value || 0).toFixed(2))
            : null),
        source: aiScore ? 'ai_catalog_score' : 'heuristic_catalog_score',
      },
      metadata: {
        contactId: contact.id,
        phone: contact.phone,
        score: score.leadScore,
        purchaseProbability: score.purchaseProbability,
        purchaseProbabilityScore: Number(probabilityScore.toFixed(3)),
        purchaseProbabilityPercent: probabilityPercent,
        intent: score.intent,
        buyerStatus: score.buyerStatus,
        reason: data?.reason || 'catalog_job',
      },
    },
  });

  return {
    scored: true,
    contactId: contact.id,
    leadScore: score.leadScore,
    purchaseProbability: score.purchaseProbability,
    purchaseProbabilityScore: Number(probabilityScore.toFixed(3)),
    purchaseProbabilityPercent: probabilityPercent,
    buyerStatus: score.buyerStatus,
  };
}

async function refreshOpportunityUniverse(workspaceId: string) {
  const throttleKey = `cia:opportunity-refresh:${workspaceId}`;
  const reserved = await redis.set(
    throttleKey,
    new Date().toISOString(),
    'EX',
    CIA_OPPORTUNITY_REFRESH_TTL_SECONDS,
    'NX',
  );
  if (reserved !== 'OK') {
    return { refreshed: false as const, reason: 'throttled' };
  }

  const cutoff = new Date(Date.now() - CIA_OPPORTUNITY_LOOKBACK_DAYS * 24 * 60 * 60 * 1000);
  const conversations = await prisma.conversation.findMany({
    where: {
      workspaceId,
      lastMessageAt: { gte: cutoff },
      contactId: { not: '' },
    },
    include: {
      contact: {
        select: {
          id: true,
          phone: true,
          name: true,
          leadScore: true,
          customFields: true,
          optedOutAt: true,
        },
      },
      messages: {
        orderBy: { createdAt: 'desc' },
        take: 12,
        select: {
          direction: true,
          createdAt: true,
          content: true,
          externalId: true,
        },
      },
    },
    orderBy: { lastMessageAt: 'desc' },
    take: CIA_OPPORTUNITY_REFRESH_LIMIT,
  });

  const seedState = buildCiaWorkspaceStateFromSeed({
    workspaceId,
    conversations: conversations.map((conversation: UnknownRecord) => {
      const lastInbound =
        conversation.messages.find((message) => message.direction === 'INBOUND') ||
        conversation.messages[0];
      const pending = isConversationPendingForAgent(conversation);

      return {
        conversationId: conversation.id,
        contactId: conversation.contact?.id,
        phone: conversation.contact?.phone,
        contactName: conversation.contact?.name,
        unreadCount: deriveOperationalUnreadCount(conversation),
        pending,
        lastMessageAt: conversation.lastMessageAt,
        lastMessageText: lastInbound?.content || '',
        leadScore: conversation.contact?.leadScore || 0,
        customFields: conversation.contact?.customFields || {},
      };
    }),
  });

  const conversationMap = new Map(
    conversations.map((conversation: UnknownRecord) => [conversation.id, conversation]),
  );
  const rankings: Array<Record<string, unknown>> = [];

  await forEachSequential(seedState.candidates, async (candidate) => {
    const conversation = conversationMap.get(candidate.conversationId);
    if (!conversation?.contact?.id) {
      return;
    }

    const joinedText = (conversation.messages || [])
      .map((message) => String(message.content || ''))
      .join('\n');
    const classification = classifyOpportunityCandidate({
      candidate,
      joinedText,
      optedOutAt: conversation.contact?.optedOutAt || null,
      customFields: conversation.contact?.customFields || {},
    });
    const compressedContext = buildCompressedOpportunityContext({
      contactName: conversation.contact?.name,
      phone: conversation.contact?.phone,
      candidate,
      messages: conversation.messages || [],
      opportunityClass: classification.opportunityClass,
      score: classification.score,
    });

    await prisma.contact
      .update({
        where: { id: conversation.contact.id },
        data: {
          purchaseProbability: mapOpportunityBucket(classification.score),
          nextBestAction: classification.nextBestAction,
        },
      })
      .catch((err) => {
        log.warn('contact_update_score_failed', { error: err?.message });
        return undefined;
      });

    await prisma.kloelMemory.upsert({
      where: {
        workspaceId_key: {
          workspaceId,
          key: `compressed_context:${conversation.contact.id}`,
        },
      },
      update: {
        value: {
          contactId: conversation.contact.id,
          phone: conversation.contact?.phone || null,
          summary: compressedContext,
          opportunityClass: classification.opportunityClass,
          score: classification.score,
          nextBestAction: classification.nextBestAction,
          source: 'cia_opportunity_refresh',
        },
        category: 'compressed_context',
        type: 'contact_context',
        content: compressedContext,
        metadata: {
          contactId: conversation.contact.id,
          phone: conversation.contact?.phone || null,
          opportunityClass: classification.opportunityClass,
          score: classification.score,
          source: 'cia_opportunity_refresh',
        },
      },
      create: {
        workspaceId,
        key: `compressed_context:${conversation.contact.id}`,
        value: {
          contactId: conversation.contact.id,
          phone: conversation.contact?.phone || null,
          summary: compressedContext,
          opportunityClass: classification.opportunityClass,
          score: classification.score,
          nextBestAction: classification.nextBestAction,
          source: 'cia_opportunity_refresh',
        },
        category: 'compressed_context',
        type: 'contact_context',
        content: compressedContext,
        metadata: {
          contactId: conversation.contact.id,
          phone: conversation.contact?.phone || null,
          opportunityClass: classification.opportunityClass,
          score: classification.score,
          source: 'cia_opportunity_refresh',
        },
      },
    });

    await prisma.kloelMemory.upsert({
      where: {
        workspaceId_key: {
          workspaceId,
          key: `opportunity_rank:${conversation.contact.id}`,
        },
      },
      update: {
        value: {
          contactId: conversation.contact.id,
          phone: conversation.contact?.phone || null,
          score: classification.score,
          opportunityClass: classification.opportunityClass,
          nextBestAction: classification.nextBestAction,
          reason: classification.reason,
          lastMessageAt: candidate.lastMessageAt,
        },
        category: 'opportunity_ranking',
        type: 'contact_opportunity',
        content: `${classification.opportunityClass} (${classification.score}%)`,
        metadata: {
          conversationId: candidate.conversationId,
          contactId: conversation.contact.id,
        },
      },
      create: {
        workspaceId,
        key: `opportunity_rank:${conversation.contact.id}`,
        value: {
          contactId: conversation.contact.id,
          phone: conversation.contact?.phone || null,
          score: classification.score,
          opportunityClass: classification.opportunityClass,
          nextBestAction: classification.nextBestAction,
          reason: classification.reason,
          lastMessageAt: candidate.lastMessageAt,
        },
        category: 'opportunity_ranking',
        type: 'contact_opportunity',
        content: `${classification.opportunityClass} (${classification.score}%)`,
        metadata: {
          conversationId: candidate.conversationId,
          contactId: conversation.contact.id,
        },
      },
    });

    rankings.push({
      contactId: conversation.contact.id,
      phone: conversation.contact?.phone || null,
      contactName: conversation.contact?.name || null,
      opportunityClass: classification.opportunityClass,
      score: classification.score,
      nextBestAction: classification.nextBestAction,
      conversationId: candidate.conversationId,
    });
  });

  const orderedRankings = rankings.sort((left, right) => Number(right.score) - Number(left.score));
  await prisma.kloelMemory.upsert({
    where: {
      workspaceId_key: {
        workspaceId,
        key: 'opportunity_universe:current',
      },
    },
    update: {
      value: {
        refreshedAt: new Date().toISOString(),
        lookbackDays: CIA_OPPORTUNITY_LOOKBACK_DAYS,
        totalContacts: orderedRankings.length,
        rankings: orderedRankings as unknown as Prisma.InputJsonValue,
      },
      category: 'opportunity_ranking',
      type: 'workspace_opportunity_universe',
      content: `Universo de oportunidades atualizado com ${orderedRankings.length} contato(s).`,
      metadata: {
        totalContacts: orderedRankings.length,
        lookbackDays: CIA_OPPORTUNITY_LOOKBACK_DAYS,
      },
    },
    create: {
      workspaceId,
      key: 'opportunity_universe:current',
      value: {
        refreshedAt: new Date().toISOString(),
        lookbackDays: CIA_OPPORTUNITY_LOOKBACK_DAYS,
        totalContacts: orderedRankings.length,
        rankings: orderedRankings as unknown as Prisma.InputJsonValue,
      },
      category: 'opportunity_ranking',
      type: 'workspace_opportunity_universe',
      content: `Universo de oportunidades atualizado com ${orderedRankings.length} contato(s).`,
      metadata: {
        totalContacts: orderedRankings.length,
        lookbackDays: CIA_OPPORTUNITY_LOOKBACK_DAYS,
      },
    },
  });

  return {
    refreshed: true as const,
    totalContacts: orderedRankings.length,
    topContacts: orderedRankings.slice(0, 10),
  };
}

async function persistCiaCycleProof(input: {
  workspaceId: string;
  cycleProofId: string;
  summary: string;
  guaranteeReport: Record<string, unknown>;
  exhaustionReport: Record<string, unknown>;
}) {
  if (!prisma?.kloelMemory?.upsert) return null;

  const payload = {
    cycleProofId: input.cycleProofId,
    summary: input.summary,
    guaranteeReport: input.guaranteeReport,
    exhaustionReport: input.exhaustionReport,
    generatedAt: new Date().toISOString(),
  };

  const details = (input.exhaustionReport?.details ?? {}) as Record<string, unknown>;
  const buildMetadata = () => ({
    cycleProofId: input.cycleProofId,
    candidateCount: Number(details?.candidateCount || 0),
    selectedCount: Number(details?.selectedCount || 0),
    dispatchableCount: Number(input.exhaustionReport?.dispatchableCount || 0),
    exhaustive: Boolean(input.exhaustionReport?.exhaustive),
    noLegalActions: Boolean(input.exhaustionReport?.noLegalActions),
  });

  return prisma.kloelMemory.upsert({
    where: {
      workspaceId_key: {
        workspaceId: input.workspaceId,
        key: 'cia_cycle_proof:current',
      },
    },
    update: {
      value: payload as unknown as Prisma.InputJsonValue,
      category: 'cia_cycle_proof',
      type: input.exhaustionReport?.noLegalActions ? 'no_legal_actions' : 'dispatched',
      content: input.summary,
      metadata: buildMetadata(),
    },
    create: {
      workspaceId: input.workspaceId,
      key: 'cia_cycle_proof:current',
      value: payload as unknown as Prisma.InputJsonValue,
      category: 'cia_cycle_proof',
      type: input.exhaustionReport?.noLegalActions ? 'no_legal_actions' : 'dispatched',
      content: input.summary,
      metadata: buildMetadata(),
    },
  });
}

async function listCanonicalWorkItems(workspaceId: string) {
  const client = prisma as unknown as UnknownRecord;
  if (!client?.agentWorkItem?.findMany) {
    return [];
  }

  return client.agentWorkItem.findMany({
    where: { workspaceId },
    orderBy: [{ priority: 'desc' }, { updatedAt: 'desc' }],
    take: 200,
  });
}

async function persistAccountProofSnapshot(input: {
  workspaceId: string;
  cycleProofId: string;
  summary: string;
  guaranteeReport: Record<string, unknown>;
  exhaustionReport: Record<string, unknown>;
  actions: Array<Record<string, unknown>>;
  workItemUniverse: Array<Record<string, unknown>>;
  tacticUniverse: Array<Record<string, unknown>>;
}) {
  const client = prisma as unknown as UnknownRecord;
  if (!client?.accountProofSnapshot?.create) {
    return null;
  }

  const exhaustionDetails = (input.exhaustionReport?.details ?? {}) as Record<string, unknown>;
  const classifications = Array.isArray(exhaustionDetails?.classifications)
    ? exhaustionDetails.classifications
    : [];
  const blockedActions = classifications.filter(
    (item: UnknownRecord) => item?.disposition === 'DEFERRED_BY_RULE',
  );
  const deferredActions = classifications.filter(
    (item: UnknownRecord) => item?.disposition === 'DEFERRED_BY_CYCLE_BUDGET',
  );

  return client.accountProofSnapshot.create({
    data: {
      workspaceId: input.workspaceId,
      proofType: 'CIA_CYCLE',
      status: input.exhaustionReport?.noLegalActions
        ? 'NO_LEGAL_ACTIONS'
        : input.actions.length > 0
          ? 'ACTIVE'
          : 'IDLE',
      cycleProofId: input.cycleProofId,
      noLegalActions: Boolean(input.exhaustionReport?.noLegalActions),
      candidateCount: Number(exhaustionDetails?.candidateCount || 0),
      eligibleActionCount: Number(input.exhaustionReport?.dispatchableCount || 0),
      blockedActionCount: Number(input.exhaustionReport?.deferredByRuleCount || 0),
      deferredActionCount: Number(input.exhaustionReport?.deferredByBudgetCount || 0),
      waitingApprovalCount: Number(input.exhaustionReport?.waitingHumanCount || 0),
      waitingInputCount: Number(input.exhaustionReport?.waitingClarificationCount || 0),
      silentRemainderCount: Number(input.exhaustionReport?.silentCount || 0),
      workItemUniverse: input.workItemUniverse,
      actionUniverse: classifications,
      executedActions: input.actions,
      blockedActions,
      deferredActions,
      metadata: {
        summary: input.summary,
        guaranteeReport: input.guaranteeReport,
        exhaustionReport: input.exhaustionReport,
        tacticUniverse: input.tacticUniverse,
      },
    },
  });
}

async function createConversationProofSnapshotDraft(input: {
  workspaceId: string;
  conversationId: string;
  contactId?: string | null;
  phone?: string | null;
  cycleProofId?: string | null;
  accountProofId?: string | null;
  selectedActionType: string;
  selectedTactic?: string | null;
  governor?: string | null;
  renderedMessage?: string | null;
  actionUniverse?: Array<Record<string, unknown>>;
  tacticUniverse?: Array<Record<string, unknown>>;
  selectedAction?: Record<string, unknown> | null;
}) {
  const client = prisma as unknown as UnknownRecord;
  if (!client?.conversationProofSnapshot?.create) {
    return null;
  }

  const selectedTacticData =
    (input.tacticUniverse || []).find(
      (item: UnknownRecord) => String(item?.tactic || '') === String(input.selectedTactic || ''),
    ) || null;

  return client.conversationProofSnapshot.create({
    data: {
      workspaceId: input.workspaceId,
      conversationId: input.conversationId,
      contactId: input.contactId || null,
      phone: input.phone || null,
      status: 'PENDING_EXECUTION',
      cycleProofId: input.cycleProofId || null,
      accountProofId: input.accountProofId || null,
      selectedActionType: input.selectedActionType,
      selectedTactic: input.selectedTactic || null,
      governor: input.governor || null,
      renderedMessage: input.renderedMessage || null,
      outcome: null,
      actionUniverse: input.actionUniverse || [],
      tacticUniverse: input.tacticUniverse || [],
      selectedAction: input.selectedAction || null,
      selectedTacticData,
      metadata: {
        createdBy: 'runCiaAction',
      },
    },
  });
}

async function finalizeConversationProofSnapshot(
  recordId: string | null | undefined,
  payload: {
    status: string;
    outcome?: string | null;
    renderedMessage?: string | null;
    metadata?: Record<string, unknown> | null;
  },
) {
  if (!recordId) return null;
  const client = prisma as unknown as UnknownRecord;
  if (!client?.conversationProofSnapshot?.update) {
    return null;
  }

  return client.conversationProofSnapshot.update({
    where: { id: recordId },
    data: {
      status: payload.status,
      outcome: payload.outcome || null,
      renderedMessage: payload.renderedMessage || undefined,
      metadata: payload.metadata || undefined,
    },
  });
}

async function runCiaCycleAll() {
  const workspaces = await prisma.workspace.findMany({
    select: { id: true, providerSettings: true },
    take: 500,
  });

  await forEachSequential(workspaces, async (workspace) => {
    const settings = (workspace.providerSettings ?? {}) as UnknownRecord;
    if (settings?.billingSuspended === true) {
      return;
    }
    if (!isCiaAutonomyMode(settings)) return;
    await runCiaCycleWorkspace(workspace.id, settings);
  });
}

async function runCiaCycleWorkspace(workspaceId: string, presetSettings?: UnknownRecord) {
  const settings = presetSettings
    ? presetSettings
    : ((
        await prisma.workspace.findUnique({
          where: { id: workspaceId },
          select: { providerSettings: true },
        })
      )?.providerSettings as UnknownRecord);

  if (settings?.billingSuspended === true || !isCiaAutonomyMode(settings)) {
    return {
      queued: 0,
      reason: settings?.billingSuspended === true ? 'billing_suspended' : 'autopilot_disabled',
    };
  }

  const now = new Date();
  const nowHour = getWorkspaceLocalHour(settings, now);
  const withinWindow = isWithinWorkspaceWindow({
    settings,
    startHour: WINDOW_START,
    endHour: WINDOW_END,
    now,
  });
  if (!withinWindow) {
    return {
      queued: 0,
      reason: 'outside_window',
      localHour: nowHour,
    };
  }

  const state = await buildCiaWorkspaceState(prisma, workspaceId, {
    limit: CIA_MAIN_LOOP_LIMIT,
    silenceHours: SILENCE_HOURS,
    allowProactive: isCiaProactiveCycleEnabled(settings),
  });

  await persistBusinessSnapshot(prisma, {
    workspaceId,
    snapshot: state.snapshot,
  });
  await persistMarketSignals(prisma, {
    workspaceId,
    signals: state.marketSignals,
  });
  const opportunityRefresh = await refreshOpportunityUniverse(workspaceId).catch(
    (error: unknown) => ({
      refreshed: false as const,
      reason:
        (error instanceof Error ? error.message : String(error)) || 'opportunity_refresh_failed',
    }),
  );

  const globalStrategy = await loadWorkspaceGlobalStrategy({
    settings,
    intentHint:
      state.clusters.PAYMENT.length > 0
        ? 'payment_recovery'
        : state.candidates[0]?.cognitiveState?.intent ||
          state.candidates[0]?.suggestedAction ||
          'followup',
  });

  const learning = await computeLearningSnapshot(prisma, workspaceId);
  if (learning.totalLogs > 0) {
    await persistSystemInsight(prisma, {
      workspaceId,
      type: 'CIA_SELF_IMPROVEMENT',
      title: 'Ciclo de autoaprendizado atualizado',
      description: learning.topVariantKey
        ? `A melhor variante recente é ${learning.topVariantKey} com score ${learning.topVariantScore}.`
        : 'Ainda estou coletando dados suficientes para refinar as variantes.',
      severity: learning.failedCount > learning.sentCount ? 'WARNING' : 'INFO',
      metadata: { ...learning },
    });
  }

  const batch = planCiaActions(state, {
    maxActionsPerCycle: CIA_MAX_ACTIONS_PER_CYCLE,
    strategy: globalStrategy,
  });
  const guaranteeReport = buildCiaGuaranteeReport(state, batch, CIA_MAX_ACTIONS_PER_CYCLE);
  const exhaustionReport = buildCiaExhaustionReport(
    state,
    batch,
    CIA_MAX_ACTIONS_PER_CYCLE,
    globalStrategy,
  );
  const cycleProofId = buildQueueJobId(
    'cia-cycle-proof',
    workspaceId,
    state.generatedAt,
    state.candidates.length,
    batch.actions.length,
  );

  try {
    assertCiaGuarantees(guaranteeReport);
    assertCiaExhaustion(exhaustionReport);
    for (const action of batch.actions) {
      assertConversationTacticPlan({
        action: action.type,
        selectedTactic: action.conversationTactic,
        selectedTacticUtility: action.selectedTacticUtility,
        selectedTacticRank: action.selectedTacticRank,
        betterTacticCount: action.betterTacticCount,
        nextBestTactic: action.nextBestTactic,
        nextBestTacticUtility: action.nextBestTacticUtility,
        executableCount: action.conversationTacticUniverse.length,
        blockedCount: 0,
        silentCount: 0,
        exhaustive: action.conversationTacticUniverse.length > 0,
        candidates: action.conversationTacticUniverse,
      });
    }
  } catch (err: unknown) {
    const errInstanceofError =
      err instanceof Error ? err : new Error(typeof err === 'string' ? err : 'unknown error');
    await publishAgentEvent({
      type: 'error',
      workspaceId,
      phase: 'cia_contract_violation',
      persistent: true,
      message:
        'Detectei uma violação interna de contrato no ciclo CIA e bloqueei o despacho automático deste tick.',
      meta: {
        error: errInstanceofError?.message || 'cia_contract_violation',
        guaranteeReport,
        exhaustionReport,
        cycleProofId,
        opportunityRefresh,
      },
    });
    await persistSystemInsight(prisma, {
      workspaceId,
      type: 'CIA_CONTRACT_VIOLATION',
      title: 'Ciclo CIA bloqueado por contrato interno',
      description:
        errInstanceofError?.message || 'Uma garantia operacional obrigatória falhou no ciclo.',
      severity: 'CRITICAL',
      metadata: {
        cycleProofId,
        guaranteeReport,
        exhaustionReport,
        opportunityRefresh,
      },
    });
    return {
      queued: 0,
      reason: 'contract_violation',
      learning,
      guaranteeReport,
      exhaustionReport,
      cycleProofId,
      opportunityRefresh,
    };
  }

  await persistCiaCycleProof({
    workspaceId,
    cycleProofId,
    summary: batch.summary,
    guaranteeReport: guaranteeReport as unknown as Record<string, unknown>,
    exhaustionReport: exhaustionReport as unknown as Record<string, unknown>,
  });
  const workItemUniverse = await listCanonicalWorkItems(workspaceId);
  const tacticUniverse = batch.actions.map((action) => ({
    conversationId: action.conversationId,
    contactId: action.contactId,
    action: action.type,
    selectedTactic: action.conversationTactic,
    candidates: action.conversationTacticUniverse,
  }));
  const accountProof = await persistAccountProofSnapshot({
    workspaceId,
    cycleProofId,
    summary: batch.summary,
    guaranteeReport: guaranteeReport as unknown as Record<string, unknown>,
    exhaustionReport: exhaustionReport as unknown as Record<string, unknown>,
    actions: batch.actions as unknown as Array<Record<string, unknown>>,
    workItemUniverse: workItemUniverse as unknown as Array<Record<string, unknown>>,
    tacticUniverse: tacticUniverse as unknown as Array<Record<string, unknown>>,
  });
  const accountProofId = accountProof?.id || null;

  // Skip noisy proof event when there are zero candidates (nothing to report)
  if (exhaustionReport.noLegalActions && exhaustionReport.details.candidateCount === 0) {
    // No candidates evaluated — suppress repetitive idle proof
  } else {
    await publishAgentEvent({
      type: 'proof',
      workspaceId,
      phase: 'cia_cycle_proof',
      persistent: true,
      message: exhaustionReport.noLegalActions
        ? `Nenhuma ação elegível permaneceu neste ciclo após avaliar ${exhaustionReport.details.candidateCount} candidata(s); ${exhaustionReport.silentCount} ficaram silenciadas e ${exhaustionReport.dispatchableCount} seguiram bloqueadas pelas regras atuais.`
        : `Selecionei ${batch.actions.length} ação(ões) para despacho após avaliar ${state.candidates.length} candidata(s); ${exhaustionReport.dispatchableCount} estavam elegíveis para execução neste ciclo.`,
      meta: {
        cycleProofId,
        accountProofId,
        candidateCount: exhaustionReport.details.candidateCount,
        dispatchableCount: exhaustionReport.dispatchableCount,
        dispatchedCount: exhaustionReport.dispatchedCount,
        silentCount: exhaustionReport.silentCount,
        noLegalActions: exhaustionReport.noLegalActions,
        exhaustive: exhaustionReport.exhaustive,
        opportunityRefresh,
        actionOptimality: batch.actions.map((action) => ({
          conversationId: action.conversationId,
          type: action.type,
          selectedActionUtility: action.selectedActionUtility,
          selectedActionRank: action.selectedActionRank,
          betterActionCount: action.betterActionCount,
          betterExecutableActionCount: action.betterExecutableActionCount,
          nextBestActionType: action.nextBestActionType,
          nextBestActionUtility: action.nextBestActionUtility,
          selectedTactic: action.conversationTactic,
          selectedTacticUtility: action.selectedTacticUtility,
          selectedTacticRank: action.selectedTacticRank,
          betterTacticCount: action.betterTacticCount,
          nextBestTactic: action.nextBestTactic,
          nextBestTacticUtility: action.nextBestTacticUtility,
        })),
      },
    });
  } // end: skip zero-candidate proof

  if (!batch.actions.length) {
    await publishAgentEvent({
      type: 'heartbeat',
      workspaceId,
      phase: 'cia_idle',
      message: exhaustionReport.noLegalActions
        ? 'Exauri todas as ações legais deste ciclo. Agora só volto a agir quando surgir trabalho novo ou alguma regra deixar de bloquear.'
        : 'Estou monitorando o WhatsApp e não encontrei uma ação segura para este ciclo.',
      meta: {
        backlog: state.snapshot.openBacklog,
        hotLeadCount: state.snapshot.hotLeadCount,
        pendingPaymentCount: state.snapshot.pendingPaymentCount,
        cycleProofId,
        accountProofId,
        exhaustionReport,
        opportunityRefresh,
      },
    });
    if (exhaustionReport.noLegalActions) {
      await persistSystemInsight(prisma, {
        workspaceId,
        type: 'CIA_NO_LEGAL_ACTIONS',
        title: 'Ciclo CIA sem ações legais disponíveis',
        description:
          'Todas as ações possíveis deste ciclo ficaram bloqueadas por regras explícitas ou timing operacional.',
        severity: 'INFO',
        metadata: {
          cycleProofId,
          accountProofId,
          guaranteeReport,
          exhaustionReport,
          opportunityRefresh,
        },
      });
    }
    return {
      queued: 0,
      reason: 'no_safe_actions',
      learning,
      guaranteeReport,
      exhaustionReport,
      cycleProofId,
      accountProofId,
      opportunityRefresh,
    };
  }

  await publishAgentEvent({
    type: 'thought',
    workspaceId,
    phase: 'cia_global_plan',
    message: batch.summary,
    meta: {
      guaranteeReport,
      exhaustionReport,
      cycleProofId,
      accountProofId,
      opportunityRefresh,
      globalStrategy,
      actions: batch.actions.map((action) => ({
        type: action.type,
        contactId: action.contactId,
        phone: action.phone,
        priority: action.priority,
        governor: action.governor,
        cognition: summarizeDecisionCognition(action),
        conversationTactic: action.conversationTactic,
      })),
      ignoredCount: batch.ignoredCount,
    },
  });

  await forEachSequential(Array.from(batch.actions.entries()), async ([index, action]) => {
    await autopilotQueue.add(
      'cia-action',
      {
        workspaceId,
        ...action,
        globalStrategy,
        cycleGeneratedAt: state.generatedAt,
        cycleProofId,
        accountProofId,
        conversationTactic: action.conversationTactic,
        conversationTacticUniverse: action.conversationTacticUniverse,
      },
      {
        jobId: buildQueueJobId(
          'cia-action',
          workspaceId,
          action.type,
          action.contactId || action.phone || action.conversationId,
          Date.now(),
          index,
        ),
        removeOnComplete: true,
      },
    );
  });

  return {
    queued: batch.actions.length,
    ignoredCount: batch.ignoredCount,
    learning,
    guaranteeReport,
    exhaustionReport,
    cycleProofId,
    accountProofId,
    opportunityRefresh,
  };
}

async function runCiaAction(data: UnknownRecord) {
  const workspaceId = data?.workspaceId;
  if (!workspaceId) return { outcome: 'SKIPPED', reason: 'missing_workspace' };

  const lockKey = await acquireCiaContactLock(data?.contactId, data?.phone);
  if (!lockKey) {
    await publishAgentEvent({
      type: 'thought',
      workspaceId,
      phase: 'cia_lock_skip',
      message: `Pulei ${data?.contactName || data?.phone || 'um contato'} porque ele já está sendo processado.`,
      meta: {
        contactId: data?.contactId,
        phone: data?.phone,
      },
    });
    return { outcome: 'SKIPPED', reason: 'contact_locked' };
  }

  let outcome: 'SENT' | 'FAILED' | 'SKIPPED' = 'SKIPPED';
  let variant: Awaited<ReturnType<typeof pickVariant>> | null = null;
  let errorMessage: string | null = null;
  let renderedMessage: string | null = null;
  let conversationProofId: string | null = null;
  const workspace = await prisma.workspace.findUnique({
    where: { id: workspaceId },
    select: { providerSettings: true },
  });
  const settings = (workspace?.providerSettings ?? {}) as UnknownRecord;

  try {
    await publishAgentEvent({
      type: 'action',
      workspaceId,
      phase: 'cia_best_action_selected',
      message: `Escolhi ${String(data?.type || 'ACTION').toLowerCase()} para ${data?.contactName || data?.phone || 'contato'} como a melhor próxima ação disponível neste tick.`,
      meta: {
        contactId: data?.contactId,
        conversationId: data?.conversationId,
        phone: data?.phone,
        cluster: data?.cluster,
        priority: data?.priority,
        governor: data?.governor,
        cognition: data?.cognitiveState?.summary || null,
        cycleProofId: data?.cycleProofId || null,
        accountProofId: data?.accountProofId || null,
        selectedActionUtility: data?.selectedActionUtility || null,
        selectedActionRank: data?.selectedActionRank || null,
        betterActionCount: data?.betterActionCount || 0,
        betterExecutableActionCount: data?.betterExecutableActionCount || 0,
        nextBestActionType: data?.nextBestActionType || null,
        nextBestActionUtility: data?.nextBestActionUtility || null,
        selectedTactic: data?.conversationTactic || null,
        selectedTacticUtility: data?.selectedTacticUtility || null,
        selectedTacticRank: data?.selectedTacticRank || null,
        betterTacticCount: data?.betterTacticCount || 0,
        nextBestTactic: data?.nextBestTactic || null,
        nextBestTacticUtility: data?.nextBestTacticUtility || null,
      },
    });

    if (data?.type === 'WAIT') {
      await publishAgentEvent({
        type: 'status',
        workspaceId,
        phase: 'cia_wait',
        message: `Segurei a ação com ${data?.contactName || data?.phone || 'o contato'} até ter sinais melhores.`,
        meta: {
          contactId: data?.contactId,
          phone: data?.phone,
          cognition: data?.cognitiveState?.summary || null,
        },
      });
      outcome = 'SKIPPED';
    } else if (data?.type === 'ESCALATE_HUMAN') {
      const humanGate = await maybeEscalateToHumanControl({
        workspaceId,
        contactId: data?.contactId,
        contactName: data?.contactName,
        phone: data?.phone,
        decisionEnvelope: buildDecisionEnvelope({
          intent: data?.cognitiveState?.intent || 'GENERAL_ASSISTANCE',
          action: 'CIA_ESCALATE_HUMAN',
          confidence: data?.confidence || data?.cognitiveState?.classificationConfidence,
          messageContent: data?.lastMessageText || '',
          demandState:
            data?.demandState ||
            computeDemandState({
              lastMessageAt: new Date(),
              unreadCount: 0,
              leadScore: 0,
              lastMessageText: data?.lastMessageText || '',
            }),
          matchedProducts: [],
        }),
        messageContent: data?.lastMessageText || '',
        intent: data?.cognitiveState?.intent || 'GENERAL_ASSISTANCE',
        action: 'CIA_ESCALATE_HUMAN',
      });
      outcome = humanGate.blocked ? 'SKIPPED' : 'FAILED';
      if (!humanGate.blocked) {
        errorMessage = 'cia_escalation_failed';
      }
    } else if (data?.type === 'RESPOND') {
      await runScanContact({
        workspaceId,
        contactId: data?.contactId,
        phone: data?.phone,
        contactName: data?.contactName,
      });
      outcome = 'SENT';
    } else {
      const actionType = String(data?.type || '');
      const family =
        actionType === 'PAYMENT_RECOVERY'
          ? 'payment_recovery'
          : actionType === 'FOLLOWUP_SOFT' || actionType === 'FOLLOWUP_URGENT'
            ? 'followup'
            : null;

      let message = '';
      if (family) {
        variant = await pickVariant(prisma, workspaceId, family, data?.globalStrategy || null);
        message =
          actionType === 'FOLLOWUP_URGENT'
            ? `${variant.text} Se ainda fizer sentido, eu consigo priorizar isso agora.`
            : variant.text;
      } else {
        message = buildCognitiveMessage({
          action: actionType as CognitiveActionType,
          state: data?.cognitiveState || null,
          contactName: data?.contactName,
          matchedProducts: [],
          tactic: data?.conversationTactic || null,
        });
      }
      renderedMessage = message;

      const conversationProof = data?.conversationId
        ? await createConversationProofSnapshotDraft({
            workspaceId,
            conversationId: data?.conversationId,
            contactId: data?.contactId || null,
            phone: data?.phone || null,
            cycleProofId: data?.cycleProofId || null,
            accountProofId: data?.accountProofId || null,
            selectedActionType: actionType,
            selectedTactic: data?.conversationTactic || null,
            governor: data?.governor || null,
            renderedMessage: message,
            actionUniverse: data?.conversationActionUniverse || [],
            tacticUniverse: data?.conversationTacticUniverse || [],
            selectedAction: {
              type: actionType,
              governor: data?.governor || null,
              reason: data?.reason || null,
              priority: data?.priority || null,
              confidence:
                data?.confidence || data?.cognitiveState?.classificationConfidence || null,
              selectedActionUtility: data?.selectedActionUtility || null,
              selectedActionRank: data?.selectedActionRank || null,
              betterActionCount: data?.betterActionCount || 0,
              betterExecutableActionCount: data?.betterExecutableActionCount || 0,
              nextBestActionType: data?.nextBestActionType || null,
              nextBestActionUtility: data?.nextBestActionUtility || null,
              selectedTactic: data?.conversationTactic || null,
              selectedTacticUtility: data?.selectedTacticUtility || null,
              selectedTacticRank: data?.selectedTacticRank || null,
              betterTacticCount: data?.betterTacticCount || 0,
              nextBestTactic: data?.nextBestTactic || null,
              nextBestTacticUtility: data?.nextBestTacticUtility || null,
            },
          })
        : null;
      conversationProofId = conversationProof?.id || null;

      const result = await sendDirectAutopilotText({
        workspaceId,
        contactId: data?.contactId,
        conversationId: data?.conversationId,
        phone: data?.phone,
        contactName: data?.contactName,
        text: message,
        settings,
        intent: data?.cognitiveState?.intent || 'GENERAL_ASSISTANCE',
        reason: data?.reason || 'cia_nba_execution',
        workspaceRecord: { providerSettings: settings },
        intentConfidence: data?.confidence || data?.cognitiveState?.classificationConfidence,
        actionLabel: actionType,
        usedHistory: true,
        usedKb: false,
        deliveryMode: 'proactive',
        idempotencyContext: {
          source: 'cia_action',
          action: actionType,
          capabilityCode: actionType,
          conversationTactic: data?.conversationTactic || null,
          conversationProofId,
          cycleGeneratedAt: data?.cycleGeneratedAt || null,
          cycleProofId: data?.cycleProofId || null,
          accountProofId: data?.accountProofId || null,
        },
      });
      outcome = result === 'executed' ? 'SENT' : 'SKIPPED';

      if (variant && family) {
        await updateVariantOutcome(prisma, {
          workspaceId,
          family,
          variant,
          outcome,
        });
      }
    }
  } catch (err: unknown) {
    const errInstanceofError =
      err instanceof Error ? err : new Error(typeof err === 'string' ? err : 'unknown error');
    outcome = 'FAILED';
    errorMessage = errInstanceofError?.message || 'cia_action_failed';
  } finally {
    if (!conversationProofId && data?.conversationId) {
      const fallbackProof = await createConversationProofSnapshotDraft({
        workspaceId,
        conversationId: data?.conversationId,
        contactId: data?.contactId || null,
        phone: data?.phone || null,
        cycleProofId: data?.cycleProofId || null,
        accountProofId: data?.accountProofId || null,
        selectedActionType: String(data?.type || 'CIA_ACTION'),
        selectedTactic: data?.conversationTactic || null,
        governor: data?.governor || null,
        renderedMessage: renderedMessage,
        actionUniverse: data?.conversationActionUniverse || [],
        tacticUniverse: data?.conversationTacticUniverse || [],
        selectedAction: {
          type: data?.type || 'CIA_ACTION',
          governor: data?.governor || null,
          reason: data?.reason || null,
          priority: data?.priority || null,
          confidence: data?.confidence || data?.cognitiveState?.classificationConfidence || null,
          selectedActionUtility: data?.selectedActionUtility || null,
          selectedActionRank: data?.selectedActionRank || null,
          betterActionCount: data?.betterActionCount || 0,
          betterExecutableActionCount: data?.betterExecutableActionCount || 0,
          nextBestActionType: data?.nextBestActionType || null,
          nextBestActionUtility: data?.nextBestActionUtility || null,
          selectedTactic: data?.conversationTactic || null,
          selectedTacticUtility: data?.selectedTacticUtility || null,
          selectedTacticRank: data?.selectedTacticRank || null,
          betterTacticCount: data?.betterTacticCount || 0,
          nextBestTactic: data?.nextBestTactic || null,
          nextBestTacticUtility: data?.nextBestTacticUtility || null,
        },
      });
      conversationProofId = fallbackProof?.id || null;
    }

    await finalizeConversationProofSnapshot(conversationProofId, {
      status: outcome === 'SENT' ? 'EXECUTED' : outcome === 'FAILED' ? 'FAILED' : 'SKIPPED',
      outcome,
      renderedMessage,
      metadata: {
        cluster: data?.cluster || null,
        governor: data?.governor || null,
        cycleProofId: data?.cycleProofId || null,
        accountProofId: data?.accountProofId || null,
        error: errorMessage,
      },
    });

    const actionLabel = String(data?.type || 'acao')
      .toLowerCase()
      .replace(SEPARATOR_G_RE, ' ')
      .trim();

    await publishAgentEvent({
      type: 'proof',
      workspaceId,
      phase: 'cia_conversation_proof',
      persistent: outcome !== 'SENT',
      message:
        outcome === 'SENT'
          ? `Executei ${actionLabel} para ${data?.contactName || data?.phone || 'contato'} e sincronizei a execução com a conversa ao vivo.`
          : outcome === 'FAILED'
            ? `A execução de ${actionLabel} falhou para ${data?.contactName || data?.phone || 'contato'}.`
            : `A execução de ${actionLabel} foi pulada para ${data?.contactName || data?.phone || 'contato'}.`,
      meta: {
        contactId: data?.contactId,
        conversationId: data?.conversationId,
        phone: data?.phone,
        cycleProofId: data?.cycleProofId || null,
        accountProofId: data?.accountProofId || null,
        conversationProofId,
        capabilityCode: data?.type || 'CIA_ACTION',
        tacticCode: data?.conversationTactic || null,
        outcome,
        error: errorMessage,
        selectedActionUtility: data?.selectedActionUtility || null,
        selectedActionRank: data?.selectedActionRank || null,
        betterActionCount: data?.betterActionCount || 0,
        selectedTacticUtility: data?.selectedTacticUtility || null,
        selectedTacticRank: data?.selectedTacticRank || null,
        betterTacticCount: data?.betterTacticCount || 0,
      },
    });

    await recordDecisionLog(prisma, {
      workspaceId,
      contactId: data?.contactId,
      phone: data?.phone,
      variantKey: variant?.key || null,
      intent: data?.type || 'CIA_ACTION',
      message: renderedMessage || variant?.text || data?.lastMessageText || '',
      outcome,
      priority: data?.priority,
      metadata: {
        cluster: data?.cluster,
        reason: data?.reason,
        governor: data?.governor,
        cognition: data?.cognitiveState?.summary || null,
        conversationTactic: data?.conversationTactic || null,
        conversationProofId,
        error: errorMessage,
        cycleProofId: data?.cycleProofId || null,
        accountProofId: data?.accountProofId || null,
      },
    });

    await recordDecisionOutcome(prisma, {
      workspaceId,
      contactId: data?.contactId,
      conversationId: data?.conversationId,
      phone: data?.phone,
      action: data?.type || 'CIA_ACTION',
      outcome,
      reward: computeCognitiveRewardSignal(
        (data?.type || 'WAIT') as CognitiveActionType,
        data?.cognitiveState || null,
      ),
      message:
        renderedMessage ||
        variant?.text ||
        data?.lastMessageText ||
        data?.cognitiveState?.summary ||
        '',
      metadata: {
        cluster: data?.cluster,
        reason: data?.reason,
        governor: data?.governor,
        conversationTactic: data?.conversationTactic || null,
        conversationProofId,
        cycleProofId: data?.cycleProofId || null,
        accountProofId: data?.accountProofId || null,
      },
    });

    await releaseCiaContactLock(lockKey);
  }

  if (outcome === 'FAILED') {
    throw new Error(errorMessage || 'cia_action_failed');
  }

  return { outcome };
}

async function runCiaSelfImproveAll() {
  const workspaces = await prisma.workspace.findMany({
    select: { id: true, providerSettings: true },
    take: 500,
  });

  await forEachSequential(workspaces, async (workspace) => {
    const settings = (workspace.providerSettings ?? {}) as UnknownRecord;
    if (!isAutonomousEnabled(settings)) return;
    await runCiaSelfImproveWorkspace(workspace.id);
  });
}

async function runCiaSelfImproveWorkspace(workspaceId: string) {
  const learning = await computeLearningSnapshot(prisma, workspaceId);
  if (!learning.totalLogs) {
    return learning;
  }

  await persistSystemInsight(prisma, {
    workspaceId,
    type: 'CIA_SELF_IMPROVEMENT',
    title: 'Aprendizado comercial atualizado',
    description: learning.topVariantKey
      ? `A variante ${learning.topVariantKey} lidera com score ${learning.topVariantScore}.`
      : 'Ainda não há variante vencedora consolidada.',
    severity: learning.failedCount > learning.sentCount ? 'WARNING' : 'INFO',
    metadata: { ...learning },
  });

  return learning;
}

async function runCiaGlobalLearningAll() {
  const workspaces = await prisma.workspace.findMany({
    select: { id: true, providerSettings: true },
    take: 500,
  });

  const enabledWorkspaces = workspaces.filter((workspace: UnknownRecord) =>
    isAutonomousEnabled(workspace.providerSettings || {}),
  );
  const signals: NonNullable<ReturnType<typeof anonymizeDecisionLog>>[] = [];

  await forEachSequential(enabledWorkspaces, async (workspace) => {
    const domain = inferWorkspaceDomain(
      (workspace.providerSettings || {}) as Record<string, unknown>,
    );
    const logs = await prisma.kloelMemory
      .findMany({
        where: {
          workspaceId: workspace.id,
          category: 'decision_log',
        },
        orderBy: { createdAt: 'desc' },
        take: 200,
      })
      .catch(() => []);

    for (const log of logs) {
      const signal = anonymizeDecisionLog({
        domain,
        log,
      });
      if (signal) signals.push(signal);
    }
  });

  const patterns = computeGlobalPatterns(signals);
  await persistGlobalPatterns(redis, patterns);

  await forEachSequential(enabledWorkspaces, async (workspace) => {
    const domain = inferWorkspaceDomain(
      (workspace.providerSettings || {}) as Record<string, unknown>,
    );
    const topPattern = patterns.find((pattern) => pattern.domain === domain);
    if (!topPattern) return;

    const strategy = buildGlobalStrategy({
      patterns,
      domain,
      intent: topPattern.intent,
    });

    await persistSystemInsight(prisma, {
      workspaceId: workspace.id,
      type: 'CIA_GLOBAL_LEARNING',
      title: `Aprendizado coletivo ativo para ${domain}`,
      description: `Estou aplicando o padrão ${topPattern.intent} com ${topPattern.samples} sinais e agressividade ${strategy.aggressiveness.toLowerCase()}.`,
      severity: topPattern.samples >= 20 ? 'INFO' : 'WARNING',
      metadata: {
        domain,
        topPattern,
        strategy,
        signalsAnalyzed: signals.length,
        patternsAvailable: patterns.length,
      },
    });
  });

  return {
    workspacesAnalyzed: enabledWorkspaces.length,
    signalsAnalyzed: signals.length,
    patternsAvailable: patterns.length,
  };
}

async function runCycleAll() {
  const workspaces = await prisma.workspace.findMany({
    select: { id: true, providerSettings: true },
    take: 500,
  });
  await forEachSequential(workspaces, async (ws) => {
    const settings = (ws.providerSettings ?? {}) as UnknownRecord;
    if (settings?.billingSuspended === true) {
      log.info('autopilot_cycle_skip_billing', { workspaceId: ws.id });
      await notifyBillingSuspended(ws.id);
      return;
    }
    if (isCiaAutonomyMode(settings)) {
      log.info('autopilot_cycle_skip_cia_primary', { workspaceId: ws.id });
      return;
    }
    if (!isAutonomousEnabled(settings)) return;
    if (!isExplicitProactiveOutreachAllowed(settings)) {
      log.info('autopilot_cycle_skip_proactive_disabled', {
        workspaceId: ws.id,
      });
      return;
    }
    await runCycleWorkspace(ws.id, settings);
  });
}

async function runCycleWorkspace(workspaceId: string, presetSettings?: UnknownRecord) {
  const settings = presetSettings
    ? presetSettings
    : ((
        await prisma.workspace.findUnique({
          where: { id: workspaceId },
          select: { providerSettings: true },
        })
      )?.providerSettings as UnknownRecord);
  if (settings?.billingSuspended === true) {
    log.info('autopilot_cycle_skip_billing', { workspaceId });
    await notifyBillingSuspended(workspaceId);
    return { queued: 0, reason: 'billing_suspended' };
  }
  if (!isAutonomousEnabled(settings)) {
    return { queued: 0, reason: 'autopilot_disabled' };
  }
  const now = new Date();
  const nowHour = getWorkspaceLocalHour(settings, now);
  const withinWindow = isWithinWorkspaceWindow({
    settings,
    startHour: WINDOW_START,
    endHour: WINDOW_END,
    now,
  });
  if (!withinWindow) {
    log.info('autopilot_cycle_skipped_window', { workspaceId, nowHour, WINDOW_START, WINDOW_END });
    return { queued: 0, reason: 'outside_window', localHour: nowHour };
  }

  const openBacklog = prisma.conversation.count
    ? await prisma.conversation
        .count({
          where: {
            workspaceId,
            status: { not: 'CLOSED' },
            unreadCount: { gt: 0 },
          },
        })
        .catch(() => 0)
    : 0;

  const cutoff = new Date(Date.now() - SILENCE_HOURS * 3600000);
  const convs = await prisma.conversation.findMany({
    where: {
      workspaceId,
      status: 'OPEN',
      lastMessageAt: { lt: cutoff },
      unreadCount: 0,
    },
    include: {
      contact: {
        select: {
          id: true,
          phone: true,
          name: true,
          leadScore: true,
          customFields: true,
          email: true,
        },
      },
      messages: { orderBy: { createdAt: 'desc' }, take: 5 },
    },
  });

  const limited = convs.slice(0, Math.max(1, CYCLE_LIMIT));
  const enriched = limited
    .map((conv) => {
      const lastInbound = conv.messages.find((m: UnknownRecord) => m.direction === 'INBOUND');
      const lastMessage = conv.messages[0];
      const demandState = computeDemandState({
        lastMessageAt: conv.lastMessageAt,
        unreadCount: conv.unreadCount,
        leadScore: (conv.contact as UnknownRecord | undefined)?.leadScore || 0,
        lastMessageText: lastInbound?.content || lastMessage?.content || '',
      });

      return {
        conv,
        lastInbound,
        lastMessage,
        demandState,
      };
    })
    .sort((a, b) => b.demandState.attentionScore - a.demandState.attentionScore);

  const marketSignals = extractMarketSignals(
    enriched.flatMap(({ conv }) => conv.messages.map((message) => message.content)),
  );
  const hotLeadCount = enriched.filter((item) => item.demandState.lane === 'HOT').length;
  const pendingPaymentCount = enriched.filter(({ lastInbound, lastMessage }) => {
    const text = String(lastInbound?.content || lastMessage?.content || '').toLowerCase();
    return ['pix', 'boleto', 'cartao', 'cartão', 'pagamento', 'pagar', 'vencimento', 'cobran'].some(
      (keyword) => text.includes(keyword),
    );
  }).length;
  const recentExecuted = await prisma.autopilotEvent
    .findMany({
      where: {
        workspaceId,
        status: 'executed',
        createdAt: {
          gte: new Date(Date.now() - 24 * 60 * 60 * 1000),
        },
      },
      take: 50,
      orderBy: { createdAt: 'desc' },
    })
    .catch(() => []);

  const approvedSalesCount = recentExecuted.filter(
    (event: UnknownRecord) => event?.meta?.saleApproved === true,
  ).length;
  const approvedSalesAmount = recentExecuted
    .map((event: UnknownRecord) => Number(event?.meta?.amount || 0) || 0)
    .reduce((sum, amount) => sum + amount, 0);

  const snapshot = buildBusinessStateSnapshot({
    openBacklog,
    hotLeadCount,
    pendingPaymentCount,
    approvedSalesCount,
    approvedSalesAmount,
    avgResponseMinutes: 0,
    marketSignals,
  });

  await persistBusinessSnapshot(prisma, {
    workspaceId,
    snapshot,
  });
  await persistMarketSignals(prisma, {
    workspaceId,
    signals: marketSignals,
  });

  const missionPlan = buildMissionPlan({
    demandStates: enriched.map(({ conv, demandState }) => ({
      contactName: conv.contact?.name || conv.contact?.phone || null,
      demandState,
    })),
    marketSignals,
    snapshot,
  });

  await publishAgentEvent({
    type: 'thought',
    workspaceId,
    phase: 'mission_plan',
    message: missionPlan.summary,
    meta: {
      focusContacts: missionPlan.focusContacts,
      priorities: missionPlan.priorities,
      openBacklog,
      hotLeadCount,
      pendingPaymentCount,
    },
  });

  if (marketSignals[0]?.frequency >= 3) {
    await persistSystemInsight(prisma, {
      workspaceId,
      type: 'CIA_MARKET_SIGNAL',
      title: `Sinal dominante: ${marketSignals[0].normalizedKey}`,
      description: `Detectei ${marketSignals[0].frequency} ocorrências recentes de ${marketSignals[0].signalType.toLowerCase()}.`,
      severity: marketSignals[0].frequency >= 5 ? 'WARNING' : 'INFO',
      metadata: {
        signalType: marketSignals[0].signalType,
        normalizedKey: marketSignals[0].normalizedKey,
        frequency: marketSignals[0].frequency,
        examples: marketSignals[0].examples,
      },
    });
  }

  if (!isExplicitProactiveOutreachAllowed(settings)) {
    log.info('autopilot_cycle_skip_proactive_disabled', {
      workspaceId,
      message: 'BI persisted but skipping proactive outreach',
    });
    return { queued: 0, reason: 'proactive_outreach_disabled', snapshot };
  }

  let executed = 0;
  await forEachSequential(enriched, async ({ conv, lastInbound, lastMessage, demandState }) => {
    if (conv.contact?.id) {
      await persistDemandState(prisma, {
        workspaceId,
        contactId: conv.contact.id,
        state: demandState,
        contactName: conv.contact.name || conv.contact.phone,
      });
    }

    if (demandState.strategy === 'DROP' || demandState.strategy === 'WAIT') {
      await logAutopilotAction({
        workspaceId,
        contactId: conv.contact?.id,
        phone: conv.contact?.phone,
        action: 'CYCLE_SKIP',
        intent: 'REENGAGE',
        status: 'skipped',
        reason: demandState.strategy === 'DROP' ? 'attention_budget_drop' : 'attention_budget_wait',
        meta: { demandState },
      });
      return;
    }

    const text = (lastInbound?.content || lastMessage?.content || '').toLowerCase();
    const buying = [
      'preco',
      'preço',
      'quanto',
      'valor',
      'pix',
      'boleto',
      'custa',
      'pag',
      'assin',
    ].some((k) => text.includes(k));
    const lastDate = lastMessage?.createdAt ? new Date(lastMessage.createdAt) : null;
    const ageHours = lastDate ? (Date.now() - lastDate.getTime()) / 3600000 : null;
    const action =
      demandState.strategy === 'RECOVER_PAYMENT'
        ? 'FOLLOW_UP_STRONG'
        : ageHours && ageHours > 72
          ? 'ANTI_CHURN'
          : buying || demandState.strategy === 'PUSH'
            ? 'GHOST_CLOSER'
            : 'LEAD_UNLOCKER';

    const decisionEnvelope = buildDecisionEnvelope({
      intent: buying ? 'FOLLOW_UP_BUYING' : 'REENGAGE',
      action,
      confidence: demandState.lane === 'HOT' ? 0.88 : demandState.lane === 'WARM' ? 0.76 : 0.62,
      messageContent: text,
      demandState,
    });

    const humanGate = await maybeEscalateToHumanControl({
      workspaceId,
      contactId: conv.contact?.id,
      contactName: conv.contact?.name || conv.contact?.phone,
      phone: conv.contact?.phone,
      decisionEnvelope,
      messageContent: text,
      intent: buying ? 'FOLLOW_UP_BUYING' : 'REENGAGE',
      action,
    });
    if (humanGate.blocked) {
      return;
    }

    await executeAction(action, {
      workspaceId,
      contactId: conv.contact?.id,
      conversationId: conv.id,
      phone: conv.contact?.phone,
      messageContent: lastInbound?.content || conv.messages[0]?.content || '',
      settings,
      intent: buying ? 'FOLLOW_UP_BUYING' : 'REENGAGE',
      reason: 'cycle_silence',
      intentConfidence: decisionEnvelope.confidence,
      usedHistory: true,
      usedKb: false,
      idempotencyContext: {
        source: 'cycle_silence',
        lastInboundId: lastInbound?.id || null,
        lastInboundAt: lastInbound?.createdAt?.toISOString?.() || null,
        conversationId: conv.id,
      },
    });
    executed += 1;
  });
  log.info('autopilot_cycle_completed', { workspaceId, processed: limited.length });
  return {
    queued: executed,
    reason: executed > 0 ? 'executed' : 'no_eligible_conversations',
    processed: limited.length,
  };
}

/**
 * Envia resposta em audio via OpenAI TTS + WhatsApp
 * Gera o audio em tempo real e envia como voice note
 */
async function sendAudioResponse(
  workspaceId: string,
  phone: string,
  chatId: string | undefined,
  text: string,
  settings: UnknownRecord,
  workspaceCfg: UnknownRecord,
  quotedMessageId?: string,
): Promise<boolean> {
  try {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      log.warn('openai_tts_not_configured', { workspaceId });
      return false;
    }

    // Buscar voice profile do workspace (ou usar default)
    let voiceId =
      settings?.voice?.voiceId ||
      settings?.autopilot?.voiceId ||
      process.env.OPENAI_TTS_VOICE ||
      'nova';

    const voiceProfile = await prisma.voiceProfile.findFirst({
      where: { workspaceId },
      orderBy: { updatedAt: 'desc' },
      select: { voiceId: true },
    });
    if (voiceProfile?.voiceId) {
      voiceId = voiceProfile.voiceId;
    }

    const ttsSpeed = Number.parseFloat(process.env.OPENAI_TTS_SPEED || '1.0');

    // Gerar audio via OpenAI TTS
    const openai = new OpenAI({ apiKey });
    const response = await openai.audio.speech.create({
      model: 'tts-1',
      voice: voiceId as string,
      input: text,
      speed: ttsSpeed,
      response_format: 'opus',
    });

    // Converter para buffer base64 para upload
    const arrayBuffer = await response.arrayBuffer();
    const audioBuffer = Buffer.from(arrayBuffer);
    const base64Audio = audioBuffer.toString('base64');

    // Upload para armazenamento (local ou CDN)
    const fs = await import('node:fs');
    const path = await import('node:path');
    const crypto = await import('node:crypto');

    // Diretório de uploads do backend (servido por rota assinada/autenticada)
    const uploadsDir = path.resolve(process.cwd(), '..', 'backend', 'uploads', 'audio');
    if (!fs.existsSync(uploadsDir)) {
      fs.mkdirSync(uploadsDir, { recursive: true });
    }

    // Use randomUUID to prevent path traversal via workspaceId
    const fileName = `audio_${crypto.randomUUID()}_${Date.now()}.mp3`;
    const filePath = path.resolve(uploadsDir, path.normalize(fileName));
    // Path traversal guard
    if (!filePath.startsWith(`${uploadsDir}${path.sep}`) && filePath !== uploadsDir) {
      throw new Error('Path traversal detected in audio file path');
    }
    fs.writeFileSync(filePath, audioBuffer);

    // Montar URL pública
    const cdnBase = process.env.CDN_BASE_URL || process.env.MEDIA_BASE_URL;

    // Prioridade: CDN > APP_URL > data URL fallback
    let audioUrl: string;
    if (cdnBase) {
      audioUrl = `${cdnBase}/audio/${fileName}`;
    } else if (process.env.APP_URL || process.env.BACKEND_URL || process.env.API_URL) {
      audioUrl = buildSignedLocalStorageUrl(`audio/${fileName}`, {
        expiresInSeconds: 15 * 60,
        downloadName: fileName,
      });
    } else {
      // Fallback para data URL (funciona mas não é ideal para arquivos grandes)
      audioUrl = `data:audio/mpeg;base64,${base64Audio}`;
    }

    // Enviar como áudio/voice note via WhatsAppEngine.sendMedia
    await WhatsAppEngine.sendMedia(
      workspaceCfg as { id: string; [key: string]: unknown },
      phone,
      'audio',
      audioUrl,
      undefined,
      {
        quotedMessageId,
        chatId,
      },
    );

    // Limpar arquivo após envio (opcional - manter para retry em caso de falha)
    // Para limpeza automática, implementar job de garbage collection
    setTimeout(() => {
      try {
        if (fs.existsSync(filePath)) {
          fs.unlinkSync(filePath);
        }
      } catch {
        void 0;
      }
    }, 60000); // Limpar após 1 minuto

    log.info('audio_response_sent', {
      workspaceId,
      phone,
      textLength: text.length,
      audioUrl: audioUrl.substring(0, 80),
    });
    return true;
  } catch (error: unknown) {
    const errorInstanceofError =
      error instanceof Error
        ? error
        : new Error(typeof error === 'string' ? error : 'unknown error');
    log.error('send_audio_error', { error: errorInstanceofError.message, workspaceId, phone });
    return false;
  }
}
