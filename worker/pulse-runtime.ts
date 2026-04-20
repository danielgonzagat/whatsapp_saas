import { WorkerLogger } from './logger';
import { getHealth } from './metrics';
import { autopilotQueue } from './queue';

const PATTERN_RE = /\/+$/;

const log = new WorkerLogger('pulse-runtime');
const DEFAULT_INTERVAL_MS = 15_000;

function resolveBackendUrl(): string | null {
  const configured =
    process.env.BACKEND_URL || process.env.API_URL || process.env.SERVICE_BASE_URL || '';

  const normalized = configured.trim().replace(PATTERN_RE, '');
  return normalized || null;
}

function resolveInternalToken() {
  return (
    process.env.PULSE_RUNTIME_TOKEN ||
    process.env.INTERNAL_API_KEY ||
    process.env.WORKER_METRICS_TOKEN ||
    ''
  ).trim();
}

function resolveNodeId() {
  const suffix =
    process.env.RAILWAY_REPLICA_ID ||
    process.env.RAILWAY_SERVICE_ID ||
    process.env.HOSTNAME ||
    'local';

  return `worker:${suffix}`;
}

function resolveIntervalMs() {
  const parsed = Number.parseInt(process.env.PULSE_WORKER_HEARTBEAT_MS || '', 10);
  if (Number.isFinite(parsed) && parsed >= 5_000) {
    return parsed;
  }
  return DEFAULT_INTERVAL_MS;
}

async function publishHeartbeat() {
  const backendUrl = resolveBackendUrl();
  if (!backendUrl) {
    return;
  }

  const token = resolveInternalToken();
  const [health, queueCounts] = await Promise.all([
    getHealth(),
    autopilotQueue.getJobCounts().catch(() => ({
      waiting: 0,
      active: 0,
      delayed: 0,
      failed: 0,
    })),
  ]);

  const waiting = (queueCounts.waiting || 0) + (queueCounts.delayed || 0);
  const failed = queueCounts.failed || 0;
  const threshold = Number.parseInt(process.env.AUTOPILOT_QUEUE_WAITING_THRESHOLD || '200', 10);

  const status =
    health.status === 'down'
      ? 'DOWN'
      : waiting > threshold || failed > 0 || health.status === 'degraded'
        ? 'DEGRADED'
        : 'UP';

  const summary =
    status === 'UP'
      ? 'Worker heartbeat healthy.'
      : status === 'DOWN'
        ? 'Worker heartbeat failed: Redis or queue runtime unavailable.'
        : 'Worker heartbeat degraded: queue pressure or failed jobs detected.';

  const response = await fetch(`${backendUrl}/pulse/live/internal`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { 'X-Internal-Key': token } : {}),
    },
    body: JSON.stringify({
      nodeId: resolveNodeId(),
      role: 'worker',
      status,
      critical: true,
      ttlMs: Math.max(resolveIntervalMs() * 3, 45_000),
      summary,
      version: String(process.env.RAILWAY_GIT_COMMIT_SHA || '').slice(0, 12) || undefined,
      signals: {
        redisStatus: health.status === 'down' ? 'DOWN' : 'UP',
        autopilotWaiting: waiting,
        autopilotActive: queueCounts.active || 0,
        autopilotFailed: failed,
        autopilotThreshold: threshold,
        uptimeSec: Math.round(process.uptime()),
        workerRole: process.env.WORKER_ROLE || 'all',
      },
    }),
    signal: AbortSignal.timeout(8_000),
  });

  if (!response.ok) {
    throw new Error(`pulse collector returned HTTP ${response.status}`);
  }
}

/** Start pulse runtime reporter. */
export function startPulseRuntimeReporter() {
  const backendUrl = resolveBackendUrl();
  if (!backendUrl) {
    log.warn('pulse_runtime_disabled', {
      reason: 'backend_url_missing',
    });
    return () => {};
  }

  let stopped = false;
  let inFlight = false;
  const intervalMs = resolveIntervalMs();

  const tick = async () => {
    if (stopped || inFlight) {
      return;
    }

    inFlight = true;
    try {
      await publishHeartbeat();
    } catch (error: unknown) {
      log.warn('pulse_runtime_heartbeat_failed', {
        error: error instanceof Error ? error.message : 'unknown_error',
      });
    } finally {
      inFlight = false;
    }
  };

  void tick();
  const timer = setInterval(() => {
    void tick();
  }, intervalMs);

  return () => {
    stopped = true;
    clearInterval(timer);
  };
}
