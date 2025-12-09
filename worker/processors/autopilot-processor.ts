import { Worker, Job } from "bullmq";
import { connection, flowQueue, autopilotQueue } from "../queue";
import { WorkerLogger } from "../logger";
import { prisma } from "../db";
import { AIProvider } from "../providers/ai-provider";
import { WhatsAppEngine } from "../providers/whatsapp-engine";
import { autopilotDecisionCounter, autopilotGhostCloserCounter } from "../metrics";
import { PlanLimitsProvider } from "../providers/plan-limits";
import { channelEnabled, logFallback, sendEmail, sendTelegram } from "../providers/channel-dispatcher";
import { redisPub } from "../redis-client";
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

      // Default: scan-message
      const { workspaceId, contactId, messageContent, phone } = job.data;
      log.info("autopilot_scan", { workspaceId, contactId, phone });

      // 1. Check if Autopilot is enabled for this workspace
      const workspace = await prisma.workspace.findUnique({ where: { id: workspaceId } });
      const settings: any = workspace?.providerSettings;
      if (!settings?.autopilot?.enabled) {
          autopilotDecisionCounter.inc({ workspaceId, intent: "DISABLED", action: "NONE", result: "skipped" });
          return; // Disabled
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
        return;
      }

      // 2. Check if we should use Unified Agent (advanced AI with tool calling)
      const contact = contactId
        ? await prisma.contact.findUnique({
            where: { id: contactId },
            select: { leadScore: true },
          })
        : null;

      const useUnifiedAgent = shouldUseUnifiedAgent({
        messageContent,
        leadScore: contact?.leadScore,
        settings,
      });

      let decision: AutopilotDecision;
      let unifiedAgentResponse: string | null = null;

      if (useUnifiedAgent) {
        log.info("autopilot_using_unified_agent", { workspaceId, contactId });

        const unifiedResult = await processWithUnifiedAgent({
          workspaceId,
          contactId,
          phone,
          message: messageContent,
          context: { source: "autopilot_worker" },
        });

        if (unifiedResult) {
          // Mapear resultado do Unified Agent para formato legado
          decision = mapUnifiedActionsToAutopilot(unifiedResult.actions);
          unifiedAgentResponse = extractTextResponse(unifiedResult);

          log.info("autopilot_unified_decision", {
            decision,
            hasResponse: !!unifiedAgentResponse,
          });

          // Se o Unified Agent já executou as ações, não precisamos executar novamente
          if (decision.alreadyExecuted && unifiedAgentResponse) {
            autopilotDecisionCounter.inc({
              workspaceId,
              intent: decision.intent,
              action: "UNIFIED_AGENT",
              result: "success",
            });
            return;
          }
        } else {
          // Fallback para o método tradicional
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
        // 2. Decide Action (lightweight, resilient)
        decision = await decideActionSafe({
          workspaceId,
          contactId,
          phone,
          messageContent,
          settings,
        });
      }

      log.info("autopilot_decision", { decision });

      // 3. Execute Action
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
        usedHistory: decision.usedHistory,
        usedKb: decision.usedKb,
      });

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
  const compliance = await ensureCompliance(input.workspaceId, targetPhone, input.settings, contactRecord);
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
    return;
  }

  // Guardrails: throttle per contato e por workspace (24h janela)
  const rate = await checkRateLimits(input.workspaceId, targetPhone);
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
  if (!canSend.allowed) return;

  const msg = await buildMessage(action, input.messageContent || "", input.settings);
  if (!msg) return;

  let sent = false;
  const followupEligible = action === "SEND_OFFER" || action === "GHOST_CLOSER";
  try {
    const started = Date.now();
    const workspaceCfg = buildWorkspaceConfig(
      input.workspaceId,
      input.settings,
      input.workspaceRecord
    );
    await WhatsAppEngine.sendText(workspaceCfg, targetPhone, msg);
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
      },
    });
    autopilotDecisionCounter.inc({
      workspaceId: input.workspaceId,
      intent: input.intent || "UNKNOWN",
      action,
      result: "executed",
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
        sent = true;
      } catch (err: any) {
        logFallback("telegram", "error", err?.message);
      }
    }
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
    default:
      return null;
  }
}

async function ensureCompliance(
  workspaceId: string,
  phone: string,
  settings: any,
  contact?: { id?: string; customFields?: any; tags?: { name: string }[] }
) {
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

function tryDecrypt(value?: string | null) {
  if (!value) return value;
  if (!value.startsWith("enc:")) return value;
  const secret = process.env.PROVIDER_SECRET_KEY;
  if (!secret) return value;
  try {
    const [_, ivB64, tagB64, dataB64] = value.split(":");
    const crypto = require("crypto");
    const key = crypto.createHash("sha256").update(secret).digest();
    const decipher = crypto.createDecipheriv(
      "aes-256-gcm",
      key,
      Buffer.from(ivB64, "base64")
    );
    decipher.setAuthTag(Buffer.from(tagB64, "base64"));
    const decrypted = Buffer.concat([
      decipher.update(Buffer.from(dataB64, "base64")),
      decipher.final(),
    ]).toString("utf8");
    return decrypted;
  } catch {
    return value;
  }
}

function buildWorkspaceConfig(workspaceId: string, settings: any, record?: any) {
  const providerSettings = settings || (record as any)?.providerSettings || {};
  return {
    id: workspaceId,
    whatsappProvider: providerSettings.whatsappProvider || "auto",
    meta: providerSettings.meta
      ? { ...providerSettings.meta, token: tryDecrypt(providerSettings.meta.token) }
      : { token: undefined, phoneId: undefined },
    wpp: providerSettings.wpp || {},
    evolution: providerSettings.evolution
      ? { ...providerSettings.evolution, apiKey: tryDecrypt(providerSettings.evolution.apiKey) }
      : {},
    ultrawa: providerSettings.ultrawa
      ? { ...providerSettings.ultrawa, apiKey: tryDecrypt(providerSettings.ultrawa.apiKey) }
      : {},
    jitterMin: (record as any)?.jitterMin,
    jitterMax: (record as any)?.jitterMax,
  };
}

async function checkRateLimits(workspaceId: string, phone: string) {
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
    if (!settings?.autopilot?.enabled) continue;
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
  if (!settings?.autopilot?.enabled) return;

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
