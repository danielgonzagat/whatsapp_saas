import { Worker, Job } from "bullmq";
import { connection, autopilotQueue } from "./queue";
import { FlowEngineGlobal } from "./flow-engine-global";
import { WorkerLogger } from "./logger";
import { jobCounter, jobDuration, autopilotDecisionCounter } from "./metrics";
import { PlanLimitsProvider } from "./providers/plan-limits";
import "./campaign-processor"; // Start Campaign Worker
import "./scraper-processor"; // Start Scraper Worker
import "./media-processor"; // Start Media Worker
import "./voice-processor"; // Start Voice Worker
import "./processors/memory-processor"; // Start Memory Worker
import "./processors/autopilot-processor"; // Start Autopilot Worker
import "./processors/webhook-processor"; // Start Webhook Worker
import "./metrics-server"; // Expose /metrics and /health
import "./dlq-monitor"; // Monitor DLQs and alert ops
import { redisPub } from "./redis-client";
import { prisma } from "./db";
import { WhatsAppEngine } from "./providers/whatsapp-engine";
import { v4 as uuidv4 } from "uuid";

/**
 * =======================================================
 * WORKER ENGINE — VERSION PRO (TS SAFE)
 * =======================================================
 */

const log = new WorkerLogger("flow-worker");
const engine = FlowEngineGlobal.get();

// Agenda ciclos globais do Autopilot (follow-up silencioso)
void (async () => {
  try {
    await autopilotQueue.add(
      "cycle-all",
      {},
      {
        jobId: "autopilot-cycle-all",
        repeat: { pattern: "0 * * * *" }, // a cada hora no minuto 0
        removeOnComplete: true,
      }
    );
    log.info("autopilot_cycle_scheduled");
  } catch (err: any) {
    log.warn("autopilot_cycle_schedule_failed", { error: err.message });
  }
})();

// Monitor de fila Autopilot para alertas operacionais
const QUEUE_THRESHOLD =
  parseInt(process.env.AUTOPILOT_QUEUE_WAITING_THRESHOLD || "200", 10) || 200;
const ALERT_WEBHOOK =
  process.env.AUTOPILOT_ALERT_WEBHOOK ||
  process.env.OPS_WEBHOOK_URL ||
  process.env.DLQ_WEBHOOK_URL;
let lastQueueAlert = 0;

async function sendOpsAlert(message: string, meta: any = {}) {
  if (!ALERT_WEBHOOK || !(global as any).fetch) return;
  try {
    await (global as any).fetch(ALERT_WEBHOOK, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        type: "autopilot_alert",
        message,
        meta,
        at: new Date().toISOString(),
        env: process.env.NODE_ENV || "dev",
      }),
    });
  } catch (err: any) {
    log.warn("autopilot_alert_failed", { error: err?.message });
  }
}

setInterval(async () => {
  try {
    const counts = await autopilotQueue.getJobCounts();
    const waiting = (counts.waiting || 0) + (counts.delayed || 0);
    const failed = counts.failed || 0;
    const now = Date.now();

    if (waiting > QUEUE_THRESHOLD && now - lastQueueAlert > 5 * 60_000) {
      lastQueueAlert = now;
      log.warn("autopilot_queue_high", { waiting, failed, threshold: QUEUE_THRESHOLD });
      await sendOpsAlert("Autopilot queue high", { waiting, failed, threshold: QUEUE_THRESHOLD });
    }
    if (failed > 0 && now - lastQueueAlert > 5 * 60_000) {
      lastQueueAlert = now;
      log.warn("autopilot_queue_failed", { failed, waiting });
      await sendOpsAlert("Autopilot queue has failed jobs", { failed, waiting });
    }
  } catch (err: any) {
    log.warn("autopilot_queue_monitor_error", { error: err?.message });
  }
}, 60_000);

