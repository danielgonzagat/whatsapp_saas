import { Worker, Job } from "bullmq";
import { createHash } from "crypto";
import { connection, flowQueue, autopilotQueue, voiceQueue } from "../queue";
import { WorkerLogger } from "../logger";
import { prisma } from "../db";
import { AIProvider } from "../providers/ai-provider";
import { resolveVoiceProvider } from "../providers/openai-models";
import { dispatchOutboundThroughFlow } from "../providers/outbound-dispatcher";
import { WhatsAppEngine } from "../providers/whatsapp-engine";
import {
  autopilotDecisionCounter,
  autopilotGhostCloserCounter,
  autopilotPipelineCounter,
} from "../metrics";
import { PlanLimitsProvider } from "../providers/plan-limits";
import { channelEnabled, logFallback, sendEmail, sendTelegram } from "../providers/channel-dispatcher";
import { redis, redisPub } from "../redis-client";
import OpenAI from "openai";
import {
  processWithUnifiedAgent,
  shouldUseUnifiedAgent,
  mapUnifiedActionsToAutopilot,
  extractTextResponse,
} from "../providers/unified-agent-integrator";
import {
  createBacklogRunState,
  finishBacklogRunTask,
  publishAgentEvent,
} from "../providers/agent-events";
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
} from "../providers/commercial-intelligence";
import {
  buildCiaWorkspaceState,
  buildCiaWorkspaceStateFromSeed,
} from "./cia/build-state";
import { planCiaActions, summarizeDecisionCognition } from "./cia/brain";
import {
  assertCiaExhaustion,
  assertCiaGuarantees,
  buildCiaExhaustionReport,
  buildCiaGuaranteeReport,
} from "./cia/contracts";
import { assertConversationTacticPlan } from "./cia/conversation-tactics";
import {
  buildSeedCognitiveState,
  loadCustomerCognitiveState,
  persistCustomerCognitiveState,
  recordDecisionOutcome,
  type CognitiveActionType,
  type CustomerCognitiveState,
} from "./cia/cognitive-state";
import {
  computeLearningSnapshot,
  pickVariant,
  recordDecisionLog,
  updateVariantOutcome,
} from "./cia/self-improvement";
import {
  anonymizeDecisionLog,
  buildGlobalStrategy,
  computeGlobalPatterns,
  type GlobalLearningPattern,
  inferWorkspaceDomain,
  persistGlobalPatterns,
} from "./cia/global-learning";
import {
  getDelayUntilWorkspaceWindowOpens,
  getWorkspaceLocalHour,
  isWithinWorkspaceWindow,
} from "../providers/timezone";
import {
  deriveOperationalUnreadCount,
  isConversationPendingForAgent,
  resolveConversationOwner,
} from "../conversation-agent-state";
import { buildQueueJobId } from "../job-id";

const log = new WorkerLogger("autopilot");
const WORKER_ROLE = (process.env.WORKER_ROLE || "all").toLowerCase();
const SHOULD_RUN_AUTOPILOT_WORKER = WORKER_ROLE !== "scheduler";
const OPS_WEBHOOK =
  process.env.AUTOPILOT_ALERT_WEBHOOK ||
  process.env.OPS_WEBHOOK_URL ||
  process.env.DLQ_WEBHOOK_URL;

const CONTACT_DAILY_LIMIT = Math.max(
  1,
  parseInt(process.env.AUTOPILOT_CONTACT_DAILY_LIMIT || "5", 10) || 5
);
const WORKSPACE_DAILY_LIMIT = Math.max(
  1,
  parseInt(process.env.AUTOPILOT_WORKSPACE_DAILY_LIMIT || "1000", 10) || 1000
);
const SILENCE_HOURS =
  parseInt(process.env.AUTOPILOT_SILENCE_HOURS || "24", 10) || 24;
const WINDOW_START =
  parseInt(process.env.AUTOPILOT_WINDOW_START || "8", 10) || 8;
const WINDOW_END = parseInt(process.env.AUTOPILOT_WINDOW_END || "22", 10) || 22;
const CYCLE_LIMIT =
  parseInt(process.env.AUTOPILOT_CYCLE_LIMIT || "200", 10) || 200;
const PENDING_MESSAGE_LIMIT = Math.max(
  1,
  parseInt(process.env.AUTOPILOT_PENDING_MESSAGE_LIMIT || "12", 10) || 12
);
const SHARED_REPLY_LOCK_MS = Math.max(
  10_000,
  parseInt(process.env.AUTOPILOT_SHARED_REPLY_LOCK_MS || "45000", 10) ||
    45_000
);
const CIA_MAIN_LOOP_LIMIT = Math.max(
  1,
  parseInt(process.env.CIA_MAIN_LOOP_LIMIT || String(CYCLE_LIMIT), 10) ||
    CYCLE_LIMIT,
);
const CIA_MAX_ACTIONS_PER_CYCLE = Math.max(
  1,
  Math.min(
    10,
    parseInt(process.env.CIA_MAX_ACTIONS_PER_CYCLE || "5", 10) || 5,
  ),
);
const CIA_CONTACT_LOCK_TTL_SECONDS = Math.max(
  5,
  parseInt(process.env.CIA_CONTACT_LOCK_TTL_SECONDS || "20", 10) || 20,
);
const CIA_OPPORTUNITY_LOOKBACK_DAYS = Math.max(
  7,
  parseInt(process.env.CIA_OPPORTUNITY_LOOKBACK_DAYS || "30", 10) || 30,
);
const CIA_OPPORTUNITY_REFRESH_LIMIT = Math.max(
  50,
  Math.min(
    2000,
    parseInt(process.env.CIA_OPPORTUNITY_REFRESH_LIMIT || "1000", 10) || 1000,
  ),
);
const CIA_OPPORTUNITY_REFRESH_TTL_SECONDS = Math.max(
  120,
  parseInt(process.env.CIA_OPPORTUNITY_REFRESH_TTL_SECONDS || "900", 10) ||
    900,
);

async function notifyBillingSuspended(workspaceId?: string) {
  if (!OPS_WEBHOOK || !(global as any).fetch) return;
  try {
    await (global as any).fetch(OPS_WEBHOOK, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        type: "billing_suspended_autopilot_skip",
        workspaceId,
        at: new Date().toISOString(),
        env: process.env.NODE_ENV || "dev",
      }),
    });
  } catch (err: any) {
    log.warn("billing_suspend_notify_failed", { error: err?.message });
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
  quotedMessageId: string;
  createdAt?: string;
};

async function reportSmokeTest(
  smokeTestId: string | undefined,
  payload: Record<string, any>,
) {
  if (!smokeTestId) return;
  await redis.set(
    `autopilot:smoke:${smokeTestId}`,
    JSON.stringify({
      smokeTestId,
      updatedAt: new Date().toISOString(),
      ...payload,
    }),
    "EX",
    300,
  );
}

function countReplyWords(value?: string | null): number {
  const words = String(value || "")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  return Math.max(1, words.length);
}

function isRecentLiveConversation(
  customerMessages: QuotedCustomerMessage[],
): boolean {
  if (!Array.isArray(customerMessages) || customerMessages.length === 0) {
    return false;
  }

  const latestTimestamp = customerMessages
    .map((message) => {
      const value = message?.createdAt ? new Date(message.createdAt).getTime() : NaN;
      return Number.isFinite(value) ? value : null;
    })
    .filter((value): value is number => typeof value === "number")
    .sort((left, right) => right - left)[0];

  if (!latestTimestamp) {
    return false;
  }

  return Date.now() - latestTimestamp <= 24 * 60 * 60 * 1000;
}

function computeReplyStyleBudget(message: string, historyTurns = 0): {
  words: number;
  maxSentences: number;
  maxWords: number;
} {
  const words = countReplyWords(message);
  let maxSentences = words <= 8 ? 2 : words <= 20 ? 3 : 4;
  let maxWords = Math.min(
    140,
    words <= 4
      ? 26
      : words <= 12
        ? Math.max(24, words + 12)
        : Math.ceil(words * 1.8),
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
  const normalized = String(reply || "")
    .replace(/\s+/g, " ")
    .replace(/\s*[-*•]\s+/g, " ")
    .trim();

  if (!normalized) {
    return undefined;
  }

  const budget = computeReplyStyleBudget(customerMessage, historyTurns);
  const allowEmoji = /\p{Extended_Pictographic}/u.test(customerMessage || "");
  const withoutEmoji = allowEmoji
    ? normalized
    : normalized.replace(/\p{Extended_Pictographic}/gu, "").trim();
  const sentenceMatches =
    withoutEmoji
      .match(/[^.!?]+[.!?]?/g)
      ?.map((part) => part.trim())
      .filter(Boolean) || [];
  const effectiveSentenceBudget =
    sentenceMatches.length > budget.maxSentences &&
    sentenceMatches.length > 1 &&
    countReplyWords(sentenceMatches[0]) <= 2
      ? Math.min(budget.maxSentences + 1, sentenceMatches.length)
      : budget.maxSentences;
  const limitedSentences = (
    sentenceMatches.length > 0 ? sentenceMatches : [withoutEmoji]
  ).slice(0, effectiveSentenceBudget);
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

  return selectedSentences.join(" ").trim() || withoutEmoji;
}

function buildMirroredReplyPlanFallback(
  customerMessages: QuotedCustomerMessage[],
  draftReply: string,
): Array<{ quotedMessageId: string; text: string }> {
  const normalizedDraft =
    finalizeReplyStyle(
      customerMessages[customerMessages.length - 1]?.content || "",
      draftReply,
      customerMessages.length,
    ) || draftReply;
  const sentences =
    normalizedDraft
      .match(/[^.!?]+[.!?]?/g)
      ?.map((item) => item.trim())
      .filter(Boolean) || [normalizedDraft];

  if (customerMessages.length === 1) {
    return [
      {
        quotedMessageId: customerMessages[0].quotedMessageId,
        text:
          finalizeReplyStyle(customerMessages[0].content, normalizedDraft, 0) ||
          normalizedDraft,
      },
    ];
  }

  return customerMessages.map((message, index) => {
    const sentence =
      sentences[index] ||
      (index === customerMessages.length - 1
        ? normalizedDraft
        : `Entendi. ${normalizedDraft}`);

    return {
      quotedMessageId: message.quotedMessageId,
      text: finalizeReplyStyle(message.content, sentence, 0) || sentence,
    };
  });
}

async function buildQuotedReplyPlan(params: {
  draftReply: string;
  customerMessages?: QuotedCustomerMessage[];
  settings?: any;
}): Promise<Array<{ quotedMessageId: string; text: string }>> {
  const normalizedMessages = (params.customerMessages || [])
    .map((message) => ({
      content: String(message.content || "").trim(),
      quotedMessageId: String(message.quotedMessageId || "").trim(),
    }))
    .filter((message) => message.content && message.quotedMessageId);

  if (!normalizedMessages.length) {
    return [];
  }

  const fallback = () =>
    buildMirroredReplyPlanFallback(normalizedMessages, params.draftReply);

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
          role: "system",
          content:
            'Você organiza respostas curtas para WhatsApp. Retorne JSON puro com o formato {"replies":[{"index":1,"text":"..."},...]}. Deve haver exatamente uma resposta por mensagem do cliente, na mesma ordem. Cada resposta deve ser curta, humana e diretamente responsiva.',
        },
        {
          role: "user",
          content: `Rascunho geral da resposta:\n${params.draftReply}\n\nMensagens do cliente:\n${normalizedMessages
            .map((message, index) => `[${index + 1}] ${message.content}`)
            .join("\n")}`,
        },
      ],
      "writer",
    );
    const raw = String(response?.content || "")
      .replace(/```json/gi, "")
      .replace(/```/g, "")
      .trim();
    const parsed = JSON.parse(raw);
    const replies = Array.isArray(parsed?.replies) ? parsed.replies : [];

    if (replies.length !== normalizedMessages.length) {
      return fallback();
    }

    return normalizedMessages.map((message, index) => ({
      quotedMessageId: message.quotedMessageId,
      text:
        finalizeReplyStyle(
          message.content,
          replies[index]?.text || params.draftReply,
          0,
        ) || params.draftReply,
    }));
  } catch {
    return fallback();
  }
}

export const autopilotWorker = SHOULD_RUN_AUTOPILOT_WORKER
  ? new Worker(
      "autopilot-jobs",
      async (job: Job) => {
        try {
          if (job.name === "cycle-all") {
            return await runCycleAll();
          }

          if (job.name === "cia-cycle-all") {
            return await runCiaCycleAll();
          }

          if (job.name === "cycle-workspace") {
            const workspaceId = job.data?.workspaceId;
            if (workspaceId) {
              return await runCycleWorkspace(workspaceId);
            }
            return;
          }

          if (job.name === "cia-cycle-workspace") {
            const workspaceId = job.data?.workspaceId;
            if (workspaceId) {
              return await runCiaCycleWorkspace(workspaceId);
            }
            return;
          }

          if (job.name === "followup-contact") {
            return await runFollowupContact(job.data);
          }

          if (job.name === "scan-contact") {
            return await runScanContact(job.data);
          }

          if (job.name === "sweep-unread-conversations") {
            return await runSweepUnreadConversations(job.data);
          }

          if (job.name === "cia-action") {
            return await runCiaAction(job.data);
          }

          if (job.name === "cia-self-improve") {
            const workspaceId = job.data?.workspaceId;
            if (workspaceId) {
              return await runCiaSelfImproveWorkspace(workspaceId);
            }
            return await runCiaSelfImproveAll();
          }

          if (job.name === "cia-global-learn") {
            return await runCiaGlobalLearningAll();
          }

          // Compatibilidade legada: scan-message vira processamento consolidado por contato
          return await runScanContact(job.data);
        } catch (err: any) {
          log.error("autopilot_error", { error: err.message });
          autopilotDecisionCounter.inc({
            workspaceId: job.data?.workspaceId || "unknown",
            intent: "ERROR",
            action: "NONE",
            result: "error",
          });
        }
      },
      { connection, concurrency: 1 }
    )
  : null;

  async function decideActionSafe(params: {
  workspaceId?: string;
  contactId?: string;
  phone?: string;
  messageContent: string;
  settings: any;
}): Promise<AutopilotDecision> {
  const { workspaceId, contactId, phone, messageContent, settings } = params;
  const text = (messageContent || "").toLowerCase();

  // Rule-based defaults (no AI required)
  const hasKeyword = (...keys: string[]) => keys.some(k => text.includes(k));

  if (hasKeyword("preco", "preço", "price", "valor")) {
    // Dispara GhostCloser direto em sinais de preço para maximizar conversão imediata
    return { intent: "BUYING", action: "GHOST_CLOSER", reason: "price inquiry", confidence: 0.72 };
  }
  if (hasKeyword("agendar", "agenda", "calend", "marcar", "schedule")) {
    return { intent: "SCHEDULING", action: "SEND_CALENDAR", reason: "scheduling intent", confidence: 0.68 };
  }
  if (hasKeyword("reclama", "problema", "erro", "suporte", "ajuda")) {
    return { intent: "COMPLAINT", action: "TRANSFER_AGENT", reason: "complaint/support", confidence: 0.7 };
  }
  if (hasKeyword("cancelar", "desistir", "parei", "não quero", "nao quero")) {
    return { intent: "CHURN_RISK", action: "ANTI_CHURN", reason: "churn_language", confidence: 0.7 };
  }
  if (hasKeyword("oi", "ola", "olá", "bom dia", "boa tarde", "boa noite")) {
    return { intent: "GREET", action: "QUALIFY", reason: "greeting", confidence: 0.55 };
  }
  if (hasKeyword("teste", "sim", "ok", "certo")) {
    return { intent: "FOLLOW_UP", action: "FOLLOW_UP", reason: "generic_follow", confidence: 0.5 };
  }

  // If OpenAI key is configured, attempt AI classification (optional)
  const apiKey = settings?.openai?.apiKey || process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return { intent: "IDLE", action: "NONE", reason: "no_ai_key", confidence: 0.3 };
  }

  try {
    const ai = new AIProvider(apiKey);
    const history = await fetchConversationHistory(workspaceId, contactId, phone, 8);
    const compressedContext = await fetchCompressedContactContext(
      workspaceId,
      contactId,
      phone,
    );
    const kbContext = await getKbContext(workspaceId, messageContent, apiKey);
    const historyText = history
      .map((m) => `${m.direction === "INBOUND" ? "User" : "Agent"}: ${m.content}`)
      .join("\n");

    const systemPrompt = `Você é o Autopilot de vendas. Classifique intenção e ação para WhatsApp.
Retorne JSON com: intent (BUYING|SCHEDULING|SUPPORT|OBJECTION|CHURN_RISK|UPSELL|FOLLOW_UP|IDLE), action (SEND_OFFER|SEND_PRICE|SEND_CALENDAR|HANDLE_OBJECTION|TRANSFER_AGENT|FOLLOW_UP|FOLLOW_UP_STRONG|ANTI_CHURN|QUALIFY|NONE), confidence (0-1), reason.`;

    const userMessage = `Mensagem atual: "${messageContent}"
Histórico recente (mais novo por último):
${historyText || "sem histórico"}

Resumo persistente do contato:
${compressedContext || "n/d"}

Contexto da base de conhecimento:
${kbContext || "n/d"}

Responda somente o JSON.`;

    const response = await ai.generateResponse(systemPrompt, userMessage, "brain");
    const parsed = JSON.parse(response.replace(/```json/g, "").replace(/```/g, ""));
    const normalizedAction = normalizeAction(parsed.action);
    return {
      intent: parsed.intent || "IDLE",
      action: normalizedAction,
      reason: parsed.reason || "ai_decision",
      confidence: typeof parsed.confidence === "number" ? parsed.confidence : 0.55,
      usedHistory: history.length > 0,
      usedKb: !!kbContext,
    };
  } catch (err: any) {
    log.warn("autopilot_ai_fallback", { error: err.message });
    return { intent: "IDLE", action: "NONE", reason: "ai_error", confidence: 0.3 };
  }
}

