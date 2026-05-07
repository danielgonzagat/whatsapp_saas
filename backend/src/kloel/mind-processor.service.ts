import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { Queue, Worker } from 'bullmq';
import { createRedisClient, isRedisConfigured } from '../common/redis/redis.util';
import { PrismaService } from '../prisma/prisma.service';
import { MindService } from './mind.service';

const DEFAULT_SCHEDULER_INTERVAL_MS = 30_000;
const DEFAULT_TICK_CONCURRENCY = 4;
const DEFAULT_TICK_ATTEMPTS = 3;
const MIND_SCHEDULER_QUEUE = 'mind-scheduler';
const MIND_TICK_QUEUE = 'mind-tick';

@Injectable()
export class MindProcessorService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(MindProcessorService.name);
  private schedulerQueue?: Queue;
  private tickQueue?: Queue;
  private schedulerWorker?: Worker;
  private tickWorker?: Worker;

  constructor(
    private readonly prisma: PrismaService,
    private readonly mind: MindService,
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
      async (job) => this.mind.tick(String(job.data.workspaceId)),
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

    const workspaces = await this.prisma.$queryRaw<Array<{ id: string }>>`
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
}