async function handleRunFlow(job: Job) {
  log.info("flow_start", { jobId: job.id, queue: job.queueName });
  
  const { user, flowId, initialVars, executionId } = job.data;
  let workspace = job.data.workspace;
  let workspaceId = job.data.workspaceId || workspace?.id;
  let subscriptionChecked = false;

  // 1. Check Subscription Status (if workspace known)
  if (workspace?.id) {
    const subStatus = await PlanLimitsProvider.checkSubscriptionStatus(workspace.id);
    subscriptionChecked = true;
    if (!subStatus.active) {
      log.warn("flow_blocked_subscription", { jobId: job.id, workspaceId: workspace.id, reason: subStatus.reason });
      return { ok: false, skipped: true, reason: subStatus.reason };
    }
  }

  // Idempotency Check
  if (executionId) {
      const existingExec = await engine.getExecution(executionId);
      if (existingExec && (existingExec.status === 'COMPLETED' || existingExec.status === 'FAILED')) {
          log.warn("flow_already_completed", { jobId: job.id, executionId, status: existingExec.status });
          return { ok: true, skipped: true, reason: "already_completed" };
      }
  }
  
  let flowDef;
  if (job.data.flow && job.data.flow.nodes) {
      // Use runtime definition from editor
      flowDef = engine.parseFlowDefinition(
          flowId || 'temp-run', 
          job.data.flow.nodes, 
          job.data.flow.edges, 
          job.data.workspace?.id || 'default'
      );
      // Override startNode if provided
      if (job.data.startNode) flowDef.startNode = job.data.startNode;
  } else {
      // Load from DB scoped to workspace if provided
      flowDef = await engine.loadFlow(flowId, workspaceId);
  }
  
  // Derive workspaceId if not provided
  if (!workspaceId && flowDef?.workspaceId) {
    workspaceId = flowDef.workspaceId;
  }

  // If no subscription check yet and workspaceId known, check now
  if (!subscriptionChecked && workspaceId) {
    const subStatus = await PlanLimitsProvider.checkSubscriptionStatus(workspaceId);
    if (!subStatus.active) {
      log.warn("flow_blocked_subscription", { jobId: job.id, workspaceId, reason: subStatus.reason });
      return { ok: false, skipped: true, reason: subStatus.reason };
    }
  }

  // Rate-limit flow runs per plan
  if (workspaceId) {
    const rate = await PlanLimitsProvider.checkFlowRunRate(workspaceId);
    if (!rate.allowed) {
      log.warn("flow_blocked_rate", { jobId: job.id, workspaceId, reason: rate.reason });
      return { ok: false, skipped: true, reason: rate.reason };
    }
  }

  if (flowDef) {
    await engine.startFlow(user, flowDef, initialVars, executionId);
    log.info("flow_completed", { jobId: job.id, flowId, user });
  } else {
    log.error("flow_not_found", { jobId: job.id, flowId });
  }
  
  return { ok: true };
}

/**
 * Handle scheduled follow-up jobs from UnifiedAgentService
 * Sends the scheduled message via WhatsApp
 */
async function handleScheduledFollowup(job: Job) {
  const { workspaceId, contactId, phone, message, scheduledFor, type } = job.data ?? {};
  
  log.info("followup_start", { jobId: job.id, workspaceId, phone, scheduledFor });
  
  if (!workspaceId || !phone || !message) {
    log.warn("followup_invalid_job", { jobId: job.id, data: job.data });
    return { error: true, reason: "invalid_followup_data" };
  }
  
  try {
    // Load workspace config
    const ws = await prisma.workspace.findUnique({ where: { id: workspaceId } });
    if (!ws) {
      log.warn("followup_workspace_not_found", { workspaceId });
      return { error: true, reason: "workspace_not_found" };
    }
    
    const settings = (ws.providerSettings as any) || {};
    const workspace = {
      id: ws.id,
      whatsappProvider: settings.whatsappProvider || "auto",
      meta: settings.meta ? { ...settings.meta, token: tryDecrypt(settings.meta.token) } : {},
      wpp: settings.wpp || {},
      evolution: settings.evolution
        ? { ...settings.evolution, apiKey: tryDecrypt(settings.evolution.apiKey) }
        : {},
      ultrawa: settings.ultrawa
        ? { ...settings.ultrawa, apiKey: tryDecrypt(settings.ultrawa.apiKey) }
        : {},
      jitterMin: ws.jitterMin,
      jitterMax: ws.jitterMax,
    };
    
    // Check if contact responded in the meantime
    if (contactId) {
      const recentMessage = await prisma.message.findFirst({
        where: {
          conversation: { contactId, workspaceId },
          direction: "INBOUND",
          createdAt: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) }, // últimas 24h
        },
        orderBy: { createdAt: "desc" },
      });
      
      if (recentMessage) {
        log.info("followup_skip_recent_inbound", { workspaceId, contactId, phone });
        return { skipped: true, reason: "recent_inbound_message" };
      }
    }
    
    // Send the follow-up message
    const result = await WhatsAppEngine.sendText(workspace, phone, message);
    
    log.info("followup_sent", { workspaceId, phone, result: !!result });
    
    // Update autopilot event status
    try {
      const prismaAny = prisma as any;
      if (prismaAny.autopilotEvent) {
        await prismaAny.autopilotEvent.updateMany({
          where: {
            workspaceId,
            contactId: contactId || undefined,
            status: "scheduled",
            action: "SCHEDULE_FOLLOWUP",
          },
          data: {
            status: "success",
            responseText: message,
          },
        });
      }
    } catch (e) {
      // Table may not exist yet
    }
    
    return { ok: true, sent: true };
  } catch (err: any) {
    log.error("followup_error", { jobId: job.id, error: err.message });
    throw err;
  }
}

