import { Injectable, Optional } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { StructuredLogger } from '../../../logging/structured-logger';
import { PrismaService } from '../../../prisma/prisma.service';
import { HebbianService } from '../hebbian.service';
import type { SpineEventRef } from '../mind.types';
import { MindEventSpine } from './mind-event-spine.service';

/**
 * Canonical outbox event types the ingestor drains besides
 * `cognition.decision_made`. These were emitted by the self-evolution cron and
 * the cognitive-consolidation pass but had NO consumer, so their rows piled up
 * `status=pending` forever (verified in prod: 3782 self_modification.proposed
 * rows, all pending). Draining them marks the loop closed and keeps
 * getOutboxStatus() honest.
 */
const SELF_MODIFICATION_EVENT_TYPE = 'cognition.self_modification.proposed';
const CONSOLIDATION_SCAN_EVENT_TYPE = 'cognition.consolidation_scan';

/**
 * TTL after which a still-pending self-modification proposal is considered
 * stale and reaped to `status=expired`. These are advisory review envelopes; a
 * week-old proposal is superseded by every 6h cycle since, so expiring keeps
 * the outbox bounded without losing actionable signal.
 */
const SELF_MODIFICATION_TTL_DAYS = 7;

@Injectable()
export class MindEventIngestor {
  private readonly logger = StructuredLogger.from(MindEventIngestor.name);

  constructor(
    @Optional() private readonly spine: MindEventSpine | undefined,
    private readonly hebbian: HebbianService,
    private readonly prisma: PrismaService,
  ) {}
  async processDecisions(workspaceId: string): Promise<void> {
    if (!this.spine) {
      return;
    }
    const claimed = await this.spine.claimPendingEvents({
      workspaceId,
      eventType: 'cognition.decision_made',
      limit: 100,
    });

    if (claimed.events.length === 0) {
      return;
    }

    const refs: SpineEventRef[] = claimed.events.map((e) => ({
      eventId: e.id,
      eventName: e.eventType,
      workspaceId,
      occurredAt: e.occurredAt.toISOString(),
      truthMode: 'observed',
    }));

    this.hebbian.ingest(refs);

    for (const event of claimed.events) {
      await this.spine.markDispatchSucceeded(event.id, workspaceId);
    }

    this.logger.debug(
      `Ingested ${claimed.events.length} cognition.decision_made events for workspace ${workspaceId}`,
    );
  }

  /**
   * Drain pending `cognition.self_modification.proposed` proposals for a
   * workspace. These are advisory self-evolution review envelopes with no
   * in-process automation yet, so consuming them = claim (pending → processing)
   * then mark dispatched (processing → dispatched, dispatchedAt set). This is
   * what closes the leak: before this consumer existed every cycle's proposal
   * stayed `pending` forever. Returns the number of proposals consumed.
   */
  async processSelfModifications(workspaceId: string): Promise<number> {
    if (!this.spine) {
      return 0;
    }
    const claimed = await this.spine.claimPendingEvents({
      workspaceId,
      eventType: SELF_MODIFICATION_EVENT_TYPE,
      limit: 100,
    });
    if (claimed.events.length === 0) {
      return 0;
    }
    for (const event of claimed.events) {
      await this.spine.markDispatchSucceeded(event.id, workspaceId);
    }
    this.logger.debug(
      `Consumed ${claimed.events.length} ${SELF_MODIFICATION_EVENT_TYPE} events for workspace ${workspaceId}`,
    );
    return claimed.events.length;
  }

  /**
   * Drain pending `cognition.consolidation_scan` summaries for a workspace.
   * Minimal consumer (item 4): the consolidation pass emits a compact, already
   * throttled summary that any spine observer can read; the ingestor's job is
   * simply to mark it consumed so it does not accrete as a second pending leak.
   * Returns the number of summaries consumed.
   */
  async processConsolidationScans(workspaceId: string): Promise<number> {
    if (!this.spine) {
      return 0;
    }
    const claimed = await this.spine.claimPendingEvents({
      workspaceId,
      eventType: CONSOLIDATION_SCAN_EVENT_TYPE,
      limit: 100,
    });
    if (claimed.events.length === 0) {
      return 0;
    }
    for (const event of claimed.events) {
      await this.spine.markDispatchSucceeded(event.id, workspaceId);
    }
    this.logger.debug(
      `Consumed ${claimed.events.length} ${CONSOLIDATION_SCAN_EVENT_TYPE} events for workspace ${workspaceId}`,
    );
    return claimed.events.length;
  }

  /**
   * TTL-expire self-modification proposals that have sat `pending` past
   * {@link SELF_MODIFICATION_TTL_DAYS}. Platform-wide (not per-workspace) so a
   * single sweep bounds the whole table. Marks `status=expired` rather than
   * deleting so the history stays auditable. Returns rows expired.
   */
  async expireStaleSelfModifications(): Promise<number> {
    const cutoff = new Date(Date.now() - SELF_MODIFICATION_TTL_DAYS * 24 * 3600 * 1000);
    const result = await this.prisma.mindOutboxEvent.updateMany({
      where: {
        eventType: SELF_MODIFICATION_EVENT_TYPE,
        status: 'pending',
        occurredAt: { lt: cutoff },
      },
      data: { status: 'expired' },
    });
    if (result.count > 0) {
      this.logger.debug(
        `Expired ${result.count} stale ${SELF_MODIFICATION_EVENT_TYPE} proposals (>${SELF_MODIFICATION_TTL_DAYS}d)`,
      );
    }
    return result.count;
  }

  @Cron(CronExpression.EVERY_MINUTE)
  async tickAllWorkspaces(): Promise<void> {
    // TTL-expire stale proposals once per sweep (platform-wide, idempotent).
    try {
      await this.expireStaleSelfModifications();
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'unknown';
      this.logger.error(`expireStaleSelfModifications failed: ${message}`);
    }

    const rows = await this.prisma.mindOutboxEvent.findMany({
      where: {
        eventType: {
          in: [
            'cognition.decision_made',
            SELF_MODIFICATION_EVENT_TYPE,
            CONSOLIDATION_SCAN_EVENT_TYPE,
          ],
        },
        status: 'pending',
      },
      distinct: ['workspaceId'],
      select: { workspaceId: true },
    });

    for (const row of rows) {
      try {
        await this.processDecisions(row.workspaceId);
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : 'unknown';
        this.logger.error(`processDecisions failed for workspace ${row.workspaceId}: ${message}`);
      }
      try {
        await this.processSelfModifications(row.workspaceId);
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : 'unknown';
        this.logger.error(
          `processSelfModifications failed for workspace ${row.workspaceId}: ${message}`,
        );
      }
      try {
        await this.processConsolidationScans(row.workspaceId);
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : 'unknown';
        this.logger.error(
          `processConsolidationScans failed for workspace ${row.workspaceId}: ${message}`,
        );
      }
    }
  }
}
