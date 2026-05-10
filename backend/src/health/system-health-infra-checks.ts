import { ConfigService } from '@nestjs/config';
import { StorageService } from '../common/storage/storage.service';
import { getTraceHeaders } from '../common/trace-headers';
import { QueueHealthService } from '../metrics/queue-health.service';
import { ObservabilityQueriesService } from '../metrics/observability-queries.service';
import { WhatsAppApiProvider } from '../whatsapp/providers/whatsapp-api.provider';

const HEALTH_RE = /\/health$/i;
const S____S____S_RE = /^\s*\{\s*\}\s*/;
const PATTERN_RE = /\/+$/;
const HTTPS_RE = /^https?:\/\//i;
const LOCALHOST_127__0__0__1_RE = /^(localhost|127\.0\.0\.1)(:\d+)?$/i;
const RAILWAY__INTERNAL_RE = /\.railway\.internal(?::\d+)?$/i;

export function resolveConfiguredWhatsAppProvider(): 'meta-cloud' {
  return 'meta-cloud';
}

export async function checkWhatsAppTransport(
  whatsappApi: WhatsAppApiProvider,
  observabilityQueries: ObservabilityQueriesService,
) {
  const provider = resolveConfiguredWhatsAppProvider();
  const runtime = whatsappApi.getRuntimeConfigDiagnostics();
  const connectedWorkspaces = await getConnectedMetaWorkspaceCount(observabilityQueries);
  const transportReady =
    runtime.appIdConfigured &&
    runtime.appSecretConfigured &&
    runtime.webhookConfigured &&
    runtime.inboundEventsConfigured;

  return {
    status: transportReady ? 'UP' : 'DOWN',
    provider,
    auth: runtime.accessTokenConfigured
      ? 'GLOBAL_TOKEN'
      : connectedWorkspaces > 0
        ? 'WORKSPACE_OAUTH_CONNECTED'
        : 'WORKSPACE_OAUTH_PENDING',
    appId: runtime.appIdConfigured ? 'CONFIGURED' : 'MISSING',
    appSecret: runtime.appSecretConfigured ? 'CONFIGURED' : 'MISSING',
    phoneNumberId: runtime.phoneNumberIdConfigured
      ? 'CONFIGURED'
      : connectedWorkspaces > 0
        ? 'WORKSPACE_SCOPED'
        : 'PENDING_FIRST_CONNECTION',
    webhook:
      runtime.webhookConfigured && runtime.inboundEventsConfigured ? 'CONFIGURED' : 'MISSING',
    webhookEvents: runtime.events,
    store: runtime.storeEnabled ? 'ENABLED' : 'DISABLED',
    connectedWorkspaces,
    connectionMode: 'workspace-oauth',
  };
}

export function resolveWorkerHealthUrl(config: ConfigService): string | null {
  const candidates = [
    config.get<string>('WORKER_HEALTH_URL'),
    config.get<string>('WORKER_METRICS_URL'),
    config.get<string>('WORKER_INTERNAL_URL'),
    config.get<string>('WORKER_BROWSER_RUNTIME_URL'),
    config.get<string>('RAILWAY_SERVICE_WORKER_URL'),
  ];

  for (const candidate of candidates) {
    const normalized = normalizeServiceUrl(candidate);
    if (!normalized) {
      continue;
    }
    return HEALTH_RE.test(normalized) ? normalized : `${normalized}/health`;
  }

  return null;
}

export function normalizeServiceUrl(candidate: string | undefined): string {
  const raw = String(candidate || '')
    .replace(S____S____S_RE, '')
    .trim()
    .replace(PATTERN_RE, '');

  if (!raw) {
    return '';
  }

  if (HTTPS_RE.test(raw)) {
    return raw;
  }

  if (LOCALHOST_127__0__0__1_RE.test(raw)) {
    return `http://${raw}`;
  }

  if (RAILWAY__INTERNAL_RE.test(raw)) {
    return `http://${raw}`;
  }

  return `https://${raw}`;
}

export function maskUrl(input: string): string {
  try {
    const url = new URL(input);
    url.username = '';
    url.password = '';
    return url.toString();
  } catch {
    return input;
  }
}