function normalizeAction(raw: string): string {
  const val = (raw || "").toUpperCase();
  const allowed = new Set([
    "SEND_OFFER",
    "SEND_PRICE",
    "SEND_CALENDAR",
    "HANDLE_OBJECTION",
    "TRANSFER_AGENT",
    "FOLLOW_UP",
    "FOLLOW_UP_STRONG",
    "ANTI_CHURN",
    "QUALIFY",
    "GHOST_CLOSER",
    "LEAD_UNLOCKER",
  ]);
  if (allowed.has(val)) return val;
  if (val === "OFFER") return "SEND_OFFER";
  if (val === "OBJECTION") return "HANDLE_OBJECTION";
  if (val === "UPSELL") return "FOLLOW_UP";
  return "FOLLOW_UP";
}

function isAutonomousEnabled(settings: any): boolean {
  const mode = String(settings?.autonomy?.mode || "").toUpperCase();
  if (mode === "LIVE" || mode === "BACKLOG" || mode === "FULL") {
    return true;
  }
  if (mode === "HUMAN_ONLY" || mode === "SUSPENDED") {
    return false;
  }
  if (mode === "OFF") {
    return settings?.autopilot?.enabled === true;
  }
  if (mode) {
    return mode === "LIVE" || mode === "BACKLOG" || mode === "FULL";
  }
  return settings?.autopilot?.enabled === true;
}

function isCiaAutonomyMode(settings: any): boolean {
  const mode = String(settings?.autonomy?.mode || "").toUpperCase();
  return mode === "LIVE" || mode === "BACKLOG" || mode === "FULL";
}

function isCiaProactiveCycleEnabled(settings: any): boolean {
  const override = String(
    process.env.CIA_ENABLE_PROACTIVE_CYCLE || "false",
  )
    .trim()
    .toLowerCase();

  if (["true", "1", "on", "yes"].includes(override)) {
    return settings?.autonomy?.proactiveEnabled === true;
  }

  if (["false", "0", "off", "no"].includes(override)) {
    return false;
  }

  return settings?.autonomy?.proactiveEnabled === true;
}

async function loadWorkspaceGlobalStrategy(input: {
  settings: any;
  intentHint?: string;
}) {
  const domain = inferWorkspaceDomain(input.settings || {});
  const raw = await redis.get("cia:global-patterns:v1").catch(() => null);
  if (!raw) {
    return buildGlobalStrategy({
      patterns: [],
      domain,
      intent: input.intentHint || "generic",
    });
  }

  try {
    const parsed = JSON.parse(raw) as {
      patterns?: GlobalLearningPattern[];
    };
    return buildGlobalStrategy({
      patterns: parsed?.patterns || [],
      domain,
      intent: input.intentHint || "generic",
    });
  } catch {
    return buildGlobalStrategy({
      patterns: [],
      domain,
      intent: input.intentHint || "generic",
    });
  }
}

function normalizeMatchableText(value: string): string {
  return (value || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
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
      select: { name: true },
      take: 50,
    }),
    prisma.kloelMemory.findMany({
      where: {
        workspaceId,
        OR: [{ type: "product" }, { category: "products" }],
      },
      select: { value: true },
      take: 50,
    }),
  ]);

  const candidates = [
    ...products.map((product: any) => product.name),
    ...memoryProducts.map((memory: any) => memory?.value?.name).filter(Boolean),
  ];

  return Array.from(
    new Set(
      candidates.filter((name) =>
        normalizedMessage.includes(normalizeMatchableText(String(name || ""))),
      ),
    ),
  );
}

