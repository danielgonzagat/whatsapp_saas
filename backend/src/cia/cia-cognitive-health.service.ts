import { Injectable, Logger } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { GoalFieldService } from '../kloel/goal-field/goal-field.service';
import { SpineEmitterService } from '../kloel/spine/spine-emitter.service';
import type { Tension } from '../kloel/goal-field/goal-field.types';

const ESCALATION_THRESHOLD = 0.7;

/**
 * UTP-CIA-COG-ESC-001.
 *
 * Scans GoalFieldService tensions for cognitive-dimension alerts and
 * persists them as kloelMemory rows with category cognitive_health_alert.
 * Consumed by the CIA frontend (via CiaService.getCognitiveHighlights)
 * to surface cognitive-substrate degradation to human operators.
 *
 * Deferred: wiring into the tick scheduler (future wave).
 */
@Injectable()
export class CiaCognitiveHealthService {
  private readonly logger = new Logger(CiaCognitiveHealthService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly goalField: GoalFieldService,
    private readonly spine: SpineEmitterService,
  ) {}

  /**
   * Runs a goal-field cycle over the workspace spine events, filters
   * cognitive tensions at or above the escalation threshold, and
   * persists each as a kloelMemory alert row.
   */
  async scanAndEscalate(workspaceId: string): Promise<{ escalated: number }> {
    const events = this.spine
      .recentEventsAsRef()
      .filter((e) => e.workspaceId === workspaceId);

    const result = this.goalField.runCycle({ events });

    const cognitiveTensions = result.tensions.filter(
      (t) => t.dimension === 'cognitive' && t.severity >= ESCALATION_THRESHOLD,
    );

    let escalated = 0;
    for (const tension of cognitiveTensions) {
      try {
        await this.prisma.kloelMemory.create({
          data: {
            workspaceId,
            key: `cog_health:${tension.tensionId}`,
            category: 'cognitive_health_alert',
            type: 'alert',
            value: this.buildAlertValue(tension) as Prisma.InputJsonValue,
            content: tension.description,
            metadata: this.buildAlertMetadata(tension) as Prisma.InputJsonValue,
          },
        });
        escalated++;
      } catch (err) {
        this.logger.warn(
          `Failed to persist cognitive health alert for ${tension.tensionId}: ${(err as Error).message}`,
        );
      }
    }

    if (escalated > 0) {
      this.logger.log(
        `scanAndEscalate: ${escalated} cognitive tensions escalated for workspace ${workspaceId}`,
      );
    }

    return { escalated };
  }

  private buildAlertValue(tension: Tension): Record<string, unknown> {
    return {
      tensionId: tension.tensionId,
      detectorName: tension.detectorName,
      severity: tension.severity,
      description: tension.description,
      detectedAt: tension.detectedAt,
    };
  }

  private buildAlertMetadata(tension: Tension): Record<string, unknown> {
    return {
      severity: tension.severity,
      detectorName: tension.detectorName,
      dimension: tension.dimension,
      evidenceEventIds: tension.evidenceEventIds,
    };
  }
}