import { HealthMonitor } from "./providers/health-monitor";

async function handleSendMessage(job: Job) {
  let { workspace, to, message, user, workspaceId } = job.data ?? {};
  const { mediaUrl, mediaType, caption, template, externalId: jobExternalId } = job.data ?? {};
  const start = Date.now();
  let contactId: string | null = null;
  let conversationId: string | null = null;
  const extractExternalId = (res: any) =>
    res?.messages?.[0]?.id ||
    res?.message?.id ||
    res?.id ||
    res?.messageId ||
    res?.sid ||
    null;

  // Lazy load workspace config if not provided
  if (!workspace && workspaceId) {
    const ws = await prisma.workspace.findUnique({ where: { id: workspaceId } });
    if (ws) {
      const settings = (ws.providerSettings as any) || {};
      workspace = {
        id: ws.id,
        whatsappProvider: settings.whatsappProvider || "auto",
        meta: settings.meta ? { ...settings.meta, token: tryDecrypt(settings.meta.token) } : {},
        wpp: settings.wpp || {},
        evolution: settings.evolution
          ? { ...settings.evolution, apiKey: tryDecrypt(settings.evolution.apiKey) }
          : {},
        ultrawa: settings.ultrawa
          ? { ...settings.ultrawa, apiKey: tryDecrypt(settings.ultrawa.apiKey) }
          : {},
        jitterMin: ws.jitterMin,
        jitterMax: ws.jitterMax,
      };
    }
  }

  log.info("send_start", { jobId: job.id, workspaceId: workspace?.id || workspaceId, to });

  if (!workspace || !to) {
    log.warn("send_invalid_job", { jobId: job.id, data: job.data });
    return { error: true, reason: "invalid_job_data" };
  }

  // 1. Check Plan Limits (Messages per Month)
  const limitCheck = await PlanLimitsProvider.checkMessageLimit(workspace.id);
  if (!limitCheck.allowed) {
      log.warn("send_blocked_limit", { jobId: job.id, workspaceId: workspace.id, reason: limitCheck.reason });
      // We return error: true so BullMQ might retry? No, if limit reached, retry won't help immediately.
      // But maybe we want to fail permanently.
      return { error: true, reason: limitCheck.reason, skipped: true };
  }

  const targetUser = user || to;
  
  try {
    // Prepara contato/conversa para registrar status
    try {
      const contact = await prisma.contact.upsert({
        where: { workspaceId_phone: { workspaceId: workspace.id, phone: targetUser } },
        update: {},
        create: {
          workspaceId: workspace.id,
          phone: targetUser,
          name: targetUser,
        },
      });
      contactId = contact.id;

      const existing = await prisma.conversation.findFirst({
        where: { workspaceId: workspace.id, contactId, status: { not: "CLOSED" } },
        select: { id: true },
      });
      if (existing) {
        conversationId = existing.id;
      } else {
        const conv = await prisma.conversation.create({
          data: {
            workspaceId: workspace.id,
            contactId,
            status: "OPEN",
            channel: "WHATSAPP",
            priority: "MEDIUM",
          },
          select: { id: true },
        });
        conversationId = conv.id;
      }
    } catch (prepErr) {
      log.warn("send_prepare_persist_failed", { error: (prepErr as any)?.message });
    }

    let res;
    if (template?.name) {
      res = await WhatsAppEngine.sendTemplate(
        workspace,
        targetUser,
        template.name,
        template.language || 'en_US',
        template.components || [],
      );
    } else if (mediaUrl && mediaType) {
      res = await WhatsAppEngine.sendMedia(
        workspace,
        targetUser,
        mediaType,
        mediaUrl,
        caption || message,
      );
    } else {
      res = await WhatsAppEngine.sendText(workspace, targetUser, message);
    }
    const latency = Date.now() - start;

    // Detect provider-level errors that didn't throw (common in HTTP 200 with { error })
    const providerError =
      (res && (res.error || res.err || res.status === "error")) || null;

    // Health Check Success (only if no provider error)
    await HealthMonitor.updateMetrics(workspace.id, !providerError, latency);
    await HealthMonitor.reportStatus(workspace.id, "CONNECTED");

    const msgType = mediaType
      ? mediaType.toUpperCase()
      : template?.name
        ? "TEMPLATE"
        : "TEXT";
    const externalId = jobExternalId || extractExternalId(res);

    // Persist outbound message for analytics/inbox visibility
    if (contactId && conversationId) {
      try {
        const created = await prisma.message.create({
          data: {
            id: uuidv4(),
            workspaceId: workspace.id,
            contactId,
            conversationId,
            content: caption || message || mediaUrl || "",
            direction: "OUTBOUND",
            type: msgType,
            mediaUrl: mediaUrl || undefined,
            status: providerError ? "FAILED" : "SENT",
            errorCode: providerError ? String(providerError) : null,
            externalId: externalId || undefined,
          },
        });

        await prisma.conversation.update({
          where: { id: conversationId },
          data: { lastMessageAt: new Date(), unreadCount: 0 },
        });

        // Notifica realtime (via Redis → backend WebSocket)
        const payload = {
          type: "message:new",
          workspaceId: workspace.id,
          message: created,
        };
        await redisPub.publish("ws:inbox", JSON.stringify(payload));
        await redisPub.publish(
          "ws:inbox",
          JSON.stringify({
            type: "conversation:update",
            workspaceId: workspace.id,
            conversation: {
              id: conversationId,
              lastMessageStatus: providerError ? "FAILED" : "SENT",
              lastMessageErrorCode: providerError ? String(providerError) : null,
              lastMessageAt: created.createdAt,
            },
          })
        );
        await redisPub.publish(
          "ws:inbox",
          JSON.stringify({
            type: "message:status",
            workspaceId: workspace.id,
            payload: {
              id: created.id,
              conversationId,
              contactId,
              externalId,
              status: providerError ? "FAILED" : "SENT",
              errorCode: providerError ? String(providerError) : null,
            },
          })
        );
      } catch (dbErr) {
        log.warn("send_persist_failed", { error: (dbErr as any)?.message });
      }
    }

    if (providerError) {
      log.warn("send_provider_error", {
        jobId: job.id,
        workspaceId: workspace.id,
        to,
        error: providerError,
      });
      return { error: true, reason: providerError };
    }

    log.info("send_completed", { jobId: job.id, workspaceId: workspace.id, to, latency });
    return { ok: true, result: res };
  } catch (err) {
    const latency = Date.now() - start;
    
    // Health Check Failure
    await HealthMonitor.updateMetrics(workspace.id, false, latency);
    log.error("send_failed", { jobId: job.id, error: err });

    // Persist failure for analytics
    if (contactId && conversationId) {
      try {
        await prisma.message.create({
          data: {
            id: uuidv4(),
            workspaceId: workspace.id,
            contactId,
          conversationId,
          content: caption || message || mediaUrl || "",
          direction: "OUTBOUND",
          type: mediaType ? mediaType.toUpperCase() : template?.name ? "TEMPLATE" : "TEXT",
          mediaUrl: mediaUrl || undefined,
          status: "FAILED",
          errorCode: (err as any)?.message,
          externalId: undefined,
          },
        });
      } catch (dbErr) {
        log.warn("send_persist_failed_errorpath", { error: (dbErr as any)?.message });
      }

      try {
        await redisPub.publish(
          "ws:inbox",
          JSON.stringify({
            type: "message:status",
            workspaceId: workspace.id,
            payload: {
              conversationId,
              contactId,
              status: "FAILED",
              errorCode: (err as any)?.message,
            },
          })
        );
      } catch (pubErr) {
        log.warn("ws_publish_failed_errorpath", { error: (pubErr as any)?.message });
      }
    }
    
    // Erros de sessão expirada (24h) não valem retry
    if ((err as any)?.message === "session_expired") {
      return { error: true, reason: "session_expired", skipped: true };
    }

    // Retry logic handled by BullMQ, but we log health
    throw err;
  }
}

