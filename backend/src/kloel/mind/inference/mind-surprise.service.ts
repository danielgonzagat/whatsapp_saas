import { Injectable, Optional } from '@nestjs/common';
import { StructuredLogger } from '../../../logging/structured-logger';
import { PrismaService } from '../../../prisma/prisma.service';
import { MindBeliefService } from './mind-belief.service';
import { MindPredictorService } from './mind-predictor.service';
import type { MindPrediction } from '../../mind.types';
import { SpineEmitterService } from '../../spine/spine-emitter.service';

@Injectable()
export class MindSurpriseService {
  private readonly logger = StructuredLogger.from(MindSurpriseService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly beliefs: MindBeliefService,
    private readonly predictor: MindPredictorService,
    @Optional() private readonly spine?: SpineEmitterService,
  ) {}

  async resolveBinary(
    workspaceId: string,
    subject: string,
    predicate: string,
    outcome: 0 | 1,
  ): Promise<number> {
    const open = await this.predictor.findOpen(workspaceId, subject, predicate);
    if (!open?.id) {
      return 0;
    }

    const probability = this.clamp(open.predictedMean, 1e-6, 1 - 1e-6);
    const surprise = outcome === 1 ? -Math.log(probability) : -Math.log(1 - probability);

    await this.predictor.resolve(workspaceId, open.id, outcome, surprise);
    await this.beliefs.observeBinary(workspaceId, subject, predicate, open.context, outcome);

    // Wave3: emit canonical cognition.surprise_observed at the real prediction
    // resolution site (fire-and-forget; metadata only, no message content).
    void this.spine
      ?.emit({
        eventName: 'cognition.surprise_observed',
        workspaceId,
        truthMode: 'observed',
        provenance: {
          source: 'production',
          processor: 'mind-surprise',
          processorVersion: '1.0.0',
          schemaVersion: '1.0.0',
        },
        payload: {
          subject,
          predicate,
          outcome,
          predictedMean: open.predictedMean,
          surprise,
        },
      })
      .catch(() => {});

    if (surprise > 1.5) {
      this.logger.warn(
        `High surprise ws=${workspaceId} subject=${subject} predicate=${predicate} outcome=${outcome} p=${probability.toFixed(3)} surprise=${surprise.toFixed(2)}`,
      );
    }

    return surprise;
  }

  
    /**
     * Close the chat-reply predictive-coding loop. Resolves the open
     * `P(reply|...)` prediction persisted before the reply was sent (via
     * MindPredictorService.predictReply) and observes the binary outcome —
     * which updates the underlying MindBelief alpha/beta. Returns the surprise
     * (0 when no open prediction exists). Shares MindPredictorService.REPLY_PREDICATE
     * so prediction + resolution target the exact same belief row.
     */
    async resolveReply(workspaceId: string, subject: string, outcome: 0 | 1): Promise<number> {
      return this.resolveBinary(workspaceId, subject, MindPredictorService.REPLY_PREDICATE, outcome);
    }

  async sweepExpired(workspaceId: string, asOf = new Date()): Promise<number> {
    return this.prisma.$transaction(async (tx) => {
      // Raw justified: SELECT … FOR UPDATE SKIP LOCKED provides concurrent-
      // safe batch processing across workers. Prisma has no row-level lock
      // primitives, and SKIP LOCKED avoids head-of-line blocking between
      // parallel sweepExpired calls.
      const rows = await tx.$queryRaw/* raw justified: SKIP LOCKED batch claim */ <
        MindPrediction[]
      >`
        SELECT *
        FROM "RAC_MindPrediction"
        WHERE "workspaceId" = ${workspaceId}
          AND "resolvedAt" IS NULL
          AND "deadline" < ${asOf}
        LIMIT 500
        FOR UPDATE SKIP LOCKED
      `;

      let surpriseTotal = 0;
      for (const row of rows) {
        if (!row.id) {
          continue;
        }
        if (row.predicate.startsWith('P(')) {
          const probabilityOfMiss = this.clamp(1 - row.predictedMean, 1e-6, 1);
          const surprise = -Math.log(probabilityOfMiss);
          await tx.mindPrediction.updateMany({
            where: { id: row.id, workspaceId: row.workspaceId },
            data: { actual: 0, surprise, resolvedAt: new Date() },
          });
          await this.beliefs.observeBinary(
            row.workspaceId,
            row.subject,
            row.predicate,
            row.context,
            0,
          );
          surpriseTotal += surprise;
        } else {
          await tx.mindPrediction.updateMany({
            where: { id: row.id, workspaceId: row.workspaceId },
            data: { actual: 0, surprise: 0, resolvedAt: new Date() },
          });
        }
      }
      return surpriseTotal;
    });
  }

  /**
   * Compute surprise value for a predicted vs observed outcome.
   * Pure math — no I/O. Predicted is a probability in [0,1], observed is 0 or 1.
   * Returns -ln(1-predicted) when observed=1, or -ln(predicted) when observed=0.
   */
  computeSurprise(predicted: number, observed: 0 | 1): number {
    const probability = this.clamp(predicted, 1e-6, 1 - 1e-6);
    return observed === 1 ? -Math.log(probability) : -Math.log(1 - probability);
  }

  private clamp(value: number, min: number, max: number): number {
    return Math.min(max, Math.max(min, value));
  }
}
