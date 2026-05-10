import { WorkerLogger } from './logger';
import { autopilotQueue } from './queue';
import { getErrorMessage } from './utils/error-message';

const QUEUE_THRESHOLD =
  Number.parseInt(process.env.AUTOPILOT_QUEUE_WAITING_THRESHOLD || '200', 10) || 200;
const ALERT_WEBHOOK =
  process.env.AUTOPILOT_ALERT_WEBHOOK || process.env.OPS_WEBHOOK_URL || process.env.DLQ_WEBHOOK_URL;
let lastQueueAlert = 0;
const QUEUE_ALERT_COOLDOWN_MS = 5 * 60_000;
const AUTOPILOT_QUEUE_CHECK_INTERVAL_MS = 60_000;

async function sendOpsAlert(log: WorkerLogger, message: string, meta: Record<string, unknown> = {}): Promise<void> {
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

async function maybeAlertHighQueue(log: WorkerLogger, waiting: number, failed: number, now: number): Promise<void> {
  if (waiting <= QUEUE_THRESHOLD || now - lastQueueAlert <= QUEUE_ALERT_COOLDOWN_MS) {
    return;
  }
  lastQueueAlert = now;
  log.warn('autopilot_queue_high', { waiting, failed, threshold: QUEUE_THRESHOLD });
  await sendOpsAlert(log, 'Autopilot queue high', { waiting, failed, threshold: QUEUE_THRESHOLD });
}

async function maybeAlertFailedJobs(log: WorkerLogger, failed: number, waiting: number, now: number): Promise<void> {
  if (failed <= 0 || now - lastQueueAlert <= QUEUE_ALERT_COOLDOWN_MS) {
    return;
  }
  lastQueueAlert = now;
  log.warn('autopilot_queue_failed', { failed, waiting });
  await sendOpsAlert(log, 'Autopilot queue has failed jobs', { failed, waiting });
}

export async function checkAutopilotQueueHealth(log: WorkerLogger): Promise<void> {
  try {
    const counts = await autopilotQueue.getJobCounts();
    const waiting = (counts.waiting || 0) + (counts.delayed || 0);
    const failed = counts.failed || 0;
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