// Decrypt provider secrets if PROVIDER_SECRET_KEY is set
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

export const flowWorker = new Worker(
  "flow-jobs",
  async (job: Job) => {
    const start = process.hrtime.bigint();
    try {
      switch (job.name) {
        case "run-flow":
          return await handleRunFlow(job);

        case "resume-flow":
          // Retoma um fluxo aguardando resposta do usuário
          if (job.data?.user && job.data?.message) {
            await engine.onUserResponse(job.data.user, job.data.message, job.data.workspaceId);
            return { ok: true };
          }
          log.warn("resume_invalid_job", { jobId: job.id, data: job.data });
          return { error: true, reason: "invalid_resume_job" };

        case "send-message":
          return await handleSendMessage(job);

        case "incoming-message": {
          // Retoma fluxos que estavam aguardando resposta do usuário
          const { user, message, workspaceId } = job.data || {};
          if (user && message) {
            await engine.onUserResponse(user, message, workspaceId);
            log.info("incoming_routed", { user, workspaceId });
          } else {
            log.warn("incoming_invalid_payload", { data: job.data });
          }
          return { ok: true };
        }

        case "scheduled-followup":
          // Follow-up agendado pelo UnifiedAgentService
          return await handleScheduledFollowup(job);

        default:
          log.warn("unknown_job", { name: job.name, jobId: job.id });
          return null;
      }
    } catch (err) {
      log.error("job_error", { jobId: job.id, error: (err as any)?.message });
      throw err;
    } finally {
      const duration = Number(process.hrtime.bigint() - start) / 1e9;
      const labels: any = { queue: job.queueName, name: job.name };
jobDuration.observe({ ...labels, status: "processed" }, duration);
      jobCounter.inc({ ...labels, status: "processed" });
    }
  },
  {
    connection,
    concurrency: 20,
  }
);

