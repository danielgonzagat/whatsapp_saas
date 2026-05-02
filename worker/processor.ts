import { type Job, Worker } from 'bullmq';
import { Prisma } from '@prisma/client';
import { FlowEngineGlobal } from './flow-engine-global';
import { WorkerLogger } from './logger';
import { autopilotDecisionCounter, jobCounter, jobDuration } from './metrics';
import { PlanLimitsProvider } from './providers/plan-limits';
import { autopilotQueue, connection, shutdownQueueSystem } from './queue';
import './campaign-processor'; // Start Campaign Worker
import './scraper-processor'; // Start Scraper Worker
import './media-processor'; // Start Media Worker
import './voice-processor'; // Start Voice Worker
import './processors/memory-processor'; // Start Memory Worker
import './processors/webhook-processor'; // Start Webhook Worker
import './processors/crm-processor'; // Start CRM Worker
import './metrics-server'; // Expose /metrics and /health
import './dlq-monitor'; // Monitor DLQs and alert ops
import { v4 as uuidv4 } from 'uuid';
import { SALES_TEMPLATES, renderTemplate } from './constants/sales-templates';
import { prisma } from './db';
import { buildQueueJobId } from './job-id';
import { dispatchOutboundThroughFlow } from './providers/outbound-dispatcher';
import { WhatsAppEngine } from './providers/whatsapp-engine';
import { redisPub } from './redis-client';
import { forEachSequential } from './utils/async-sequence';

/**
 * =======================================================
 * WORKER ENGINE — VERSION PRO (TS SAFE)
 * =======================================================
 */

const log = new WorkerLogger('flow-worker');
const engine = FlowEngineGlobal.get();
const WORKER_ROLE = (process.env.WORKER_ROLE || 'all').toLowerCase();
const SHOULD_SCHEDULE = WORKER_ROLE !== 'executor';
const SHOULD_EXECUTE = WORKER_ROLE !== 'scheduler';
const AUTOPILOT_CYCLE_CRON = process.env.AUTOPILOT_CYCLE_CRON || '* * * * *';
const ENABLE_LEGACY_AUTOPILOT_SCANNER = process.env.ENABLE_LEGACY_AUTOPILOT_SCANNER === 'true';
const ALLOW_PROACTIVE_OUTREACH = process.env.ALLOW_PROACTIVE_OUTREACH === 'true';
const ENABLE_LEGACY_AUTOPILOT_SCANNER_WITH_APPROVAL =
  ENABLE_LEGACY_AUTOPILOT_SCANNER && ALLOW_PROACTIVE_OUTREACH;
import { getWhatsAppProviderFromEnv } from './providers/whatsapp-provider-resolver';
const DEFAULT_WHATSAPP_PROVIDER = getWhatsAppProviderFromEnv();

type JsonObject = Record<string, Prisma.JsonValue>;

function isPlainJsonObject(value: Prisma.JsonValue | null | undefined): value is JsonObject {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function asJsonObject(value: Prisma.JsonValue | null | undefined): JsonObject {
  return isPlainJsonObject(value) ? (value as JsonObject) : {};
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function jsonDateMillis(value: Prisma.JsonValue | undefined): number {
  if (typeof value !== 'string' && typeof value !== 'number') {
    return 0;
  }

  const parsed = new Date(value).getTime();
  return Number.isFinite(parsed) ? parsed : 0;
}

if (SHOULD_EXECUTE) {
  void import('./processors/autopilot-processor'); // Start Autopilot Worker
} else {
  log.info('autopilot_worker_disabled_for_role', { role: WORKER_ROLE });
}

/**
 * Send fallback email when WhatsApp delivery fails
 * Uses Resend/SendGrid/SMTP based on env vars
 */
function buildFallbackEmailHtml(
  contactName: string | null,
  message: string,
  workspaceName: string | null,
): string {
  return `
    <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto;">
      <h2>Olá${contactName ? ` ${contactName}` : ''}!</h2>
      <p style="white-space: pre-wrap;">${message}</p>
      <hr style="border: none; border-top: 1px solid #eee; margin: 20px 0;">
      <p style="color: #666; font-size: 12px;">
        Enviado automaticamente por ${workspaceName || 'KLOEL'}
      </p>
    </div>
  `;
}

async function trySendFallbackEmailViaResend(args: {
  to: string;
  fromEmail: string;
  subject: string;
  html: string;
}): Promise<boolean> {
  if (!process.env.RESEND_API_KEY) {
    return false;
  }
  try {
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: args.fromEmail,
        to: args.to,
        subject: args.subject,
        html: args.html,
      }),
      signal: AbortSignal.timeout(30000),
    });
    if (response.ok) {
      log.info('fallback_email_resend_sent', { to: args.to });
      return true;
    }
  } catch (e) {
    log.warn('fallback_email_resend_error', {
      error: e instanceof Error ? e.message : String(e),
    });
  }
  return false;
}

async function trySendFallbackEmailViaSendGrid(args: {
  to: string;
  fromEmail: string;
  subject: string;
  html: string;
}): Promise<boolean> {
  if (!process.env.SENDGRID_API_KEY) {
    return false;
  }
  try {
    const response = await fetch('https://api.sendgrid.com/v3/mail/send', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${process.env.SENDGRID_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        personalizations: [{ to: [{ email: args.to }] }],
        from: { email: args.fromEmail },
        subject: args.subject,
        content: [{ type: 'text/html', value: args.html }],
      }),
      signal: AbortSignal.timeout(30000),
    });
    if (response.ok || response.status === 202) {
      log.info('fallback_email_sendgrid_sent', { to: args.to });
      return true;
    }
  } catch (e) {
    log.warn('fallback_email_sendgrid_error', {
      error: e instanceof Error ? e.message : String(e),
    });
  }
  return false;
}

