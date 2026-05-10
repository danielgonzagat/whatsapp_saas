import { InjectRedis } from '@nestjs-modules/ioredis';
import { Injectable, Logger, Optional } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';
import { StripeService } from '../billing/stripe.service';
import { StorageService } from '../common/storage/storage.service';
import { getTraceHeaders } from '../common/trace-headers';
import { QueueHealthService } from '../metrics/queue-health.service';
import { ObservabilityQueriesService } from '../metrics/observability-queries.service';
import { PrismaService } from '../prisma/prisma.service';
import { connection } from '../queue/queue';
import { WhatsAppApiProvider } from '../whatsapp/providers/whatsapp-api.provider';

const HEALTH_RE = /\/health$/i;
const S____S____S_RE = /^\s*\{\s*\}\s*/;
const PATTERN_RE = /\/+$/;
const HTTPS_RE = /^https?:\/\//i;
const LOCALHOST_127__0__0__1_RE = /^(localhost|127\.0\.0\.1)(:\d+)?$/i;
const RAILWAY__INTERNAL_RE = /\.railway\.internal(?::\d+)?$/i;

/** System health service. */
@Injectable()
export class SystemHealthService {
  constructor(
    private prisma: PrismaService,
    @InjectRedis() private redis: Redis,
    private config: ConfigService,
    private readonly whatsappApi: WhatsAppApiProvider,
    private readonly storageService: StorageService,
    private readonly observabilityQueries: ObservabilityQueriesService,
    private readonly queueHealth: QueueHealthService,
    @Optional()
    private readonly stripeService: StripeService,
  ) {}

  /**
   * Liveness probe: "is the process alive and responding?"
   *
   * No external dependencies. No database, no Redis, no worker. A liveness
   * failure is the only acceptable signal for the orchestrator to kill and
   * restart the container. Returning DOWN from liveness because Redis is
   * temporarily unreachable creates restart storms that cannot fix the
   * underlying problem.
   */
  liveness() {
    return { status: 'UP', timestamp: new Date().toISOString() };
  }

  /**
   * Readiness probe: "should this instance receive traffic?"
   *
   * Checks only the dependencies that must be up to serve any request
   * meaningfully (database + Redis). Other integrations (WhatsApp, Worker,
   * Storage, Stripe, OpenAI) have their own degraded modes and should not
   * gate readiness — losing them means partial functionality, not no
   * functionality.
   */
  async readiness() {
    const [database, redis] = await Promise.all([this.checkDatabase(), this.checkRedis()]);
    const isReady = database.status === 'UP' && redis.status === 'UP';
    return {
      status: isReady ? 'UP' : 'DOWN',
      details: { database, redis },
      timestamp: new Date().toISOString(),
    };
  }

  /** Check. */
  async check() {
    const whatsapp = await this.checkWhatsAppTransport();
    const [database, redis, worker, storage, queues] = await Promise.all([
      this.checkDatabase(),
      this.checkRedis(),
      this.checkWorker(),
      this.checkStorage(),
      this.checkQueues(),
    ]);
    const backup = this.checkBackup();
    const email = this.checkEmail();
    const stripe = this.checkStripe();
    const status = {
      database,
      redis,
      whatsapp,
      worker,
      storage,
      queues,
      backup,
      email,
      config: this.checkCriticalConfig(),
      openai: this.checkOpenAI(),
      anthropic: this.checkAnthropic(),
      stripe,
      googleAuth: this.checkGoogleAuth(),
      version: '0.0.365',
      timestamp: new Date().toISOString(),
    };

    const hardDependencies = [
      status.database,
      status.redis,
      status.whatsapp,
      status.worker,
      status.config,
    ];
    const hasDownDependency = hardDependencies.some(
      (dependency: Record<string, unknown>) => dependency?.status === 'DOWN',
    );
    const isHealthy =
      !hasDownDependency &&
      Object.values(status)
        .filter((s: unknown) => typeof s === 'object' && s && 'status' in s)
        .every((s: unknown) =>
          ['UP', 'CONFIGURED', 'NOT_CONFIGURED'].includes((s as Record<string, string>).status),
        );
    return {
      status: hasDownDependency ? 'DOWN' : isHealthy ? 'UP' : 'DEGRADED',
      details: status,
    };
  }