// EVENTO: job completou
flowWorker.on("completed", (job: Job) => {
  log.info("job_completed", { jobId: job?.id });
  const labels: any = { queue: job?.queueName || "flow-jobs", name: job?.name || "unknown" };
  jobCounter.inc({ ...labels, status: "completed" });
});

// EVENTO: job falhou
flowWorker.on("failed", (job: Job | undefined, err: Error) => {
  log.error("job_failed", { jobId: job?.id, error: err?.message });
  const labels: any = { queue: job?.queueName || "flow-jobs", name: job?.name || "unknown" };
  jobCounter.inc({ ...labels, status: "failed" });

  const workspaceId = (job?.data as any)?.workspace?.id || (job?.data as any)?.workspaceId || "global";
  const payload = {
    type: "job_failed",
    workspaceId,
    jobId: job?.id,
    queue: job?.queueName,
    name: job?.name,
    error: err?.message,
    ts: Date.now(),
  };
  // Publica alerta para dashboards/ops
  redisPub.publish(`alerts:${workspaceId}`, JSON.stringify(payload)).catch(() => {});
});

/**
 * =======================================================
 * AUTOPILOT SCANNER — lê conversas e age sozinho
 * =======================================================
 */

type AutopilotDecision = {
  intent: string;
  action: string;
  reason?: string;
};

const bestHourCache: Map<string, { hour: number; ts: number }> = new Map();

async function computeBestHour(workspaceId: string): Promise<number> {
  const cache = bestHourCache.get(workspaceId);
  if (cache && Date.now() - cache.ts < 10 * 60 * 1000) return cache.hour;

  const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const msgs = await prisma.message.findMany({
    where: { workspaceId, createdAt: { gte: since } },
    select: { createdAt: true },
  });

  const buckets = Array(24).fill(0);
  msgs.forEach((m) => {
    buckets[m.createdAt.getHours()]++;
  });
  let best = 10;
  let bestVal = -1;
  buckets.forEach((v, idx) => {
    if (v > bestVal) {
      bestVal = v;
      best = idx;
    }
  });
  bestHourCache.set(workspaceId, { hour: best, ts: Date.now() });
  return best;
}