async function sendFallbackEmail(
  to: string,
  contactName: string | null,
  message: string,
  workspaceName: string | null,
): Promise<boolean> {
  const fromEmail = process.env.EMAIL_FROM || 'noreply@kloel.com';
  const subject = `Mensagem de ${workspaceName || 'sua empresa'}`;
  const html = buildFallbackEmailHtml(contactName, message, workspaceName);

  if (await trySendFallbackEmailViaResend({ to, fromEmail, subject, html })) {
    return true;
  }
  if (await trySendFallbackEmailViaSendGrid({ to, fromEmail, subject, html })) {
    return true;
  }

  if (!process.env.RESEND_API_KEY && !process.env.SENDGRID_API_KEY) {
    log.warn('fallback_email_no_provider', { to });
  }
  return false;
}

if (SHOULD_SCHEDULE) {
  if (ALLOW_PROACTIVE_OUTREACH) {
    // Agenda ciclos globais do Autopilot (follow-up silencioso) apenas com autorização explícita.
    void (async () => {
      try {
        await autopilotQueue.add(
          'cycle-all',
          {},
          {
            jobId: 'autopilot-cycle-all',
            repeat: { pattern: AUTOPILOT_CYCLE_CRON },
            removeOnComplete: true,
          },
        );
        log.info('autopilot_cycle_scheduled', {
          pattern: AUTOPILOT_CYCLE_CRON,
          role: WORKER_ROLE,
        });
      } catch (err: unknown) {
        const errInstanceofError =
          err instanceof Error ? err : new Error(typeof err === 'string' ? err : 'unknown error');
        log.warn('autopilot_cycle_schedule_failed', { error: errInstanceofError.message });
      }
    })();
  } else {
    log.info('autopilot_cycle_scheduler_disabled', {
      role: WORKER_ROLE,
      reason: 'proactive_outreach_disabled',
    });
  }

  // CIA proactive cycle DISABLED — observer loop handles reactive processing.
  // The CIA cycle was causing contract violations and duplicate messages by
  // processing the same contacts in parallel with the observer.
  // Re-enable when the observer is stable and dedup is verified.
  log.info('cia_main_loop_disabled', {
    reason: 'observer_reactive_only',
    role: WORKER_ROLE,
  });

  // CIA self-improvement and global learning DISABLED while stabilizing.
  log.info('cia_self_improvement_disabled', { reason: 'stabilizing' });
  log.info('cia_global_learning_disabled', { reason: 'stabilizing' });
} else {
  log.info('repeatable_schedulers_disabled_for_role', { role: WORKER_ROLE });
}

// Monitor de fila Autopilot para alertas operacionais
const QUEUE_THRESHOLD =
  Number.parseInt(process.env.AUTOPILOT_QUEUE_WAITING_THRESHOLD || '200', 10) || 200;
const ALERT_WEBHOOK =
  process.env.AUTOPILOT_ALERT_WEBHOOK || process.env.OPS_WEBHOOK_URL || process.env.DLQ_WEBHOOK_URL;
let lastQueueAlert = 0;

async function sendOpsAlert(message: string, meta: Record<string, unknown> = {}): Promise<void> {
  if (!ALERT_WEBHOOK || typeof globalThis.fetch !== 'function') {
    return;
  }
  try {
    await globalThis.fetch(ALERT_WEBHOOK, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        type: 'autopilot_alert',
        message,
        meta,
        at: new Date().toISOString(),
        env: process.env.NODE_ENV || 'dev',
      }),
      signal: AbortSignal.timeout(10000),
    });
  } catch (err: unknown) {
    const errInstanceofError =
      err instanceof Error ? err : new Error(typeof err === 'string' ? err : 'unknown error');
    log.warn('autopilot_alert_failed', { error: errInstanceofError?.message });
  }
}

const QUEUE_ALERT_COOLDOWN_MS = 5 * 60_000;

async function maybeAlertHighQueue(waiting: number, failed: number, now: number): Promise<void> {
  if (waiting <= QUEUE_THRESHOLD || now - lastQueueAlert <= QUEUE_ALERT_COOLDOWN_MS) {
    return;
  }
  lastQueueAlert = now;
  log.warn('autopilot_queue_high', { waiting, failed, threshold: QUEUE_THRESHOLD });
  await sendOpsAlert('Autopilot queue high', { waiting, failed, threshold: QUEUE_THRESHOLD });
}

async function maybeAlertFailedJobs(failed: number, waiting: number, now: number): Promise<void> {
  if (failed <= 0 || now - lastQueueAlert <= QUEUE_ALERT_COOLDOWN_MS) {
    return;
  }
  lastQueueAlert = now;
  log.warn('autopilot_queue_failed', { failed, waiting });
  await sendOpsAlert('Autopilot queue has failed jobs', { failed, waiting });
}

async function checkAutopilotQueueHealth(): Promise<void> {
  try {
    const counts = await autopilotQueue.getJobCounts();
    const waiting = (counts.waiting || 0) + (counts.delayed || 0);
    const failed = counts.failed || 0;
    const now = Date.now();

    await maybeAlertHighQueue(waiting, failed, now);
    await maybeAlertFailedJobs(failed, waiting, now);
  } catch (err: unknown) {
    const errInstanceofError =
      err instanceof Error ? err : new Error(typeof err === 'string' ? err : 'unknown error');
    log.warn('autopilot_queue_monitor_error', { error: errInstanceofError?.message });
  }
}

const autopilotMonitorInterval = setInterval(checkAutopilotQueueHealth, 60_000);

async function gracefulShutdown(signal: string) {
  log.info('shutdown_started', { signal });
  clearInterval(autopilotMonitorInterval);
  await engine
    .shutdown()
    .catch((err) => log.warn('flow_engine_shutdown_error', { error: getErrorMessage(err) }));
  // PR P2-4: close all BullMQ queues, DLQs, QueueEvents, and the
  // shared Redis connection in reverse order. 10s timeout caps the
  // total wait so a stuck close cannot block process exit indefinitely.
  await shutdownQueueSystem(10_000).catch((err) =>
    log.warn('shutdown_queue_system_error', { error: getErrorMessage(err) }),
  );
  log.info('shutdown_complete', { signal });
  process.exit(0);
}

