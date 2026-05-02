import { type Job, Worker } from 'bullmq';
import { FlowEngineGlobal } from './flow-engine-global';
import { WorkerLogger } from './logger';
import { jobCounter, jobDuration } from './metrics';
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
import { redisPub } from './redis-client';
import { getErrorMessage } from './utils/error-message';
import { handleScheduledFollowup } from './__companions__/scheduled-followup-handler.companion';
import { handleSendMessage } from './__companions__/send-message-handler.companion';
import { autopilotScanner } from './__companions__/autopilot-scanner.companion';

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

if (SHOULD_EXECUTE) {
  void import('./processors/autopilot-processor'); // Start Autopilot Worker
} else {
  log.info('autopilot_worker_disabled_for_role', { role: WORKER_ROLE });
}

/* ------------------------------------------------------------------ */
/*  Schedulers                                                         */
/* ------------------------------------------------------------------ */

if (SHOULD_SCHEDULE) {
  if (ALLOW_PROACTIVE_OUTREACH) {
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
        log.warn('autopilot_cycle_schedule_failed', { error: getErrorMessage(err) });
      }
    })();
  } else {
    log.info('autopilot_cycle_scheduler_disabled', {
      role: WORKER_ROLE,
      reason: 'proactive_outreach_disabled',
    });
  }

  log.info('cia_main_loop_disabled', {
    reason: 'observer_reactive_only',
    role: WORKER_ROLE,
  });

  log.info('cia_self_improvement_disabled', { reason: 'stabilizing' });
  log.info('cia_global_learning_disabled', { reason: 'stabilizing' });
} else {
  log.info('repeatable_schedulers_disabled_for_role', { role: WORKER_ROLE });
}

/* ------------------------------------------------------------------ */
/*  Queue health monitor                                               */
/* ------------------------------------------------------------------ */

const QUEUE_THRESHOLD =
  Number.parseInt(process.env.AUTOPILOT_QUEUE_WAITING_THRESHOLD || '200', 10) || 200;
const ALERT_WEBHOOK =
  process.env.AUTOPILOT_ALERT_WEBHOOK || process.env.OPS_WEBHOOK_URL || process.env.DLQ_WEBHOOK_URL;
let lastQueueAlert = 0;
const QUEUE_ALERT_COOLDOWN_MS = 5 * 60_000;

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
    log.warn('autopilot_alert_failed', { error: getErrorMessage(err) });
  }
}

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
    log.warn('autopilot_queue_monitor_error', { error: getErrorMessage(err) });
  }
}

const autopilotMonitorInterval = setInterval(checkAutopilotQueueHealth, 60_000);

/* ------------------------------------------------------------------ */
/*  Graceful shutdown                                                  */
/* ------------------------------------------------------------------ */

async function gracefulShutdown(signal: string) {
  log.info('shutdown_started', { signal });
  clearInterval(autopilotMonitorInterval);
  await engine
    .shutdown()
    .catch((err) => log.warn('flow_engine_shutdown_error', { error: getErrorMessage(err) }));
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

/* ------------------------------------------------------------------ */
/*  Flow guard helpers                                                 */
/* ------------------------------------------------------------------ */

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
    return engine.loadFlow(flowId, workspaceId);
  }
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

/* ------------------------------------------------------------------ */
/*  Job handler: run-flow                                              */
/* ------------------------------------------------------------------ */

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

/* ------------------------------------------------------------------ */
/*  Flow worker                                                        */
/* ------------------------------------------------------------------ */

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
              if (job.data?.user && job.data?.message) {
                await engine.onUserResponse(job.data.user, job.data.message, job.data.workspaceId);
                return { ok: true };
              }
              log.warn('resume_invalid_job', { jobId: job.id, data: job.data });
              return { error: true, reason: 'invalid_resume_job' };

            case 'send-message':
              return await handleSendMessage(job);

            case 'incoming-message': {
              const { user, message, workspaceId } = job.data || {};
              if (user && message) {
                await engine.onUserResponse(user, message, workspaceId);
                log.info('incoming_routed', { user, workspaceId });
              } else {
                log.warn('incoming_invalid_payload', { data: job.data });
              }
              return { ok: true };
            }

            case 'scheduled-followup':
              return await handleScheduledFollowup(job);

            default:
              log.warn('unknown_job', { name: job.name, jobId: job.id });
              return null;
          }
        } catch (err) {
          log.error('job_error', {
            jobId: job.id,
            error: getErrorMessage(err),
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

/* ------------------------------------------------------------------ */
/*  Worker event handlers                                              */
/* ------------------------------------------------------------------ */

flowWorker?.on('completed', (job: Job) => {
  log.info('job_completed', { jobId: job?.id });
  const labels: { queue: string; name: string } = {
    queue: job?.queueName || 'flow-jobs',
    name: job?.name || 'unknown',
  };
  jobCounter.inc({ ...labels, status: 'completed' });
});

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
  redisPub
    .publish(`alerts:${workspaceId}`, JSON.stringify(payload))
    .catch((pubErr) =>
      log.warn?.('redis_publish_alert_failed', { error: pubErr?.message || String(pubErr) }),
    );
});

/* ------------------------------------------------------------------ */
/*  Legacy autopilot scanner                                           */
/* ------------------------------------------------------------------ */

if (ENABLE_LEGACY_AUTOPILOT_SCANNER_WITH_APPROVAL) {
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
