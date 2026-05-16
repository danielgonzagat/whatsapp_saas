import { type Job, Worker } from 'bullmq';
import { FlowEngineGlobal } from './flow-engine-global';
import { WorkerLogger } from './logger';
import { jobCounter, jobDuration } from './metrics';
import {
  checkFlowSubscription,
  checkIdempotentCompletion,
  executeResolvedFlow,
  resolveFlowDefinition,
  runSubscriptionAndRateGuards,
} from './processor-flow-guards';
import {
  autopilotQueue,
  buildQueueOptions,
  shutdownQueueSystem,
  silent24hResolverQueue,
} from './queue';
import './campaign-processor'; // Start Campaign Worker
import './scraper-processor'; // Start Scraper Worker
import './media-processor'; // Start Media Worker
import './voice-processor'; // Start Voice Worker
import './processors/memory-processor'; // Start Memory Worker
import './processors/webhook-processor'; // Start Webhook Worker
import './processors/crm-processor'; // Start CRM Worker
import './processors/silent-24h-resolver.processor'; // Start Silent 24h Resolver Worker
import './metrics-server'; // Expose /metrics and /health
import './dlq-monitor'; // Monitor DLQs and alert ops
import { redisPub } from './redis-client';
import { getErrorMessage } from './utils/error-message';
import { handleScheduledFollowup } from './scheduled-followup-handler';
import { handleSendMessage } from './send-message-handler';
import { autopilotScanner } from './autopilot-scanner.engine';
import {
  checkIdempotent,
  endJob,
  extractWorkspaceId,
  logError,
  markCompleted,
  startJob,
} from './processor-base';
import { startAutopilotHealthMonitor } from './processor-health-monitor';

/**
 * =======================================================
 * WORKER ENGINE — VERSION PRO (TS SAFE)
 *
 * ARCHITECTURAL COHESION: This file is the Worker Process Lifecycle
 * controller. It wires together the Flow Engine, BullMQ workers, scheduler
 * repeatables, autopilot health monitoring, graceful shutdown handlers, and
 * legacy scanner. Flow guards and health monitoring are extracted to dedicated
 * modules (processor-flow-guards.ts, processor-health-monitor.ts). What
 * remains is the boot-time wiring, the job dispatch switch, event handlers,
 * and the SIGTERM/SIGINT shutdown orchestration — all of which form a single
 * "process lifecycle" responsibility.
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

  void (async () => {
    try {
      await silent24hResolverQueue.add(
        'resolve-expired',
        {},
        {
          jobId: 'silent-24h-resolve-expired',
          repeat: { pattern: '*/5 * * * *' },
          removeOnComplete: true,
        },
      );
      log.info('silent_24h_resolver_scheduled', { pattern: '*/5 * * * *' });
    } catch (err: unknown) {
      log.warn('silent_24h_resolver_schedule_failed', { error: getErrorMessage(err) });
    }
  })();

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
/*  Queue health monitor (extracted → processor-health-monitor.ts)      */
/* ------------------------------------------------------------------ */

const autopilotMonitorInterval = startAutopilotHealthMonitor(log);

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
/*  Flow guard helpers (extracted → processor-flow-guards.ts)          */
/* ------------------------------------------------------------------ */

/* ------------------------------------------------------------------ */
/*  Job handler: run-flow                                              */
/* ------------------------------------------------------------------ */

async function handleRunFlow(job: Job) {
  log.info('flow_start', { jobId: job.id, queue: job.queueName });

  const { user, flowId, initialVars, executionId } = job.data;
  const workspace = job.data.workspace;
  let workspaceId = job.data.workspaceId || workspace?.id;
  let subscriptionChecked = false;

  if (workspace?.id) {
    const blocked = await checkFlowSubscription(job.id, workspace.id);
    subscriptionChecked = true;
    if (blocked) {
      log.warn('flow_blocked_subscription', {
        jobId: job.id,
        workspaceId: workspace.id,
        reason: blocked.reason,
      });
      return blocked;
    }
  }

  const alreadyCompleted = await checkIdempotentCompletion(
    engine,
    job.id,
    executionId,
    workspaceId,
  );
  if (alreadyCompleted) {
    log.warn('flow_already_completed', {
      jobId: job.id,
      executionId,
      workspaceId,
      reason: alreadyCompleted.reason,
    });
    return alreadyCompleted;
  }

  const flowDef = await resolveFlowDefinition(engine, job, flowId, workspaceId);

  if (!workspaceId && flowDef?.workspaceId) {
    workspaceId = flowDef.workspaceId;
  }

  const guarded = await runSubscriptionAndRateGuards(job.id, workspaceId, subscriptionChecked);
  if (guarded) {
    return guarded;
  }

  await executeResolvedFlow(engine, log, job, flowDef, user, flowId, initialVars, executionId);

  return { ok: true };
}