process.on('SIGTERM', () => {
  void gracefulShutdown('SIGTERM');
});
process.on('SIGINT', () => {
  void gracefulShutdown('SIGINT');
});

type SkippedFlowResult = { ok: false; skipped: true; reason: string };

async function checkFlowSubscription(
  jobId: Job['id'],
  workspaceId: string,
): Promise<SkippedFlowResult | null> {
  const subStatus = await PlanLimitsProvider.checkSubscriptionStatus(workspaceId);
  if (subStatus.active) {
    return null;
  }
  log.warn('flow_blocked_subscription', { jobId, workspaceId, reason: subStatus.reason });
  return { ok: false, skipped: true, reason: subStatus.reason };
}

async function checkFlowRateLimit(
  jobId: Job['id'],
  workspaceId: string,
): Promise<SkippedFlowResult | null> {
  const rate = await PlanLimitsProvider.checkFlowRunRate(workspaceId);
  if (rate.allowed) {
    return null;
  }
  log.warn('flow_blocked_rate', { jobId, workspaceId, reason: rate.reason });
  return { ok: false, skipped: true, reason: rate.reason };
}

async function resolveFlowDefinition(
  job: Job,
  flowId: string,
  workspaceId: string | undefined,
): Promise<Awaited<ReturnType<FlowEngineGlobal['loadFlow']>>> {
  if (!job.data.flow?.nodes) {
    // Load from DB scoped to workspace if provided
    return engine.loadFlow(flowId, workspaceId);
  }
  // Use runtime definition from editor
  const flowDef = engine.parseFlowDefinition(
    flowId || 'temp-run',
    job.data.flow.nodes,
    job.data.flow.edges,
    job.data.workspace?.id || 'default',
  );
  if (job.data.startNode) {
    flowDef.startNode = job.data.startNode;
  }
  return flowDef;
}

async function checkIdempotentCompletion(
  jobId: Job['id'],
  executionId: string | undefined,
  workspaceId: string | undefined,
): Promise<{ ok: true; skipped: true; reason: 'already_completed' } | null> {
  if (!executionId) {
    return null;
  }
  const existingExec = await engine.getExecution(executionId, workspaceId);
  if (!existingExec) {
    return null;
  }
  if (existingExec.status !== 'COMPLETED' && existingExec.status !== 'FAILED') {
    return null;
  }
  log.warn('flow_already_completed', { jobId, executionId, status: existingExec.status });
  return { ok: true, skipped: true, reason: 'already_completed' };
}

async function runSubscriptionAndRateGuards(
  jobId: Job['id'],
  workspaceId: string | undefined,
  subscriptionChecked: boolean,
): Promise<SkippedFlowResult | null> {
  if (!subscriptionChecked && workspaceId) {
    const blocked = await checkFlowSubscription(jobId, workspaceId);
    if (blocked) {
      return blocked;
    }
  }

  if (workspaceId) {
    const blocked = await checkFlowRateLimit(jobId, workspaceId);
    if (blocked) {
      return blocked;
    }
  }
  return null;
}

async function executeResolvedFlow(
  job: Job,
  flowDef: Awaited<ReturnType<typeof resolveFlowDefinition>>,
  user: string,
  flowId: string | undefined,
  initialVars: Parameters<typeof engine.startFlow>[2],
  executionId: string | undefined,
): Promise<void> {
  if (flowDef) {
    await engine.startFlow(user, flowDef, initialVars, executionId);
    log.info('flow_completed', { jobId: job.id, flowId, user });
  } else {
    log.error('flow_not_found', { jobId: job.id, flowId });
  }
}

async function handleRunFlow(job: Job) {
  log.info('flow_start', { jobId: job.id, queue: job.queueName });

  const { user, flowId, initialVars, executionId } = job.data;
  const workspace = job.data.workspace;
  let workspaceId = job.data.workspaceId || workspace?.id;
  let subscriptionChecked = false;

  // 1. Check Subscription Status (if workspace known)
  if (workspace?.id) {
    const blocked = await checkFlowSubscription(job.id, workspace.id);
    subscriptionChecked = true;
    if (blocked) {
      return blocked;
    }
  }

  // Idempotency Check
  const alreadyCompleted = await checkIdempotentCompletion(job.id, executionId, workspaceId);
  if (alreadyCompleted) {
    return alreadyCompleted;
  }

  const flowDef = await resolveFlowDefinition(job, flowId, workspaceId);

  // Derive workspaceId if not provided
  if (!workspaceId && flowDef?.workspaceId) {
    workspaceId = flowDef.workspaceId;
  }

  const guarded = await runSubscriptionAndRateGuards(job.id, workspaceId, subscriptionChecked);
  if (guarded) {
    return guarded;
  }

  await executeResolvedFlow(job, flowDef, user, flowId, initialVars, executionId);

  return { ok: true };
}

/**
 * Handle scheduled follow-up jobs from UnifiedAgentService
 * Sends the scheduled message via WhatsApp
 */
