import { Worker, Job } from "bullmq";
import { connection, flowQueue, autopilotQueue, voiceQueue } from "../queue";
import { WorkerLogger } from "../logger";
import { prisma } from "../db";
import { AIProvider } from "../providers/ai-provider";
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

const log = new WorkerLogger("autopilot");
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

export const autopilotWorker = new Worker(
  "autopilot-jobs",
  async (job: Job) => {
    try {
      if (job.name === "cycle-all") {
        return await runCycleAll();
      }

      if (job.name === "cycle-workspace") {
        const workspaceId = job.data?.workspaceId;
        if (workspaceId) {
          return await runCycleWorkspace(workspaceId);
        }
        return;
      }

      if (job.name === "followup-contact") {
        return await runFollowupContact(job.data);
      }

      if (job.name === "scan-contact") {
        return await runScanContact(job.data);
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
  { connection, concurrency: 10 }
);

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
    const kbContext = await getKbContext(workspaceId, messageContent, apiKey);
    const historyText = history
      .map((m) => `${m.direction === "INBOUND" ? "User" : "Agent"}: ${m.content}`)
      .join("\n");

    const systemPrompt = `Você é o Autopilot de vendas. Classifique intenção e ação para WhatsApp.
Retorne JSON com: intent (BUYING|SCHEDULING|SUPPORT|OBJECTION|CHURN_RISK|UPSELL|FOLLOW_UP|IDLE), action (SEND_OFFER|SEND_PRICE|SEND_CALENDAR|HANDLE_OBJECTION|TRANSFER_AGENT|FOLLOW_UP|FOLLOW_UP_STRONG|ANTI_CHURN|QUALIFY|NONE), confidence (0-1), reason.`;

    const userMessage = `Mensagem atual: "${messageContent}"
Histórico recente (mais novo por último):
${historyText || "sem histórico"}

Contexto da base de conhecimento:
${kbContext || "n/d"}

Responda somente o JSON.`;

    const response = await ai.generateResponse(systemPrompt, userMessage, "gpt-4o-mini");
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
  const sessionStatus = String(settings?.whatsappApiSession?.status || "").toLowerCase();
  return (
    settings?.autopilot?.enabled === true ||
    sessionStatus === "connected" ||
    sessionStatus === "working"
  );
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
        select: { id: true, phone: true, leadScore: true },
      })
    : null;

  if (!contact && phone) {
    contact = await prisma.contact.findFirst({
      where: { workspaceId, phone },
      select: { id: true, phone: true, leadScore: true },
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
    leadScore: contact?.leadScore,
    messageContent: aggregatedMessage,
    messageCount: effectiveMessages.length,
    messageIds: effectiveMessages
      .map((message: any) => message.id)
      .filter(Boolean),
  };
}

export async function runScanContact(data: any) {
  const { workspaceId } = data || {};
  if (!workspaceId) return;
  const smokeTestId = data?.smokeTestId as string | undefined;
  const smokeMode = data?.smokeMode === "live" ? "live" : "dry-run";

  const workspace = await prisma.workspace.findUnique({ where: { id: workspaceId } });
  const settings: any = workspace?.providerSettings;
  const aggregated = await buildPendingMessageBatch({
    workspaceId,
    contactId: data?.contactId,
    phone: data?.phone,
    fallbackMessageContent: data?.messageContent,
  });

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
    return;
  }

  const { contactId, phone, leadScore, messageContent, messageCount, messageIds } = aggregated;
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
    return;
  }

  const productMatches = await findWorkspaceProductMatches(
    workspaceId,
    messageContent,
  );
  const useUnifiedAgent =
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
        return;
      }

      if (unifiedAgentResponse && decision.action === "NONE") {
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
          return;
        }

        await sendDirectAutopilotText({
          workspaceId,
          contactId,
          phone,
          text: unifiedAgentResponse,
          settings,
          intent: decision.intent,
          reason: decision.reason,
          workspaceRecord: workspace,
          intentConfidence: decision.confidence,
          actionLabel: "UNIFIED_AGENT_TEXT",
          usedHistory: true,
          usedKb: productMatches.length > 0,
          deliveryMode: "reactive",
          smokeTestId,
          smokeMode,
        });
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
    const fallbackText = await generateAutonomousFallbackResponse({
      workspaceId,
      messageContent,
      settings,
      matchedProducts: productMatches,
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
      return;
    }

    await sendDirectAutopilotText({
      workspaceId,
      contactId,
      phone,
      text: fallbackText,
      settings,
      intent: decision.intent || "GENERAL_ASSISTANCE",
      reason: decision.reason || "autonomous_fallback",
      workspaceRecord: workspace,
      intentConfidence: decision.confidence,
      actionLabel: "AUTONOMOUS_FALLBACK",
      usedHistory: true,
      usedKb: productMatches.length > 0 || decision.usedKb,
      deliveryMode: "reactive",
      smokeTestId,
      smokeMode,
    });
    return;
  }

  await executeAction(decision.action, {
    workspaceId,
    contactId,
    phone,
    messageContent,
    settings,
    intent: decision.intent,
    reason: decision.reason,
    workspaceRecord: workspace,
    intentConfidence: decision.confidence,
    usedHistory: true,
    usedKb: productMatches.length > 0 || decision.usedKb,
    deliveryMode: "reactive",
    smokeTestId,
    smokeMode,
  });
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
}) {
  const { workspaceId, messageContent, settings, matchedProducts = [] } = params;
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
      return `Sou o Kloel, a inteligência comercial da ${workspaceName}. Posso te ajudar com ${matchedProducts.join(", ")}. Me diga o que você quer saber e eu te explico em detalhes.`;
    }

    return `Sou o Kloel, a inteligência de atendimento da ${workspaceName}. Posso te ajudar com sua dúvida e continuar a conversa por aqui.`;
  }

  try {
    const ai = new AIProvider(apiKey);
    const systemPrompt = `Você é Kloel, a inteligência comercial autônoma da ${workspaceName}.
Responda sempre.
Se houver contexto comercial relevante, use-o para ajudar, vender e conduzir a conversa.
Se não houver produtos ou dados suficientes, responda como uma IA útil, natural e humanizada.
Nunca fique em silêncio.
Fale em português do Brasil e seja direto.`;

    const userPrompt = `Mensagem do cliente:
${messageContent}

Produtos cadastrados:
${productSummary}

Produtos detectados nesta conversa:
${matchedProducts.length ? matchedProducts.join(", ") : "nenhum"}

Responda com uma única mensagem pronta para enviar no WhatsApp.`;

    const response = await ai.generateResponse(
      systemPrompt,
      userPrompt,
      "gpt-4o-mini",
    );

    return String(response || "").trim();
  } catch (err: any) {
    log.warn("autopilot_generic_fallback_ai_error", {
      workspaceId,
      error: err?.message,
    });
    return matchedProducts.length > 0
      ? `Sou o Kloel, a inteligência comercial da ${workspaceName}. Posso te ajudar com ${matchedProducts.join(", ")} e te explicar os próximos passos.`
      : `Sou o Kloel, a inteligência de atendimento da ${workspaceName}. Posso te ajudar por aqui com o que você precisar.`;
  }
}