  /**
   * Deep readiness probe: Postgres, Redis (via BullMQ), Stripe, Meta Cloud API,
   * OpenAI, Anthropic — each with a 2-second timeout.
   *
   * Unlike the narrow readiness(), this checks every critical dependency the
   * application needs to serve full traffic. Orchestrators should gate routing
   * on this endpoint.
   */
  async deepReadiness(): Promise<{
    status: 'UP' | 'DOWN';
    timestamp: string;
    failures: string[];
    details: Record<
      string,
      { status: string; error?: string; latencyMs?: number }
    >;
  }> {
    const logger = new Logger('ReadinessProbe');
    const startedAt = Date.now();

    const probes: Array<Promise<{
      dependency: string;
      status: 'UP' | 'DOWN';
      error?: string;
      latencyMs: number;
    }>> = [
      this.probePostgres(),
      this.probeBullMQRedis(),
      this.probeStripe(),
      this.probeMetaCloud(),
      this.probeOpenAI(),
      this.probeAnthropic(),
      Promise.resolve(this.probeEmail()),
    ];

    const settled = await Promise.allSettled(probes);
    const failures: string[] = [];
    const details: Record<
      string,
      { status: string; error?: string; latencyMs?: number }
    > = {};

    for (const result of settled) {
      if (result.status === 'rejected') {
        logger.error(
          `Readiness probe crashed unexpectedly`,
          String(result.reason),
        );
        continue;
      }

      const probe = result.value;
      details[probe.dependency] = {
        status: probe.status,
        latencyMs: probe.latencyMs,
      };

      if (probe.status === 'DOWN') {
        failures.push(probe.dependency);
        details[probe.dependency].error = probe.error ?? 'unknown';
      }
    }

    const status = failures.length === 0 ? 'UP' : 'DOWN';

    logger.log(
      JSON.stringify({
        event: 'readiness_probe.completed',
        status,
        failures,
        totalDurationMs: Date.now() - startedAt,
      }),
    );

    return {
      status,
      timestamp: new Date().toISOString(),
      failures,
      details,
    };
  }

  private async withTimeout<T>(
    promise: Promise<T>,
    ms: number,
    label: string,
  ): Promise<T> {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const timeout = new Promise<never>((_, reject) => {
      timer = setTimeout(() => {
        reject(new Error(`${label} timed out after ${ms}ms`));
      }, ms);
    });

    try {
      const result = await Promise.race([promise, timeout]);
      clearTimeout(timer);
      return result;
    } catch (err) {
      clearTimeout(timer);
      throw err;
    }
  }

  private async probePostgres(): Promise<{
    dependency: string;
    status: 'UP' | 'DOWN';
    error?: string;
    latencyMs: number;
  }> {
    const startedAt = Date.now();
    try {
      await this.withTimeout(
        this.prisma.$queryRaw<{ '?column?': 1 }[]>`SELECT 1`,
        2_000,
        'postgres',
      );
      return { dependency: 'postgres', status: 'UP', latencyMs: Date.now() - startedAt };
    } catch (err: unknown) {
      return {
        dependency: 'postgres',
        status: 'DOWN',
        error: err instanceof Error ? err.message : String(err),
        latencyMs: Date.now() - startedAt,
      };
    }
  }

  private async probeBullMQRedis(): Promise<{
    dependency: string;
    status: 'UP' | 'DOWN';
    error?: string;
    latencyMs: number;
  }> {
    const startedAt = Date.now();
    try {
      await this.withTimeout(connection.ping(), 2_000, 'redis-bullmq');
      return { dependency: 'redis', status: 'UP', latencyMs: Date.now() - startedAt };
    } catch (err: unknown) {
      return {
        dependency: 'redis',
        status: 'DOWN',
        error: err instanceof Error ? err.message : String(err),
        latencyMs: Date.now() - startedAt,
      };
    }
  }