async function handleScheduledFollowup(job: Job) {
  const { workspaceId, contactId, phone, message, scheduledFor } = job.data ?? {};

  log.info('followup_start', { jobId: job.id, workspaceId, phone, scheduledFor });

  if (!workspaceId || !phone || !message) {
    log.warn('followup_invalid_job', { jobId: job.id, data: job.data });
    return { error: true, reason: 'invalid_followup_data' };
  }

  try {
    // Load workspace config
    const ws = await prisma.workspace.findUnique({ where: { id: workspaceId } });
    if (!ws) {
      log.warn('followup_workspace_not_found', { workspaceId });
      return { error: true, reason: 'workspace_not_found' };
    }

    // Check if contact responded in the meantime
    if (contactId) {
      const recentMessage = await prisma.message.findFirst({
        where: {
          conversation: { contactId, workspaceId },
          direction: 'INBOUND',
          createdAt: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) }, // últimas 24h
        },
        orderBy: { createdAt: 'desc' },
      });

      if (recentMessage) {
        log.info('followup_skip_recent_inbound', { workspaceId, contactId, phone });
        return { skipped: true, reason: 'recent_inbound_message' };
      }
    }

    // Send the follow-up message through the canonical outbound pipeline
    let sent = false;
    let channel = 'whatsapp';

    try {
      const result = await dispatchOutboundThroughFlow({
        workspaceId,
        to: phone,
        message,
        jobId: buildQueueJobId('scheduled-followup', workspaceId, contactId || phone, job.id),
      });
      sent = !!result && !result.error;
      log.info('followup_sent', { workspaceId, phone, channel, result: sent });
    } catch (whatsappErr: unknown) {
      const whatsappErrInstanceofError =
        whatsappErr instanceof Error
          ? whatsappErr
          : new Error(typeof whatsappErr === 'string' ? whatsappErr : 'unknown error');
      log.warn('followup_whatsapp_failed', {
        workspaceId,
        phone,
        error: whatsappErrInstanceofError.message,
      });
    }

    // Fallback: try email if WhatsApp failed and contact has email
    if (!sent && contactId) {
      const contact = await prisma.contact.findFirst({
        where: { id: contactId, workspaceId },
        select: { email: true, name: true },
      });

      if (contact?.email) {
        try {
          const emailResult = await sendFallbackEmail(
            contact.email,
            contact.name,
            message,
            ws.name,
          );
          if (emailResult) {
            sent = true;
            channel = 'email';
            log.info('followup_email_sent', { workspaceId, email: contact.email });
          }
        } catch (emailErr: unknown) {
          const emailErrInstanceofError =
            emailErr instanceof Error
              ? emailErr
              : new Error(typeof emailErr === 'string' ? emailErr : 'unknown error');
          log.warn('followup_email_failed', {
            workspaceId,
            error: emailErrInstanceofError.message,
          });
        }
      }
    }

    if (!sent) {
      log.warn('followup_all_channels_failed', { workspaceId, phone, contactId });
      return { ok: false, reason: 'all_channels_failed' };
    }

    // Update autopilot event status
    try {
      const prismaClient = prisma as unknown as Record<string, unknown>;
      if (prismaClient.autopilotEvent) {
        await (
          prismaClient.autopilotEvent as { updateMany: (args: unknown) => Promise<unknown> }
        ).updateMany({
          where: {
            workspaceId,
            contactId: contactId || undefined,
            status: 'scheduled',
            action: 'SCHEDULE_FOLLOWUP',
          },
          data: {
            status: 'success',
            responseText: message,
          },
        });
      }
    } catch {
      // PULSE:OK — FollowUp result table may not exist in all envs; send result already recorded
      void 0;
    }

    return { ok: true, sent: true };
  } catch (err: unknown) {
    const errInstanceofError =
      err instanceof Error ? err : new Error(typeof err === 'string' ? err : 'unknown error');
    log.error('followup_error', { jobId: job.id, error: errInstanceofError.message });
    throw err;
  }
}

import { HealthMonitor } from './providers/health-monitor';

const JSON_RE = /```json/g;
const PATTERN_RE = /```/g;

const PRE__VALOR_CUSTA_PIX_BO_RE = /(preç|valor|custa|pix|boleto|pag|assin|compr|checkout|fechar)/i;