async function executeAction(
  action: string,
  input: {
    workspaceId: string;
    contactId?: string;
    phone?: string;
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
  }
) {
  if (!action || action === "NONE") return;

  let contactEmail: string | undefined;
  let contactTelegramId: string | undefined;
  let contactRecord: any;

  let targetPhone = input.phone;
  if (!targetPhone && input.contactId) {
    const contact = await prisma.contact.findUnique({
      where: { id: input.contactId },
      select: { phone: true, email: true, customFields: true, id: true, workspaceId: true, tags: { select: { name: true } } },
    });
    contactRecord = contact;
    targetPhone = contact?.phone || input.contactId;
    contactEmail = contact?.email || undefined;
    const cf: any = contact?.customFields || {};
    contactTelegramId = cf.telegramChatId || cf.telegram || undefined;
  }
  if (!targetPhone) return;
  if (!contactEmail && input.workspaceId) {
    // Tentativa de localizar por phone se contactId não veio
    const byPhone = await prisma.contact.findFirst({
      where: { workspaceId: input.workspaceId, phone: targetPhone },
      select: { id: true, email: true, customFields: true, workspaceId: true, tags: { select: { name: true } } },
    });
    if (byPhone) {
      contactRecord = byPhone;
      contactEmail = byPhone.email || undefined;
      const cf: any = byPhone.customFields || {};
      contactTelegramId = cf.telegramChatId || cf.telegram || undefined;
      input.contactId = input.contactId || byPhone.id;
    }
  }

  // Compliance: opt-in e janela 24h
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
    return;
  }

  // Guardrails: throttle per contato e por workspace (24h janela)
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
    return;
  }

  // Respeita limites de plano antes de enviar
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
    return;
  }

  const msg = await buildMessage(action, input.messageContent || "", input.settings);
  if (!msg) return;

  let sent = false;
  let sendError: string | undefined;
  const followupEligible = action === "SEND_OFFER" || action === "GHOST_CLOSER";
  try {
    const started = Date.now();
    const workspaceCfg = buildWorkspaceConfig(
      input.workspaceId,
      input.settings,
      input.workspaceRecord
    );

    // SEND_AUDIO: Gera áudio via ElevenLabs e envia como voice note
    if (action === "SEND_AUDIO") {
      const audioSent = await sendAudioResponse(input.workspaceId, targetPhone, msg, input.settings, workspaceCfg);
      if (!audioSent) {
        // Fallback para texto se áudio falhar
        await WhatsAppEngine.sendText(workspaceCfg, targetPhone, msg);
      }
    } else {
      await WhatsAppEngine.sendText(workspaceCfg, targetPhone, msg);
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

    // Agenda follow-up de buying signal se não houver resposta futura
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
          delay: 45 * 60 * 1000, // 45 minutos
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

  // Fallbacks omnicanais (email/telegram)
  if (!sent) {
    const settings = input.settings || {};

    // Email
    if (channelEnabled(settings, "email") && contactEmail) {
      try {
        await sendEmail(
          contactEmail,
          "Follow-up automático",
          msg
        );
        logFallback("email", "sent");
        await persistFallbackMessage({
          workspaceId: input.workspaceId,
          contactId: input.contactId,
          channel: "EMAIL",
          content: msg,
        });
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

    // Telegram (opcional se chatId disponível)
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

  // Hot Flow: se configurado, dispare um fluxo "quente" quando enviamos oferta
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
}

async function sendDirectAutopilotText(input: {
  workspaceId: string;
  contactId?: string;
  phone?: string;
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
}) {
  const action = input.actionLabel || "UNIFIED_AGENT_TEXT";
  const message = String(input.text || "").trim();
  if (!message) return;

  let targetPhone = input.phone;
  let contactRecord: any = null;

  if (!targetPhone && input.contactId) {
    contactRecord = await prisma.contact.findUnique({
      where: { id: input.contactId },
      select: { id: true, phone: true, customFields: true, tags: { select: { name: true } } },
    });
    targetPhone = contactRecord?.phone;
  }

  if (!contactRecord && input.contactId) {
    contactRecord = await prisma.contact.findUnique({
      where: { id: input.contactId },
      select: { id: true, phone: true, customFields: true, tags: { select: { name: true } } },
    });
  }

  if (!targetPhone) return;

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
    return;
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
    return;
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
    return;
  }

  const workspaceCfg = buildWorkspaceConfig(
    input.workspaceId,
    input.settings,
    input.workspaceRecord,
  );

  try {
    const started = Date.now();
    await WhatsAppEngine.sendText(workspaceCfg, targetPhone, message);
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
      responseText: message,
    });
  } catch (err: any) {
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
  contact?: { id?: string; customFields?: any; tags?: { name: string }[] },
  deliveryMode: "reactive" | "proactive" = "proactive",
) {
  const bypassReactiveCompliance =
    (process.env.AUTOPILOT_BYPASS_REACTIVE_COMPLIANCE ?? "true") === "true";
  if (deliveryMode === "reactive" && bypassReactiveCompliance) {
    return { allowed: true as const };
  }

  const enforceOptIn = process.env.ENFORCE_OPTIN === "true" || settings?.autopilot?.requireOptIn === true;
  const enforce24h = (process.env.AUTOPILOT_ENFORCE_24H ?? "true") === "true";
  if (!contact) {
    contact = await prisma.contact.findFirst({
      where: { workspaceId, phone },
      select: { id: true, customFields: true, tags: { select: { name: true } } },
    });
  }

  if (enforceOptIn) {
    const tags = contact?.tags?.map((t) => t.name.toLowerCase()) || [];
    const cf: any = contact?.customFields || {};
    const hasOptIn = tags.includes("optin_whatsapp") || cf.optin === true || cf.optin_whatsapp === true;
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
    return;
  }

  if (!settings?.autopilot?.enabled) {
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
    return;
  }

  const now = new Date();
  const nowHour = now.getHours();
  const withinWindow =
    WINDOW_START <= WINDOW_END
      ? nowHour >= WINDOW_START && nowHour < WINDOW_END
      : nowHour >= WINDOW_START || nowHour < WINDOW_END;

  if (!withinWindow) {
    const next = new Date(now);
    next.setHours(WINDOW_START, 0, 0, 0);
    if (next.getTime() <= now.getTime()) {
      next.setDate(next.getDate() + 1);
    }
    const delayMs = Math.max(1, next.getTime() - now.getTime());

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
      meta: { nextAttemptAt: next.toISOString(), source: "followup_contact" },
    });
    return;
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
  if (!conv || !conv.contact?.phone) return;

  const lastMsg = conv.messages[0];
  if (!lastMsg) return;

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
    return;
  }

  const text = (lastMsg.content || "").toLowerCase();
  const buying = ["preco", "preço", "quanto", "valor", "pix", "boleto", "custa", "pag", "assin"].some((k) =>
    text.includes(k)
  );

  const action = buying ? "GHOST_CLOSER" : "LEAD_UNLOCKER";

  await executeAction(action, {
    workspaceId,
    contactId: conv.contact.id,
    phone: conv.contact.phone,
    messageContent: lastMsg.content || "",
    settings,
    intent: buying ? "FOLLOW_UP_BUYING" : "REENGAGE",
    reason: "buying_signal_followup",
    workspaceRecord: { providerSettings: settings },
  });
}

