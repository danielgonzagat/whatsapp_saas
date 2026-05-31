import { Injectable, Optional } from '@nestjs/common';
import { StructuredLogger } from '../../../logging/structured-logger';
import { PrismaService } from '../../../prisma/prisma.service';
import { SpineEmitterService } from '../../spine/spine-emitter.service';

const GOAL_DEDUP_WINDOW_MS = 3_600_000; // 1 hour
const SURPRISE_HIGH = 0.5;
const REPLY_MEAN_LOW = 0.3;
const REPLY_SAMPLES_MIN = 5;
const ERROR_EVENT_MIN = 3;

@Injectable()
export class MindAutonomyService {
  private readonly logger = StructuredLogger.from(MindAutonomyService.name);
  private readonly proposedGoals = new Map<string, number>();

  constructor(
    private readonly prisma: PrismaService,
    @Optional() private readonly spine?: SpineEmitterService,
  ) {}

  /**
   * Scans recent autopilot events and mind beliefs for anomalies, then
   * proposes one actionable goal. Returns null when no anomaly is found.
   *
   * Idempotent within a 1-hour window (in-process). Designed for
   * fire-and-forget invocation from the mind tick loop — never throws.
   */
  async proposeGoal(
    workspaceId: string,
  ): Promise<{ goal: string; priority: number; rationale: string } | null> {
    try {
      const since = new Date(Date.now() - 24 * 3600 * 1000);

      const [recentEvents, beliefs] = await Promise.all([
        this.prisma.autopilotEvent.findMany({
          where: { workspaceId, createdAt: { gte: since } },
          orderBy: { createdAt: 'desc' },
          take: 100,
        }),
        this.prisma.mindBelief.findMany({
          where: { workspaceId },
          orderBy: { updatedAt: 'desc' },
          take: 200,
        }),
      ]);

      const errorEvents = recentEvents.filter((e) => e.status === 'error');
      const highSurpriseBeliefs = beliefs.filter((b) => b.variance > SURPRISE_HIGH);
      const lowReplyBeliefs = beliefs.filter(
        (b) =>
          b.predicate === 'replied_to_user' &&
          b.mean < REPLY_MEAN_LOW &&
          b.samples >= REPLY_SAMPLES_MIN,
      );

      if (
        errorEvents.length < ERROR_EVENT_MIN &&
        highSurpriseBeliefs.length === 0 &&
        lowReplyBeliefs.length === 0
      ) {
        return null;
      }

      let goal: string;
      let priority: number;
      let rationale: string;

      if (errorEvents.length >= ERROR_EVENT_MIN) {
        const topIntent = errorEvents[0].intent;
        goal = `Investigate ${errorEvents.length} autopilot errors in last 24h`;
        priority = Math.min(0.95, 0.6 + errorEvents.length * 0.05);
        rationale = `${errorEvents.length} autopilot events failed. Top failed intent: ${topIntent}`;
      } else if (lowReplyBeliefs.length > 0) {
        const b = lowReplyBeliefs[0];
        goal = `Improve reply engagement for ${b.subject}`;
        priority = 0.7;
        rationale = `Belief mean=${b.mean.toFixed(2)} with ${b.samples} samples — replies below threshold`;
      } else if (highSurpriseBeliefs.length > 0) {
        const b = highSurpriseBeliefs[0];
        goal = `Investigate belief volatility for ${b.subject}/${b.predicate}`;
        priority = 0.5;
        rationale = `Variance=${b.variance.toFixed(2)} with ${b.samples} samples — unstable pattern`;
      } else {
        return null;
      }

      const dedupKey = `${workspaceId}:${goal}`;
      const lastProposed = this.proposedGoals.get(dedupKey);
      if (lastProposed && Date.now() - lastProposed < GOAL_DEDUP_WINDOW_MS) {
        this.logger.debug(`Goal dedup suppressed workspace=${workspaceId} goal="${goal}"`);
        return null;
      }
      this.proposedGoals.set(dedupKey, Date.now());

      await this.spine?.emit({
        eventName: 'cognition.autonomy.goal_proposed',
        workspaceId,
        truthMode: 'inferred',
        provenance: {
          source: 'production',
          processor: 'MindAutonomyService',
          processorVersion: '1.0.0',
          schemaVersion: '1.0',
        },
        payload: { goal, priority, rationale },
      });

      this.logger.log(`Goal proposed workspace=${workspaceId} goal="${goal}" priority=${priority}`);
      return { goal, priority, rationale };
    } catch (error: unknown) {
      this.logger.warn(
        `proposeGoal failed workspace=${workspaceId}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
      return null;
    }
  }

  /** Exposed for test inspection — not part of the public API contract. */
  _dedupSize(): number {
    return this.proposedGoals.size;
  }
}