async function handleSendMessage(job: Job) {
  const { to, message, user, workspaceId, workspace: initialWorkspace } = job.data ?? {};
  let workspace = initialWorkspace;
  const {
    mediaUrl,
    mediaType,
    caption,
    template,
    externalId: jobExternalId,
    quotedMessageId,
    chatId,
  } = job.data ?? {};
  const start = Date.now();
  let contactId: string | null = null;
  let conversationId: string | null = null;
  type ProviderSendResponse = {
    messages?: Array<{ id?: string | null } | null | undefined> | null;
    message?: { id?: string | null } | null;
    id?: string | null;
    messageId?: string | null;
    sid?: string | null;
  } | null;
  const extractExternalId = (res: ProviderSendResponse): string | null =>
    res?.messages?.[0]?.id || res?.message?.id || res?.id || res?.messageId || res?.sid || null;

  // Lazy load workspace config if not provided
  if (!workspace && workspaceId) {
    const ws = await prisma.workspace.findUnique({ where: { id: workspaceId } });
    if (ws) {
      workspace = {
        id: ws.id,
        whatsappProvider: DEFAULT_WHATSAPP_PROVIDER,
        jitterMin: ws.jitterMin,
        jitterMax: ws.jitterMax,
      };
    }
  }

  log.info('send_start', { jobId: job.id, workspaceId: workspace?.id || workspaceId, to });

  if (!workspace || !to) {
    log.warn('send_invalid_job', { jobId: job.id, data: job.data });
    return { error: true, reason: 'invalid_job_data' };
  }

  // 1. Check Plan Limits (Messages per Month)
  const limitCheck = await PlanLimitsProvider.checkMessageLimit(workspace.id);
  if (!limitCheck.allowed) {
    log.warn('send_blocked_limit', {
      jobId: job.id,
      workspaceId: workspace.id,
      reason: limitCheck.reason,
    });
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
          name: null,
        },
      });
      contactId = contact.id;

      const existing = await prisma.conversation.findFirst({
        where: { workspaceId: workspace.id, contactId, status: { not: 'CLOSED' } },
        select: { id: true },
      });
      if (existing) {
        conversationId = existing.id;
      } else {
        const conv = await prisma.conversation.create({
          data: {
            workspaceId: workspace.id,
            contactId,
            status: 'OPEN',
            channel: 'WHATSAPP',
            priority: 'MEDIUM',
          },
          select: { id: true },
        });
        conversationId = conv.id;
      }
    } catch (prepErr) {
      log.warn('send_prepare_persist_failed', {
        error: prepErr instanceof Error ? prepErr.message : String(prepErr),
      });
    }

    let res: Awaited<ReturnType<typeof WhatsAppEngine.sendText>> | undefined;
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
        {
          quotedMessageId,
          chatId,
        },
      );
    } else {
      res = await WhatsAppEngine.sendText(workspace, targetUser, message, {
        quotedMessageId,
        chatId,
      });
    }
    const latency = Date.now() - start;

    // Detect provider-level errors that didn't throw (common in HTTP 200 with { error })
    const providerError = (res && (res.error || res.err || res.status === 'error')) || null;

    await HealthMonitor.updateMetrics(workspace.id, !providerError, latency);
    if (!providerError) {
      await HealthMonitor.reportStatus(workspace.id, 'CONNECTED');
    }

    const msgType = mediaType ? mediaType.toUpperCase() : template?.name ? 'TEMPLATE' : 'TEXT';
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
            content: caption || message || mediaUrl || '',
            direction: 'OUTBOUND',
            type: msgType,
            mediaUrl: mediaUrl || undefined,
            status: providerError ? 'FAILED' : 'SENT',
            errorCode: providerError ? String(providerError) : null,
            externalId: externalId || undefined,
          },
        });

        await prisma.conversation.updateMany({
          where: { id: conversationId, workspaceId: workspace.id },
          data: { lastMessageAt: new Date(), unreadCount: 0 },
        });

        // Notifica realtime (via Redis → backend WebSocket)
        const payload = {
          type: 'message:new',
          workspaceId: workspace.id,
          message: created,
        };
        await redisPub.publish('ws:inbox', JSON.stringify(payload));
        await redisPub.publish(
          'ws:inbox',
          JSON.stringify({
            type: 'conversation:update',
            workspaceId: workspace.id,
            conversation: {
              id: conversationId,
              lastMessageStatus: providerError ? 'FAILED' : 'SENT',
              lastMessageErrorCode: providerError ? String(providerError) : null,
              lastMessageAt: created.createdAt,
            },
          }),
        );
        await redisPub.publish(
          'ws:inbox',
          JSON.stringify({
            type: 'message:status',
            workspaceId: workspace.id,
            payload: {
              id: created.id,
              conversationId,
              contactId,
              externalId,
              status: providerError ? 'FAILED' : 'SENT',
              errorCode: providerError ? String(providerError) : null,
            },
          }),
        );
      } catch (dbErr) {
        log.warn('send_persist_failed', {
          error: dbErr instanceof Error ? dbErr.message : String(dbErr),
        });
      }
    }

    if (providerError) {
      log.warn('send_provider_error', {
        jobId: job.id,
        workspaceId: workspace.id,
        to,
        error: providerError,
      });
      throw new Error(String(providerError));
    }

    log.info('send_completed', { jobId: job.id, workspaceId: workspace.id, to, latency });
    return { ok: true, result: res };
  } catch (err) {
    const latency = Date.now() - start;
    const maxAttempts = typeof job.opts?.attempts === 'number' ? job.opts.attempts : 1;
    const finalFailure =
      job.attemptsMade + 1 >= maxAttempts ||
      (err instanceof Error ? err.message : String(err)) === 'session_expired';

    // Health Check Failure
    await HealthMonitor.updateMetrics(workspace.id, false, latency);
    log.error('send_failed', { jobId: job.id, error: err });

    // Persist failure for analytics
    if (finalFailure && contactId && conversationId) {
      try {
        await prisma.message.create({
          data: {
            id: uuidv4(),
            workspaceId: workspace.id,
            contactId,
            conversationId,
            content: caption || message || mediaUrl || '',
            direction: 'OUTBOUND',
            type: mediaType ? mediaType.toUpperCase() : template?.name ? 'TEMPLATE' : 'TEXT',
            mediaUrl: mediaUrl || undefined,
            status: 'FAILED',
            errorCode: err instanceof Error ? err.message : String(err),
            externalId: undefined,
          },
        });
      } catch (dbErr) {
        log.warn('send_persist_failed_errorpath', {
          error: dbErr instanceof Error ? dbErr.message : String(dbErr),
        });
      }

      try {
        await redisPub.publish(
          'ws:inbox',
          JSON.stringify({
            type: 'message:status',
            workspaceId: workspace.id,
            payload: {
              conversationId,
              contactId,
              status: 'FAILED',
              errorCode: err instanceof Error ? err.message : String(err),
            },
          }),
        );
      } catch (pubErr) {
        log.warn('ws_publish_failed_errorpath', {
          error: pubErr instanceof Error ? pubErr.message : String(pubErr),
        });
      }
    }

    // Erros de sessão expirada (24h) não valem retry
    if ((err instanceof Error ? err.message : String(err)) === 'session_expired') {
      return { error: true, reason: 'session_expired', skipped: true };
    }

    // Retry logic handled by BullMQ, but we log health
    throw err;
  }
}

/** Flow worker. */
export const flowWorker = SHOULD_EXECUTE
  ? new Worker(
      'flow-jobs',
      async (job: Job) => {
        const start = process.hrtime.bigint();
        try {
          switch (job.name) {
            case 'run-flow':
              return await handleRunFlow(job);

            case 'resume-flow':
              // Retoma um fluxo aguardando resposta do usuário
              if (job.data?.user && job.data?.message) {
                await engine.onUserResponse(job.data.user, job.data.message, job.data.workspaceId);
                return { ok: true };
              }
              log.warn('resume_invalid_job', { jobId: job.id, data: job.data });
              return { error: true, reason: 'invalid_resume_job' };

            case 'send-message':
              return await handleSendMessage(job);

            // PULSE:OK — incoming-message is enqueued by inbound-processor via flowQueue under different naming
            case 'incoming-message': {
              // Retoma fluxos que estavam aguardando resposta do usuário
              const { user, message, workspaceId } = job.data || {};
              if (user && message) {
                await engine.onUserResponse(user, message, workspaceId);
                log.info('incoming_routed', { user, workspaceId });
              } else {
                log.warn('incoming_invalid_payload', { data: job.data });
              }
              return { ok: true };
            }

            // PULSE:OK — scheduled-followup is enqueued by followup.service as followup-contact with jobId containing this name
            case 'scheduled-followup':
              // Follow-up agendado pelo UnifiedAgentService
              return await handleScheduledFollowup(job);

            default:
              log.warn('unknown_job', { name: job.name, jobId: job.id });
              return null;
          }
        } catch (err) {
          log.error('job_error', {
            jobId: job.id,
            error: err instanceof Error ? err.message : String(err),
          });
          throw err;
        } finally {
          const duration = Number(process.hrtime.bigint() - start) / 1e9;
          const labels: { queue: string; name: string } = {
            queue: job.queueName,
            name: job.name,
          };
          jobDuration.observe({ ...labels, status: 'processed' }, duration);
          jobCounter.inc({ ...labels, status: 'processed' });
        }
      },
      {
        connection,
        concurrency: 1,
        lockDuration: 60000,
      },
    )
  : null;

