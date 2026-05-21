import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { StructuredLogger } from '../logging/structured-logger';
import { Queue, Worker } from 'bullmq';
import { createRedisClient, isRedisConfigured } from '../common/redis/redis.util';
import { PrismaService } from '../prisma/prisma.service';
import { MindReportService } from './mind-report.service';
import { MindService } from './mind.service';

const DEFAULT_SCHEDULER_INTERVAL_MS = 30_000;
const DEFAULT_TICK_CONCURRENCY = 4;
const DEFAULT_TICK_ATTEMPTS = 3;
const MIND_SCHEDULER_QUEUE = 'mind-scheduler';
const MIND_TICK_QUEUE = 'mind-tick';

@Injectable()
export class MindProcessorService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = StructuredLogger.from(MindProcessorService.name);
  private schedulerQueue?: Queue;
  private tickQueue?: Queue;
  private schedulerWorker?: Worker;
  private tickWorker?: Worker;
  private readonly dailyReportKeys = new Set<string>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly mind: MindService,
    private readonly reports: MindReportService,
  ) {}

  async onModuleInit(): Promise<void> {
    if (process.env.MIND_DISABLE_PROCESSOR === '1') {
      this.logger.log('MIND processor disabled by MIND_DISABLE_PROCESSOR');
      return;
    }
    if (!isRedisConfigured()) {
      this.logger.warn('MIND processor waiting for Redis configuration');
      return;
    }

    const interval = Number.parseInt(
      process.env.MIND_SCHEDULER_INTERVAL_MS ?? String(DEFAULT_SCHEDULER_INTERVAL_MS),
      10,
    );
    const concurrency = Number.parseInt(
      process.env.MIND_TICK_CONCURRENCY ?? String(DEFAULT_TICK_CONCURRENCY),
      10,
    );
    const attempts = Number.parseInt(
      process.env.MIND_TICK_ATTEMPTS ?? String(DEFAULT_TICK_ATTEMPTS),
      10,
    );

    const schedulerConnection = createRedisClient({ maxRetriesPerRequest: null });
    const tickConnection = createRedisClient({ maxRetriesPerRequest: null });

    this.schedulerQueue = new Queue(MIND_SCHEDULER_QUEUE, { connection: schedulerConnection });
    this.tickQueue = new Queue(MIND_TICK_QUEUE, {
      connection: tickConnection,
      defaultJobOptions: {
        attempts,
        backoff: { type: 'exponential', delay: 5000 },
        removeOnComplete: 50,
        removeOnFail: 100,
      },
    });

    await this.schedulerQueue.add(
      'fanout',
      {},
      { jobId: 'mind-fanout', repeat: { every: interval } },
    );

    this.schedulerWorker = new Worker(
      MIND_SCHEDULER_QUEUE,
      async () => this.enqueueActiveWorkspaces(),
      {
        connection: createRedisClient({ maxRetriesPerRequest: null }),
        concurrency: 1,
        autorun: true,
      },
    );

    this.schedulerWorker.on('error', (error) => {
      this.logger.error(`MIND scheduler worker error: ${error.message}`);
    });

    this.tickWorker = new Worker(
      MIND_TICK_QUEUE,
      async (job) => {
        const workspaceId = String(job.data.workspaceId);
        const tick = await this.mind.tick(workspaceId);
        await this.maybeGenerateDailyReport(workspaceId);
        return tick;
      },
      {
        connection: createRedisClient({ maxRetriesPerRequest: null }),
        concurrency,
        autorun: true,
      },
    );

    this.tickWorker.on('failed', (job, error, prev) => {
      if (prev) {
        this.logger.warn(
          `MIND tick retry workspace=${job?.data?.workspaceId} attempt=${job?.attemptsMade}: ${error.message}`,
        );
      } else {
        this.logger.error(`MIND tick failed workspace=${job?.data?.workspaceId}: ${error.message}`);
      }
    });

    this.logger.log(
      `MIND processor running interval=${interval}ms concurrency=${concurrency} attempts=${attempts}`,
    );
  }

  async onModuleDestroy(): Promise<void> {
    await this.tickWorker?.close();
    await this.schedulerWorker?.close();
    await this.tickQueue?.close();
    await this.schedulerQueue?.close();
  }

  private async enqueueActiveWorkspaces(): Promise<{ dispatched: number }> {
    if (!this.tickQueue) {
      return { dispatched: 0 };
    }

    // Raw justified: UNION across three heterogeneous tables (AutopilotEvent,
    // Message, Workspace) cannot be expressed with Prisma's type-safe API.
    // This single query is used to fan-out scheduled ticks to active workspaces.
    const workspaces = await this.prisma.$queryRaw/* raw justified: heterogeneous UNION fan-out */ <
      Array<{ id: string }>
    >`
      SELECT DISTINCT "workspaceId" AS id
      FROM "RAC_AutopilotEvent"
      WHERE "createdAt" > NOW() - INTERVAL '7 days'
      UNION
      SELECT DISTINCT "workspaceId" AS id
      FROM "RAC_Message"
      WHERE "createdAt" > NOW() - INTERVAL '7 days'
      UNION
      SELECT id
      FROM "RAC_Workspace"
      ORDER BY id
      LIMIT 5000
    `;

    for (const workspace of workspaces) {
      const bucket = Math.floor(Date.now() / DEFAULT_SCHEDULER_INTERVAL_MS);
      await this.tickQueue.add(
        'tick',
        { workspaceId: workspace.id },
        { jobId: `mind-tick-${workspace.id}-${bucket}` },
      );
    }

    return { dispatched: workspaces.length };
  }

  private async maybeGenerateDailyReport(workspaceId: string): Promise<void> {
    if (process.env.MIND_DISABLE_DAILY_REPORT === '1') {
      return;
    }

    const reportDate = new Date();
    const key = `${workspaceId}:${reportDate.toISOString().slice(0, 10)}`;
    if (this.dailyReportKeys.has(key)) {
      return;
    }

    try {
      await this.reports.generateDaily(workspaceId);
      this.dailyReportKeys.add(key);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.warn(`MIND daily report failed workspace=${workspaceId}: ${message}`);
    }
  }
}