function hasKeyword(text: string, ...keys: string[]) {
  const lower = text.toLowerCase();
  return keys.some((k) => lower.includes(k));
}

async function decideAction(messageContent: string, settings: any): Promise<AutopilotDecision> {
  const text = messageContent || "";

  if (hasKeyword(text, "quanto custa", "preco", "preço", "valor", "preco?")) {
    return { intent: "BUYING", action: "SEND_PRICE", reason: "price_question" };
  }
  if (hasKeyword(text, "quero", "comprar", "fechar", "vamos", "contratar", "assinar")) {
    return { intent: "BUYING", action: "SEND_OFFER", reason: "buy_signal" };
  }
  if (hasKeyword(text, "pix", "boleto", "pagar", "pagamento", "checkout", "link de pagamento")) {
    return { intent: "BUYING", action: "SEND_OFFER", reason: "payment_intent" };
  }
  if (hasKeyword(text, "agendar", "agenda", "calend", "marcar", "reuni", "call")) {
    return { intent: "SCHEDULING", action: "SEND_CALENDAR", reason: "schedule" };
  }
  if (hasKeyword(text, "problema", "erro", "bug", "não funciona", "nao funciona", "suporte")) {
    return { intent: "SUPPORT", action: "TRANSFER_AGENT", reason: "support" };
  }
  if (hasKeyword(text, "caro", "muito caro", "sem dinheiro", "agora não", "agora nao", "talvez depois")) {
    return { intent: "OBJECTION", action: "HANDLE_OBJECTION", reason: "price_objection" };
  }
  if (hasKeyword(text, "cancel", "cancelar", "desistir", "parar", "não quero mais", "nao quero mais")) {
    return { intent: "CHURN_RISK", action: "ANTI_CHURN", reason: "churn_risk" };
  }
  if (hasKeyword(text, "já uso", "ja uso", "sou cliente", "renovar", "upgrade", "plano maior")) {
    return { intent: "UPSELL", action: "UPSELL", reason: "existing_customer" };
  }

  // If AI key available, try richer intent
  const apiKey = settings?.openai?.apiKey || process.env.OPENAI_API_KEY;
  if (apiKey) {
    try {
      const { AIProvider } = await import("./providers/ai-provider");
      const ai = new AIProvider(apiKey);
      const prompt = `
      Classifique a intenção para atendimento de vendas em JSON:
      Campos: intent (BUYING|SCHEDULING|SUPPORT|OBJECTION|CHURN_RISK|UPSELL|IDLE), action (SEND_OFFER|SEND_PRICE|SEND_CALENDAR|TRANSFER_AGENT|FOLLOW_UP|HANDLE_OBJECTION|ANTI_CHURN|UPSELL|NONE), reason.
      Mensagem: "${text}"
      `;
      const res = await ai.generateResponse("Responda apenas JSON.", prompt);
      const parsed = JSON.parse(res.replace(/```json/g, "").replace(/```/g, ""));
      return {
        intent: parsed.intent || "IDLE",
        action: parsed.action || "NONE",
        reason: parsed.reason || "ai_decision",
      };
    } catch (err) {
      // fallback
    }
  }

  return { intent: "IDLE", action: "FOLLOW_UP", reason: "default_follow_up" };
}

