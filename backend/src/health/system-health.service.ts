import { InjectRedis } from '@nestjs-modules/ioredis';
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';
import { StorageService } from '../common/storage/storage.service';
import { PrismaService } from '../prisma/prisma.service';
import { WhatsAppApiProvider } from '../whatsapp/providers/whatsapp-api.provider';

const HEALTH_RE = /\/health$/i;
const S____S____S_RE = /^\s*\{\s*\}\s*/;
const PATTERN_RE = /\/+$/;
const HTTPS_RE = /^https?:\/\//i;
const LOCALHOST_127__0__0__1_RE = /^(localhost|127\.0\.0\.1)(:\d+)?$/i;
const RAILWAY__INTERNAL_RE = /\.railway\.internal(?::\d+)?$/i;

@Injectable()
export class SystemHealthService {
  constructor(
    private prisma: PrismaService,
    @InjectRedis() private redis: Redis,
    private config: ConfigService,
    private readonly whatsappApi: WhatsAppApiProvider,
    private readonly storageService: StorageService,
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

  async check() {
    const whatsapp = await this.checkWhatsAppTransport();
    const status = {
      database: await this.checkDatabase(),
      redis: await this.checkRedis(),
      whatsapp,
      worker: await this.checkWorker(),
      storage: await this.checkStorage(),
      config: this.checkCriticalConfig(),
      openai: this.checkOpenAI(),
      anthropic: this.checkAnthropic(),
      stripe: this.checkStripe(),
      googleAuth: this.checkGoogleAuth(),
      version: '0.0.365', // From context
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
      (dependency: any) => dependency?.status === 'DOWN',
    );
    const isHealthy =
      !hasDownDependency &&
      Object.values(status)
        .filter((s: any) => typeof s === 'object' && s && 'status' in s)
        .every((s: any) => ['UP', 'CONFIGURED', 'NOT_CONFIGURED'].includes(s.status));
    return {
      status: hasDownDependency ? 'DOWN' : isHealthy ? 'UP' : 'DEGRADED',
      details: status,
    };
  }

  private async checkDatabase() {
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      return { status: 'UP', latency: 'OK' };
    } catch (e) {
      return { status: 'DOWN', error: e.message };
    }
  }

  private async checkRedis() {
    try {
      await this.redis.ping();
      return { status: 'UP' };
    } catch (e: any) {
      return { status: 'DOWN', error: e.message };
    }
  }

  private async checkStorage() {
    try {
      return await this.storageService.healthCheck();
    } catch (e: any) {
      return { status: 'DOWN', driver: 'unknown', error: e.message };
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
      const response = await fetch(workerHealthUrl, {
        method: 'GET',
        headers: workerMetricsToken
          ? {
              Authorization: `Bearer ${workerMetricsToken}`,
            }
          : undefined,
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
    } catch (e: any) {
      clearTimeout(timeout);
      return {
        status: 'DOWN',
        url: this.maskUrl(workerHealthUrl),
        error: e.message,
      };
    }
  }

  private checkCriticalConfig() {
    const jwtSecret = this.config.get<string>('JWT_SECRET');
    const redisUrl = this.config.get<string>('REDIS_URL');
    const metaAppId = this.config.get<string>('META_APP_ID');
    const metaAppSecret = this.config.get<string>('META_APP_SECRET');
    const metaVerifyToken =
      this.config.get<string>('META_WEBHOOK_VERIFY_TOKEN') ||
      this.config.get<string>('META_VERIFY_TOKEN');

    const missing: string[] = [];
    if (!jwtSecret) missing.push('JWT_SECRET');
    if (!redisUrl) missing.push('REDIS_URL');
    if (!metaAppId) missing.push('META_APP_ID');
    if (!metaAppSecret) missing.push('META_APP_SECRET');
    if (!metaVerifyToken) missing.push('META_WEBHOOK_VERIFY_TOKEN');

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
      return await this.prisma.metaConnection.count({
        where: { status: 'connected' },
      });
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
