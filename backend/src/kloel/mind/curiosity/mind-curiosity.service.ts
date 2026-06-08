import { Injectable, Optional } from '@nestjs/common';
import { StructuredLogger } from '../../../logging/structured-logger';
import { PrismaService } from '../../../prisma/prisma.service';
import { SpineEmitterService } from '../../spine/spine-emitter.service';

const COVERAGE_THRESHOLD = 5;
const COVERAGE_WINDOW_DAYS = 7;
const VARIANCE_MIN = 0.3;
const SAMPLES_MIN_FOR_VARIANCE = 3;

const KNOWN_CONCEPTS = new Set([
  'price_objection',
  'trust_objection',
  'deadline_objection',
  'competitor_comparison',
  'hot_lead',
  'reheatable_cold_lead',
  'dead_lead',
  'imminent_purchase',
  'fatigue_risk',
  'audio_preference',
  'night_preference',
  'high_ticket_product',
  'tight_margin_product',
]);

@Injectable()
export class MindCuriosityService {
  private readonly logger = StructuredLogger.from(MindCuriosityService.name);

  constructor(
    private readonly prisma: PrismaService,
    @Optional() private readonly spine?: SpineEmitterService,
  ) {}

  /**
   * Identifies knowledge gaps by scanning concept detections for low-coverage
   * areas and mind beliefs for high-variance subjects. Returns the most
   * actionable gap or null when the workspace is well-covered.
   *
   * Designed for fire-and-forget invocation from the mind tick loop —
   * never throws.
   */
  async identifyKnowledgeGap(
    workspaceId: string,
  ): Promise<{ topic: string; reason: string; suggestedAction: string } | null> {
    try {
      const since = new Date(Date.now() - COVERAGE_WINDOW_DAYS * 24 * 3600 * 1000);
      const detections = await this.prisma.mindConceptDetection.findMany({
        where: { workspaceId, occurredAt: { gte: since } },
        orderBy: { occurredAt: 'desc' },
        take: 500,
      });

      const conceptCounts = new Map<string, number>();
      for (const d of detections) {
        conceptCounts.set(d.concept, (conceptCounts.get(d.concept) ?? 0) + 1);
      }

      for (const concept of KNOWN_CONCEPTS) {
        const count = conceptCounts.get(concept) ?? 0;
        if (count < COVERAGE_THRESHOLD) {
          const gap = {
            topic: `concept:${concept}`,
            reason: `Only ${count} detections in ${COVERAGE_WINDOW_DAYS} days — insufficient coverage for reliable inference`,
            suggestedAction: `Review messages for ${concept.replace(
              /_/g,
              ' ',
            )} patterns and tune detection rules`,
          };

          await this.spine?.emit({
            eventName: 'cognition.curiosity.gap_identified',
            workspaceId,
            truthMode: 'inferred',
            provenance: {
              source: 'production',
              processor: 'MindCuriosityService',
              processorVersion: '1.0.0',
              schemaVersion: '1.0',
            },
            payload: { ...gap, concept, count },
          });

          this.logger.log(
            `Knowledge gap workspace=${workspaceId} topic="${gap.topic}" count=${count}`,
          );
          return gap;
        }
      }

      const beliefs = await this.prisma.mindBelief.findMany({
        where: {
          workspaceId,
          variance: { gte: VARIANCE_MIN },
          samples: { gte: SAMPLES_MIN_FOR_VARIANCE },
        },
        orderBy: { variance: 'desc' },
        take: 10,
      });

      const b = beliefs[0];
      if (b) {
        const gap = {
          topic: `belief:${b.subject}/${b.predicate}`,
          reason: `Variance=${b.variance.toFixed(2)} with ${b.samples} samples — knowledge is unstable`,
          suggestedAction: `Collect more observations for ${b.subject} to reduce uncertainty`,
        };

        await this.spine?.emit({
          eventName: 'cognition.curiosity.gap_identified',
          workspaceId,
          truthMode: 'inferred',
          provenance: {
            source: 'production',
            processor: 'MindCuriosityService',
            processorVersion: '1.0.0',
            schemaVersion: '1.0',
          },
          payload: { ...gap, variance: b.variance, samples: b.samples },
        });

        return gap;
      }

      return null;
    } catch (error: unknown) {
      this.logger.warn(
        `identifyKnowledgeGap failed workspace=${workspaceId}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
      return null;
    }
  }
}