async function generateTemplate(action: string, message: string, settings: any) {
  const templates: Record<string, string> = {
    SEND_PRICE: "Posso te passar os valores e opções agora. Quer que eu envie o preço detalhado?",
    FOLLOW_UP: "Vi que não conseguimos concluir. Posso te ajudar em algo ou enviar uma condição especial?",
    FOLLOW_UP_SOFT: "Oi! Só checando se posso te ajudar com algo ou se prefere que eu volte mais tarde. 🙂",
    FOLLOW_UP_STRONG: "Última chamada: reservei uma condição especial pra você hoje. Quer fechar agora?",
    SEND_CALENDAR: "Aqui está meu link de agenda para marcarmos rápido: https://cal.com/danielpenin (exemplo).",
    QUALIFY: "Para te ajudar melhor, qual é a sua necessidade principal e prazo?",
    FILTER: "Só para confirmar: você realmente está avaliando contratar agora ou é apenas curiosidade?",
    TRANSFER_AGENT: "Vou chamar um especialista humano para te atender em instantes.",
    OFFER: "Tenho uma condição especial hoje. Podemos fechar agora com um bônus exclusivo. Posso enviar?",
    GHOST_CLOSER: "Notei que a gente parou antes de finalizar. Quer que eu reserve sua vaga agora?",
    NIGHT_SOFT: "Vi seu interesse! Estou fora do horário agora, mas já deixei separado pra você. Amanhã cedo te chamo. Tudo bem?",
    HANDLE_OBJECTION: "Entendo sua preocupação. Posso ajustar a proposta para encaixar no que você precisa e caber no bolso. Que tal eu te mandar uma condição mais leve agora?",
    ANTI_CHURN: "Quero garantir que você tenha resultado. Posso ajustar plano, oferecer bônus ou suporte extra. O que faria você ficar 100% satisfeito?",
    UPSELL: "Como você já usa nosso serviço, há um upgrade que libera mais resultados. Quer que eu te mostre a opção que mais compensa?",
  };

  // Reuse AI for richer pitch
  if (action === "SEND_OFFER" || action === "OFFER") {
    const apiKey = settings?.openai?.apiKey || process.env.OPENAI_API_KEY;
    if (apiKey) {
      try {
        const { AIProvider } = await import("./providers/ai-provider");
        const ai = new AIProvider(apiKey);
        return await ai.generateResponse(
          "Você é um closer conciso. Gere uma oferta curta com CTA.",
          `Mensagem do lead: "${message || "sem contexto"}". Gere uma oferta direta.`
        );
      } catch (err) {
        // fallback
      }
    }
    return templates["OFFER"];
  }

  return templates[action] || templates["FOLLOW_UP"];
}

async function ensureOptInAllowed(workspaceId: string, contact: any): Promise<void> {
  const enforce = process.env.ENFORCE_OPTIN === "true";
  if (!enforce) return;

  const tags = contact?.tags || [];
  const hasOptIn = tags.some((t: any) => t.name === "optin_whatsapp");
  if (!hasOptIn) {
    throw new Error("optin_required");
  }
}

