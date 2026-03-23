import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { InjectRedis } from '@nestjs-modules/ioredis';
import Redis from 'ioredis';
import { ConfigService } from '@nestjs/config';
import { WhatsAppApiProvider } from '../whatsapp/providers/whatsapp-api.provider';
import { WorkerBrowserRuntimeService } from '../whatsapp/worker-browser-runtime.service';

@Injectable()
export class SystemHealthService {
  constructor(
    private prisma: PrismaService,
    @InjectRedis() private redis: Redis,
    private config: ConfigService,
    private readonly whatsappApi: WhatsAppApiProvider,
    private readonly workerBrowserRuntime: WorkerBrowserRuntimeService,
  ) {}

  async check() {
    const whatsapp = await this.checkWhatsAppTransport();
    const status = {
      database: await this.checkDatabase(),
      redis: await this.checkRedis(),
      whatsapp,
      worker: await this.checkWorker(),
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
    const isHealthy = !hasDownDependency && Object.values(status)
      .filter((s: any) => typeof s === 'object' && s && 'status' in s)
      .every((s: any) =>
        ['UP', 'CONFIGURED', 'NOT_CONFIGURED'].includes(s.status),
      );
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

  private resolveConfiguredWhatsAppProvider():
    | 'whatsapp-api'
    | 'whatsapp-web-agent' {
    return String(
      this.config.get<string>('WHATSAPP_PROVIDER_DEFAULT') || '',
    ).trim() === 'whatsapp-web-agent'
      ? 'whatsapp-web-agent'
      : 'whatsapp-api';
  }

  private async checkWhatsAppTransport() {
    const provider = this.resolveConfiguredWhatsAppProvider();
    if (provider === 'whatsapp-web-agent') {
      const browserRuntimeUrl =
        this.config.get<string>('WORKER_BROWSER_RUNTIME_URL') ||
        this.config.get<string>('WORKER_HEALTH_URL') ||
        this.config.get<string>('WORKER_METRICS_URL');

      try {
        const healthy = await this.workerBrowserRuntime.ping();
        return {
          status: healthy ? 'UP' : 'DOWN',
          provider,
          runtime: browserRuntimeUrl ? this.maskUrl(browserRuntimeUrl) : null,
          anthropic:
            this.config.get<string>('ANTHROPIC_API_KEY') ? 'CONFIGURED' : 'MISSING',
          openai:
            this.config.get<string>('OPENAI_API_KEY') ? 'CONFIGURED' : 'MISSING',
        };
      } catch (e: any) {
        return {
          status: 'DOWN',
          provider,
          runtime: browserRuntimeUrl ? this.maskUrl(browserRuntimeUrl) : null,
          error: e.message,
        };
      }
    }

    const baseUrl =
      this.config.get<string>('WAHA_API_URL') ||
      this.config.get<string>('WAHA_BASE_URL');
    const apiKey =
      this.config.get<string>('WAHA_API_KEY') ||
      this.config.get<string>('WAHA_API_TOKEN');

    if (!baseUrl) {
      return { status: 'DOWN', error: 'WAHA_API_URL/WAHA_BASE_URL missing' };
    }

    try {
      const healthy = await this.whatsappApi.ping();
      const runtime = this.whatsappApi.getRuntimeConfigDiagnostics();
      const webhookStatus =
        runtime.webhookConfigured && runtime.inboundEventsConfigured
          ? 'CONFIGURED'
          : 'MISSING';
      return {
        status: healthy && webhookStatus === 'CONFIGURED' ? 'UP' : 'DOWN',
        provider,
        url: this.maskUrl(baseUrl),
        auth: apiKey ? 'CONFIGURED' : 'MISSING',
        webhook: webhookStatus,
        webhookUrl: runtime.webhookUrl,
        webhookEvents: runtime.events,
        allowInternalWebhookUrl: runtime.allowInternalWebhookUrl,
        store: runtime.storeEnabled ? 'ENABLED' : 'DISABLED',
      };
    } catch (e: any) {
      const runtime = this.whatsappApi.getRuntimeConfigDiagnostics();
      return {
        status: 'DOWN',
        provider,
        url: this.maskUrl(baseUrl),
        auth: apiKey ? 'CONFIGURED' : 'MISSING',
        webhook:
          runtime.webhookConfigured && runtime.inboundEventsConfigured
            ? 'CONFIGURED'
            : 'MISSING',
        webhookUrl: runtime.webhookUrl,
        webhookEvents: runtime.events,
        allowInternalWebhookUrl: runtime.allowInternalWebhookUrl,
        error: e.message,
      };
    }
  }

  private async checkWorker() {
    const workerHealthUrl =
      this.config.get<string>('WORKER_HEALTH_URL') ||
      this.config.get<string>('WORKER_METRICS_URL');
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
    const provider = this.resolveConfiguredWhatsAppProvider();
    const wahaUrl =
      this.config.get<string>('WAHA_API_URL') ||
      this.config.get<string>('WAHA_BASE_URL');
    const wahaKey =
      this.config.get<string>('WAHA_API_KEY') ||
      this.config.get<string>('WAHA_API_TOKEN');

    const missing: string[] = [];
    if (!jwtSecret) missing.push('JWT_SECRET');
    if (!redisUrl) missing.push('REDIS_URL');
    if (provider === 'whatsapp-api') {
      if (!wahaUrl) missing.push('WAHA_API_URL');
      if (!wahaKey) missing.push('WAHA_API_KEY');
    } else {
      const browserRuntimeUrl =
        this.config.get<string>('WORKER_BROWSER_RUNTIME_URL') ||
        this.config.get<string>('WORKER_HEALTH_URL') ||
        this.config.get<string>('WORKER_METRICS_URL');
      if (!browserRuntimeUrl) missing.push('WORKER_BROWSER_RUNTIME_URL');
      if (
        !this.config.get<string>('ANTHROPIC_API_KEY') &&
        !this.config.get<string>('OPENAI_API_KEY')
      ) {
        missing.push('ANTHROPIC_API_KEY or OPENAI_API_KEY');
      }
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
      missing: [
        'GOOGLE_CLIENT_ID or NEXT_PUBLIC_GOOGLE_CLIENT_ID or GOOGLE_ALLOWED_CLIENT_IDS',
      ],
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
}
