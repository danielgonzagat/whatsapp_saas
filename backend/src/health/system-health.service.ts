import { InjectRedis } from '@nestjs-modules/ioredis';
import { Injectable, Logger, Optional } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';
import { StripeService } from '../billing/stripe.service';
import { StorageService } from '../common/storage/storage.service';
import { QueueHealthService } from '../metrics/queue-health.service';
import { ObservabilityQueriesService } from '../metrics/observability-queries.service';
import { PrismaService } from '../prisma/prisma.service';
import { WhatsAppApiProvider } from '../whatsapp/providers/whatsapp-api.provider';
import * as DbProbe from './system-health-db-probe';
import * as ExternalProbe from './system-health-external-probes';
import * as InfraChecks from './system-health-infra-checks';

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

  liveness() {
    return {
      status: 'UP',
      uptime: process.uptime(),
      timestamp: new Date().toISOString(),
    };
  }

  async readiness() {
    const [database, redis] = await Promise.all([
      DbProbe.checkDatabase(this.prisma),
      DbProbe.checkRedis(this.redis),
    ]);
    const isReady = database.status === 'UP' && redis.status === 'UP';
    return {
      status: isReady ? 'UP' : 'DOWN',
      details: { database, redis },
      timestamp: new Date().toISOString(),
    };
  }

  async check() {
    const whatsapp = await InfraChecks.checkWhatsAppTransport(
      this.whatsappApi,
      this.observabilityQueries,
    );
    const [database, redis, worker, storage, queues] = await Promise.all([
      DbProbe.checkDatabase(this.prisma),
      DbProbe.checkRedis(this.redis),
      InfraChecks.checkWorker(this.config),
      InfraChecks.checkStorage(this.storageService),
      InfraChecks.checkQueues(this.queueHealth),
    ]);
    const backup = ExternalProbe.checkBackup();
    const email = ExternalProbe.checkEmail();
    const stripe = ExternalProbe.checkStripe(this.config);
    const status = {
      database,
      redis,
      whatsapp,
      worker,
      storage,
      queues,
      backup,
      email,
      config: InfraChecks.checkCriticalConfig(this.config),
      openai: ExternalProbe.checkOpenAI(this.config),
      anthropic: ExternalProbe.checkAnthropic(this.config),
      stripe,
      googleAuth: ExternalProbe.checkGoogleAuth(this.config),
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
        .every((s: unknown) => {
          if (typeof s !== 'object' || !s || !('status' in s)) {
            return true;
          }
          const status = String((s as Record<string, unknown>).status ?? '');
          return ['UP', 'CONFIGURED', 'NOT_CONFIGURED'].includes(status);
        });
    return {
      status: hasDownDependency ? 'DOWN' : isHealthy ? 'UP' : 'DEGRADED',
      details: status,
    };
  }

  async deepReadiness(): Promise<{
    status: 'UP' | 'DOWN';
    timestamp: string;
    failures: string[];
    details: Record<string, { status: string; error?: string; latencyMs?: number }>;
  }> {
    const logger = new Logger('ReadinessProbe');
    const startedAt = Date.now();

    const probes: Array<
      Promise<{
        dependency: string;
        status: 'UP' | 'DOWN';
        error?: string;
        latencyMs: number;
      }>
    > = [
      DbProbe.probePostgres(this.prisma),
      DbProbe.probeBullMQRedis(),
      ExternalProbe.probeStripe(this.stripeService),
      ExternalProbe.probeMetaCloud(this.config),
      ExternalProbe.probeOpenAI(this.config),
      ExternalProbe.probeAnthropic(this.config),
      ExternalProbe.probeEmail(),
    ];

    const settled = await Promise.allSettled(probes);
    const failures: string[] = [];
    const details: Record<string, { status: string; error?: string; latencyMs?: number }> = {};

    for (const result of settled) {
      if (result.status === 'rejected') {
        logger.error(`Readiness probe crashed unexpectedly`, String(result.reason));
        continue;
      }

      const probe = result.value;
      details[probe.dependency] = {
        status: probe.status,
        latencyMs: probe.latencyMs,
      };

      if (probe.status === 'DOWN') {
        failures.push(probe.dependency);
        const entry = details[probe.dependency];
        if (entry) {
          entry.error = probe.error ?? 'unknown';
        }
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

  async deepDiagnostic() {
    const logger = new Logger('DeepDiagnostic');
    const startedAt = Date.now();

    const readiness = await this.deepReadiness();

    let queueDetails: Record<string, unknown>[] = [];
    try {
      const queueStatuses = await this.queueHealth.getQueuesStatus();
      queueDetails = queueStatuses.map((q) => ({
        name: q.name,
        waiting: q.main.waiting ?? 0,
        active: q.main.active ?? 0,
        delayed: q.main.delayed ?? 0,
        failed: q.main.failed ?? 0,
        dlqWaiting: q.dlq.waiting ?? 0,
        dlqFailed: q.dlq.failed ?? 0,
      }));
    } catch (err) {
      logger.warn('Queue status collection failed', String(err));
    }

    const memoryUsage = process.memoryUsage();

    logger.log(
      JSON.stringify({
        event: 'deep_diagnostic.completed',
        status: readiness.status,
        failures: readiness.failures,
        totalDurationMs: Date.now() - startedAt,
      }),
    );

    return {
      status: readiness.status,
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      failures: readiness.failures,
      indicators: readiness.details,
      queues: {
        count: queueDetails.length,
        details: queueDetails,
        totalWaiting: queueDetails.reduce((sum, q) => sum + ((q.waiting as number) ?? 0), 0),
        totalFailed: queueDetails.reduce((sum, q) => sum + ((q.failed as number) ?? 0), 0),
        totalDlqWaiting: queueDetails.reduce((sum, q) => sum + ((q.dlqWaiting as number) ?? 0), 0),
        totalDlqFailed: queueDetails.reduce((sum, q) => sum + ((q.dlqFailed as number) ?? 0), 0),
      },
      performance: {
        memory: {
          heapUsedMb: Math.round(memoryUsage.heapUsed / 1024 / 1024),
          heapTotalMb: Math.round(memoryUsage.heapTotal / 1024 / 1024),
          rssMb: Math.round(memoryUsage.rss / 1024 / 1024),
        },
        diagnosticDurationMs: Date.now() - startedAt,
      },
    };
  }
}