async function autopilotScanner() {
  try {
    // Últimas conversas abertas, mais recentes primeiro
    const convs = await prisma.conversation.findMany({
      where: { status: "OPEN" },
      orderBy: { updatedAt: "desc" },
      take: 50,
      include: {
        contact: { include: { tags: { select: { name: true } } } },
        workspace: { select: { id: true, providerSettings: true, jitterMin: true, jitterMax: true } },
        messages: { take: 1, orderBy: { createdAt: "desc" } },
      },
    });

    for (const conv of convs) {
      const settings: any = conv.workspace.providerSettings || {};
      if (!settings.autopilot?.enabled) continue;

      const lastMsg = conv.messages[0];
      if (!lastMsg) continue;

      // Cooldown por contato (evita spam)
      const cf = (conv.contact as any).customFields || {};
      const lastActionAt = cf.autopilotLastActionAt ? new Date(cf.autopilotLastActionAt).getTime() : 0;
      const nextRetryAt = cf.autopilotNextRetryAt ? new Date(cf.autopilotNextRetryAt).getTime() : 0;
      if (nextRetryAt && nextRetryAt > Date.now()) {
        continue;
      }
      if (lastActionAt && Date.now() - lastActionAt < 2 * 60 * 60 * 1000) {
        continue;
      }

      // Só reage a última mensagem INBOUND ou follow-up após 24h sem resposta
      const now = Date.now();
      const ageHours = (now - new Date(lastMsg.createdAt).getTime()) / 3600000;
      const isInbound = lastMsg.direction === "INBOUND";
      const text = (lastMsg.content || "").toLowerCase();
      const buyingSignal = /(preç|valor|custa|pix|boleto|pag|assin|compr|checkout|fechar)/i.test(text);
      const shouldFollowUp =
        (ageHours >= 12 && lastMsg.direction === "OUTBOUND") ||
        (ageHours >= 24 && isInbound);
      const antiChurn = ageHours >= 72;

      if (!isInbound && !shouldFollowUp && !antiChurn) continue;

      // Modo noturno: se >22h ou <7h e intenção de compra, usa mensagem soft
      const hour = new Date().getHours();
      const isNight = hour >= 22 || hour < 7;

      // Se estamos em follow-up após silêncio, prioriza reengajar
      const decision = antiChurn
        ? { intent: "CHURN_RISK", action: "ANTI_CHURN", reason: "silent_72h" }
        : buyingSignal && isInbound && ageHours >= 6
          ? { intent: "BUYING_SIGNAL", action: "GHOST_CLOSER", reason: "silent_buying_signal" }
        : shouldFollowUp
          ? { intent: "REENGAGE", action: "FOLLOW_UP_STRONG", reason: "silent_24h" }
          : await decideAction(lastMsg.content || "", settings);
      const action = decision.action || "FOLLOW_UP";

      try {
        const messageToSend = await generateTemplate(
          isNight && (decision.intent === "BUYING" || action === "SEND_OFFER") ? "NIGHT_SOFT" : action,
          lastMsg.content || "",
          settings
        );
        if (!messageToSend) continue;

        // Limites de plano e assinatura
        const subscription = await PlanLimitsProvider.checkSubscriptionStatus(conv.workspaceId);
        if (!subscription.active) {
          throw new Error(subscription.reason || "subscription_inactive");
        }
        const msgLimit = await PlanLimitsProvider.checkMessageLimit(conv.workspaceId);
        if (!msgLimit.allowed) {
          throw new Error(msgLimit.reason || "message_limit");
        }

        // Opt-in obrigatório (quando configurado)
        await ensureOptInAllowed(conv.workspaceId, conv.contact);

        // SmartTime gating para follow-ups não urgentes
        const bestHour = await computeBestHour(conv.workspaceId);
        const hour = new Date().getHours();
        const withinPrime = Math.abs(hour - bestHour) <= 2;
        const isHotAction = action === "SEND_OFFER" || action === "SEND_PRICE";
        if (!withinPrime && !isHotAction) continue;

        const workspaceConfig = {
          id: conv.workspaceId,
          whatsappProvider: settings.whatsappProvider || "auto",
          meta: settings.meta || {},
          wpp: settings.wpp || {},
          evolution: settings.evolution || {},
          ultrawa: settings.ultrawa || {},
          jitterMin: (conv.workspace as any).jitterMin,
          jitterMax: (conv.workspace as any).jitterMax,
        };

        let status: "executed" | "error" = "executed";
        let errorMsg: string | undefined;
        const sendStarted = Date.now();
        let latencyMs: number | undefined;

        try {
          await WhatsAppEngine.sendText(
            workspaceConfig,
            conv.contact.phone,
            messageToSend
          );
          latencyMs = Date.now() - sendStarted;

          // Persist outbound no Inbox para visibilidade dos agentes
          await prisma.message.create({
            data: {
              workspaceId: conv.workspaceId,
              contactId: conv.contactId,
              conversationId: conv.id,
              content: messageToSend,
              direction: "OUTBOUND",
              type: "TEXT",
              status: "DELIVERED",
            },
          });
          await prisma.conversation.update({
            where: { id: conv.id },
            data: { lastMessageAt: new Date(), unreadCount: 0 },
          });
        } catch (err: any) {
          status = "error";
          errorMsg = err?.message;
          latencyMs = Date.now() - sendStarted;
          throw err;
        } finally {
          // Update contact customFields with last action timestamp
          const newCf = {
            ...(cf || {}),
            autopilotLastAction: action,
            autopilotLastActionAt: new Date().toISOString(),
            autopilotNextRetryAt: null,
          };
          await prisma.contact.update({
            where: { id: conv.contactId },
            data: { customFields: newCf as any },
          });

          // Log action for audit/analytics (success or error)
          await prisma.auditLog.create({
            data: {
              action: "AUTOPILOT_ACTION",
              resource: "contact",
              resourceId: conv.contactId,
              details: {
                intent: decision.intent || "UNKNOWN",
                action,
                reason: decision.reason || "auto",
                message: messageToSend,
                status,
              error: errorMsg,
            } as any,
            workspaceId: conv.workspaceId,
          },
        });

          autopilotDecisionCounter.inc({
            workspaceId: conv.workspaceId,
            intent: decision.intent || "UNKNOWN",
            action,
            result: status,
          });
        }
      } catch (err: any) {
        log.warn("autopilot_scan_error", { error: err?.message, convId: conv.id });
      }
    }
  } catch (err: any) {
    log.error("autopilot_scan_loop_error", { error: err?.message });
  }
}

// Roda a cada 5 minutos (ajustar conforme necessidade)
setInterval(autopilotScanner, 5 * 60 * 1000);