// EVENTO: job completou
flowWorker?.on('completed', (job: Job) => {
  log.info('job_completed', { jobId: job?.id });
  const labels: { queue: string; name: string } = {
    queue: job?.queueName || 'flow-jobs',
    name: job?.name || 'unknown',
  };
  jobCounter.inc({ ...labels, status: 'completed' });
});

// EVENTO: job falhou
flowWorker?.on('failed', (job: Job | undefined, err: Error) => {
  log.error('job_failed', { jobId: job?.id, error: err?.message });
  const labels: { queue: string; name: string } = {
    queue: job?.queueName || 'flow-jobs',
    name: job?.name || 'unknown',
  };
  jobCounter.inc({ ...labels, status: 'failed' });

  const workspaceId = (() => {
    const d = job?.data as Record<string, unknown> | undefined;
    const ws = d?.workspace;
    if (ws && typeof ws === 'object' && !Array.isArray(ws)) {
      const wsId = (ws as Record<string, unknown>).id;
      if (typeof wsId === 'string') {
        return wsId;
      }
    }
    if (typeof d?.workspaceId === 'string') {
      return d.workspaceId;
    }
    return 'global';
  })();
  const payload = {
    type: 'job_failed',
    workspaceId,
    jobId: job?.id,
    queue: job?.queueName,
    name: job?.name,
    error: err?.message,
    ts: Date.now(),
  };
  // Publica alerta para dashboards/ops
  redisPub
    .publish(`alerts:${workspaceId}`, JSON.stringify(payload))
    .catch((err) =>
      log.warn?.('redis_publish_alert_failed', { error: err?.message || String(err) }),
    );
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

type AutopilotSettings = {
  openai?: { apiKey?: string | null } | null;
  autonomy?: { mode?: string | null } | null;
  autopilot?: { enabled?: boolean | null } | null;
  providerSettings?: { calendarLink?: string | null } | null;
  calendarLink?: string | null;
  [key: string]: unknown;
};

type AutopilotContact = {
  tags?: ReadonlyArray<{ name: string }> | null;
};

function asNestedObject(value: Prisma.JsonValue | undefined): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null;
  }
  return value as Record<string, unknown>;
}

function asNestedString(value: unknown): string | null {
  return typeof value === 'string' ? value : null;
}

function parseAutopilotSettings(raw: Prisma.JsonValue | null | undefined): AutopilotSettings {
  const base = asJsonObject(raw);
  const openai = asNestedObject(base.openai);
  const autonomy = asNestedObject(base.autonomy);
  const autopilot = asNestedObject(base.autopilot);
  const providerSettings = asNestedObject(base.providerSettings);

  const parsed: AutopilotSettings = {
    openai: openai ? { apiKey: asNestedString(openai.apiKey) } : null,
    autonomy: autonomy ? { mode: asNestedString(autonomy.mode) } : null,
    autopilot: autopilot
      ? { enabled: typeof autopilot.enabled === 'boolean' ? autopilot.enabled : null }
      : null,
    providerSettings: providerSettings
      ? { calendarLink: asNestedString(providerSettings.calendarLink) }
      : null,
    calendarLink: asNestedString(base.calendarLink),
  };

  for (const [key, value] of Object.entries(base)) {
    if (!(key in parsed)) {
      parsed[key] = value;
    }
  }

  return parsed;
}

const bestHourCache = new Map<string, { hour: number; ts: number }>();
const BEST_HOUR_CACHE_MAX = 500; // bounded by workspace count

async function computeBestHour(workspaceId: string): Promise<number> {
  const cache = bestHourCache.get(workspaceId);
  if (cache && Date.now() - cache.ts < 10 * 60 * 1000) {
    return cache.hour;
  }

  const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const msgs = await prisma.message.findMany({
    where: { workspaceId, createdAt: { gte: since } },
    select: { createdAt: true },
  });

  const buckets: number[] = new Array<number>(24).fill(0);
  msgs.forEach((m) => {
    buckets[m.createdAt.getHours()]++;
  });
  let best = 10;
  let bestVal = -1;
  buckets.forEach((v: number, idx: number) => {
    if (v > bestVal) {
      bestVal = v;
      best = idx;
    }
  });
  // Evict oldest entry if cache exceeds max size to prevent unbounded growth
  if (bestHourCache.size >= BEST_HOUR_CACHE_MAX) {
    const oldestKey = bestHourCache.keys().next().value;
    if (oldestKey) {
      bestHourCache.delete(oldestKey);
    }
  }
  bestHourCache.set(workspaceId, { hour: best, ts: Date.now() });
  return best;
}

function hasKeyword(text: string, ...keys: string[]) {
  const lower = text.toLowerCase();
  return keys.some((k) => lower.includes(k));
}

type KeywordRule = {
  readonly keywords: readonly string[];
  readonly decision: AutopilotDecision;
};