export { runFollowupContact };

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

  const nowHour = new Date().getHours();
  const withinWindow =
    WINDOW_START <= WINDOW_END
      ? nowHour >= WINDOW_START && nowHour < WINDOW_END
      : nowHour >= WINDOW_START || nowHour < WINDOW_END; // window across midnight
  if (!withinWindow) {
    log.info("autopilot_cycle_skipped_window", { workspaceId, nowHour, WINDOW_START, WINDOW_END });
    return;
  }

  const cutoff = new Date(Date.now() - SILENCE_HOURS * 3600000);
  const convs = await prisma.conversation.findMany({
    where: {
      workspaceId,
      status: "OPEN",
      lastMessageAt: { lt: cutoff },
      unreadCount: 0,
    },
    include: {
      contact: { select: { id: true, phone: true, customFields: true, email: true } },
      messages: { orderBy: { createdAt: "desc" }, take: 5 },
    },
  });

  const limited = convs.slice(0, Math.max(1, CYCLE_LIMIT));

  for (const conv of limited) {
    const lastInbound = conv.messages.find((m: any) => m.direction === "INBOUND");
    const text = (lastInbound?.content || conv.messages[0]?.content || "").toLowerCase();
    const buying = ["preco", "preço", "quanto", "valor", "pix", "boleto", "custa", "pag", "assin"].some((k) =>
      text.includes(k)
    );
    const lastDate = conv.messages[0]?.createdAt ? new Date(conv.messages[0].createdAt) : null;
    const ageHours = lastDate ? (Date.now() - lastDate.getTime()) / 3600000 : null;
    const action = ageHours && ageHours > 72 ? "ANTI_CHURN" : buying ? "GHOST_CLOSER" : "LEAD_UNLOCKER";

    await executeAction(action, {
      workspaceId,
      contactId: conv.contact?.id,
      phone: conv.contact?.phone,
      messageContent: lastInbound?.content || conv.messages[0]?.content || "",
      settings,
      intent: buying ? "FOLLOW_UP_BUYING" : "REENGAGE",
      reason: "cycle_silence",
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
  workspaceCfg: any
): Promise<boolean> {
  try {
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
    await WhatsAppEngine.sendMedia(workspaceCfg, phone, "audio", audioUrl);

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