async function buildPendingMessageBatch(params: {
  workspaceId: string;
  contactId?: string;
  phone?: string;
  fallbackMessageContent?: string;
}) {
  const { workspaceId, contactId, phone, fallbackMessageContent } = params;

  let contact = contactId
    ? await prisma.contact.findUnique({
      where: { id: contactId },
        select: { id: true, phone: true, leadScore: true, name: true },
      })
    : null;

  if (!contact && phone) {
    contact = await prisma.contact.findFirst({
      where: { workspaceId, phone },
      select: { id: true, phone: true, leadScore: true, name: true },
    });
  }

  const resolvedContactId = contact?.id || contactId;
  const resolvedPhone = contact?.phone || phone;

  if (!resolvedContactId || !resolvedPhone) {
    return null;
  }

  const lastOutbound = await prisma.message.findFirst({
    where: {
      workspaceId,
      contactId: resolvedContactId,
      direction: "OUTBOUND",
    },
    orderBy: { createdAt: "desc" },
    select: { createdAt: true },
  });

  const inboundMessages = await prisma.message.findMany({
    where: {
      workspaceId,
      contactId: resolvedContactId,
      direction: "INBOUND",
      ...(lastOutbound?.createdAt
        ? {
            createdAt: {
              gt: lastOutbound.createdAt,
            },
          }
        : {}),
    },
    orderBy: { createdAt: "asc" },
    take: PENDING_MESSAGE_LIMIT,
    select: {
      id: true,
      externalId: true,
      content: true,
      createdAt: true,
    },
  });

  const usableMessages = inboundMessages.filter(
    (message: any) => String(message.content || "").trim().length > 0,
  );
  const effectiveMessages = usableMessages.length
    ? usableMessages
    : fallbackMessageContent
      ? [
          {
            id: undefined,
            content: fallbackMessageContent,
            createdAt: new Date(),
          },
        ]
      : [];

  if (!effectiveMessages.length) {
    return null;
  }

  const aggregatedMessage =
    effectiveMessages.length === 1
      ? String(effectiveMessages[0].content)
      : effectiveMessages
          .map(
            (message: any, index: number) =>
              `[${index + 1}] ${String(message.content || "").trim()}`,
          )
          .join("\n");

  return {
    contactId: resolvedContactId,
    phone: resolvedPhone,
    contactName: contact?.name || resolvedPhone,
    leadScore: contact?.leadScore,
    messageContent: aggregatedMessage,
    messageCount: effectiveMessages.length,
    messageIds: effectiveMessages
      .map((message: any) => message.id)
      .filter(Boolean),
    providerMessageIds: effectiveMessages
      .map((message: any) => message.externalId)
      .filter(Boolean),
    customerMessages: effectiveMessages
      .map((message: any) => ({
        content: String(message.content || "").trim(),
        quotedMessageId: String(message.externalId || "").trim(),
        createdAt: message.createdAt?.toISOString?.() || null,
      }))
      .filter(
        (message: QuotedCustomerMessage) =>
          message.content.length > 0 && message.quotedMessageId.length > 0,
      ),
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
      ? String(
          input.providerMessageIds[input.providerMessageIds.length - 1] || "",
        ).trim() || undefined
      : undefined;
  if (fromContext) {
    return fromContext;
  }

  const message = await prisma.message.findFirst({
    where: {
      workspaceId: input.workspaceId,
      direction: "INBOUND",
      externalId: { not: null },
      ...(input.conversationId
        ? { conversationId: input.conversationId }
        : input.contactId
          ? { contactId: input.contactId }
          : input.phone
            ? { contact: { phone: input.phone } }
            : {}),
    },
    orderBy: { createdAt: "desc" },
    select: { externalId: true },
  });

  const externalId = String(message?.externalId || "").trim();
  return externalId || undefined;
}

export async function runSweepUnreadConversations(data: any) {
  const workspaceId = data?.workspaceId;
  if (!workspaceId) return;

  const runId = String(data?.runId || "");
  const limit = Math.max(1, Math.min(2000, Number(data?.limit || 500) || 500));
  const mode = String(data?.mode || "reply_all_recent_first");

  const fetchLimit = Math.max(limit, Math.min(limit * 5, 5000));
  const rawConversations = await prisma.conversation.findMany({
    where: {
      workspaceId,
      status: { not: "CLOSED" },
    },
    orderBy: [{ lastMessageAt: "desc" }],
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
        orderBy: { createdAt: "desc" },
        take: 5,
      },
      contact: {
        select: {
          id: true,
          name: true,
          phone: true,
        },
      },
    },
  });
  const conversations = rawConversations
    .filter((conversation: any) => isConversationPendingForAgent(conversation))
    .sort((left: any, right: any) => {
      const leftTimestamp = new Date(left.lastMessageAt || 0).getTime();
      const rightTimestamp = new Date(right.lastMessageAt || 0).getTime();
      if (mode === "prioritize_hot") {
        const unreadDiff =
          deriveOperationalUnreadCount(right) -
          deriveOperationalUnreadCount(left);
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
      status: "skipped",
      summary: "Nenhuma conversa pendente encontrada.",
    });
    return { queued: 0, runId };
  }

  await publishAgentEvent({
    type: "status",
    workspaceId,
    runId,
    phase: "queue_start",
    persistent: true,
    message:
      mode === "prioritize_hot"
        ? `Separei ${conversations.length} conversas e vou priorizar as mais recentes com maior volume de mensagens.`
        : `Separei ${conversations.length} conversas e vou responder por ordem dos mais recentes primeiro.`,
    meta: {
      total: conversations.length,
      mode,
    },
  });

  for (const [index, conversation] of conversations.entries()) {
    const displayName =
      conversation.contact?.name || conversation.contact?.phone || "contato";

    await publishAgentEvent({
      type: "thought",
      workspaceId,
      runId,
      phase: "queue_contact",
      message: `Preparando ${displayName} (${index + 1}/${conversations.length})`,
      meta: {
        contactId: conversation.contactId,
        contactName: conversation.contact?.name || null,
        phone: conversation.contact?.phone || null,
        unreadCount: deriveOperationalUnreadCount(conversation),
      },
    });

    await autopilotQueue.add(
      "scan-contact",
      {
        workspaceId,
        runId,
        deliveryMode: "reactive",
        contactId: conversation.contactId,
        phone: conversation.contact?.phone || undefined,
        contactName: conversation.contact?.name || undefined,
        backlogIndex: index + 1,
        backlogTotal: conversations.length,
      },
      {
        jobId: buildQueueJobId(
          "scan-contact",
          workspaceId,
          conversation.contactId,
          "run",
          runId,
        ),
        removeOnComplete: true,
      },
    );
  }

  return {
    queued: conversations.length,
    runId,
  };
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
  if (
    input.action === "AUTONOMOUS_FALLBACK" &&
    input.decisionEnvelope.riskFlags.length === 0
  ) {
    return { blocked: false as const };
  }

  const allowedToSend = shouldAutonomousSend(
    input.decisionEnvelope,
    "AUTONOMOUS",
  );

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
    const taskPayload: any = {
      ...humanTask,
      conversationId: lockedConversation?.id || null,
      status: "OPEN",
    };

    await persistHumanTask(prisma, {
      workspaceId: input.workspaceId,
      task: taskPayload,
    });

    await persistSystemInsight(prisma, {
      workspaceId: input.workspaceId,
      type: "CIA_HUMAN_TASK",
      title: `Validação humana necessária para ${input.contactName || input.phone || "contato"}`,
      description: humanTask.reason,
      severity: humanTask.urgency === "CRITICAL" ? "CRITICAL" : "WARNING",
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
      actionType: "TRANSFER_HUMAN",
      contactId: input.contactId,
      idempotencyKey: buildAutonomyExecutionKey({
        workspaceId: input.workspaceId,
        actionType: "TRANSFER_HUMAN",
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
      await finishAutonomyExecution(transferExecution.record?.id, "SUCCESS", {
        response: {
          humanTaskId: humanTask.id,
          conversationId: lockedConversation?.id || null,
          status: "conversation_locked_human",
        },
      });
    }
  }

  await publishAgentEvent({
    type: "status",
    workspaceId: input.workspaceId,
    runId: input.runId,
    phase: "human_validation",
    persistent: true,
    message: `Preciso de validação humana para ${input.contactName || input.phone || "este contato"}. Motivo: ${
      humanTask?.reason || "risco operacional identificado"
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
    action: input.action || "HUMAN_REVIEW_REQUIRED",
    intent: input.intent,
    status: "skipped",
    reason: humanTask?.reason || "human_validation_required",
    meta: {
      humanTaskId: humanTask?.id,
      riskFlags: input.decisionEnvelope.riskFlags,
      confidence: input.decisionEnvelope.confidence,
      capabilities: input.decisionEnvelope.capabilities,
    },
  });

  return {
    blocked: true as const,
    summary:
      humanTask?.reason ||
      "A IA decidiu escalar este caso para validação humana.",
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
    orderBy: [{ updatedAt: "desc" }],
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
  if (!conversation || conversation.mode === "HUMAN") {
    return conversation;
  }

  await prisma.conversation.update({
    where: { id: conversation.id },
    data: { mode: "HUMAN" },
  });

  return {
    ...conversation,
    mode: "HUMAN",
  };
}

function resolveScanDeliveryMode(data: {
  messageId?: string;
  runId?: string;
  deliveryMode?: "reactive" | "proactive";
}): "reactive" | "proactive" {
  if (data?.deliveryMode === "reactive" || data?.deliveryMode === "proactive") {
    return data.deliveryMode;
  }
  return data?.messageId && !data?.runId ? "reactive" : "proactive";
}

function getSharedReplyLockKey(
  workspaceId: string,
  contactId?: string | null,
  phone?: string | null,
) {
  const normalizedPhone = String(phone || "").replace(/\D/g, "");
  return `autopilot:reply:${workspaceId}:${contactId || normalizedPhone}`;
}

export async function runScanContact(data: any) {
  const { workspaceId } = data || {};
  if (!workspaceId) return;
  const smokeTestId = data?.smokeTestId as string | undefined;
  const smokeMode = data?.smokeMode === "live" ? "live" : "dry-run";
  const runId = data?.runId as string | undefined;
  const scanDeliveryMode = resolveScanDeliveryMode(data || {});

  const workspace = await prisma.workspace.findUnique({ where: { id: workspaceId } });
  const settings: any = workspace?.providerSettings;
  const aggregated = await buildPendingMessageBatch({
    workspaceId,
    contactId: data?.contactId,
    phone: data?.phone,
    fallbackMessageContent: data?.messageContent,
  });

  let finalStatus: "sent" | "failed" | "skipped" = "skipped";
  let finalSummary = "sem ação";
  let finalContactId = data?.contactId as string | undefined;
  let finalPhone = data?.phone as string | undefined;
  let finalContactName = data?.contactName as string | undefined;
  let replyLockKey: string | null = null;
  let keepReplyLock = false;

  try {
    if (!aggregated) {
      log.info("autopilot_scan_contact_empty", { workspaceId, contactId: data?.contactId, phone: data?.phone });
      autopilotPipelineCounter.inc({
        workspaceId,
        stage: "scan_contact",
        result: "empty",
      });
      await reportSmokeTest(smokeTestId, {
        status: "empty",
        workspaceId,
        contactId: data?.contactId,
        phone: data?.phone,
      });
      finalSummary = "Nenhuma mensagem pendente para este contato.";
      return;
    }

    const {
      contactId,
      phone,
      contactName,
      leadScore,
      messageContent,
      messageCount,
      messageIds,
      providerMessageIds,
      customerMessages,
    } = aggregated;

    finalContactId = contactId;
    finalPhone = phone;
    finalContactName = contactName;
    replyLockKey = getSharedReplyLockKey(workspaceId, contactId, phone);
    const replyReserved = await redis.set(
      replyLockKey,
      String(data?.messageId || runId || "scan-contact"),
      "PX",
      SHARED_REPLY_LOCK_MS,
      "NX",
    );
    if (replyReserved !== "OK") {
      finalSummary = "Contato já está sendo respondido por outro pipeline.";
      return;
    }

    const conversation = await findConversationAutomationState({
      workspaceId,
      contactId,
      phone,
    });
    if (conversation && resolveConversationOwner(conversation) !== "AGENT") {
      const blockedReason = conversation.assignedAgentId
        ? "assigned_to_human"
        : "human_mode_lock";
      await logAutopilotAction({
        workspaceId,
        contactId,
        phone,
        action: "SCAN_CONTACT",
        intent: "HUMAN_REVIEW_REQUIRED",
        status: "skipped",
        reason: blockedReason,
        meta: {
          source: "scan_contact",
          conversationId: conversation.id,
          conversationMode: conversation.mode,
          conversationStatus: conversation.status,
          assignedAgentId: conversation.assignedAgentId || null,
          owner: resolveConversationOwner(conversation),
        },
      });
      autopilotPipelineCounter.inc({
        workspaceId,
        stage: "scan_contact",
        result: blockedReason,
      });
      await publishAgentEvent({
        type: "status",
        workspaceId,
        runId,
        phase: "human_mode_lock",
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
      finalSummary = "Conversa travada em modo humano.";
      return;
    }

    log.info("autopilot_scan_contact", {
      workspaceId,
      contactId,
      phone,
      messageCount,
    });
    autopilotPipelineCounter.inc({
      workspaceId,
      stage: "scan_contact",
      result: "processing",
    });
    await reportSmokeTest(smokeTestId, {
      status: "processing",
      workspaceId,
      contactId,
      phone,
      messageCount,
    });

    await publishAgentEvent({
      type: "thought",
      workspaceId,
      runId,
      phase: "open_contact",
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
        intent: "DISABLED",
        action: "NONE",
        result: "skipped",
      });
      autopilotPipelineCounter.inc({
        workspaceId,
        stage: "scan_contact",
        result: "disabled",
      });
      await reportSmokeTest(smokeTestId, {
        status: "disabled",
        workspaceId,
        contactId,
        phone,
      });
      finalSummary = "Autopilot desativado para este workspace.";
      return;
    }

    if (settings?.billingSuspended === true) {
      log.info("autopilot_skip_billing_suspended", { workspaceId });
      try {
        await prisma.autopilotEvent.create({
          data: {
            workspaceId,
            contactId,
            intent: "BILLING",
            action: "SUSPENDED",
            status: "skipped",
            reason: "billing_suspended",
            meta: { source: "autopilot_worker" },
          },
        });
      } catch (err: any) {
        log.warn("autopilot_event_billing_skip_failed", { error: err?.message });
      }
      await notifyBillingSuspended(workspaceId);
      autopilotDecisionCounter.inc({
        workspaceId,
        intent: "BILLING_SUSPENDED",
        action: "NONE",
        result: "skipped",
      });
      autopilotPipelineCounter.inc({
        workspaceId,
        stage: "scan_contact",
        result: "billing_suspended",
      });
      await reportSmokeTest(smokeTestId, {
        status: "billing_suspended",
        workspaceId,
        contactId,
        phone,
      });
      finalSummary = "Billing suspenso. O contato não pode ser atendido automaticamente.";
      return;
    }

    const productMatches = await findWorkspaceProductMatches(
      workspaceId,
      messageContent,
    );

    await publishAgentEvent({
      type: "thought",
      workspaceId,
      runId,
      phase: "analyze_contact",
      message:
        productMatches.length > 0
          ? `Identifiquei interesse em ${productMatches.join(", ")}.`
          : "Lendo o histórico recente e entendendo a intenção do contato.",
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
      source: "scan_contact",
    });

    await publishAgentEvent({
      type: "thought",
      workspaceId,
      runId,
      phase: "cognitive_state",
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

    if (cognitiveState.nextBestAction === "WAIT") {
      await publishAgentEvent({
        type: "status",
        workspaceId,
        runId,
        phase: "cognitive_wait",
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
        action: "SCAN_CONTACT",
        intent: cognitiveState.intent,
        status: "skipped",
        reason: "cognitive_wait",
        meta: {
          source: "scan_contact",
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
        outcome: "WAITED",
        reward: computeCognitiveRewardSignal(cognitiveState.nextBestAction, cognitiveState),
        message: cognitiveState.summary,
        metadata: {
          source: "scan_contact",
        },
      });
      finalSummary = "Estado cognitivo indicou espera antes da próxima ação.";
      return;
    }

    if (cognitiveState.nextBestAction === "ESCALATE_HUMAN") {
      const cognitiveEnvelope = buildDecisionEnvelope({
        intent: cognitiveState.intent,
        action: "COGNITIVE_ESCALATION",
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
        action: "COGNITIVE_ESCALATION",
      });
      await recordDecisionOutcome(prisma, {
        workspaceId,
        contactId,
        conversationId: conversation?.id,
        phone,
        action: cognitiveState.nextBestAction,
        outcome: humanGate.blocked ? "ESCALATED" : "SKIPPED",
        reward: computeCognitiveRewardSignal(cognitiveState.nextBestAction, cognitiveState),
        message: cognitiveState.summary,
        metadata: {
          source: "scan_contact",
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
        "ASK_CLARIFYING",
        "SOCIAL_PROOF",
        "OFFER",
        "PAYMENT_RECOVERY",
        "FOLLOWUP_SOFT",
        "FOLLOWUP_URGENT",
      ].includes(cognitiveState.nextBestAction)
    ) {
      const text = buildCognitiveMessage({
        action: cognitiveState.nextBestAction,
        state: cognitiveState,
        contactName,
        matchedProducts: productMatches,
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
          outcome: "ESCALATED",
          reward: computeCognitiveRewardSignal(cognitiveState.nextBestAction, cognitiveState),
          message: text,
          metadata: {
            source: "scan_contact",
            blocked: true,
          },
        });
        finalSummary = humanGate.summary;
        return;
      }

      if (smokeTestId && smokeMode !== "live") {
        autopilotPipelineCounter.inc({
          workspaceId,
          stage: "reply",
          result: "preview",
        });
        await reportSmokeTest(smokeTestId, {
          status: "completed",
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
        finalSummary = "Resposta cognitiva gerada em modo preview.";
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
        reason: "cognitive_next_best_action",
        workspaceRecord: workspace,
        intentConfidence: cognitiveState.classificationConfidence,
        actionLabel: cognitiveState.nextBestAction,
        usedHistory: true,
        usedKb: productMatches.length > 0,
        deliveryMode: scanDeliveryMode,
        smokeTestId,
        smokeMode,
        runId,
        customerMessages,
        idempotencyContext: {
          source: "scan_contact_cognitive_action",
          action: cognitiveState.nextBestAction,
          messageIds,
          providerMessageIds,
          runId: runId || null,
        },
      });
      finalStatus = sendResult === "executed" ? "sent" : "skipped";
      await recordDecisionOutcome(prisma, {
        workspaceId,
        contactId,
        conversationId: conversation?.id,
        phone,
        action: cognitiveState.nextBestAction,
        outcome: sendResult === "executed" ? "SENT" : "SKIPPED",
        reward: computeCognitiveRewardSignal(cognitiveState.nextBestAction, cognitiveState),
        message: text,
        metadata: {
          source: "scan_contact",
          matchedProducts: productMatches,
        },
      });
      finalSummary =
        sendResult === "executed"
          ? "Resposta cognitiva enviada com sucesso."
          : "Ação cognitiva pulada por política operacional.";
      return;
    }

    const useUnifiedAgent =
      cognitiveState.nextBestAction === "RESPOND" ||
      productMatches.length > 0 ||
      shouldUseUnifiedAgent({
        messageContent,
        leadScore: leadScore || undefined,
        settings,
      });

    let decision: AutopilotDecision;
    let unifiedAgentResponse: string | null = null;

    if (useUnifiedAgent) {
      log.info("autopilot_using_unified_agent", {
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
          source: "autopilot_worker",
          aggregatedPendingMessages: messageCount,
          pendingMessageIds: messageIds,
          matchedProducts: productMatches,
        },
      });

      if (unifiedResult) {
        decision = mapUnifiedActionsToAutopilot(unifiedResult.actions);
        unifiedAgentResponse = extractTextResponse(unifiedResult);

        log.info("autopilot_unified_decision", {
          decision,
          hasResponse: !!unifiedAgentResponse,
        });

        if (decision.alreadyExecuted) {
          const observedExecution = await beginAutonomyExecution({
            workspaceId,
            actionType: "UNIFIED_AGENT_EXECUTED",
            contactId,
            conversationId: conversation?.id,
            idempotencyKey: buildAutonomyExecutionKey({
              workspaceId,
              actionType: "UNIFIED_AGENT_EXECUTED",
              contactId,
              conversationId: conversation?.id,
              phone,
              payload: {
                source: "unified_agent_already_executed",
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
              source: "unified_agent_already_executed",
              messageIds,
              runId: runId || null,
            },
          });
          if (observedExecution.allowed) {
            await finishAutonomyExecution(observedExecution.record?.id, "SUCCESS", {
              response: {
                channel: "UNIFIED_AGENT_TOOL",
                actions: unifiedResult.actions,
                response: unifiedAgentResponse || null,
              },
            });
          }
          keepReplyLock = true;

          autopilotDecisionCounter.inc({
            workspaceId,
            intent: decision.intent,
            action: "UNIFIED_AGENT",
            result: "success",
          });
          autopilotPipelineCounter.inc({
            workspaceId,
            stage: "unified_agent",
            result: "already_executed",
          });
          await reportSmokeTest(smokeTestId, {
            status: "already_executed",
            workspaceId,
            contactId,
            phone,
            decision,
          });
          finalSummary = "A resposta já havia sido executada anteriormente.";
          return;
        }

        if (unifiedAgentResponse && !decision.alreadyExecuted) {
          const decisionEnvelope = buildDecisionEnvelope({
            intent: decision.intent,
            action: "UNIFIED_AGENT_TEXT",
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
            action: "UNIFIED_AGENT_TEXT",
          });
          if (humanGate.blocked) {
            finalSummary = humanGate.summary;
            return;
          }

          await publishAgentEvent({
            type: "thought",
            workspaceId,
            runId,
            phase: "compose_reply",
            message: `Pensando na melhor resposta para ${contactName || phone}.`,
            meta: {
              contactId,
              contactName,
              phone,
              intent: decision.intent,
            },
          });

          if (smokeTestId && smokeMode !== "live") {
            autopilotPipelineCounter.inc({
              workspaceId,
              stage: "reply",
              result: "preview",
            });
            await reportSmokeTest(smokeTestId, {
              status: "completed",
              mode: smokeMode,
              workspaceId,
              contactId,
              phone,
              decision,
              responseText: unifiedAgentResponse,
              matchedProducts: productMatches,
            });
            finalSummary = "Resposta gerada em modo preview.";
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
            actionLabel: "UNIFIED_AGENT_TEXT",
            usedHistory: true,
            usedKb: productMatches.length > 0,
            deliveryMode: scanDeliveryMode,
            smokeTestId,
            smokeMode,
            runId,
            customerMessages,
            idempotencyContext: {
              source: "scan_contact_unified_agent_text",
              messageIds,
              providerMessageIds,
              runId: runId || null,
            },
          });

          finalStatus = sendResult === "executed" ? "sent" : "skipped";
          keepReplyLock = sendResult === "executed";
          finalSummary =
            sendResult === "executed"
              ? "Resposta enviada com texto gerado pelo Unified Agent."
              : "A resposta foi pulada por política operacional.";
          return;
        }
      } else {
        log.warn("autopilot_unified_fallback", { workspaceId });
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

    log.info("autopilot_decision", { decision });

    if (!decision.action || decision.action === "NONE") {
      const decisionEnvelope = buildDecisionEnvelope({
        intent: decision.intent || "GENERAL_ASSISTANCE",
        action: "AUTONOMOUS_FALLBACK",
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
        intent: decision.intent || "GENERAL_ASSISTANCE",
        action: "AUTONOMOUS_FALLBACK",
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
        deliveryMode: scanDeliveryMode,
      });

      await publishAgentEvent({
        type: "thought",
        workspaceId,
        runId,
        phase: "compose_reply",
        message: `Preparando uma resposta útil para ${contactName || phone}.`,
        meta: {
          contactId,
          contactName,
          phone,
        },
      });

      if (smokeTestId && smokeMode !== "live") {
        autopilotPipelineCounter.inc({
          workspaceId,
          stage: "reply",
          result: "preview",
        });
        await reportSmokeTest(smokeTestId, {
          status: "completed",
          mode: smokeMode,
          workspaceId,
          contactId,
          phone,
          decision,
          responseText: fallbackText,
          matchedProducts: productMatches,
        });
        finalSummary = "Fallback gerado em modo preview.";
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
        intent: decision.intent || "GENERAL_ASSISTANCE",
        reason: decision.reason || "autonomous_fallback",
        workspaceRecord: workspace,
        intentConfidence: decision.confidence,
        actionLabel: "AUTONOMOUS_FALLBACK",
        usedHistory: true,
        usedKb: productMatches.length > 0 || decision.usedKb,
        deliveryMode: scanDeliveryMode,
        smokeTestId,
        smokeMode,
        runId,
        customerMessages,
        idempotencyContext: {
          source: "scan_contact_autonomous_fallback",
          messageIds,
          providerMessageIds,
          runId: runId || null,
        },
      });

      finalStatus = sendResult === "executed" ? "sent" : "skipped";
      keepReplyLock = sendResult === "executed";
      finalSummary =
        sendResult === "executed"
          ? "Resposta enviada com fallback autônomo."
          : "Fallback pulado por política operacional.";
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
      type: "thought",
      workspaceId,
      runId,
      phase: "compose_reply",
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
      contactName,
      messageContent,
      settings,
      intent: decision.intent,
      reason: decision.reason,
      workspaceRecord: workspace,
      intentConfidence: decision.confidence,
      usedHistory: true,
      usedKb: productMatches.length > 0 || decision.usedKb,
      deliveryMode: scanDeliveryMode,
      smokeTestId,
      smokeMode,
      runId,
      customerMessages,
      idempotencyContext: {
        source: "scan_contact_action",
        messageIds,
        providerMessageIds,
        runId: runId || null,
      },
    });

    finalStatus = executeResult === "executed" ? "sent" : "skipped";
    keepReplyLock = executeResult === "executed";
    finalSummary =
      executeResult === "executed"
        ? `Ação ${decision.action} executada com sucesso.`
        : `Ação ${decision.action} pulada por política operacional.`;
  } catch (err: any) {
    finalStatus = "failed";
    finalSummary = err?.message || "Erro ao processar contato";
    throw err;
  } finally {
    if (replyLockKey && !keepReplyLock) {
      await redis.del(replyLockKey).catch(() => undefined);
    }
    if (runId) {
      await finishBacklogRunTask({
        workspaceId,
        runId,
        contactId: finalContactId,
        contactName: finalContactName,
        phone: finalPhone,
        status: finalStatus,
        summary: finalSummary,
      });
    }
  }
}

async function fetchConversationHistory(
  workspaceId?: string,
  contactId?: string,
  phone?: string,
  limit = 8
) {
  if (!workspaceId) return [];
  let contact = contactId
    ? await prisma.contact.findUnique({ where: { id: contactId }, select: { id: true, phone: true } })
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
    orderBy: { createdAt: "desc" },
    take: limit,
    select: { content: true, direction: true },
  });
  return messages.reverse();
}

async function fetchCompressedContactContext(
  workspaceId?: string,
  contactId?: string,
  phone?: string,
) {
  if (!workspaceId) return "";

  const normalizedPhone = String(phone || "").trim();
  const keys = [
    contactId ? `compressed_context:${contactId}` : "",
    normalizedPhone ? `compressed_context:${normalizedPhone}` : "",
  ].filter(Boolean);

  if (!keys.length) return "";

  const memory = await prisma.kloelMemory.findFirst({
    where: {
      workspaceId,
      category: "compressed_context",
      key: { in: keys },
    },
    orderBy: { updatedAt: "desc" },
    select: {
      content: true,
      value: true,
    },
  });

  return String(
    memory?.content ||
      (typeof memory?.value === "object"
        ? (memory?.value as Record<string, any> | null)?.summary
        : "") ||
      "",
  ).trim();
}

async function getKbContext(workspaceId?: string, text?: string, apiKey?: string) {
  if (!workspaceId || !text || !apiKey) return "";
  try {
    const openai = new OpenAI({ apiKey });
    const cleaned = text.slice(0, 2000);
    const embedding = await openai.embeddings.create({
      model: "text-embedding-3-small",
      input: cleaned,
    });
    const vectorString = `[${embedding.data[0].embedding.join(",")}]`;
    const rows: any[] = await prisma.$queryRaw`
      SELECT v.content, (v.embedding <=> ${vectorString}::vector) AS distance
      FROM "Vector" v
      JOIN "KnowledgeSource" s ON v."sourceId" = s.id
      JOIN "KnowledgeBase" kb ON s."knowledgeBaseId" = kb.id
      WHERE kb."workspaceId" = ${workspaceId}
      ORDER BY distance ASC
      LIMIT 3
    `;
    if (!rows || rows.length === 0) return "";
    return rows.map((r: any) => r.content).join("\n---\n").slice(0, 1500);
  } catch (err: any) {
    log.warn("kb_context_error", { error: err.message });
    return "";
  }
}

async function generatePitchSafe(messageContent: string, settings: any) {
  const apiKey = settings?.openai?.apiKey || process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return "Tem interesse? Consigo te fazer uma oferta especial se fecharmos ainda hoje.";
  }
  try {
    const ai = new AIProvider(apiKey);
    const pitchPrompt = `Generate a short, high-converting offer message for a lead who said: "${messageContent}". Be direct.`;
    return await ai.generateResponse("You are a concise sales copywriter. Return plain text.", pitchPrompt);
  } catch (err: any) {
    log.warn("autopilot_pitch_fallback", { error: err.message });
    return "Posso te fazer uma oferta exclusiva. Quer fechar agora?";
  }
}

async function generateAutonomousFallbackResponse(params: {
  workspaceId: string;
  messageContent: string;
  settings: any;
  matchedProducts?: string[];
  contactId?: string;
  phone?: string;
  deliveryMode?: string;
}) {
  const {
    workspaceId,
    messageContent,
    settings,
    matchedProducts = [],
    contactId,
    phone,
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

  const workspaceName = workspace?.name || "empresa";
  const compressedContext = await fetchCompressedContactContext(
    workspaceId,
    contactId,
    phone,
  );
  const isLiveConversation = deliveryMode === "reactive";
  const productSummary = products.length
    ? products
        .map((product: any) => {
          const price =
            typeof product.price === "number"
              ? ` (${product.currency || "BRL"} ${product.price})`
              : "";
          const description = product.description
            ? ` - ${String(product.description).slice(0, 120)}`
            : "";
          return `${product.name}${price}${description}`;
        })
        .join("\n")
    : "Nenhum produto cadastrado.";

  if (!apiKey) {
    if (matchedProducts.length > 0) {
      return `Posso te ajudar com ${matchedProducts.join(", ")}. O que você quer saber?`;
    }

    return `Posso te ajudar por aqui. O que você precisa?`;
  }

  try {
    const ai = new AIProvider(apiKey);
    const systemPrompt = `Você responde no WhatsApp da ${workspaceName}.
Responda sempre.
Fale como humano, de igual para igual.
Seja direto, curto e comercial.
Use no máximo 3 frases curtas.
Não use emoji.
Não use listas.
Não diga que é IA.
Nunca fique em silêncio.
${isLiveConversation ? "A conversa está ao vivo. Você pode responder acompanhando os pontos recentes do cliente." : "Esta não é uma conversa ao vivo. Considere o resumo integral do contato e responda com uma única mensagem estratégica."}`;

    const userPrompt = `Mensagem do cliente:
${messageContent}

Resumo integral do contato:
${compressedContext || "n/d"}

Produtos cadastrados:
${productSummary}

Produtos detectados nesta conversa:
${matchedProducts.length ? matchedProducts.join(", ") : "nenhum"}

Responda com uma única mensagem pronta para enviar no WhatsApp.`;

    const response = await ai.generateResponse(
      systemPrompt,
      userPrompt,
      "writer",
    );

    return String(response || "").trim();
  } catch (err: any) {
    log.warn("autopilot_generic_fallback_ai_error", {
      workspaceId,
      error: err?.message,
    });
    return matchedProducts.length > 0
      ? `Posso te ajudar com ${matchedProducts.join(", ")}. Qual ponto você quer ver primeiro?`
      : `Posso te ajudar por aqui. Me diz o que você precisa.`;
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

function computeCognitiveRewardSignal(action: CognitiveActionType, state?: CustomerCognitiveState | null) {
  if (!state) return 0;
  const stageBoost =
    state.stage === "CHECKOUT" ? 1.2 : state.stage === "HOT" ? 0.85 : 0.4;
  const trustBoost = state.trustScore * 0.6;
  const urgencyBoost = state.urgencyScore * 0.9;

  switch (action) {
    case "PAYMENT_RECOVERY":
      return Number((stageBoost + urgencyBoost + 0.9).toFixed(3));
    case "OFFER":
      return Number((stageBoost + trustBoost + 0.55).toFixed(3));
    case "SOCIAL_PROOF":
      return Number((trustBoost + 0.45).toFixed(3));
    case "ASK_CLARIFYING":
      return Number((0.55 + urgencyBoost * 0.35).toFixed(3));
    case "FOLLOWUP_URGENT":
      return Number((0.75 + urgencyBoost).toFixed(3));
    case "FOLLOWUP_SOFT":
      return Number((0.45 + trustBoost * 0.5).toFixed(3));
    case "RESPOND":
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
  const state = params.state;
  const productText = params.matchedProducts?.length
    ? ` sobre ${params.matchedProducts.join(", ")}`
    : "";
  const tactic = String(params.tactic || "");

  switch (params.action) {
    case "ASK_CLARIFYING":
      if (tactic === "QUALIFY_NEED") {
        return `Pra eu te orientar certo${productText}, qual necessidade você quer resolver primeiro?`;
      }
      return `Pra eu te ajudar melhor${productText}, sua prioridade é valor, resultado ou próximo passo?`;
    case "SOCIAL_PROOF":
      if (tactic === "TRUST_REASSURANCE") {
        return `Faz sentido ter essa dúvida${productText}. Se quiser, eu te explico o ponto principal de forma direta.`;
      }
      return `Faz sentido ter essa dúvida${productText}. Se quiser, eu te mostro o que costuma destravar essa decisão.`;
    case "OFFER":
      if (tactic === "CHECKOUT_SIMPLIFICATION") {
        return `Pelo que você me disse${productText}, eu posso te mostrar a opção mais simples pra avançar agora.`;
      }
      if (tactic === "PRICE_VALUE_REFRAME") {
        return `Aqui${productText}, o ponto não é só preço. Se fizer sentido, eu te mostro a opção com melhor custo-benefício.`;
      }
      return `Pelo que você me disse${productText}, eu já posso te mostrar a melhor opção pra seguir.`;
    case "FOLLOWUP_URGENT":
      if (tactic === "SAFE_URGENCY") {
        return `Ainda dá pra priorizar isso hoje${productText}. Se fizer sentido, eu já te passo o próximo passo.`;
      }
      return `Sua conversa está perto de avançar${productText}. Se ainda fizer sentido, eu sigo com você agora.`;
    case "FOLLOWUP_SOFT":
      if (tactic === "CHECKOUT_SIMPLIFICATION") {
        return `Sua conversa ficou em aberto${productText}. Se ainda fizer sentido, eu te resumo o caminho mais simples.`;
      }
      return `Sua conversa ficou em aberto${productText}. Se quiser, eu continuo daqui.`;
    case "PAYMENT_RECOVERY":
      if (tactic === "CHECKOUT_SIMPLIFICATION") {
        return `Seu pagamento ficou pendente${productText}. Se quiser, eu te passo o próximo passo agora.`;
      }
      return `Seu pagamento ficou pendente${productText}. Se quiser, eu reativo isso agora.`;
    default:
      if (tactic === "TRUST_REASSURANCE") {
        return `Estou acompanhando sua conversa${productText}. Se quiser, eu te digo o melhor próximo passo.`;
      }
      return `Estou acompanhando sua conversa${productText}. Posso seguir com você por aqui.`;
  }
}

function normalizeAutonomyLedgerValue(value: any): any {
  if (value instanceof Date) {
    return value.toISOString();
  }

  if (Array.isArray(value)) {
    return value.map((item) => normalizeAutonomyLedgerValue(item));
  }

  if (value && typeof value === "object") {
    return Object.keys(value)
      .sort()
      .reduce<Record<string, any>>((acc, key) => {
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
  payload: Record<string, any>;
}) {
  const hash = createHash("sha256");
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
  return hash.digest("hex");
}

function isAutonomyExecutionDuplicate(err: any) {
  return (
    err?.code === "P2002" ||
    String(err?.message || "").toLowerCase().includes("unique constraint")
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
  request: Record<string, any>;
}) {
  const client: any = prisma as any;
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
        status: "PENDING",
      },
    });
    return { allowed: true as const, record };
  } catch (err: any) {
    if (!isAutonomyExecutionDuplicate(err)) {
      throw err;
    }

    const existing = await client.autonomyExecution.findFirst({
      where: {
        workspaceId: input.workspaceId,
        idempotencyKey: input.idempotencyKey,
      },
    });

    if (existing?.status === "FAILED") {
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
          status: "PENDING",
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
        existing?.status === "SUCCESS"
          ? "duplicate_execution_success"
          : "duplicate_execution_pending",
    };
  }
}

async function finishAutonomyExecution(
  recordId: string | undefined,
  status: "SUCCESS" | "FAILED" | "SKIPPED",
  payload?: {
    response?: Record<string, any> | null;
    error?: string | null;
  },
) {
  if (!recordId) return;

  const client: any = prisma as any;
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
  message: string;
  idempotencyKey: string;
  quotedMessageId?: string;
}) {
  const result = await dispatchOutboundThroughFlow({
    workspaceId: input.workspaceId,
    to: input.phone,
    message: input.message,
    jobId: buildQueueJobId("autonomy-send", input.idempotencyKey),
    externalId: input.idempotencyKey,
    quotedMessageId: input.quotedMessageId,
  });

  if (result?.error) {
    throw new Error(String(result.reason || "send_error"));
  }

  return result;
}

async function dispatchAutonomousReplyPlan(input: {
  workspaceId: string;
  phone: string;
  message: string;
  idempotencyKey: string;
  quotedMessageId?: string;
  customerMessages?: QuotedCustomerMessage[];
  settings?: any;
  mirrorReplies?: boolean;
}): Promise<Array<{ quotedMessageId?: string; text: string }>> {
  const normalizedCustomerMessages = (input.customerMessages || [])
    .map((message) => ({
      content: String(message.content || "").trim(),
      quotedMessageId: String(message.quotedMessageId || "").trim(),
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
    if (!input.quotedMessageId) {
      throw new Error("quoted_message_required");
    }
    replyPlan.push({
      quotedMessageId: input.quotedMessageId,
      text: input.message,
    });
  }

  for (const [index, reply] of replyPlan.entries()) {
    const effectiveQuotedMessageId =
      reply.quotedMessageId || input.quotedMessageId;
    if (!effectiveQuotedMessageId) {
      throw new Error("quoted_message_required");
    }
    await dispatchAutonomousTextMessage({
      workspaceId: input.workspaceId,
      phone: input.phone,
      message: reply.text,
      idempotencyKey: `${input.idempotencyKey}:${index + 1}`,
      quotedMessageId: effectiveQuotedMessageId,
    });
  }

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
    contactName?: string;
    messageContent?: string;
    settings?: any;
    intent?: string;
    reason?: string;
    workspaceRecord?: any;
    intentConfidence?: number;
    usedHistory?: boolean;
    usedKb?: boolean;
    deliveryMode?: "reactive" | "proactive";
    smokeTestId?: string;
    smokeMode?: "dry-run" | "live";
    runId?: string;
    idempotencyContext?: Record<string, any>;
    customerMessages?: QuotedCustomerMessage[];
  }
) {
  if (!action || action === "NONE") return "skipped";

  let contactEmail: string | undefined;
  let contactTelegramId: string | undefined;
  let contactRecord: any;

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
    const cf: any = contact?.customFields || {};
    contactTelegramId = cf.telegramChatId || cf.telegram || undefined;
  }

  if (!targetPhone) return "skipped";

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
      const cf: any = byPhone.customFields || {};
      contactTelegramId = cf.telegramChatId || cf.telegram || undefined;
      input.contactId = input.contactId || byPhone.id;
    }
  }

  const displayName =
    input.contactName || contactRecord?.name || targetPhone || "contato";
  const latestQuotedMessageId = await resolveLatestQuotedMessageId({
    workspaceId: input.workspaceId,
    contactId: input.contactId,
    conversationId: input.conversationId,
    phone: targetPhone,
    providerMessageIds: input.idempotencyContext?.providerMessageIds,
  });

  const compliance = await ensureCompliance(
    input.workspaceId,
    targetPhone,
    input.settings,
    contactRecord,
    input.deliveryMode || "proactive",
  );
  if (!compliance.allowed) {
    await logAutopilotAction({
      workspaceId: input.workspaceId,
      contactId: input.contactId,
      phone: targetPhone,
      action,
      intent: input.intent,
      status: "skipped",
      reason: compliance.reason,
      intentConfidence: input.intentConfidence,
      meta: { compliance: true },
    });
    autopilotDecisionCounter.inc({
      workspaceId: input.workspaceId,
      intent: input.intent || "UNKNOWN",
      action,
      result: "skipped_compliance",
    });
    autopilotPipelineCounter.inc({
      workspaceId: input.workspaceId,
      stage: "reply",
      result: "skipped_compliance",
    });
    await reportSmokeTest(input.smokeTestId, {
      status: "skipped",
      workspaceId: input.workspaceId,
      contactId: input.contactId,
      phone: targetPhone,
      action,
      reason: compliance.reason,
    });
    return "skipped";
  }

  const rate = await checkRateLimits(
    input.workspaceId,
    targetPhone,
    input.deliveryMode || "proactive",
  );
  if (!rate.allowed) {
    log.info("autopilot_rate_limited", { workspaceId: input.workspaceId, phone: targetPhone, reason: rate.reason });
    await logAutopilotAction({
      workspaceId: input.workspaceId,
      contactId: input.contactId,
      phone: targetPhone,
      action,
      intent: input.intent,
      status: "skipped",
      reason: rate.reason || "rate_limit",
    });
    autopilotDecisionCounter.inc({
      workspaceId: input.workspaceId,
      intent: input.intent || "UNKNOWN",
      action,
      result: "rate_limited",
    });
    autopilotPipelineCounter.inc({
      workspaceId: input.workspaceId,
      stage: "reply",
      result: "rate_limited",
    });
    await reportSmokeTest(input.smokeTestId, {
      status: "skipped",
      workspaceId: input.workspaceId,
      contactId: input.contactId,
      phone: targetPhone,
      action,
      reason: rate.reason || "rate_limit",
    });
    if (action === "GHOST_CLOSER" || action === "LEAD_UNLOCKER") {
      autopilotGhostCloserCounter.inc({
        workspaceId: input.workspaceId,
        action,
        result: "rate_limited",
      });
    }
    return "skipped";
  }

  const canSend = await PlanLimitsProvider.checkMessageLimit(input.workspaceId);
  if (!canSend.allowed) {
    await logAutopilotAction({
      workspaceId: input.workspaceId,
      contactId: input.contactId,
      phone: targetPhone,
      action,
      intent: input.intent,
      status: "skipped",
      reason: canSend.reason || "plan_limit",
      intentConfidence: input.intentConfidence,
      meta: {
        usedHistory: input.usedHistory,
        usedKb: input.usedKb,
      },
    });
    autopilotPipelineCounter.inc({
      workspaceId: input.workspaceId,
      stage: "reply",
      result: "blocked_plan_limit",
    });
    await reportSmokeTest(input.smokeTestId, {
      status: "skipped",
      workspaceId: input.workspaceId,
      contactId: input.contactId,
      phone: targetPhone,
      action,
      reason: canSend.reason || "plan_limit",
    });
    return "skipped";
  }

  const msg = await buildMessage(action, input.messageContent || "", input.settings);
  if (!msg) return "skipped";

  const idempotencyKey = buildAutonomyExecutionKey({
    workspaceId: input.workspaceId,
    actionType: action,
    contactId: input.contactId,
    conversationId: input.conversationId,
    phone: targetPhone,
    payload: {
      source: "execute_action",
      message: msg,
      intent: input.intent,
      reason: input.reason,
      deliveryMode: input.deliveryMode || "proactive",
      customerMessages: input.customerMessages || null,
      context: input.idempotencyContext || null,
    },
  });
  const execution = await beginAutonomyExecution({
    workspaceId: input.workspaceId,
    actionType: action,
    contactId: input.contactId,
    conversationId: input.conversationId,
    workItemId: input.idempotencyContext?.workItemId || null,
    proofId:
      input.idempotencyContext?.conversationProofId ||
      input.idempotencyContext?.accountProofId ||
      input.idempotencyContext?.cycleProofId ||
      null,
    capabilityCode: input.idempotencyContext?.capabilityCode || action,
    tacticCode: input.idempotencyContext?.conversationTactic || null,
    idempotencyKey,
    request: {
      phone: targetPhone,
      message: msg,
      intent: input.intent,
      reason: input.reason,
      deliveryMode: input.deliveryMode || "proactive",
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
      status: "skipped",
      reason: execution.reason,
      intentConfidence: input.intentConfidence,
      meta: {
        duplicateExecution: true,
        idempotencyKey,
      },
    });
    autopilotPipelineCounter.inc({
      workspaceId: input.workspaceId,
      stage: "reply",
      result: "duplicate_execution",
    });
    await reportSmokeTest(input.smokeTestId, {
      status: "skipped",
      workspaceId: input.workspaceId,
      contactId: input.contactId,
      phone: targetPhone,
      action,
      reason: execution.reason,
    });
    return "skipped";
  }

  await publishAgentEvent({
    type: "typing",
    workspaceId: input.workspaceId,
    runId: input.runId,
    phase: "typing",
    message: `Digitando resposta para ${displayName}.`,
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
    },
  });

  let sent = false;
  let sendError: string | undefined;
  let executionResponse: Record<string, any> | null = null;
  const followupEligible = action === "SEND_OFFER" || action === "GHOST_CLOSER";
  try {
    const started = Date.now();
    const workspaceCfg = buildWorkspaceConfig(
      input.workspaceId,
      input.settings,
      input.workspaceRecord
    );

    if (action === "SEND_AUDIO") {
      const audioSent = await sendAudioResponse(
        input.workspaceId,
        targetPhone,
        msg,
        input.settings,
        workspaceCfg,
        latestQuotedMessageId,
      );
      if (!audioSent) {
        const replyPlan = await dispatchAutonomousReplyPlan({
          workspaceId: input.workspaceId,
          phone: targetPhone,
          message: msg,
          idempotencyKey,
          customerMessages: input.customerMessages,
          settings: input.settings,
          quotedMessageId: latestQuotedMessageId,
          mirrorReplies:
            input.deliveryMode === "reactive" &&
            isRecentLiveConversation(input.customerMessages || []),
        });
        executionResponse = {
          channel: "FLOW_SEND_MESSAGE",
          fallbackFromAudio: true,
          message: msg,
          replyPlan,
        };
      } else {
        executionResponse = {
          channel: "WHATSAPP_AUDIO",
          message: msg,
        };
      }
    } else {
      const replyPlan = await dispatchAutonomousReplyPlan({
        workspaceId: input.workspaceId,
        phone: targetPhone,
        message: msg,
        idempotencyKey,
        customerMessages: input.customerMessages,
        settings: input.settings,
        quotedMessageId: latestQuotedMessageId,
        mirrorReplies:
          input.deliveryMode === "reactive" &&
          isRecentLiveConversation(input.customerMessages || []),
      });
      executionResponse = {
        channel: "FLOW_SEND_MESSAGE",
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
      status: "executed",
      reason: input.reason,
      latencyMs: Date.now() - started,
      intentConfidence: input.intentConfidence,
      meta: {
        usedHistory: input.usedHistory,
        usedKb: input.usedKb,
        audioMode: action === "SEND_AUDIO",
      },
    });
    autopilotDecisionCounter.inc({
      workspaceId: input.workspaceId,
      intent: input.intent || "UNKNOWN",
      action,
      result: "executed",
    });
    autopilotPipelineCounter.inc({
      workspaceId: input.workspaceId,
      stage: "reply",
      result: "sent",
    });
    await reportSmokeTest(input.smokeTestId, {
      status: "completed",
      mode: input.smokeMode || "live",
      workspaceId: input.workspaceId,
      contactId: input.contactId,
      phone: targetPhone,
      action,
      responseText: msg,
    });
    if (action === "GHOST_CLOSER" || action === "LEAD_UNLOCKER") {
      autopilotGhostCloserCounter.inc({
        workspaceId: input.workspaceId,
        action,
        result: "executed",
      });
    }
    sent = true;

    if (followupEligible) {
      await autopilotQueue.add(
        "followup-contact",
        {
          workspaceId: input.workspaceId,
          contactId: input.contactId,
          phone: targetPhone,
          reason: "buying_signal_followup",
          scheduledAt: new Date().toISOString(),
        },
        {
          delay: 45 * 60 * 1000,
          jobId: `followup-${input.contactId || targetPhone}-bs`,
          removeOnComplete: true,
        }
      );
    }
  } catch (err: any) {
    log.error("autopilot_send_error", { err: err.message });
    sendError = err?.message || "send_error";
    await logAutopilotAction({
      workspaceId: input.workspaceId,
      contactId: input.contactId,
      phone: targetPhone,
      action,
      intent: input.intent,
      status: "error",
      reason: err?.message || "send_error",
      intentConfidence: input.intentConfidence,
      meta: {
        usedHistory: input.usedHistory,
        usedKb: input.usedKb,
      },
    });
    autopilotDecisionCounter.inc({
      workspaceId: input.workspaceId,
      intent: input.intent || "UNKNOWN",
      action,
      result: "error",
    });
    autopilotPipelineCounter.inc({
      workspaceId: input.workspaceId,
      stage: "reply",
      result: "failed",
    });
    if (action === "GHOST_CLOSER" || action === "LEAD_UNLOCKER") {
      autopilotGhostCloserCounter.inc({
        workspaceId: input.workspaceId,
        action,
        result: "error",
      });
    }
  }

  if (!sent) {
    const settings = input.settings || {};

    if (channelEnabled(settings, "email") && contactEmail) {
      try {
        await sendEmail(contactEmail, "Follow-up automático", msg);
        logFallback("email", "sent");
        await persistFallbackMessage({
          workspaceId: input.workspaceId,
          contactId: input.contactId,
          channel: "EMAIL",
          content: msg,
        });
        executionResponse = {
          channel: "EMAIL_FALLBACK",
          message: msg,
        };
        await logAutopilotAction({
          workspaceId: input.workspaceId,
          contactId: input.contactId,
          phone: targetPhone,
          action: `${action}_EMAIL_FALLBACK`,
          intent: input.intent,
          status: "executed",
          reason: "email_fallback",
        });
        autopilotDecisionCounter.inc({
          workspaceId: input.workspaceId,
          intent: input.intent || "UNKNOWN",
          action: `${action}_EMAIL_FALLBACK`,
          result: "executed",
        });
        autopilotPipelineCounter.inc({
          workspaceId: input.workspaceId,
          stage: "reply",
          result: "sent_email_fallback",
        });
        await reportSmokeTest(input.smokeTestId, {
          status: "completed",
          mode: input.smokeMode || "live",
          workspaceId: input.workspaceId,
          contactId: input.contactId,
          phone: targetPhone,
          action: `${action}_EMAIL_FALLBACK`,
          responseText: msg,
        });
        sent = true;
      } catch (err: any) {
        logFallback("email", "error", err?.message);
      }
    }

    if (!sent && channelEnabled(settings, "telegram") && contactTelegramId) {
      try {
        await sendTelegram(contactTelegramId, msg);
        logFallback("telegram", "sent");
        await persistFallbackMessage({
          workspaceId: input.workspaceId,
          contactId: input.contactId,
          channel: "TELEGRAM",
          content: msg,
        });
        executionResponse = {
          channel: "TELEGRAM_FALLBACK",
          message: msg,
        };
        await logAutopilotAction({
          workspaceId: input.workspaceId,
          contactId: input.contactId,
          phone: targetPhone,
          action: `${action}_TELEGRAM_FALLBACK`,
          intent: input.intent,
          status: "executed",
          reason: "telegram_fallback",
        });
        autopilotDecisionCounter.inc({
          workspaceId: input.workspaceId,
          intent: input.intent || "UNKNOWN",
          action: `${action}_TELEGRAM_FALLBACK`,
          result: "executed",
        });
        autopilotPipelineCounter.inc({
          workspaceId: input.workspaceId,
          stage: "reply",
          result: "sent_telegram_fallback",
        });
        await reportSmokeTest(input.smokeTestId, {
          status: "completed",
          mode: input.smokeMode || "live",
          workspaceId: input.workspaceId,
          contactId: input.contactId,
          phone: targetPhone,
          action: `${action}_TELEGRAM_FALLBACK`,
          responseText: msg,
        });
        sent = true;
      } catch (err: any) {
        logFallback("telegram", "error", err?.message);
      }
    }
  }

  if (!sent) {
    await finishAutonomyExecution(execution.record?.id, "FAILED", {
      error: sendError || "autopilot_send_failed",
      response: executionResponse,
    });
    await reportSmokeTest(input.smokeTestId, {
      status: "failed",
      workspaceId: input.workspaceId,
      contactId: input.contactId,
      phone: targetPhone,
      action,
      error: sendError || "autopilot_send_failed",
    });
    throw new Error(sendError || "autopilot_send_failed");
  }

  await finishAutonomyExecution(execution.record?.id, "SUCCESS", {
    response: executionResponse,
  });

  await publishAgentEvent({
    type: "contact",
    workspaceId: input.workspaceId,
    runId: input.runId,
    phase: "message_sent",
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

  if (action === "SEND_OFFER") {
    const hotFlowId = input.settings?.autopilot?.hotFlowId;
    if (hotFlowId) {
      await flowQueue.add("run-flow", {
        workspaceId: input.workspaceId,
        flowId: hotFlowId,
        user: targetPhone,
        initialVars: { source: "autopilot_hot", lastMessage: input.messageContent || "" },
      });
    }
  }

  return "executed";
}

async function sendDirectAutopilotText(input: {
  workspaceId: string;
  contactId?: string;
  conversationId?: string;
  phone?: string;
  contactName?: string;
  text: string;
  settings?: any;
  intent?: string;
  reason?: string;
  workspaceRecord?: any;
  intentConfidence?: number;
  actionLabel?: string;
  usedHistory?: boolean;
  usedKb?: boolean;
  deliveryMode?: "reactive" | "proactive";
  smokeTestId?: string;
  smokeMode?: "dry-run" | "live";
  runId?: string;
  idempotencyContext?: Record<string, any>;
  customerMessages?: QuotedCustomerMessage[];
}) {
  const action = input.actionLabel || "UNIFIED_AGENT_TEXT";
  const message = String(input.text || "").trim();
  if (!message) return "skipped";

  let targetPhone = input.phone;
  let contactRecord: any = null;

  if (!targetPhone && input.contactId) {
    contactRecord = await prisma.contact.findUnique({
      where: { id: input.contactId },
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
    contactRecord = await prisma.contact.findUnique({
      where: { id: input.contactId },
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

  const displayName =
    input.contactName || contactRecord?.name || targetPhone || "contato";
  if (!targetPhone) return "skipped";
  const latestQuotedMessageId = await resolveLatestQuotedMessageId({
    workspaceId: input.workspaceId,
    contactId: input.contactId,
    conversationId: input.conversationId,
    phone: targetPhone,
    providerMessageIds: input.idempotencyContext?.providerMessageIds,
  });

  const compliance = await ensureCompliance(
    input.workspaceId,
    targetPhone,
    input.settings,
    contactRecord || undefined,
    input.deliveryMode || "proactive",
  );
  if (!compliance.allowed) {
    await logAutopilotAction({
      workspaceId: input.workspaceId,
      contactId: input.contactId,
      phone: targetPhone,
      action,
      intent: input.intent,
      status: "skipped",
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
      intent: input.intent || "UNKNOWN",
      action,
      result: "skipped_compliance",
    });
    autopilotPipelineCounter.inc({
      workspaceId: input.workspaceId,
      stage: "reply",
      result: "skipped_compliance",
    });
    await reportSmokeTest(input.smokeTestId, {
      status: "skipped",
      workspaceId: input.workspaceId,
      contactId: input.contactId,
      phone: targetPhone,
      action,
      reason: compliance.reason,
    });
    return "skipped";
  }

  const rate = await checkRateLimits(
    input.workspaceId,
    targetPhone,
    input.deliveryMode || "proactive",
  );
  if (!rate.allowed) {
    await logAutopilotAction({
      workspaceId: input.workspaceId,
      contactId: input.contactId,
      phone: targetPhone,
      action,
      intent: input.intent,
      status: "skipped",
      reason: rate.reason || "rate_limit",
      intentConfidence: input.intentConfidence,
      meta: {
        usedHistory: input.usedHistory,
        usedKb: input.usedKb,
      },
    });
    autopilotDecisionCounter.inc({
      workspaceId: input.workspaceId,
      intent: input.intent || "UNKNOWN",
      action,
      result: "rate_limited",
    });
    autopilotPipelineCounter.inc({
      workspaceId: input.workspaceId,
      stage: "reply",
      result: "rate_limited",
    });
    await reportSmokeTest(input.smokeTestId, {
      status: "skipped",
      workspaceId: input.workspaceId,
      contactId: input.contactId,
      phone: targetPhone,
      action,
      reason: rate.reason || "rate_limit",
    });
    return "skipped";
  }

  const canSend = await PlanLimitsProvider.checkMessageLimit(input.workspaceId);
  if (!canSend.allowed) {
    await logAutopilotAction({
      workspaceId: input.workspaceId,
      contactId: input.contactId,
      phone: targetPhone,
      action,
      intent: input.intent,
      status: "skipped",
      reason: canSend.reason || "plan_limit",
      intentConfidence: input.intentConfidence,
      meta: {
        usedHistory: input.usedHistory,
        usedKb: input.usedKb,
        mode: "direct_generated_response",
      },
    });
    autopilotPipelineCounter.inc({
      workspaceId: input.workspaceId,
      stage: "reply",
      result: "blocked_plan_limit",
    });
    await reportSmokeTest(input.smokeTestId, {
      status: "skipped",
      workspaceId: input.workspaceId,
      contactId: input.contactId,
      phone: targetPhone,
      action,
      reason: canSend.reason || "plan_limit",
    });
    return "skipped";
  }

  const idempotencyKey = buildAutonomyExecutionKey({
    workspaceId: input.workspaceId,
    actionType: action,
    contactId: input.contactId,
    conversationId: input.conversationId,
    phone: targetPhone,
    payload: {
      source: "direct_generated_response",
      message,
      intent: input.intent,
      reason: input.reason,
      deliveryMode: input.deliveryMode || "proactive",
      customerMessages: input.customerMessages || null,
      context: input.idempotencyContext || null,
    },
  });
  const execution = await beginAutonomyExecution({
    workspaceId: input.workspaceId,
    actionType: action,
    contactId: input.contactId,
    conversationId: input.conversationId,
    workItemId: input.idempotencyContext?.workItemId || null,
    proofId:
      input.idempotencyContext?.conversationProofId ||
      input.idempotencyContext?.accountProofId ||
      input.idempotencyContext?.cycleProofId ||
      null,
    capabilityCode: input.idempotencyContext?.capabilityCode || action,
    tacticCode: input.idempotencyContext?.conversationTactic || null,
    idempotencyKey,
    request: {
      phone: targetPhone,
      message,
      intent: input.intent,
      reason: input.reason,
      deliveryMode: input.deliveryMode || "proactive",
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
      status: "skipped",
      reason: execution.reason,
      intentConfidence: input.intentConfidence,
      meta: {
        duplicateExecution: true,
        idempotencyKey,
        mode: "direct_generated_response",
      },
    });
    autopilotPipelineCounter.inc({
      workspaceId: input.workspaceId,
      stage: "reply",
      result: "duplicate_execution",
    });
    await reportSmokeTest(input.smokeTestId, {
      status: "skipped",
      workspaceId: input.workspaceId,
      contactId: input.contactId,
      phone: targetPhone,
      action,
      reason: execution.reason,
    });
    return "skipped";
  }

  try {
    const started = Date.now();
    await publishAgentEvent({
      type: "typing",
      workspaceId: input.workspaceId,
      runId: input.runId,
      phase: "typing",
      message: `Digitando resposta para ${displayName}.`,
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
      },
    });
    const replyPlan = await dispatchAutonomousReplyPlan({
      workspaceId: input.workspaceId,
      phone: targetPhone,
      message,
      idempotencyKey,
      quotedMessageId: latestQuotedMessageId,
      customerMessages: input.customerMessages,
      settings: input.settings,
      mirrorReplies:
        input.deliveryMode === "reactive" &&
        isRecentLiveConversation(input.customerMessages || []),
    });
    const responseText = replyPlan.map((item) => item.text).join("\n");
    await logAutopilotAction({
      workspaceId: input.workspaceId,
      contactId: input.contactId,
      phone: targetPhone,
      action,
      intent: input.intent,
      status: "executed",
      reason: input.reason,
      latencyMs: Date.now() - started,
      intentConfidence: input.intentConfidence,
      meta: {
        usedHistory: input.usedHistory,
        usedKb: input.usedKb,
        mode: "direct_generated_response",
      },
    });
    autopilotDecisionCounter.inc({
      workspaceId: input.workspaceId,
      intent: input.intent || "UNKNOWN",
      action,
      result: "executed",
    });
    autopilotPipelineCounter.inc({
      workspaceId: input.workspaceId,
      stage: "reply",
      result: "sent",
    });
    await reportSmokeTest(input.smokeTestId, {
      status: "completed",
      mode: input.smokeMode || "live",
      workspaceId: input.workspaceId,
      contactId: input.contactId,
      phone: targetPhone,
      action,
      responseText,
    });
    await finishAutonomyExecution(execution.record?.id, "SUCCESS", {
      response: {
        channel: "FLOW_SEND_MESSAGE",
        message,
        replyPlan,
        mode: "direct_generated_response",
      },
    });
    await publishAgentEvent({
      type: "contact",
      workspaceId: input.workspaceId,
      runId: input.runId,
      phase: "message_sent",
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
        messagePreview: responseText.slice(0, 240),
        autonomyExecutionId: execution.record?.id || null,
      },
    });
    return "executed";
  } catch (err: any) {
    await finishAutonomyExecution(execution.record?.id, "FAILED", {
      error: err?.message || "send_error",
      response: {
        channel: "FLOW_SEND_MESSAGE",
        message,
        customerMessages: input.customerMessages || null,
        mode: "direct_generated_response",
      },
    });
    await logAutopilotAction({
      workspaceId: input.workspaceId,
      contactId: input.contactId,
      phone: targetPhone,
      action,
      intent: input.intent,
      status: "error",
      reason: err?.message || "send_error",
      intentConfidence: input.intentConfidence,
      meta: {
        usedHistory: input.usedHistory,
        usedKb: input.usedKb,
        mode: "direct_generated_response",
      },
    });
    autopilotDecisionCounter.inc({
      workspaceId: input.workspaceId,
      intent: input.intent || "UNKNOWN",
      action,
      result: "error",
    });
    autopilotPipelineCounter.inc({
      workspaceId: input.workspaceId,
      stage: "reply",
      result: "failed",
    });
    await reportSmokeTest(input.smokeTestId, {
      status: "failed",
      workspaceId: input.workspaceId,
      contactId: input.contactId,
      phone: targetPhone,
      action,
      error: err?.message || "direct_send_failed",
    });
    throw err;
  }
}

/**
 * Persiste mensagem de fallback (email/telegram) e notifica Inbox via Redis.
 */
async function persistFallbackMessage(params: {
  workspaceId: string;
  contactId?: string;
  channel: "EMAIL" | "TELEGRAM";
  content: string;
}) {
  const { workspaceId, contactId, channel, content } = params;
  if (!contactId) return;

  // Encontra ou cria conversa específica do canal
  let conversation = await prisma.conversation.findFirst({
    where: { workspaceId, contactId, channel },
    orderBy: { updatedAt: "desc" },
    select: { id: true },
  });

  if (!conversation) {
    conversation = await prisma.conversation.create({
      data: {
        workspaceId,
        contactId,
        channel,
        status: "OPEN",
        priority: "MEDIUM",
      },
      select: { id: true },
    });
  }

  const message = await prisma.message.create({
    data: {
      workspaceId,
      contactId,
      conversationId: conversation.id,
      direction: "OUTBOUND",
      type: "TEXT",
      content,
      status: "SENT",
    },
  });

  await prisma.conversation.update({
    where: { id: conversation.id },
    data: { lastMessageAt: new Date(), unreadCount: 0 },
  });

  // Notifica realtime (permitindo que Inbox exiba mensagem do canal)
  await redisPub.publish(
    "ws:inbox",
    JSON.stringify({
      type: "message:new",
      workspaceId,
      message,
    })
  );
  await redisPub.publish(
    "ws:inbox",
    JSON.stringify({
      type: "conversation:update",
      workspaceId,
      conversation: {
        id: conversation.id,
        lastMessageStatus: "SENT",
        lastMessageAt: message.createdAt,
      },
    })
  );
  await redisPub.publish(
    "ws:inbox",
    JSON.stringify({
      type: "message:status",
      workspaceId,
      payload: {
        id: message.id,
        conversationId: conversation.id,
        contactId,
        status: "SENT",
      },
    })
  );
}

async function buildMessage(action: string, content: string, settings: any) {
  const defaults: Record<string, string> = {
    SEND_OFFER: "Consigo uma condição especial se fecharmos hoje. Quer que eu envie agora?",
    SEND_PRICE: "Posso te passar os valores e opções agora. Prefere plano mensal ou anual?",
    FOLLOW_UP: "Só passando para garantir que você recebeu minha última mensagem. Posso ajudar em algo agora?",
    FOLLOW_UP_STRONG: "Eu reservei uma condição especial pra você hoje. Quer que eu finalize agora pra garantir?",
    GHOST_CLOSER: "Notei que quase fechamos e você sumiu. Quer que eu reserve agora a condição especial pra você?",
    LEAD_UNLOCKER: "Fiquei na dúvida se você ainda tem interesse. Posso te mandar algo que desbloqueie sua decisão?",
    SEND_CALENDAR: "Aqui está meu link de agenda para marcarmos rápido: https://cal.com/danielpenin (exemplo).",
    QUALIFY: "Para te ajudar melhor, qual é sua principal necessidade e prazo?",
    TRANSFER_AGENT: "Vou chamar um especialista humano para te atender em instantes.",
    ANTI_CHURN: "Quero garantir que você tenha resultado. Posso ajustar plano ou oferecer suporte extra pra você ficar 100%?",
    HANDLE_OBJECTION: "Entendo sua preocupação. Posso ajustar a proposta para encaixar melhor no que você precisa. Posso te mandar uma opção mais leve?",
  };
  const customTpl = (settings?.autopilot?.templates || {}) as Record<string, string>;

  switch (action) {
    case "SEND_OFFER":
      return await generatePitchSafe(content, settings);
    case "SEND_PRICE":
      return customTpl.SEND_PRICE || defaults.SEND_PRICE;
    case "SEND_CALENDAR":
      return customTpl.SEND_CALENDAR || defaults.SEND_CALENDAR;
    case "QUALIFY":
      return customTpl.QUALIFY || defaults.QUALIFY;
    case "FOLLOW_UP":
      return customTpl.FOLLOW_UP || defaults.FOLLOW_UP;
    case "FOLLOW_UP_STRONG":
      return customTpl.FOLLOW_UP_STRONG || defaults.FOLLOW_UP_STRONG;
    case "GHOST_CLOSER":
      return customTpl.GHOST_CLOSER || defaults.GHOST_CLOSER;
    case "LEAD_UNLOCKER":
      return customTpl.LEAD_UNLOCKER || defaults.LEAD_UNLOCKER;
    case "TRANSFER_AGENT":
      return customTpl.TRANSFER_AGENT || defaults.TRANSFER_AGENT;
    case "ANTI_CHURN":
      return customTpl.ANTI_CHURN || defaults.ANTI_CHURN;
    case "HANDLE_OBJECTION":
      return customTpl.HANDLE_OBJECTION || defaults.HANDLE_OBJECTION;
    case "SEND_AUDIO":
      // Para SEND_AUDIO, retornar o conteúdo que será convertido em áudio
      return content || customTpl.FOLLOW_UP || defaults.FOLLOW_UP;
    default:
      return null;
  }
}

async function ensureCompliance(
  workspaceId: string,
  phone: string,
  settings: any,
  contact?: {
    id?: string;
    optIn?: boolean;
    optedOutAt?: Date | string | null;
    customFields?: any;
    tags?: { name: string }[];
  },
  deliveryMode: "reactive" | "proactive" = "proactive",
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
    return { allowed: false, reason: "opted_out" as const };
  }

  if (deliveryMode === "reactive") {
    return { allowed: true as const };
  }

  const enforceOptIn =
    process.env.ENFORCE_OPTIN === "true" ||
    settings?.autopilot?.requireOptIn === true;
  const enforce24h = (process.env.AUTOPILOT_ENFORCE_24H ?? "true") === "true";

  if (enforceOptIn) {
    const tags = contact?.tags?.map((t) => t.name.toLowerCase()) || [];
    const cf: any = contact?.customFields || {};
    const hasOptIn =
      contact?.optIn === true ||
      tags.includes("optin_whatsapp") ||
      cf.optin === true ||
      cf.optin_whatsapp === true;
    if (!hasOptIn) {
      return { allowed: false, reason: "optin_required" as const };
    }
  }

  if (enforce24h) {
    const lastInbound = await prisma.message.findFirst({
      where: { workspaceId, contact: { phone }, direction: "INBOUND" },
      orderBy: { createdAt: "desc" },
      select: { createdAt: true },
    });
    const cutoff = Date.now() - 24 * 60 * 60 * 1000;
    if (!lastInbound || lastInbound.createdAt.getTime() < cutoff) {
      return { allowed: false, reason: "session_expired_24h" as const };
    }
  }

  return { allowed: true as const };
}

async function runFollowupContact(data: any) {
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
  const settings: any = workspace?.providerSettings || {};

  if (settings?.billingSuspended === true) {
    log.info("followup_skip_billing_suspended", { workspaceId });
    await notifyBillingSuspended(workspaceId);
    await logAutopilotAction({
      workspaceId,
      contactId,
      phone,
      action: "FOLLOWUP_CONTACT",
      intent: "FOLLOW_UP",
      status: "skipped",
      reason: "billing_suspended",
      meta: { source: "followup_contact" },
    });
    return "skipped";
  }

  if (!isAutonomousEnabled(settings)) {
    log.info("followup_skip_autopilot_disabled", { workspaceId });
    await logAutopilotAction({
      workspaceId,
      contactId,
      phone,
      action: "FOLLOWUP_CONTACT",
      intent: "FOLLOW_UP",
      status: "skipped",
      reason: "autopilot_disabled",
      meta: { source: "followup_contact" },
    });
    return "skipped";
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
      "followup-contact",
      {
        ...data,
        workspaceId,
        scheduledAt: data?.scheduledAt || new Date().toISOString(),
      },
      {
        delay: delayMs,
        jobId: `followup-${jobKey}-window`,
        removeOnComplete: true,
      }
    );

    await logAutopilotAction({
      workspaceId,
      contactId,
      phone,
      action: "FOLLOWUP_CONTACT",
      intent: "FOLLOW_UP",
      status: "skipped",
      reason: "outside_window_rescheduled",
      meta: {
        source: "followup_contact",
        localHour: nowHour,
        windowStart: WINDOW_START,
        windowEnd: WINDOW_END,
        delayMs,
      },
    });
    return "skipped";
  }

  // Encontra conversa aberta
  const conv = await prisma.conversation.findFirst({
    where: {
      workspaceId,
      status: "OPEN",
      ...(contactId ? { contactId } : phone ? { contact: { phone } } : {}),
    },
    include: {
      contact: { select: { id: true, phone: true } },
      messages: { orderBy: { createdAt: "desc" }, take: 1 },
    },
  });
  if (!conv || !conv.contact?.phone) return "skipped";
  if (conv.mode && conv.mode !== "AI") {
    await logAutopilotAction({
      workspaceId,
      contactId: conv.contact.id,
      phone: conv.contact.phone,
      action: "FOLLOWUP_CONTACT",
      intent: "FOLLOW_UP",
      status: "skipped",
      reason: "human_mode_lock",
      meta: {
        source: "followup_contact",
        conversationId: conv.id,
        conversationMode: conv.mode,
      },
    });
    return "skipped";
  }

  const lastMsg = conv.messages[0];
  if (!lastMsg) return "skipped";

  // Se houve resposta INBOUND após o agendamento, não enviar follow-up
  if (scheduledAt && lastMsg.direction === "INBOUND" && lastMsg.createdAt > scheduledAt) {
    log.info("followup_skip_inbound_received", { workspaceId, contactId: conv.contact.id });
    await logAutopilotAction({
      workspaceId,
      contactId: conv.contact.id,
      phone: conv.contact.phone,
      action: "FOLLOWUP_CONTACT",
      intent: "FOLLOW_UP",
      status: "skipped",
      reason: "inbound_after_schedule",
      meta: { source: "followup_contact" },
    });
    return "skipped";
  }

  const text = (lastMsg.content || "").toLowerCase();
  const buying = ["preco", "preço", "quanto", "valor", "pix", "boleto", "custa", "pag", "assin"].some((k) =>
    text.includes(k)
  );

  const action =
    data?.actionOverride || (buying ? "GHOST_CLOSER" : "LEAD_UNLOCKER");

  if (data?.messageOverride) {
    return sendDirectAutopilotText({
      workspaceId,
      contactId: conv.contact.id,
      conversationId: conv.id,
      phone: conv.contact.phone,
      text: String(data.messageOverride),
      settings,
      intent: buying ? "FOLLOW_UP_BUYING" : "REENGAGE",
      reason: data?.reason || "cia_followup_override",
      workspaceRecord: { providerSettings: settings },
      actionLabel: action,
      idempotencyContext: {
        source: "followup_override",
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
    messageContent: lastMsg.content || "",
    settings,
    intent: buying ? "FOLLOW_UP_BUYING" : "REENGAGE",
    reason: data?.reason || "buying_signal_followup",
    workspaceRecord: { providerSettings: settings },
    idempotencyContext: {
      source: "followup_contact",
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

function buildWorkspaceConfig(workspaceId: string, settings: any, record?: any) {
  const providerSettings = (record as any)?.providerSettings || {};
  const whatsappApiSession = {
    ...(providerSettings?.whatsappApiSession || {}),
    ...(settings?.whatsappApiSession || {}),
  };

  return {
    id: workspaceId,
    whatsappProvider: "whatsapp-api",
    jitterMin: (record as any)?.jitterMin,
    jitterMax: (record as any)?.jitterMax,
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
  deliveryMode: "reactive" | "proactive" = "proactive",
) {
  const bypassReactiveRateLimits =
    (process.env.AUTOPILOT_BYPASS_REACTIVE_RATELIMITS ?? "true") === "true";
  if (deliveryMode === "reactive" && bypassReactiveRateLimits) {
    return { allowed: true as const };
  }
  if (process.env.TEST_AUTOPILOT_SKIP_RATELIMIT === "1") {
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
    return { allowed: false, reason: "contact_daily_limit" as const };
  }
  if (wsCount > WORKSPACE_DAILY_LIMIT) {
    return { allowed: false, reason: "workspace_daily_limit" as const };
  }
  return { allowed: true as const };
}

async function logAutopilotAction(input: {
  workspaceId: string;
  contactId?: string;
  phone?: string;
  action: string;
  intent?: string;
  status: "executed" | "error" | "skipped";
  reason?: string;
  latencyMs?: number;
  intentConfidence?: number;
  meta?: Record<string, any>;
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
      ...((input.meta as any) || {}),
    };

    await prisma.auditLog.create({
      data: {
        workspaceId: input.workspaceId,
        action: "AUTOPILOT_ACTION",
        resource: "contact",
        resourceId: input.contactId,
        details,
      },
    });

    const client: any = prisma as any;
    if (client.autopilotEvent) {
      await client.autopilotEvent.create({
        data: {
          workspaceId: input.workspaceId,
          contactId: input.contactId,
          intent: input.intent || "UNKNOWN",
          action: input.action,
          status: input.status,
          reason: input.reason,
          messageSent: input.phone ? `to:${input.phone}` : undefined,
          latencyMs: input.latencyMs,
          meta: details,
        },
      });
    }
  } catch (err: any) {
    log.warn("autopilot_audit_error", { error: err.message });
  }
}

async function acquireCiaContactLock(contactId?: string, phone?: string) {
  const keyBase = contactId || phone;
  if (!keyBase) return null;

  const key = `cia:lock:${keyBase}`;
  try {
    const result = await (redis as any).set(
      key,
      "1",
      "EX",
      CIA_CONTACT_LOCK_TTL_SECONDS,
      "NX",
    );
    return result ? key : null;
  } catch {
    return key;
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

function mapOpportunityBucket(score: number): "LOW" | "MEDIUM" | "HIGH" {
  if (score >= 75) return "HIGH";
  if (score >= 45) return "MEDIUM";
  return "LOW";
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
  customFields?: Record<string, any> | null;
}) {
  const text = String(input.joinedText || "").toLowerCase();
  const customFields = (input.customFields || {}) as Record<string, any>;
  const customerStatus = String(
    customFields.customerStatus ||
      customFields.status ||
      customFields.stage ||
      "",
  ).toLowerCase();

  const purchased =
    input.optedOutAt ||
    customerStatus.includes("won") ||
    customerStatus.includes("cliente") ||
    customerStatus.includes("customer") ||
    /(já\s*comprei|ja\s*comprei|comprei|paguei|pagamento aprovado|pedido confirmado|assinatura ativa)/i.test(
      text,
    );

  if (purchased) {
    return {
      opportunityClass: "BOUGHT",
      score: 0,
      nextBestAction: "DO_NOT_CONTACT",
      reason: "already_converted_or_blocked",
    };
  }

  const waitingMoney =
    input.candidate.cluster === "PAYMENT" ||
    input.candidate.cognitiveState.paymentState === "PENDING" ||
    input.candidate.cognitiveState.paymentState === "READY_TO_PAY" ||
    /(pix|boleto|cart[aã]o|cartao|quando virar|assim que cair|me chama amanh[aã]|pagar|pagamento)/i.test(
      text,
    );

  const hotIntent =
    input.candidate.cluster === "HOT" ||
    ["HOT", "CHECKOUT"].includes(input.candidate.cognitiveState.stage) ||
    /(quero|vou comprar|como pago|manda o link|fecha comigo|posso pagar)/i.test(
      text,
    );

  const clientWaiting =
    input.candidate.pending ||
    input.candidate.unreadCount > 0 ||
    input.candidate.cognitiveState.nextBestAction === "RESPOND";

  const askedAndGhosted =
    !clientWaiting &&
    input.candidate.silenceMinutes >= 6 * 60 &&
    /(quanto|valor|pre[cç]o|funciona|tem como|me manda|link|produto|servi[cç]o)/i.test(
      text,
    );

  const warm =
    !askedAndGhosted &&
    (input.candidate.priority >= 55 ||
      input.candidate.silenceMinutes < 72 * 60 ||
      input.candidate.cognitiveState.trustScore >= 0.45);

  let opportunityClass = "COLD";
  if (waitingMoney) {
    opportunityClass = "WAITING_MONEY";
  } else if (hotIntent) {
    opportunityClass = "HIGH_INTENT";
  } else if (clientWaiting) {
    opportunityClass = "ASKED_AND_GHOSTED";
  } else if (warm) {
    opportunityClass = "WARM";
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
    opportunityClass === "WAITING_MONEY"
      ? Math.max(88, baseScore)
      : opportunityClass === "HIGH_INTENT"
        ? Math.max(78, baseScore)
        : opportunityClass === "ASKED_AND_GHOSTED"
          ? Math.max(62, baseScore)
          : opportunityClass === "WARM"
            ? Math.max(48, Math.min(74, baseScore))
            : Math.min(44, baseScore);

  return {
    opportunityClass,
    score,
    nextBestAction: input.candidate.suggestedAction || "FOLLOWUP_SOFT",
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
  const lastInbound = input.messages.find((message) => message.direction === "INBOUND");
  const lastOutbound = input.messages.find((message) => message.direction === "OUTBOUND");

  return [
    `Contato: ${input.contactName || input.phone || "sem_nome"}`,
    `Classe de oportunidade: ${input.opportunityClass}`,
    `Probabilidade estimada: ${input.score}%`,
    `Cluster CIA: ${input.candidate.cluster}`,
    `Próxima melhor ação: ${input.candidate.suggestedAction}`,
    `Silêncio: ${input.candidate.silenceMinutes} minuto(s)`,
    `Mensagens pendentes: ${input.candidate.unreadCount}`,
    `Resumo cognitivo: ${input.candidate.cognitiveState.summary}`,
    `Última inbound: ${String(lastInbound?.content || input.candidate.lastMessageText || "").slice(0, 280)}`,
    `Última outbound: ${String(lastOutbound?.content || "").slice(0, 280)}`,
  ]
    .filter(Boolean)
    .join("\n");
}

async function refreshOpportunityUniverse(workspaceId: string) {
  const throttleKey = `cia:opportunity-refresh:${workspaceId}`;
  const reserved = await redis.set(
    throttleKey,
    new Date().toISOString(),
    "EX",
    CIA_OPPORTUNITY_REFRESH_TTL_SECONDS,
    "NX",
  );
  if (reserved !== "OK") {
    return { refreshed: false as const, reason: "throttled" };
  }

  const cutoff = new Date(
    Date.now() - CIA_OPPORTUNITY_LOOKBACK_DAYS * 24 * 60 * 60 * 1000,
  );
  const conversations = await prisma.conversation.findMany({
    where: {
      workspaceId,
      lastMessageAt: { gte: cutoff },
      contactId: { not: null },
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
        orderBy: { createdAt: "desc" },
        take: 12,
        select: {
          direction: true,
          createdAt: true,
          content: true,
          externalId: true,
        },
      },
    },
    orderBy: { lastMessageAt: "desc" },
    take: CIA_OPPORTUNITY_REFRESH_LIMIT,
  });

  const seedState = buildCiaWorkspaceStateFromSeed({
    workspaceId,
    conversations: conversations.map((conversation: any) => {
      const lastInbound =
        conversation.messages.find((message: any) => message.direction === "INBOUND") ||
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
        lastMessageText: lastInbound?.content || "",
        leadScore: conversation.contact?.leadScore || 0,
        customFields: conversation.contact?.customFields || {},
      };
    }),
  });

  const conversationMap = new Map(
    conversations.map((conversation: any) => [conversation.id, conversation]),
  );
  const rankings: Array<Record<string, any>> = [];

  for (const candidate of seedState.candidates) {
    const conversation = conversationMap.get(candidate.conversationId);
    if (!conversation?.contact?.id) {
      continue;
    }

    const joinedText = (conversation.messages || [])
      .map((message: any) => String(message.content || ""))
      .join("\n");
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

    await prisma.contact.update({
      where: { id: conversation.contact.id },
      data: {
        purchaseProbability: mapOpportunityBucket(classification.score),
        nextBestAction: classification.nextBestAction,
      },
    }).catch(() => undefined);

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
          source: "cia_opportunity_refresh",
        },
        category: "compressed_context",
        type: "contact_context",
        content: compressedContext,
        metadata: {
          contactId: conversation.contact.id,
          phone: conversation.contact?.phone || null,
          opportunityClass: classification.opportunityClass,
          score: classification.score,
          source: "cia_opportunity_refresh",
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
          source: "cia_opportunity_refresh",
        },
        category: "compressed_context",
        type: "contact_context",
        content: compressedContext,
        metadata: {
          contactId: conversation.contact.id,
          phone: conversation.contact?.phone || null,
          opportunityClass: classification.opportunityClass,
          score: classification.score,
          source: "cia_opportunity_refresh",
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
        category: "opportunity_ranking",
        type: "contact_opportunity",
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
        category: "opportunity_ranking",
        type: "contact_opportunity",
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
  }

  const orderedRankings = rankings.sort((left, right) => right.score - left.score);
  await prisma.kloelMemory.upsert({
    where: {
      workspaceId_key: {
        workspaceId,
        key: "opportunity_universe:current",
      },
    },
    update: {
      value: {
        refreshedAt: new Date().toISOString(),
        lookbackDays: CIA_OPPORTUNITY_LOOKBACK_DAYS,
        totalContacts: orderedRankings.length,
        rankings: orderedRankings,
      },
      category: "opportunity_ranking",
      type: "workspace_opportunity_universe",
      content: `Universo de oportunidades atualizado com ${orderedRankings.length} contato(s).`,
      metadata: {
        totalContacts: orderedRankings.length,
        lookbackDays: CIA_OPPORTUNITY_LOOKBACK_DAYS,
      },
    },
    create: {
      workspaceId,
      key: "opportunity_universe:current",
      value: {
        refreshedAt: new Date().toISOString(),
        lookbackDays: CIA_OPPORTUNITY_LOOKBACK_DAYS,
        totalContacts: orderedRankings.length,
        rankings: orderedRankings,
      },
      category: "opportunity_ranking",
      type: "workspace_opportunity_universe",
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
  guaranteeReport: Record<string, any>;
  exhaustionReport: Record<string, any>;
}) {
  if (!prisma?.kloelMemory?.upsert) return null;

  const payload = {
    cycleProofId: input.cycleProofId,
    summary: input.summary,
    guaranteeReport: input.guaranteeReport,
    exhaustionReport: input.exhaustionReport,
    generatedAt: new Date().toISOString(),
  };

  return prisma.kloelMemory.upsert({
    where: {
      workspaceId_key: {
        workspaceId: input.workspaceId,
        key: "cia_cycle_proof:current",
      },
    },
    update: {
      value: payload,
      category: "cia_cycle_proof",
      type: input.exhaustionReport?.noLegalActions ? "no_legal_actions" : "dispatched",
      content: input.summary,
      metadata: {
        cycleProofId: input.cycleProofId,
        candidateCount: input.exhaustionReport?.details?.candidateCount || 0,
        selectedCount: input.exhaustionReport?.details?.selectedCount || 0,
        dispatchableCount: input.exhaustionReport?.dispatchableCount || 0,
        exhaustive: Boolean(input.exhaustionReport?.exhaustive),
        noLegalActions: Boolean(input.exhaustionReport?.noLegalActions),
      },
    },
    create: {
      workspaceId: input.workspaceId,
      key: "cia_cycle_proof:current",
      value: payload,
      category: "cia_cycle_proof",
      type: input.exhaustionReport?.noLegalActions ? "no_legal_actions" : "dispatched",
      content: input.summary,
      metadata: {
        cycleProofId: input.cycleProofId,
        candidateCount: input.exhaustionReport?.details?.candidateCount || 0,
        selectedCount: input.exhaustionReport?.details?.selectedCount || 0,
        dispatchableCount: input.exhaustionReport?.dispatchableCount || 0,
        exhaustive: Boolean(input.exhaustionReport?.exhaustive),
        noLegalActions: Boolean(input.exhaustionReport?.noLegalActions),
      },
    },
  });
}

async function listCanonicalWorkItems(workspaceId: string) {
  const client: any = prisma as any;
  if (!client?.agentWorkItem?.findMany) {
    return [];
  }

  return client.agentWorkItem.findMany({
    where: { workspaceId },
    orderBy: [{ priority: "desc" }, { updatedAt: "desc" }],
    take: 200,
  });
}

async function persistAccountProofSnapshot(input: {
  workspaceId: string;
  cycleProofId: string;
  summary: string;
  guaranteeReport: Record<string, any>;
  exhaustionReport: Record<string, any>;
  actions: Array<Record<string, any>>;
  workItemUniverse: Array<Record<string, any>>;
  tacticUniverse: Array<Record<string, any>>;
}) {
  const client: any = prisma as any;
  if (!client?.accountProofSnapshot?.create) {
    return null;
  }

  const classifications = Array.isArray(input.exhaustionReport?.details?.classifications)
    ? input.exhaustionReport.details.classifications
    : [];
  const blockedActions = classifications.filter(
    (item: any) => item?.disposition === "DEFERRED_BY_RULE",
  );
  const deferredActions = classifications.filter(
    (item: any) => item?.disposition === "DEFERRED_BY_CYCLE_BUDGET",
  );

  return client.accountProofSnapshot.create({
    data: {
      workspaceId: input.workspaceId,
      proofType: "CIA_CYCLE",
      status: input.exhaustionReport?.noLegalActions
        ? "NO_LEGAL_ACTIONS"
        : input.actions.length > 0
          ? "ACTIVE"
          : "IDLE",
      cycleProofId: input.cycleProofId,
      noLegalActions: Boolean(input.exhaustionReport?.noLegalActions),
      candidateCount: Number(input.exhaustionReport?.details?.candidateCount || 0),
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
  actionUniverse?: Array<Record<string, any>>;
  tacticUniverse?: Array<Record<string, any>>;
  selectedAction?: Record<string, any> | null;
}) {
  const client: any = prisma as any;
  if (!client?.conversationProofSnapshot?.create) {
    return null;
  }

  const selectedTacticData =
    (input.tacticUniverse || []).find(
      (item: any) => String(item?.tactic || "") === String(input.selectedTactic || ""),
    ) || null;

  return client.conversationProofSnapshot.create({
    data: {
      workspaceId: input.workspaceId,
      conversationId: input.conversationId,
      contactId: input.contactId || null,
      phone: input.phone || null,
      status: "PENDING_EXECUTION",
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
        createdBy: "runCiaAction",
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
    metadata?: Record<string, any> | null;
  },
) {
  if (!recordId) return null;
  const client: any = prisma as any;
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

  for (const workspace of workspaces) {
    const settings: any = workspace.providerSettings || {};
    if (settings?.billingSuspended === true) {
      continue;
    }
    if (!isCiaAutonomyMode(settings)) continue;
    await runCiaCycleWorkspace(workspace.id, settings);
  }
}

async function runCiaCycleWorkspace(workspaceId: string, presetSettings?: any) {
  const settings = presetSettings
    ? presetSettings
    : ((await prisma.workspace.findUnique({
        where: { id: workspaceId },
        select: { providerSettings: true },
      }))?.providerSettings as any);

  if (settings?.billingSuspended === true || !isCiaAutonomyMode(settings)) {
    return {
      queued: 0,
      reason: settings?.billingSuspended === true ? "billing_suspended" : "autopilot_disabled",
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
      reason: "outside_window",
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
    (error: any) => ({
      refreshed: false as const,
      reason: error?.message || "opportunity_refresh_failed",
    }),
  );

  const globalStrategy = await loadWorkspaceGlobalStrategy({
    settings,
    intentHint:
      state.clusters.PAYMENT.length > 0
        ? "payment_recovery"
        : state.candidates[0]?.cognitiveState?.intent ||
          state.candidates[0]?.suggestedAction ||
          "followup",
  });

  const learning = await computeLearningSnapshot(prisma, workspaceId);
  if (learning.totalLogs > 0) {
    await persistSystemInsight(prisma, {
      workspaceId,
      type: "CIA_SELF_IMPROVEMENT",
      title: "Ciclo de autoaprendizado atualizado",
      description:
        learning.topVariantKey
          ? `A melhor variante recente é ${learning.topVariantKey} com score ${learning.topVariantScore}.`
          : "Ainda estou coletando dados suficientes para refinar as variantes.",
      severity: learning.failedCount > learning.sentCount ? "WARNING" : "INFO",
      metadata: learning,
    });
  }

  const batch = planCiaActions(state, {
    maxActionsPerCycle: CIA_MAX_ACTIONS_PER_CYCLE,
    strategy: globalStrategy,
  });
  const guaranteeReport = buildCiaGuaranteeReport(
    state,
    batch,
    CIA_MAX_ACTIONS_PER_CYCLE,
  );
  const exhaustionReport = buildCiaExhaustionReport(
    state,
    batch,
    CIA_MAX_ACTIONS_PER_CYCLE,
    globalStrategy,
  );
  const cycleProofId = buildQueueJobId(
    "cia-cycle-proof",
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
  } catch (err: any) {
    await publishAgentEvent({
      type: "error",
      workspaceId,
      phase: "cia_contract_violation",
      persistent: true,
      message:
        "Detectei uma violação interna de contrato no ciclo CIA e bloqueei o despacho automático deste tick.",
      meta: {
        error: err?.message || "cia_contract_violation",
        guaranteeReport,
        exhaustionReport,
        cycleProofId,
        opportunityRefresh,
      },
    });
    await persistSystemInsight(prisma, {
      workspaceId,
      type: "CIA_CONTRACT_VIOLATION",
      title: "Ciclo CIA bloqueado por contrato interno",
      description:
        err?.message || "Uma garantia operacional obrigatória falhou no ciclo.",
      severity: "CRITICAL",
      metadata: {
        cycleProofId,
        guaranteeReport,
        exhaustionReport,
        opportunityRefresh,
      },
    });
    return {
      queued: 0,
      reason: "contract_violation",
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
    guaranteeReport,
    exhaustionReport,
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
    guaranteeReport,
    exhaustionReport,
    actions: batch.actions,
    workItemUniverse,
    tacticUniverse,
  });
  const accountProofId = accountProof?.id || null;

  await publishAgentEvent({
    type: "proof",
    workspaceId,
    phase: "cia_cycle_proof",
    persistent: true,
    message: exhaustionReport.noLegalActions
      ? "Prova do ciclo: exauri todas as ações legais e seguras do universo formal atual."
      : `Prova do ciclo: selecionei ${batch.actions.length} melhor(es) ação(ões) dentre ${state.candidates.length} candidato(s) do universo formal atual.`,
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

  if (!batch.actions.length) {
    await publishAgentEvent({
      type: "heartbeat",
      workspaceId,
      phase: "cia_idle",
      message:
        exhaustionReport.noLegalActions
          ? "Exauri todas as ações legais deste ciclo. Agora só volto a agir quando surgir trabalho novo ou alguma regra deixar de bloquear."
          : "Estou monitorando o WhatsApp e não encontrei uma ação segura para este ciclo.",
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
        type: "CIA_NO_LEGAL_ACTIONS",
        title: "Ciclo CIA sem ações legais disponíveis",
        description:
          "Todas as ações possíveis deste ciclo ficaram bloqueadas por regras explícitas ou timing operacional.",
        severity: "INFO",
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
      reason: "no_safe_actions",
      learning,
      guaranteeReport,
      exhaustionReport,
      cycleProofId,
      accountProofId,
      opportunityRefresh,
    };
  }

  await publishAgentEvent({
    type: "thought",
    workspaceId,
    phase: "cia_global_plan",
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

  for (const [index, action] of batch.actions.entries()) {
    await autopilotQueue.add(
      "cia-action",
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
          "cia-action",
          workspaceId,
          action.type,
          action.contactId || action.phone || action.conversationId,
          Date.now(),
          index,
        ),
        removeOnComplete: true,
      },
    );
  }

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

async function runCiaAction(data: any) {
  const workspaceId = data?.workspaceId;
  if (!workspaceId) return { outcome: "SKIPPED", reason: "missing_workspace" };

  const lockKey = await acquireCiaContactLock(data?.contactId, data?.phone);
  if (!lockKey) {
    await publishAgentEvent({
      type: "thought",
      workspaceId,
      phase: "cia_lock_skip",
      message: `Pulei ${data?.contactName || data?.phone || "um contato"} porque ele já está sendo processado.`,
      meta: {
        contactId: data?.contactId,
        phone: data?.phone,
      },
    });
    return { outcome: "SKIPPED", reason: "contact_locked" };
  }

  let outcome: "SENT" | "FAILED" | "SKIPPED" = "SKIPPED";
  let variant: Awaited<ReturnType<typeof pickVariant>> | null = null;
  let errorMessage: string | null = null;
  let renderedMessage: string | null = null;
  let conversationProofId: string | null = null;
  const workspace = await prisma.workspace.findUnique({
    where: { id: workspaceId },
    select: { providerSettings: true },
  });
  const settings: any = workspace?.providerSettings || {};

  try {
    await publishAgentEvent({
      type: "action",
      workspaceId,
      phase: "cia_best_action_selected",
      message: `Escolhi ${String(data?.type || "ACTION").toLowerCase()} para ${data?.contactName || data?.phone || "contato"} como a melhor próxima ação disponível neste tick.`,
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

    if (data?.type === "WAIT") {
      await publishAgentEvent({
        type: "status",
        workspaceId,
        phase: "cia_wait",
        message: `Segurei a ação com ${data?.contactName || data?.phone || "o contato"} até ter sinais melhores.`,
        meta: {
          contactId: data?.contactId,
          phone: data?.phone,
          cognition: data?.cognitiveState?.summary || null,
        },
      });
      outcome = "SKIPPED";
    } else if (data?.type === "ESCALATE_HUMAN") {
      const humanGate = await maybeEscalateToHumanControl({
        workspaceId,
        contactId: data?.contactId,
        contactName: data?.contactName,
        phone: data?.phone,
        decisionEnvelope: buildDecisionEnvelope({
          intent: data?.cognitiveState?.intent || "GENERAL_ASSISTANCE",
          action: "CIA_ESCALATE_HUMAN",
          confidence: data?.confidence || data?.cognitiveState?.classificationConfidence,
          messageContent: data?.lastMessageText || "",
          demandState:
            data?.demandState ||
            computeDemandState({
              lastMessageAt: new Date(),
              unreadCount: 0,
              leadScore: 0,
              lastMessageText: data?.lastMessageText || "",
            }),
          matchedProducts: [],
        }),
        messageContent: data?.lastMessageText || "",
        intent: data?.cognitiveState?.intent || "GENERAL_ASSISTANCE",
        action: "CIA_ESCALATE_HUMAN",
      });
      outcome = humanGate.blocked ? "SKIPPED" : "FAILED";
      if (!humanGate.blocked) {
        errorMessage = "cia_escalation_failed";
      }
    } else if (data?.type === "RESPOND") {
      await runScanContact({
        workspaceId,
        contactId: data?.contactId,
        phone: data?.phone,
        contactName: data?.contactName,
      });
      outcome = "SENT";
    } else {
      const actionType = String(data?.type || "");
      const family =
        actionType === "PAYMENT_RECOVERY"
          ? "payment_recovery"
          : actionType === "FOLLOWUP_SOFT" || actionType === "FOLLOWUP_URGENT"
            ? "followup"
            : null;

      let message = "";
      if (family) {
        variant = await pickVariant(prisma, workspaceId, family, data?.globalStrategy || null);
        message =
          actionType === "FOLLOWUP_URGENT"
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
        intent: data?.cognitiveState?.intent || "GENERAL_ASSISTANCE",
        reason: data?.reason || "cia_nba_execution",
        workspaceRecord: { providerSettings: settings },
        intentConfidence:
          data?.confidence || data?.cognitiveState?.classificationConfidence,
        actionLabel: actionType,
        usedHistory: true,
        usedKb: false,
        deliveryMode: "proactive",
        idempotencyContext: {
          source: "cia_action",
          action: actionType,
          capabilityCode: actionType,
          conversationTactic: data?.conversationTactic || null,
          conversationProofId,
          cycleGeneratedAt: data?.cycleGeneratedAt || null,
          cycleProofId: data?.cycleProofId || null,
          accountProofId: data?.accountProofId || null,
        },
      });
      outcome = result === "executed" ? "SENT" : "SKIPPED";

      if (variant && family) {
        await updateVariantOutcome(prisma, {
          workspaceId,
          family,
          variant,
          outcome,
        });
      }
    }
  } catch (err: any) {
    outcome = "FAILED";
    errorMessage = err?.message || "cia_action_failed";
  } finally {
    if (!conversationProofId && data?.conversationId) {
      const fallbackProof = await createConversationProofSnapshotDraft({
        workspaceId,
        conversationId: data?.conversationId,
        contactId: data?.contactId || null,
        phone: data?.phone || null,
        cycleProofId: data?.cycleProofId || null,
        accountProofId: data?.accountProofId || null,
        selectedActionType: String(data?.type || "CIA_ACTION"),
        selectedTactic: data?.conversationTactic || null,
        governor: data?.governor || null,
        renderedMessage: renderedMessage,
        actionUniverse: data?.conversationActionUniverse || [],
        tacticUniverse: data?.conversationTacticUniverse || [],
        selectedAction: {
          type: data?.type || "CIA_ACTION",
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
      status:
        outcome === "SENT"
          ? "EXECUTED"
          : outcome === "FAILED"
            ? "FAILED"
            : "SKIPPED",
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

    await publishAgentEvent({
      type: "proof",
      workspaceId,
      phase: "cia_conversation_proof",
      persistent: outcome !== "SENT",
      message:
        outcome === "SENT"
          ? `Prova registrada: executei ${String(data?.type || "ACTION").toLowerCase()} para ${data?.contactName || data?.phone || "contato"} e sincronizei a execução com a conversa ao vivo.`
          : outcome === "FAILED"
            ? `Prova registrada: a execução de ${String(data?.type || "ACTION").toLowerCase()} falhou para ${data?.contactName || data?.phone || "contato"}.`
            : `Prova registrada: a execução de ${String(data?.type || "ACTION").toLowerCase()} foi pulada para ${data?.contactName || data?.phone || "contato"}.`,
      meta: {
        contactId: data?.contactId,
        conversationId: data?.conversationId,
        phone: data?.phone,
        cycleProofId: data?.cycleProofId || null,
        accountProofId: data?.accountProofId || null,
        conversationProofId,
        capabilityCode: data?.type || "CIA_ACTION",
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
      intent: data?.type || "CIA_ACTION",
      message: renderedMessage || variant?.text || data?.lastMessageText || "",
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
      action: data?.type || "CIA_ACTION",
      outcome,
      reward: computeCognitiveRewardSignal(
        (data?.type || "WAIT") as CognitiveActionType,
        data?.cognitiveState || null,
      ),
      message:
        renderedMessage ||
        variant?.text ||
        data?.lastMessageText ||
        data?.cognitiveState?.summary ||
        "",
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

  if (outcome === "FAILED") {
    throw new Error(errorMessage || "cia_action_failed");
  }

  return { outcome };
}

async function runCiaSelfImproveAll() {
  const workspaces = await prisma.workspace.findMany({
    select: { id: true, providerSettings: true },
    take: 500,
  });

  for (const workspace of workspaces) {
    const settings: any = workspace.providerSettings || {};
    if (!isAutonomousEnabled(settings)) continue;
    await runCiaSelfImproveWorkspace(workspace.id);
  }
}

async function runCiaSelfImproveWorkspace(workspaceId: string) {
  const learning = await computeLearningSnapshot(prisma, workspaceId);
  if (!learning.totalLogs) {
    return learning;
  }

  await persistSystemInsight(prisma, {
    workspaceId,
    type: "CIA_SELF_IMPROVEMENT",
    title: "Aprendizado comercial atualizado",
    description:
      learning.topVariantKey
        ? `A variante ${learning.topVariantKey} lidera com score ${learning.topVariantScore}.`
        : "Ainda não há variante vencedora consolidada.",
    severity: learning.failedCount > learning.sentCount ? "WARNING" : "INFO",
    metadata: learning,
  });

  return learning;
}

async function runCiaGlobalLearningAll() {
  const workspaces = await prisma.workspace.findMany({
    select: { id: true, providerSettings: true },
    take: 500,
  });

  const enabledWorkspaces = workspaces.filter((workspace: any) =>
    isAutonomousEnabled(workspace.providerSettings || {}),
  );
  const signals: NonNullable<ReturnType<typeof anonymizeDecisionLog>>[] = [];

  for (const workspace of enabledWorkspaces) {
    const domain = inferWorkspaceDomain(workspace.providerSettings || {});
    const logs = await prisma.kloelMemory
      .findMany({
        where: {
          workspaceId: workspace.id,
          category: "decision_log",
        },
        orderBy: { createdAt: "desc" },
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
  }

  const patterns = computeGlobalPatterns(signals);
  await persistGlobalPatterns(redis, patterns);

  for (const workspace of enabledWorkspaces) {
    const domain = inferWorkspaceDomain(workspace.providerSettings || {});
    const topPattern = patterns.find((pattern) => pattern.domain === domain);
    if (!topPattern) continue;

    const strategy = buildGlobalStrategy({
      patterns,
      domain,
      intent: topPattern.intent,
    });

    await persistSystemInsight(prisma, {
      workspaceId: workspace.id,
      type: "CIA_GLOBAL_LEARNING",
      title: `Aprendizado coletivo ativo para ${domain}`,
      description: `Estou aplicando o padrão ${topPattern.intent} com ${topPattern.samples} sinais e agressividade ${strategy.aggressiveness.toLowerCase()}.`,
      severity: topPattern.samples >= 20 ? "INFO" : "WARNING",
      metadata: {
        domain,
        topPattern,
        strategy,
        signalsAnalyzed: signals.length,
        patternsAvailable: patterns.length,
      },
    });
  }

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
  for (const ws of workspaces) {
    const settings: any = ws.providerSettings || {};
    if (settings?.billingSuspended === true) {
      log.info("autopilot_cycle_skip_billing", { workspaceId: ws.id });
      await notifyBillingSuspended(ws.id);
      continue;
    }
    if (isCiaAutonomyMode(settings)) {
      log.info("autopilot_cycle_skip_cia_primary", { workspaceId: ws.id });
      continue;
    }
    if (!isAutonomousEnabled(settings)) continue;
    await runCycleWorkspace(ws.id, settings);
  }
}

async function runCycleWorkspace(workspaceId: string, presetSettings?: any) {
  const settings = presetSettings
    ? presetSettings
    : ((await prisma.workspace.findUnique({
        where: { id: workspaceId },
        select: { providerSettings: true },
      }))?.providerSettings as any);
  if (settings?.billingSuspended === true) {
    log.info("autopilot_cycle_skip_billing", { workspaceId });
    await notifyBillingSuspended(workspaceId);
    return;
  }
  if (!isAutonomousEnabled(settings)) return;

  const now = new Date();
  const nowHour = getWorkspaceLocalHour(settings, now);
  const withinWindow = isWithinWorkspaceWindow({
    settings,
    startHour: WINDOW_START,
    endHour: WINDOW_END,
    now,
  });
  if (!withinWindow) {
    log.info("autopilot_cycle_skipped_window", { workspaceId, nowHour, WINDOW_START, WINDOW_END });
    return;
  }

  const openBacklog = prisma.conversation.count
    ? await prisma.conversation
        .count({
          where: {
            workspaceId,
            status: { not: "CLOSED" },
            unreadCount: { gt: 0 },
          },
        })
        .catch(() => 0)
    : 0;

  const cutoff = new Date(Date.now() - SILENCE_HOURS * 3600000);
  const convs = await prisma.conversation.findMany({
    where: {
      workspaceId,
      status: "OPEN",
      lastMessageAt: { lt: cutoff },
      unreadCount: 0,
    },
    include: {
      contact: { select: { id: true, phone: true, name: true, leadScore: true, customFields: true, email: true } },
      messages: { orderBy: { createdAt: "desc" }, take: 5 },
    },
  });

  const limited = convs.slice(0, Math.max(1, CYCLE_LIMIT));
  const enriched = limited
    .map((conv) => {
      const lastInbound = conv.messages.find((m: any) => m.direction === "INBOUND");
      const lastMessage = conv.messages[0];
      const demandState = computeDemandState({
        lastMessageAt: conv.lastMessageAt,
        unreadCount: conv.unreadCount,
        leadScore: (conv.contact as any)?.leadScore || 0,
        lastMessageText: lastInbound?.content || lastMessage?.content || "",
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
    enriched.flatMap(({ conv }) => conv.messages.map((message: any) => message.content)),
  );
  const hotLeadCount = enriched.filter(
    (item) => item.demandState.lane === "HOT",
  ).length;
  const pendingPaymentCount = enriched.filter(({ lastInbound, lastMessage }) => {
    const text = String(lastInbound?.content || lastMessage?.content || "").toLowerCase();
    return [
      "pix",
      "boleto",
      "cartao",
      "cartão",
      "pagamento",
      "pagar",
      "vencimento",
      "cobran",
    ].some((keyword) => text.includes(keyword));
  }).length;
  const recentExecuted = await prisma.autopilotEvent.findMany({
    where: {
      workspaceId,
      status: "executed",
      createdAt: {
        gte: new Date(Date.now() - 24 * 60 * 60 * 1000),
      },
    },
    take: 50,
    orderBy: { createdAt: "desc" },
  }).catch(() => []);

  const approvedSalesCount = recentExecuted.filter((event: any) => event?.meta?.saleApproved === true).length;
  const approvedSalesAmount = recentExecuted
    .map((event: any) => Number(event?.meta?.amount || 0) || 0)
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
    type: "thought",
    workspaceId,
    phase: "mission_plan",
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
      type: "CIA_MARKET_SIGNAL",
      title: `Sinal dominante: ${marketSignals[0].normalizedKey}`,
      description: `Detectei ${marketSignals[0].frequency} ocorrências recentes de ${marketSignals[0].signalType.toLowerCase()}.`,
      severity: marketSignals[0].frequency >= 5 ? "WARNING" : "INFO",
      metadata: {
        signalType: marketSignals[0].signalType,
        normalizedKey: marketSignals[0].normalizedKey,
        frequency: marketSignals[0].frequency,
        examples: marketSignals[0].examples,
      },
    });
  }

  for (const { conv, lastInbound, lastMessage, demandState } of enriched) {
    if (conv.contact?.id) {
      await persistDemandState(prisma, {
        workspaceId,
        contactId: conv.contact.id,
        state: demandState,
        contactName: conv.contact.name || conv.contact.phone,
      });
    }

    if (demandState.strategy === "DROP" || demandState.strategy === "WAIT") {
      await logAutopilotAction({
        workspaceId,
        contactId: conv.contact?.id,
        phone: conv.contact?.phone,
        action: "CYCLE_SKIP",
        intent: "REENGAGE",
        status: "skipped",
        reason:
          demandState.strategy === "DROP"
            ? "attention_budget_drop"
            : "attention_budget_wait",
        meta: { demandState },
      });
      continue;
    }

    const text = (lastInbound?.content || lastMessage?.content || "").toLowerCase();
    const buying = ["preco", "preço", "quanto", "valor", "pix", "boleto", "custa", "pag", "assin"].some((k) =>
      text.includes(k)
    );
    const lastDate = lastMessage?.createdAt ? new Date(lastMessage.createdAt) : null;
    const ageHours = lastDate ? (Date.now() - lastDate.getTime()) / 3600000 : null;
    const action =
      demandState.strategy === "RECOVER_PAYMENT"
        ? "FOLLOW_UP_STRONG"
        : ageHours && ageHours > 72
          ? "ANTI_CHURN"
          : buying || demandState.strategy === "PUSH"
            ? "GHOST_CLOSER"
            : "LEAD_UNLOCKER";

    const decisionEnvelope = buildDecisionEnvelope({
      intent: buying ? "FOLLOW_UP_BUYING" : "REENGAGE",
      action,
      confidence:
        demandState.lane === "HOT"
          ? 0.88
          : demandState.lane === "WARM"
            ? 0.76
            : 0.62,
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
      intent: buying ? "FOLLOW_UP_BUYING" : "REENGAGE",
      action,
    });
    if (humanGate.blocked) {
      continue;
    }

    await executeAction(action, {
      workspaceId,
      contactId: conv.contact?.id,
      conversationId: conv.id,
      phone: conv.contact?.phone,
      messageContent: lastInbound?.content || conv.messages[0]?.content || "",
      settings,
      intent: buying ? "FOLLOW_UP_BUYING" : "REENGAGE",
      reason: "cycle_silence",
      intentConfidence: decisionEnvelope.confidence,
      usedHistory: true,
      usedKb: false,
      idempotencyContext: {
        source: "cycle_silence",
        lastInboundId: lastInbound?.id || null,
        lastInboundAt: lastInbound?.createdAt?.toISOString?.() || null,
        conversationId: conv.id,
      },
    });
  }
  log.info("autopilot_cycle_completed", { workspaceId, processed: limited.length });
}

/**
 * 🎙️ Envia resposta em áudio via ElevenLabs + WhatsApp
 * Gera o áudio em tempo real e envia como voice note
 */
async function sendAudioResponse(
  workspaceId: string,
  phone: string,
  text: string,
  settings: any,
  workspaceCfg: any,
  quotedMessageId?: string,
): Promise<boolean> {
  try {
    if (resolveVoiceProvider() !== "elevenlabs") {
      log.warn("audio_provider_not_supported_for_human_voice", {
        workspaceId,
        provider: resolveVoiceProvider(),
      });
      return false;
    }

    const apiKey = process.env.ELEVENLABS_API_KEY;
    if (!apiKey) {
      log.warn("elevenlabs_not_configured", { workspaceId });
      return false;
    }

    // Buscar voice profile do workspace (ou usar default)
    let voiceId = settings?.voice?.voiceId || settings?.autopilot?.voiceId || "21m00Tcm4TlvDq8ikWAM"; // Rachel default
    
    const voiceProfile = await prisma.voiceProfile.findFirst({
      where: { workspaceId },
      orderBy: { updatedAt: "desc" },
      select: { voiceId: true },
    });
    if (voiceProfile?.voiceId) {
      voiceId = voiceProfile.voiceId;
    }

    // Gerar áudio via ElevenLabs
    const elevenUrl = `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`;
    const response = await fetch(elevenUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "xi-api-key": apiKey,
      },
      body: JSON.stringify({
        text,
        model_id: "eleven_monolingual_v1",
        voice_settings: {
          stability: 0.5,
          similarity_boost: 0.75,
        },
      }),
    });

    if (!response.ok) {
      log.error("elevenlabs_api_error", { status: response.status, workspaceId });
      return false;
    }

    // Converter para buffer base64 para upload
    const arrayBuffer = await response.arrayBuffer();
    const audioBuffer = Buffer.from(arrayBuffer);
    const base64Audio = audioBuffer.toString("base64");

    // Upload para armazenamento (local ou CDN)
    const fs = await import("fs");
    const path = await import("path");
    
    // Diretório de uploads do backend (acessível via /uploads/)
    const uploadsDir = path.join(process.cwd(), "..", "backend", "uploads", "audio");
    if (!fs.existsSync(uploadsDir)) {
      fs.mkdirSync(uploadsDir, { recursive: true });
    }

    const fileName = `audio_${workspaceId}_${Date.now()}.mp3`;
    const filePath = path.join(uploadsDir, fileName);
    fs.writeFileSync(filePath, audioBuffer);

    // Montar URL pública
    const appUrl =
      process.env.APP_URL ||
      process.env.BACKEND_URL ||
      process.env.API_URL ||
      "";
    const cdnBase = process.env.CDN_BASE_URL || process.env.MEDIA_BASE_URL;
    
    // Prioridade: CDN > APP_URL > data URL fallback
    let audioUrl: string;
    if (cdnBase) {
      audioUrl = `${cdnBase}/audio/${fileName}`;
    } else if (appUrl) {
      audioUrl = `${appUrl}/uploads/audio/${fileName}`;
    } else {
      // Fallback para data URL (funciona mas não é ideal para arquivos grandes)
      audioUrl = `data:audio/mpeg;base64,${base64Audio}`;
    }

    // Enviar como áudio/voice note via WhatsAppEngine.sendMedia
    await WhatsAppEngine.sendMedia(workspaceCfg, phone, "audio", audioUrl, undefined, {
      quotedMessageId,
    });

    // Limpar arquivo após envio (opcional - manter para retry em caso de falha)
    // Para limpeza automática, implementar job de garbage collection
    setTimeout(() => {
      try {
        if (fs.existsSync(filePath)) {
          fs.unlinkSync(filePath);
        }
      } catch {}
    }, 60000); // Limpar após 1 minuto

    log.info("audio_response_sent", { workspaceId, phone, textLength: text.length, audioUrl: audioUrl.substring(0, 80) });
    return true;

  } catch (error: any) {
    log.error("send_audio_error", { error: error.message, workspaceId, phone });
    return false;
  }
}