const KEYWORD_RULES: readonly KeywordRule[] = [
  {
    keywords: ['quanto custa', 'preco', 'preço', 'valor', 'preco?'],
    decision: { intent: 'BUYING', action: 'SEND_PRICE', reason: 'price_question' },
  },
  {
    keywords: ['quero', 'comprar', 'fechar', 'vamos', 'contratar', 'assinar'],
    decision: { intent: 'BUYING', action: 'SEND_OFFER', reason: 'buy_signal' },
  },
  {
    keywords: ['pix', 'boleto', 'pagar', 'pagamento', 'checkout', 'link de pagamento'],
    decision: { intent: 'BUYING', action: 'SEND_OFFER', reason: 'payment_intent' },
  },
  {
    keywords: ['agendar', 'agenda', 'calend', 'marcar', 'reuni', 'call'],
    decision: { intent: 'SCHEDULING', action: 'SEND_CALENDAR', reason: 'schedule' },
  },
  {
    keywords: ['problema', 'erro', 'bug', 'não funciona', 'nao funciona', 'suporte'],
    decision: { intent: 'SUPPORT', action: 'TRANSFER_AGENT', reason: 'support' },
  },
  {
    keywords: ['caro', 'muito caro', 'sem dinheiro', 'agora não', 'agora nao', 'talvez depois'],
    decision: { intent: 'OBJECTION', action: 'HANDLE_OBJECTION', reason: 'price_objection' },
  },
  {
    keywords: ['cancel', 'cancelar', 'desistir', 'parar', 'não quero mais', 'nao quero mais'],
    decision: { intent: 'CHURN_RISK', action: 'ANTI_CHURN', reason: 'churn_risk' },
  },
  {
    keywords: ['já uso', 'ja uso', 'sou cliente', 'renovar', 'upgrade', 'plano maior'],
    decision: { intent: 'UPSELL', action: 'UPSELL', reason: 'existing_customer' },
  },
];

function classifyByKeywords(text: string): AutopilotDecision | null {
  for (const rule of KEYWORD_RULES) {
    if (hasKeyword(text, ...rule.keywords)) {
      return rule.decision;
    }
  }
  return null;
}

async function classifyWithAi(text: string, apiKey: string): Promise<AutopilotDecision | null> {
  try {
    const { AIProvider } = await import('./providers/ai-provider');
    const ai = new AIProvider(apiKey);
    const prompt = `
      Classifique a intenção para atendimento de vendas em JSON:
      Campos: intent (BUYING|SCHEDULING|SUPPORT|OBJECTION|CHURN_RISK|UPSELL|IDLE), action (SEND_OFFER|SEND_PRICE|SEND_CALENDAR|TRANSFER_AGENT|FOLLOW_UP|HANDLE_OBJECTION|ANTI_CHURN|UPSELL|NONE), reason.
      Mensagem: "${text}"
      `;
    const res = await ai.generateResponse('Responda apenas JSON.', prompt);
    const parsed = JSON.parse(res.replace(JSON_RE, '').replace(PATTERN_RE, ''));
    return {
      intent: parsed.intent || 'IDLE',
      action: parsed.action || 'NONE',
      reason: parsed.reason || 'ai_decision',
    };
  } catch {
    // PULSE:OK — AI intent parse failure falls back to default IDLE intent below
    return null;
  }
}

async function decideAction(
  messageContent: string,
  settings: AutopilotSettings,
): Promise<AutopilotDecision> {
  const text = messageContent || '';

  const keywordDecision = classifyByKeywords(text);
  if (keywordDecision) {
    return keywordDecision;
  }

  // If AI key available, try richer intent
  const apiKey = settings?.openai?.apiKey || process.env.OPENAI_API_KEY;
  if (apiKey) {
    const aiDecision = await classifyWithAi(text, apiKey);
    if (aiDecision) {
      return aiDecision;
    }
  }

  return { intent: 'IDLE', action: 'FOLLOW_UP', reason: 'default_follow_up' };
}

async function generateTemplate(
  action: string,
  message: string,
  settings: AutopilotSettings,
): Promise<string> {
  // PR P4-1: templates are now in worker/constants/sales-templates.ts
  // (byte-identical mirror of backend/src/common/sales-templates.ts).
  // The hardcoded `cal.com/danielpenin` is gone — calendar links come
  // from workspace settings or DEFAULT_CALENDAR_LINK env var.
  const calendarLink: string | undefined =
    settings?.providerSettings?.calendarLink || settings?.calendarLink || undefined;

  // Reuse AI for richer pitch
  if (action === 'SEND_OFFER' || action === 'OFFER') {
    const apiKey = settings?.openai?.apiKey || process.env.OPENAI_API_KEY;
    if (apiKey) {
      try {
        const { AIProvider } = await import('./providers/ai-provider');
        const ai = new AIProvider(apiKey);
        return await ai.generateResponse(
          'Você é um closer conciso. Gere uma oferta curta com CTA.',
          `Mensagem do lead: "${message || 'sem contexto'}". Gere uma oferta direta.`,
        );
      } catch {
        // PULSE:OK — AI offer generation failure falls back to static OFFER template below
      }
    }
    return renderTemplate('OFFER', { calendarLink });
  }

  const key = action as keyof typeof SALES_TEMPLATES;
  if (key in SALES_TEMPLATES) {
    return renderTemplate(key, { calendarLink });
  }
  return renderTemplate('FOLLOW_UP', { calendarLink });
}

async function ensureOptInAllowed(
  _workspaceId: string,
  contact: AutopilotContact | null | undefined,
): Promise<void> {
  const enforce = process.env.ENFORCE_OPTIN === 'true';
  if (!enforce) {
    return;
  }

  const tags = contact?.tags ?? [];
  const hasOptIn = tags.some((t) => t.name === 'optin_whatsapp');
  if (!hasOptIn) {
    throw new Error('optin_required');
  }
}

function isAutonomyActive(settings: AutopilotSettings): boolean {
  const mode = String(settings?.autonomy?.mode || '').toUpperCase();
  if (['LIVE', 'BACKLOG', 'FULL'].includes(mode)) {
    return true;
  }
  if (['OFF', 'HUMAN_ONLY', 'SUSPENDED'].includes(mode)) {
    return false;
  }
  return settings?.autopilot?.enabled === true;
}

