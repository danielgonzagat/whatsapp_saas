import { Injectable, OnModuleInit, OnModuleDestroy, Logger, Optional } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { Queue, Worker } from 'bullmq';
import { MindBackgroundProcessor } from './mind-bg.processor';
import { SpineEmitterService } from '../spine/spine-emitter.service';
import { resolveRedisUrl } from '../../common/redis/resolve-redis-url';
import { attachDlq } from '../../queue/queue';
import { PrismaService } from '../../prisma/prisma.service';
import { type SpineEventRef } from './mind.types';
import { CiaCognitiveHealthService } from './cia/cia-cognitive-health.service';

const MIND_BG_QUEUE = 'mind-bg-tick';

const SHORT_INTERVAL_MS = 5_000;

@Injectable()
export class MindBackgroundScheduler implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(MindBackgroundScheduler.name);

  private worker: Worker | null = null;

  private queue: Queue | null = null;

  private dlq: Queue | null = null;

  private readonly enabled: boolean;

  /**
   * True once onModuleInit determined Redis is unavailable while the scheduler
   * is otherwise enabled. Gates the in-process @Cron fallback so the learning
   * edge (hebbian.decay + consolidation.runCycle, driven via executeTick) keeps
   * firing without Redis — and so it NEVER double-runs when the BullMQ loop is
   * active (that loop only exists when a Redis URL resolved).
   */
  private redisAbsent = false;

  /**
   * Workspaces explicitly registered for MIND ticking by the autonomy
   * lifecycle (CIA bootstrap activates, pause deregisters). This is the fast,
   * in-memory source of truth for the current process; executeTick UNIONs it
   * with the durable set persisted in RAC_MindWorkspaceState so a process
   * restart keeps ticking already-active workspaces.
   */
  private readonly registered = new Set<string>();

  /**
   * Dev/bootstrap workspace ticked only when no real workspace is discoverable
   * (empty registry AND empty MindWorkspaceState). Keeps local/test loops alive
   * without a seeded tenant; production ticks the real, discovered workspaces.
   */
  private static readonly DEFAULT_WORKSPACE_ID = 'ws-test-001';

  public constructor(
    private readonly processor: MindBackgroundProcessor,
    private readonly spine: SpineEmitterService,
    private readonly prisma: PrismaService,
    @Optional() private readonly cognitiveHealth?: CiaCognitiveHealthService,
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
      this.logger.debug('Mind BG scheduler disabled (KLOEL_MIND_BG_ENABLED=false or test mode)');
      return;
    }
    const redisUrl = resolveRedisUrl();
    if (!redisUrl) {
      // No Redis: the BullMQ loop cannot start. Flip the in-process flag so the
      // @Cron fallback below keeps the learning edge alive (decay/consolidation).
      this.redisAbsent = true;
      this.logger.warn('Mind BG scheduler: no Redis URL resolved, using in-process @Cron fallback');
      return;
    }
    const connection = { url: redisUrl };

    this.queue = new Queue(MIND_BG_QUEUE, {
      connection,
      defaultJobOptions: {
        attempts: 3,
        backoff: { type: 'exponential', delay: 1000 },
        removeOnFail: false,
      },
    });
    this.dlq = attachDlq(this.queue);

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
    if (this.dlq) {
      closes.push(this.dlq.close().catch(() => undefined));
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

  /**
   * Register a workspace so the background loop ticks its Mind. Called by the
   * CIA autonomy bootstrap when a workspace activates. Idempotent — a Set keeps
   * the registry deduped; executeTick reads it on the next tick.
   */
  public registerWorkspace(workspaceId: string): void {
    if (workspaceId.length === 0) {
      return;
    }
    this.registered.add(workspaceId);
  }

  /**
   * Deregister a workspace from the in-memory tick registry. Called when CIA
   * autonomy is paused. Note: the workspace may still be ticked if it has a
   * durable RAC_MindWorkspaceState row — the persisted set survives a pause,
   * which is intentional (Mind keeps learning from already-observed evidence).
   */
  public deregisterWorkspace(workspaceId: string): void {
    this.registered.delete(workspaceId);
  }

  async executeTick(): Promise<void> {
    const workspaceIds = await this.resolveWorkspaceIds();
    // Primary: spine ring (in-memory, real-time) — a single global ring shared
    // across workspaces, so we read it ONCE and partition per workspace below.
    const spineEvents = this.spine.recentEventsAsRef(500);

    for (const workspaceId of workspaceIds) {
      await this.tickWorkspace(workspaceId, spineEvents);
    }
  }

  /**
   * Resolve the set of workspaces to tick. UNION of:
   *   1. the in-memory registry (CIA autonomy lifecycle, fast path), and
   *   2. distinct workspaceIds persisted in RAC_MindWorkspaceState (durable —
   *      survives a process restart so already-active tenants keep ticking).
   * Falls back to the dev/bootstrap default ONLY when nothing is discoverable
   * (no registered tenant AND no persisted state, e.g. a fresh/test process).
   */
  private async resolveWorkspaceIds(): Promise<string[]> {
    const ids = new Set<string>(this.registered);
    try {
      const rows = await this.prisma.mindWorkspaceState.findMany({
        distinct: ['workspaceId'],
        select: { workspaceId: true },
      });
      for (const row of rows) {
        if (row.workspaceId.length > 0) {
          ids.add(row.workspaceId);
        }
      }
    } catch (err: unknown) {
      this.logger.warn(
        `Workspace discovery query failed, using registry only: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
    if (ids.size === 0) {
      return [MindBackgroundScheduler.DEFAULT_WORKSPACE_ID];
    }
    return [...ids];
  }

  /** Run one MIND tick for a single workspace with workspace-isolated events. */
  private async tickWorkspace(
    workspaceId: string,
    spineEvents: readonly SpineEventRef[],
  ): Promise<void> {
    // Workspace isolation: only this workspace's events feed its Mind. Events
    // with no workspaceId are ambient and not attributable to a tenant, so they
    // are excluded to avoid cross-tenant belief contamination.
    const scopedSpine = spineEvents.filter((e) => e.workspaceId === workspaceId);

    // Fallback: database (persisted, survives restart). Only when the in-memory
    // ring has nothing for this workspace.
    let dbEvents: SpineEventRef[] = [];
    if (scopedSpine.length === 0) {
      try {
        type AutopilotEventRow = {
          id: string;
          intent: string;
          action: string;
          status: string;
          meta: unknown;
          createdAt: Date | string;
        };
        const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
        const rows = await this.prisma.$queryRawUnsafe<AutopilotEventRow[]>(
          `SELECT id, intent, action, status, meta, "createdAt"
           FROM "RAC_AutopilotEvent"
           WHERE "workspaceId" = $1 AND "createdAt" > $2
           ORDER BY "createdAt" DESC LIMIT 500`,
          workspaceId,
          since,
        );
        dbEvents = (rows || []).map((r: AutopilotEventRow) => ({
          eventId: r.id,
          eventName: r.action || r.intent || 'unknown',
          workspaceId,
          occurredAt: new Date(r.createdAt).toISOString(),
          truthMode: 'observed' as const,
        }));
      } catch (err: unknown) {
        this.logger.warn(
          `DB fallback query failed for ws ${workspaceId}: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    }
    const mergedEvents = scopedSpine.length > 0 ? scopedSpine : dbEvents;
    this.processor.tick({
      nowMs: Date.now(),
      recentEvents: mergedEvents,
      workingMemory: [],
      workspaceId,
    });

    // Wave 15: cognitive health on-tick scan (flag-gated, shipped off by default)
    if (process.env['CIA_COGNITIVE_HEALTH_TICK_ENABLED'] === 'true') {
      try {
        await this.cognitiveHealth?.scanAndEscalate(workspaceId);
      } catch (err: unknown) {
        this.logger.warn(
          `Cognitive health scan failed for ${workspaceId}: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    }
  }

  /**
   * In-process learning-edge fallback. When Redis is absent the BullMQ tick loop
   * never starts, so without this the MIND learning edge (hebbian.decay +
   * consolidation.runCycle, reached through executeTick → tickWorkspace →
   * processor.tick) silently stops. This @Cron mirrors MindEventIngestor's
   * EVERY_MINUTE pattern and is guarded by redisAbsent so it ONLY runs when the
   * BullMQ loop is NOT active — no double-ticking when Redis is present.
   */
  @Cron(CronExpression.EVERY_MINUTE)
  async inProcessTick(): Promise<void> {
    if (!this.enabled || !this.redisAbsent) {
      return;
    }
    try {
      await this.executeTick();
    } catch (err: unknown) {
      let message = 'unknown error';
      if (err instanceof Error) {
        message = err.message;
      } else if (typeof err === 'string') {
        message = err;
      } else {
        message = JSON.stringify(err) ?? 'unknown error';
      }
      this.logger.warn(`In-process MIND tick fallback failed: ${message}`);
    }
  }
}
