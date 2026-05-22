import { WorkerLogger } from './logger';
import { autopilotQueue } from './queue';
import { getErrorMessage } from './utils/error-message';

export function parseNonNegativeEnvInt(raw: string | undefined, fallback: number): number {
  if (raw === undefined || raw.trim() === '') {
    return fallback;
  }
  const parsed = Number(raw);
  return Number.isInteger(parsed) && parsed >= 0 ? parsed : fallback;
}

const QUEUE_THRESHOLD =
  Number.parseInt(process.env.AUTOPILOT_QUEUE_WAITING_THRESHOLD || '200', 10) || 200;
// Transient failures (a handful of jobs) must NOT spam the warn channel —
// they were the root cause of the runtime probe flapping in 2026-05. Only
// alert when the failed-job count rises beyond a meaningful threshold AND
// keeps growing between checks; otherwise stay silent.
const FAILED_JOBS_THRESHOLD =
  Number.parseInt(process.env.AUTOPILOT_QUEUE_FAILED_THRESHOLD || '25', 10) || 25;
let lastObservedFailed = 0;
const ALERT_WEBHOOK =
  process.env.AUTOPILOT_ALERT_WEBHOOK || process.env.OPS_WEBHOOK_URL || process.env.DLQ_WEBHOOK_URL;
let lastQueueAlert = 0;
const QUEUE_ALERT_COOLDOWN_MS = 5 * 60_000;
const AUTOPILOT_QUEUE_CHECK_INTERVAL_MS = 60_000;
// Failed-job auto-drain grace window. Jobs that failed more than this many
// milliseconds ago are reaped on every health tick — they are graveyards
// from past outages whose retry budget is long exhausted. Recent failures
// (within the grace window) keep alerting so on-call still sees them.
const AUTOPILOT_FAILED_DRAIN_GRACE_MS = parseNonNegativeEnvInt(
  process.env.AUTOPILOT_FAILED_DRAIN_GRACE_MS,
  60 * 60_000,
);
const AUTOPILOT_FAILED_DRAIN_LIMIT = parseNonNegativeEnvInt(
  process.env.AUTOPILOT_FAILED_DRAIN_LIMIT,
  1000,
);

async function sendOpsAlert(
  log: WorkerLogger,
  message: string,
  meta: Record<string, unknown> = {},
): Promise<void> {
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

async function maybeAlertHighQueue(
  log: WorkerLogger,
  waiting: number,
  failed: number,
  now: number,
): Promise<void> {
  if (waiting <= QUEUE_THRESHOLD || now - lastQueueAlert <= QUEUE_ALERT_COOLDOWN_MS) {
    return;
  }
  lastQueueAlert = now;
  log.warn('autopilot_queue_high', { waiting, failed, threshold: QUEUE_THRESHOLD });
  await sendOpsAlert(log, 'Autopilot queue high', { waiting, failed, threshold: QUEUE_THRESHOLD });
}

async function maybeAlertFailedJobs(
  log: WorkerLogger,
  failed: number,
  waiting: number,
  now: number,
): Promise<void> {
  const grew = failed > lastObservedFailed;
  lastObservedFailed = failed;
  if (failed < FAILED_JOBS_THRESHOLD || !grew || now - lastQueueAlert <= QUEUE_ALERT_COOLDOWN_MS) {
    return;
  }
  lastQueueAlert = now;
  log.warn('autopilot_queue_failed', {
    failed,
    waiting,
    threshold: FAILED_JOBS_THRESHOLD,
  });
  await sendOpsAlert(log, 'Autopilot queue has failed jobs', {
    failed,
    waiting,
    threshold: FAILED_JOBS_THRESHOLD,
  });
}

/**
 * Reap failed jobs that have been sitting past {@link AUTOPILOT_FAILED_DRAIN_GRACE_MS}.
 * Returns the number of jobs removed so the caller can re-read the live counts.
 */
async function drainStaleFailedJobs(log: WorkerLogger): Promise<number> {
  try {
    const drained = await autopilotQueue.clean(
      AUTOPILOT_FAILED_DRAIN_GRACE_MS,
      AUTOPILOT_FAILED_DRAIN_LIMIT,
      'failed',
    );
    if (drained.length > 0) {
      log.info('autopilot_queue_drained_stale_failed', {
        drained: drained.length,
        graceMs: AUTOPILOT_FAILED_DRAIN_GRACE_MS,
      });
    }
    return drained.length;
  } catch (err: unknown) {
    log.warn('autopilot_queue_drain_failed', { error: getErrorMessage(err) });
    return 0;
  }
}

export async function checkAutopilotQueueHealth(log: WorkerLogger): Promise<void> {
  try {
    let counts = await autopilotQueue.getJobCounts();
    let failed = counts.failed || 0;
    // Reap ancient graveyard before alerting so transient-outage debris does
    // not keep pinging on-call and tripping the runtime gate forever.
    if (failed > 0) {
      const drained = await drainStaleFailedJobs(log);
      if (drained > 0) {
        counts = await autopilotQueue.getJobCounts();
        failed = counts.failed || 0;
      }
    }
    const waiting = (counts.waiting || 0) + (counts.delayed || 0);
    const now = Date.now();

    await maybeAlertHighQueue(log, waiting, failed, now);
    await maybeAlertFailedJobs(log, failed, waiting, now);
  } catch (err: unknown) {
    log.warn('autopilot_queue_monitor_error', { error: getErrorMessage(err) });
  }
}

export function startAutopilotHealthMonitor(log: WorkerLogger): ReturnType<typeof setInterval> {
  return setInterval(() => {
    void checkAutopilotQueueHealth(log);
  }, AUTOPILOT_QUEUE_CHECK_INTERVAL_MS);
}