  private async probeStripe(): Promise<{
    dependency: string;
    status: 'UP' | 'DOWN';
    error?: string;
    latencyMs: number;
  }> {
    const startedAt = Date.now();
    try {
      if (!this.stripeService) {
        return {
          dependency: 'stripe',
          status: 'DOWN',
          error: 'STRIPE_SECRET_KEY not configured',
          latencyMs: Date.now() - startedAt,
        };
      }
      await this.withTimeout(
        this.stripeService.retrieveBalance(),
        2_000,
        'stripe',
      );
      return { dependency: 'stripe', status: 'UP', latencyMs: Date.now() - startedAt };
    } catch (err: unknown) {
      return {
        dependency: 'stripe',
        status: 'DOWN',
        error: err instanceof Error ? err.message : String(err),
        latencyMs: Date.now() - startedAt,
      };
    }
  }

  private async probeMetaCloud(): Promise<{
    dependency: string;
    status: 'UP' | 'DOWN';
    error?: string;
    latencyMs: number;
  }> {
    const startedAt = Date.now();
    const appId = this.config.get<string>('META_APP_ID');
    const appSecret = this.config.get<string>('META_APP_SECRET');

    if (!appId || !appSecret) {
      return {
        dependency: 'metacloud',
        status: 'DOWN',
        error: 'META_APP_ID or META_APP_SECRET not configured',
        latencyMs: Date.now() - startedAt,
      };
    }

    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 2_000);