async function autopilotScanner() {
  try {
    const workspaces = await prisma.workspace.findMany({
      select: { id: true, providerSettings: true, jitterMin: true, jitterMax: true },
    });

    await forEachSequential(workspaces, async (workspace) => {
      const settings = parseAutopilotSettings(workspace.providerSettings);
      if (!isAutonomyActive(settings)) {
        return;
      }

      const convs = await prisma.conversation.findMany({
        where: { workspaceId: workspace.id, status: 'OPEN' },
        orderBy: { updatedAt: 'desc' },
        take: 50,
        include: {
          contact: { include: { tags: { select: { name: true } } } },
          messages: { take: 1, orderBy: { createdAt: 'desc' } },
        },
      });

      await forEachSequential(convs, async (conv) => {
        const lastMsg = conv.messages[0];
        if (!lastMsg) {
          return;
        }

        const cf = asJsonObject(conv.contact?.customFields);
        const lastActionAt = jsonDateMillis(cf.autopilotLastActionAt);
        const nextRetryAt = jsonDateMillis(cf.autopilotNextRetryAt);
        if (nextRetryAt && nextRetryAt > Date.now()) {
          return;
        }
        if (lastActionAt && Date.now() - lastActionAt < 2 * 60 * 60 * 1000) {
          return;
        }

        const now = Date.now();
        const ageHours = (now - new Date(lastMsg.createdAt).getTime()) / 3600000;
        const isInbound = lastMsg.direction === 'INBOUND';
        const text = (lastMsg.content || '').toLowerCase();
        const buyingSignal = PRE__VALOR_CUSTA_PIX_BO_RE.test(text);
        const shouldFollowUp =
          (ageHours >= 12 && lastMsg.direction === 'OUTBOUND') || (ageHours >= 24 && isInbound);
        const antiChurn = ageHours >= 72;

        if (!isInbound && !shouldFollowUp && !antiChurn) {
          return;
        }

        const hour = new Date().getHours();
        const isNight = hour >= 22 || hour < 7;
        const decision = antiChurn
          ? { intent: 'CHURN_RISK', action: 'ANTI_CHURN', reason: 'silent_72h' }
          : buyingSignal && isInbound && ageHours >= 6
            ? { intent: 'BUYING_SIGNAL', action: 'GHOST_CLOSER', reason: 'silent_buying_signal' }
            : shouldFollowUp
              ? { intent: 'REENGAGE', action: 'FOLLOW_UP_STRONG', reason: 'silent_24h' }
              : await decideAction(lastMsg.content || '', settings);
        const action = decision.action || 'FOLLOW_UP';

        try {
          const messageToSend = await generateTemplate(
            isNight && (decision.intent === 'BUYING' || action === 'SEND_OFFER')
              ? 'NIGHT_SOFT'
              : action,
            lastMsg.content || '',
            settings,
          );
          if (!messageToSend) {
            return;
          }

          const subscription = await PlanLimitsProvider.checkSubscriptionStatus(conv.workspaceId);
          if (!subscription.active) {
            throw new Error(subscription.reason || 'subscription_inactive');
          }
          const msgLimit = await PlanLimitsProvider.checkMessageLimit(conv.workspaceId);
          if (!msgLimit.allowed) {
            throw new Error(msgLimit.reason || 'message_limit');
          }

          await ensureOptInAllowed(conv.workspaceId, conv.contact);

          const bestHour = await computeBestHour(conv.workspaceId);
          const currentHour = new Date().getHours();
          const withinPrime = Math.abs(currentHour - bestHour) <= 2;
          const isHotAction = action === 'SEND_OFFER' || action === 'SEND_PRICE';
          if (!withinPrime && !isHotAction) {
            return;
          }

          let status: 'executed' | 'error' = 'executed';
          let errorMsg: string | undefined;
          try {
            await dispatchOutboundThroughFlow({
              workspaceId: conv.workspaceId,
              to: conv.contact.phone,
              message: messageToSend,
              jobId: buildQueueJobId(
                'legacy-scanner',
                conv.workspaceId,
                conv.contactId,
                Date.now(),
              ),
            });
          } catch (err: unknown) {
            status = 'error';
            errorMsg = getErrorMessage(err);
            throw err;
          } finally {
            const newCf = {
              ...(cf || {}),
              autopilotLastAction: action,
              autopilotLastActionAt: new Date().toISOString(),
              autopilotNextRetryAt: null,
            };
            const auditDetails: Prisma.InputJsonObject = {
              intent: decision.intent || 'UNKNOWN',
              action,
              reason: decision.reason || 'auto',
              message: messageToSend,
              status,
              ...(errorMsg ? { error: errorMsg } : {}),
            };
            await prisma.contact.updateMany({
              where: { id: conv.contactId, workspaceId: conv.workspaceId },
              data: { customFields: newCf as Prisma.InputJsonObject },
            });

            await prisma.auditLog.create({
              data: {
                action: 'AUTOPILOT_ACTION',
                resource: 'contact',
                resourceId: conv.contactId,
                details: auditDetails,
                workspaceId: conv.workspaceId,
              },
            });

            autopilotDecisionCounter.inc({
              workspaceId: conv.workspaceId,
              intent: decision.intent || 'UNKNOWN',
              action,
              result: status,
            });
          }
        } catch (err: unknown) {
          log.warn('autopilot_scan_error', { error: getErrorMessage(err), convId: conv.id });
        }
      });
    });
  } catch (err: unknown) {
    log.error('autopilot_scan_loop_error', { error: getErrorMessage(err) });
  }
}

if (ENABLE_LEGACY_AUTOPILOT_SCANNER_WITH_APPROVAL) {
  // Scanner legado mantido apenas como fallback operacional temporário.
  setInterval(autopilotScanner, 5 * 60 * 1000);
  log.warn('legacy_autopilot_scanner_enabled', {
    everyMs: 5 * 60 * 1000,
  });
} else if (ENABLE_LEGACY_AUTOPILOT_SCANNER && !ALLOW_PROACTIVE_OUTREACH) {
  log.warn('legacy_autopilot_scanner_blocked', {
    reason: 'allow_proactive_outreach_required',
  });
} else {
  log.info('legacy_autopilot_scanner_disabled');
}
