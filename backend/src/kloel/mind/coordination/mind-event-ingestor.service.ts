import { Injectable } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { StructuredLogger } from '../../../logging/structured-logger';
import { PrismaService } from '../../../prisma/prisma.service';
import { HebbianService } from '../hebbian.service';
import type { SpineEventRef } from '../mind.types';
import { MindEventSpine } from './mind-event-spine.service';
@Injectable()
export class MindEventIngestor {
  private readonly logger = StructuredLogger.from(MindEventIngestor.name);

  constructor(
    private readonly spine: MindEventSpine,
    private readonly hebbian: HebbianService,
    private readonly prisma: PrismaService,
  ) {}
  async processDecisions(workspaceId: string): Promise<void> {
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
  @Cron(CronExpression.EVERY_MINUTE)
  async tickAllWorkspaces(): Promise<void> {
    const rows = await this.prisma.mindOutboxEvent.findMany({
      where: {
        eventType: 'cognition.decision_made',
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
        this.logger.error(
          `processDecisions failed for workspace ${row.workspaceId}: ${message}`,
        );
      }
    }
  }
}