export async function checkWorker(config: ConfigService) {
  const workerHealthUrl = resolveWorkerHealthUrl(config);
  const workerMetricsToken = config.get<string>('WORKER_METRICS_TOKEN');

  if (!workerHealthUrl) {
    return { status: 'NOT_CONFIGURED' };
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 3000);

  type FetchFn = (url: string, init: RequestInit) => Promise<Response>;
  const apiFetch: FetchFn = (globalThis as Record<string, unknown>).fetch as FetchFn;

  try {
    const response = await apiFetch(workerHealthUrl, {
      method: 'GET',
      headers: workerMetricsToken
        ? {
            ...getTraceHeaders(),
            Authorization: `Bearer ${workerMetricsToken}`,
          }
        : getTraceHeaders(),
      signal: controller.signal,
    });
    clearTimeout(timeout);

    if (!response.ok) {
      return {
        status: 'DOWN',
        url: maskUrl(workerHealthUrl),
        error: `HTTP ${response.status}`,
      };
    }

    const payload = await response.json().catch(() => ({}));
    return {
      status: payload?.status === 'ok' ? 'UP' : 'DEGRADED',
      url: maskUrl(workerHealthUrl),
      details: payload,
    };
  } catch (e: unknown) {
    clearTimeout(timeout);
    return {
      status: 'DOWN',
      url: maskUrl(workerHealthUrl),
      error: e instanceof Error ? (e instanceof Error ? e.message : String(e)) : 'unknown_error',
    };
  }
}

export async function checkQueues(queueHealth: QueueHealthService) {
  try {
    const statuses = await queueHealth.getQueuesStatus();
    const totalWaiting = statuses.reduce((sum, q) => sum + (q.main.waiting || 0), 0);
    const totalFailed = statuses.reduce((sum, q) => sum + (q.main.failed || 0), 0);
    const totalDlqWaiting = statuses.reduce((sum, q) => sum + (q.dlq.waiting || 0), 0);
    const totalDlqFailed = statuses.reduce((sum, q) => sum + (q.dlq.failed || 0), 0);
    const threshold = statuses[0]?.threshold ?? 200;
    const alert = totalWaiting > threshold || totalFailed > 0 || totalDlqFailed > 0;
    return {
      status: alert ? 'DEGRADED' : 'UP',
      waiting: totalWaiting,
      failed: totalFailed,
      dlqWaiting: totalDlqWaiting,
      dlqFailed: totalDlqFailed,
      threshold,
    };
  } catch (e: unknown) {
    return {
      status: 'DOWN',
      error: e instanceof Error ? e.message : String(e),
    };
  }
}

export async function checkStorage(storageService: StorageService) {
  try {
    return await storageService.healthCheck();
  } catch (e: unknown) {
    return {
      status: 'DOWN',
      driver: 'unknown',
      error: e instanceof Error ? (e instanceof Error ? e.message : String(e)) : 'unknown_error',
    };
  }
}

export function checkCriticalConfig(config: ConfigService) {
  const jwtSecret = config.get<string>('JWT_SECRET');
  const redisUrl = config.get<string>('REDIS_URL');
  const metaAppId = config.get<string>('META_APP_ID');
  const metaAppSecret = config.get<string>('META_APP_SECRET');
  const metaVerifyToken =
    config.get<string>('META_VERIFY_TOKEN') ||
    config.get<string>('META_WEBHOOK_VERIFY_TOKEN');

  const missing: string[] = [];
  if (!jwtSecret) {
    missing.push('JWT_SECRET');
  }
  if (!redisUrl) {
    missing.push('REDIS_URL');
  }
  if (!metaAppId) {
    missing.push('META_APP_ID');
  }
  if (!metaAppSecret) {
    missing.push('META_APP_SECRET');
  }
  if (!metaVerifyToken) {
    missing.push('META_VERIFY_TOKEN');
  }

  return {
    status: missing.length ? 'DOWN' : 'CONFIGURED',
    missing,
  };
}

export async function getConnectedMetaWorkspaceCount(
  observabilityQueries: ObservabilityQueriesService,
): Promise<number> {
  try {
    return await observabilityQueries.countConnectedMetaWorkspaces();
  } catch {
    return 0;
  }
}
