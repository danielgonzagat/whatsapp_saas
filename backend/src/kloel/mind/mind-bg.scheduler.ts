import {
  Injectable,
  OnModuleInit,
  OnModuleDestroy,
  Logger,
} from '@nestjs/common';
import { Queue, Worker } from 'bullmq';
import { MindBackgroundProcessor } from './mind-bg.processor';
import { SpineEmitterService } from '../spine/spine-emitter.service';
import { resolveRedisUrl } from '../../common/redis/resolve-redis-url';

const MIND_BG_QUEUE = 'mind-bg-tick';

const SHORT_INTERVAL_MS = 5_000;

@Injectable()
export class MindBackgroundScheduler
  implements OnModuleInit, OnModuleDestroy
{
  private readonly logger = new Logger(MindBackgroundScheduler.name);

  private worker: Worker | null = null;

  private queue: Queue | null = null;

  private readonly enabled: boolean;

  public constructor(
    private readonly processor: MindBackgroundProcessor,
    private readonly spine: SpineEmitterService,
  ) {
    const explicit = process.env['KLOEL_MIND_BG_ENABLED'];
    if (explicit !== undefined) {
      this.enabled = explicit !== 'false';
    } else {
      this.enabled = process.env['NODE_ENV'] !== 'test';
    }
  }

  public async onModuleInit() {
    if (!this.enabled) {
      this.logger.debug(
        'Mind BG scheduler disabled (KLOEL_MIND_BG_ENABLED=false or test mode)',
      );
      return;
    }
    const redisUrl = resolveRedisUrl();
    if (!redisUrl) {
      this.logger.warn(
        'Mind BG scheduler: no Redis URL resolved, skipping startup',
      );
      return;
    }
    const connection = { url: redisUrl };

    this.queue = new Queue(MIND_BG_QUEUE, { connection });

    this.worker = new Worker(
      MIND_BG_QUEUE,
      async () => {
        await this.executeTick();
      },
      { connection, removeOnComplete: { count: 0 } },
    );

    await this.queue.add('tick', {}, { repeat: { every: SHORT_INTERVAL_MS } });

    this.logger.log(
      `Mind BG scheduler started (queue ${MIND_BG_QUEUE}, every ${SHORT_INTERVAL_MS}ms)`,
    );
  }

  public async onModuleDestroy() {
    const closes: Promise<unknown>[] = [];
    if (this.worker) {
      closes.push(this.worker.close().catch(() => undefined));
    }
    if (this.queue) {
      closes.push(
        this.queue
          .close()
          .then(() => this.drainRepeatable())
          .catch(() => undefined),
      );
    }
    if (closes.length > 0) {
      await Promise.all(closes);
    }
  }

  private async drainRepeatable() {
    try {
      await this.queue?.removeRepeatable('tick', {
        every: SHORT_INTERVAL_MS,
      });
    } catch {
      // Best-effort cleanup — the queue may already be closed.
    }
  }

  private async executeTick(): Promise<void> {
    this.processor.tick({
      nowMs: Date.now(),
      recentEvents: this.spine.recentEventsAsRef(500),
      workingMemory: [],      workspaceId: 'ws-test-001',
    });
  }
}