/* ------------------------------------------------------------------ */
/*  Flow worker                                                        */
/* ------------------------------------------------------------------ */

export const flowWorker = SHOULD_EXECUTE
  ? new Worker(
      'flow-jobs',
      async (job: Job) => {
        const meta = startJob(job, log);
        const correlationId = meta.correlationId;
        const ctxLog = log.withContext(correlationId, meta.workspaceId);

        try {
          const dedup = await checkIdempotent(job);
          if (dedup) {
            ctxLog.info('job_skipped_idempotent', { jobId: job.id });
            const durationMs = endJob(meta, ctxLog, job.name, 'skipped');
            jobDuration.observe(
              { queue: job.queueName, name: job.name, status: 'skipped' },
              durationMs / 1000,
            );
            jobCounter.inc({ queue: job.queueName, name: job.name, status: 'skipped' });
            return { ok: true, skipped: true, reason: 'idempotent' };
          }

          let result: unknown;
          switch (job.name) {
            case 'run-flow':
              result = await handleRunFlow(job);
              break;
            case 'resume-flow':
              if (job.data?.user && job.data?.message) {
                await engine.onUserResponse(job.data.user, job.data.message, job.data.workspaceId);
                result = { ok: true };
              } else {
                ctxLog.warn('resume_invalid_job', { jobId: job.id, data: job.data });
                result = { error: true, reason: 'invalid_resume_job' };
              }
              break;
            case 'send-message':
              result = await handleSendMessage(job);
              break;
            case 'incoming-message': {
              const { user, message, workspaceId } = job.data || {};
              if (user && message) {
                await engine.onUserResponse(user, message, workspaceId);
                ctxLog.info('incoming_routed', { user, workspaceId });
              } else {
                ctxLog.warn('incoming_invalid_payload', { data: job.data });
              }
              result = { ok: true };
              break;
            }
            case 'scheduled-followup':
              result = await handleScheduledFollowup(job);
              break;
            default:
              ctxLog.warn('unknown_job', { name: job.name, jobId: job.id });
              result = null;
          }

          await markCompleted(job);
          const durationMs = endJob(meta, ctxLog, job.name, 'completed');
          jobDuration.observe(
            { queue: job.queueName, name: job.name, status: 'processed' },
            durationMs / 1000,
          );
          jobCounter.inc({ queue: job.queueName, name: job.name, status: 'processed' });
          return result;
        } catch (err) {
          logError(meta, ctxLog, err, job.name);
          const durationMs = endJob(meta, ctxLog, job.name, 'failed');
          jobDuration.observe(
            { queue: job.queueName, name: job.name, status: 'failed' },
            durationMs / 1000,
          );
          jobCounter.inc({ queue: job.queueName, name: job.name, status: 'failed' });

          if (typeof job.data === 'object' && job.data !== null && !Object.isFrozen(job.data)) {
            (job.data as Record<string, unknown>).correlationId = correlationId;
          }
          throw err;
        }
      },
      { ...buildQueueOptions(), concurrency: 1, lockDuration: 60000 },
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
  const workspaceId = job ? extractWorkspaceId(job) : 'unknown';
  const correlationId =
    job?.data && typeof job.data === 'object'
      ? ((job.data as Record<string, unknown>)?.correlationId ?? 'unknown')
      : 'unknown';
  log.error('job_failed', {
    jobId: job?.id,
    error: err?.message,
    correlationId,
    workspaceId,
  });
  const labels: { queue: string; name: string } = {
    queue: job?.queueName || 'flow-jobs',
    name: job?.name || 'unknown',
  };
  jobCounter.inc({ ...labels, status: 'failed' });

  const payload = {
    type: 'job_failed',
    workspaceId,
    correlationId,
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
