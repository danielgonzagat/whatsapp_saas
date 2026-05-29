import { Injectable, OnModuleDestroy, OnModuleInit, Optional } from '@nestjs/common';
import { StructuredLogger } from '../../../logging/structured-logger';
import { Queue, Worker } from 'bullmq';
import { createBullMqConnectionOptions, isRedisConfigured } from '../../../common/redis/redis.util';
import { attachDlq } from '../../../queue/queue';
import { PrismaService } from '../../../prisma/prisma.service';
import { MindReportService } from '../observability/mind-report.service';
import { MindService } from '../../mind.service';
import { MindAutonomyService } from '../autonomy/mind-autonomy.service';
import { MindCuriosityService } from '../curiosity/mind-curiosity.service';
import { MindLongTermMemoryService } from '../memory/mind-long-term-memory.service';
import { MindSelfModelService } from '../self-model/mind-self-model.service';

const DEFAULT_SCHEDULER_INTERVAL_MS = 30_000;
const DEFAULT_TICK_CONCURRENCY = 4;
const DEFAULT_TICK_ATTEMPTS = 3;
const MIND_SCHEDULER_QUEUE = 'mind-scheduler';
const MIND_TICK_QUEUE = 'mind-tick';

type MindTickJobData = { workspaceId?: unknown };

function getMindTickWorkspaceId(data: unknown): string {
  if (data && typeof data === 'object' && 'workspaceId' in data) {
    return String((data as MindTickJobData).workspaceId);
  }
  return '';
}

@Injectable()
export class MindProcessorService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = StructuredLogger.from(MindProcessorService.name);
  private schedulerQueue?: Queue;
  private tickQueue?: Queue;
  private schedulerWorker?: Worker;
  private tickWorker?: Worker;
  private schedulerDlq?: Queue;
  private tickDlq?: Queue;
  private readonly dailyReportKeys = new Set<string>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly mind: MindService,
    private readonly reports: MindReportService,
    @Optional() private readonly autonomy?: MindAutonomyService,
    @Optional() private readonly curiosity?: MindCuriosityService,
    @Optional() private readonly longTermMemory?: MindLongTermMemoryService,
    @Optional() private readonly selfModel?: MindSelfModelService,
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

    const schedulerConnection = createBullMqConnectionOptions();
    const tickConnection = createBullMqConnectionOptions();

    this.schedulerQueue = new Queue(MIND_SCHEDULER_QUEUE, {
      connection: schedulerConnection,
      defaultJobOptions: {
        attempts: 3,
        backoff: { type: 'exponential', delay: 1000 },
        removeOnFail: false,
      },
    });
    this.schedulerDlq = attachDlq(this.schedulerQueue);

    this.tickQueue = new Queue(MIND_TICK_QUEUE, {
      connection: tickConnection,
      defaultJobOptions: {
        attempts,
        backoff: { type: 'exponential', delay: 5000 },
        removeOnComplete: 50,
        removeOnFail: 100,
      },
    });
    this.tickDlq = attachDlq(this.tickQueue);

    await this.schedulerQueue.add(
      'fanout',
      {},
      { jobId: 'mind-fanout', repeat: { every: interval } },
    );

    this.schedulerWorker = new Worker(
      MIND_SCHEDULER_QUEUE,
      async () => this.enqueueActiveWorkspaces(),
      {
        connection: createBullMqConnectionOptions(),
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
        const workspaceId = getMindTickWorkspaceId(job.data);
        const tick = await this.mind.tick(workspaceId);
        await this.maybeGenerateDailyReport(workspaceId);
        // Fire-and-forget emergent cognition behaviors — never block the tick
        void this.autonomy?.proposeGoal(workspaceId);
        void this.curiosity?.identifyKnowledgeGap(workspaceId);
        void this.longTermMemory?.consolidate(workspaceId);
        // Wave5 L6: persist a versioned self-model snapshot each cycle.
        // snapshot() is not internally guarded, so catch here to stay
        // fail-open — a self-model write must never break the tick.
        void this.selfModel?.snapshot(workspaceId).catch((error: unknown) => {
          this.logger.warn(
            `MIND self-model snapshot failed workspace=${workspaceId}: ${
              error instanceof Error ? error.message : String(error)
            }`,
          );
        });
        return tick;
      },
      {
        connection: createBullMqConnectionOptions(),
        concurrency,
        autorun: true,
      },
    );

    this.tickWorker.on('failed', (job, error, prev) => {
      if (prev) {
        this.logger.warn(
          `MIND tick retry workspace=${getMindTickWorkspaceId(job?.data)} attempt=${job?.attemptsMade}: ${error.message}`,
        );
      } else {
        this.logger.error(
          `MIND tick failed workspace=${getMindTickWorkspaceId(job?.data)}: ${error.message}`,
        );
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
    await this.tickDlq?.close();
    await this.schedulerQueue?.close();
    await this.schedulerDlq?.close();
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