      try {
        const token = `${appId}|${appSecret}`;
        const response = await fetch(
          `https://graph.facebook.com/v21.0/${appId}?access_token=${encodeURIComponent(token)}&fields=id`,
          { signal: controller.signal },
        );
        clearTimeout(timeout);

        if (!response.ok) {
          const body = await response.text().catch(() => '');
          throw new Error(`Meta Graph API returned ${response.status}: ${body.slice(0, 200)}`);
        }

        return { dependency: 'metacloud', status: 'UP', latencyMs: Date.now() - startedAt };
      } catch (err) {
        clearTimeout(timeout);
        throw err;
      }
    } catch (err: unknown) {
      return {
        dependency: 'metacloud',
        status: 'DOWN',
        error: err instanceof Error ? err.message : String(err),
        latencyMs: Date.now() - startedAt,
      };
    }
  }

  private async probeOpenAI(): Promise<{
    dependency: string;
    status: 'UP' | 'DOWN';
    error?: string;
    latencyMs: number;
  }> {
    const startedAt = Date.now();
    const apiKey = this.config.get<string>('OPENAI_API_KEY');

    if (!apiKey) {
      return {
        dependency: 'openai',
        status: 'DOWN',
        error: 'OPENAI_API_KEY not configured',
        latencyMs: Date.now() - startedAt,
      };
    }

    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 2_000);

      try {
        const response = await fetch('https://api.openai.com/v1/models', {
          method: 'GET',
          headers: { Authorization: `Bearer ${apiKey}` },
          signal: controller.signal,
        });
        clearTimeout(timeout);

        if (!response.ok) {
          const body = await response.text().catch(() => '');
          throw new Error(`OpenAI API returned ${response.status}: ${body.slice(0, 200)}`);
        }

        return { dependency: 'openai', status: 'UP', latencyMs: Date.now() - startedAt };
      } catch (err) {
        clearTimeout(timeout);
        throw err;
      }
    } catch (err: unknown) {
      return {
        dependency: 'openai',
        status: 'DOWN',
        error: err instanceof Error ? err.message : String(err),
        latencyMs: Date.now() - startedAt,
      };
    }
  }

  private async probeAnthropic(): Promise<{
    dependency: string;
    status: 'UP' | 'DOWN';
    error?: string;
    latencyMs: number;
  }> {
    const startedAt = Date.now();
    const apiKey = this.config.get<string>('ANTHROPIC_API_KEY');

    if (!apiKey) {
      return {
        dependency: 'anthropic',
        status: 'DOWN',
        error: 'ANTHROPIC_API_KEY not configured',
        latencyMs: Date.now() - startedAt,
      };
    }

    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 2_000);

      try {
        const response = await fetch('https://api.anthropic.com/v1/messages', {
          method: 'POST',
          headers: {
            'x-api-key': apiKey,
            'anthropic-version': '2023-06-01',
            'content-type': 'application/json',
          },
          body: JSON.stringify({
            model: 'claude-3-haiku-20240307',
            max_tokens: 1,
            messages: [{ role: 'user', content: 'ping' }],
          }),
          signal: controller.signal,
        });
        clearTimeout(timeout);

        if (!response.ok) {
          const body = await response.text().catch(() => '');
          throw new Error(`Anthropic API returned ${response.status}: ${body.slice(0, 200)}`);
        }

        return { dependency: 'anthropic', status: 'UP', latencyMs: Date.now() - startedAt };
      } catch (err) {
        clearTimeout(timeout);
        throw err;
      }
    } catch (err: unknown) {
      return {
        dependency: 'anthropic',
        status: 'DOWN',
        error: err instanceof Error ? err.message : String(err),
        latencyMs: Date.now() - startedAt,
      };
    }
  }

  private probeEmail(): {
    dependency: string;
    status: 'UP' | 'DOWN';
    error?: string;
    latencyMs: number;
  } {
    const startedAt = Date.now();
    const isProduction = process.env.NODE_ENV === 'production';

    const hasResend = Boolean(process.env.RESEND_API_KEY?.trim());
    const hasSendGrid = Boolean(process.env.SENDGRID_API_KEY?.trim());
    const hasSmtp = Boolean(process.env.SMTP_HOST?.trim());
    const configured = hasResend || hasSendGrid || hasSmtp;

    if (!configured && isProduction) {
      return {
        dependency: 'email',
        status: 'DOWN',
        error:
          'No email provider configured: RESEND_API_KEY, SENDGRID_API_KEY, or SMTP_HOST missing',
        latencyMs: Date.now() - startedAt,
      };
    }

    return { dependency: 'email', status: 'UP', latencyMs: Date.now() - startedAt };
  }

  private async checkDatabase() {
    try {
      await this.prisma.$queryRaw<{ '?column?': 1 }[]>`SELECT 1`;
      return { status: 'UP', latency: 'OK' };
    } catch (e: unknown) {
      return { status: 'DOWN', error: e instanceof Error ? e.message : String(e) };
    }
  }

  private async checkRedis() {
    try {
      await this.redis.ping();
      return { status: 'UP' };
    } catch (e: unknown) {
      return {
        status: 'DOWN',
        error: e instanceof Error ? (e instanceof Error ? e.message : String(e)) : 'unknown_error',
      };
    }
  }

  private async checkStorage() {
    try {
      return await this.storageService.healthCheck();
    } catch (e: unknown) {
      return {
        status: 'DOWN',
        driver: 'unknown',
        error: e instanceof Error ? (e instanceof Error ? e.message : String(e)) : 'unknown_error',
      };
    }
  }

  private resolveConfiguredWhatsAppProvider(): 'meta-cloud' {
    return 'meta-cloud';
  }

  private async checkWhatsAppTransport() {
    const provider = this.resolveConfiguredWhatsAppProvider();
    const runtime = this.whatsappApi.getRuntimeConfigDiagnostics();
    const connectedWorkspaces = await this.getConnectedMetaWorkspaceCount();
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

  private async checkWorker() {
    const workerHealthUrl = this.resolveWorkerHealthUrl();
    const workerMetricsToken = this.config.get<string>('WORKER_METRICS_TOKEN');

    if (!workerHealthUrl) {
      return { status: 'NOT_CONFIGURED' };
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 3000);

    try {
      // Not SSRF: workerHealthUrl is derived from server-owned env vars
      // (WORKER_HEALTH_URL, WORKER_METRICS_URL, etc.) — intentional backend-to-worker
      // internal communication on Railway's private network.
      const response = await fetch(workerHealthUrl, {
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
          url: this.maskUrl(workerHealthUrl),
          error: `HTTP ${response.status}`,
        };
      }

      const payload = await response.json().catch(() => ({}));
      return {
        status: payload?.status === 'ok' ? 'UP' : 'DEGRADED',
        url: this.maskUrl(workerHealthUrl),
        details: payload,
      };
    } catch (e: unknown) {
      clearTimeout(timeout);
      return {
        status: 'DOWN',
        url: this.maskUrl(workerHealthUrl),
        error: e instanceof Error ? (e instanceof Error ? e.message : String(e)) : 'unknown_error',
      };
    }
  }

  private async checkQueues() {
    try {
      const statuses = await this.queueHealth.getQueuesStatus();
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

  private checkCriticalConfig() {
    const jwtSecret = this.config.get<string>('JWT_SECRET');
    const redisUrl = this.config.get<string>('REDIS_URL');
    const metaAppId = this.config.get<string>('META_APP_ID');
    const metaAppSecret = this.config.get<string>('META_APP_SECRET');
    const metaVerifyToken =
      this.config.get<string>('META_VERIFY_TOKEN') ||
      this.config.get<string>('META_WEBHOOK_VERIFY_TOKEN');

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

  private checkOpenAI() {
    const key = this.config.get('OPENAI_API_KEY');
    return { status: key ? 'CONFIGURED' : 'MISSING' };
  }

  private checkAnthropic() {
    const key = this.config.get('ANTHROPIC_API_KEY');
    return { status: key ? 'CONFIGURED' : 'MISSING' };
  }

  private checkStripe() {
    const key = this.config.get('STRIPE_SECRET_KEY');
    return { status: key ? 'CONFIGURED' : 'MISSING' };
  }

  private checkBackup() {
    return { status: 'CONFIGURED' };
  }

  private checkEmail() {
    const hasResend = Boolean(process.env.RESEND_API_KEY?.trim());
    const hasSendGrid = Boolean(process.env.SENDGRID_API_KEY?.trim());
    const hasSmtp = Boolean(process.env.SMTP_HOST?.trim());
    const configured = hasResend || hasSendGrid || hasSmtp;

    if (configured) {
      const provider = hasResend ? 'resend' : hasSendGrid ? 'sendgrid' : 'smtp';
      return { status: 'CONFIGURED', provider };
    }
    return {
      status: 'NOT_CONFIGURED',
      missing: ['RESEND_API_KEY', 'SENDGRID_API_KEY', 'SMTP_HOST'],
    };
  }

  private checkGoogleAuth() {
    const clientIds = this.getConfiguredGoogleClientIds();
    const clientSecret = this.config.get('GOOGLE_CLIENT_SECRET');

    if (clientIds.length) {
      return {
        status: 'CONFIGURED',
        mode: 'google_identity_services',
        clientIdsConfigured: clientIds.length,
        clientSecret: clientSecret ? 'CONFIGURED' : 'OPTIONAL_MISSING',
      };
    }

    return {
      status: 'MISSING',
      missing: ['GOOGLE_CLIENT_ID or NEXT_PUBLIC_GOOGLE_CLIENT_ID or GOOGLE_ALLOWED_CLIENT_IDS'],
    };
  }

  private getConfiguredGoogleClientIds() {
    const raw = [
      this.config.get<string>('GOOGLE_CLIENT_ID'),
      this.config.get<string>('NEXT_PUBLIC_GOOGLE_CLIENT_ID'),
      this.config.get<string>('GOOGLE_ALLOWED_CLIENT_IDS'),
    ]
      .filter((value): value is string => typeof value === 'string')
      .flatMap((value) => value.split(','))
      .map((value) => value.trim())
      .filter(Boolean);

    return [...new Set(raw)];
  }

  private maskUrl(input: string): string {
    try {
      const url = new URL(input);
      url.username = '';
      url.password = '';
      return url.toString();
    } catch {
      return input;
    }
  }

  private async getConnectedMetaWorkspaceCount(): Promise<number> {
    try {
      return await this.observabilityQueries.countConnectedMetaWorkspaces();
    } catch {
      return 0;
    }
  }

  private resolveWorkerHealthUrl(): string | null {
    const candidates = [
      this.config.get<string>('WORKER_HEALTH_URL'),
      this.config.get<string>('WORKER_METRICS_URL'),
      this.config.get<string>('WORKER_INTERNAL_URL'),
      this.config.get<string>('WORKER_BROWSER_RUNTIME_URL'),
      this.config.get<string>('RAILWAY_SERVICE_WORKER_URL'),
    ];

    for (const candidate of candidates) {
      const normalized = this.normalizeServiceUrl(candidate);
      if (!normalized) {
        continue;
      }
      return HEALTH_RE.test(normalized) ? normalized : `${normalized}/health`;
    }

    return null;
  }

  private normalizeServiceUrl(candidate: string | undefined): string {
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
}
