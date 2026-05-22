import { Injectable, Optional, Logger } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import type { ProofEvaluation, BeliefUpdate } from './types';
import type { MindBeliefService } from '../mind-belief.service';
import { SpineEmitterService } from '../spine/spine-emitter.service';

@Injectable()
export class BeliefUpdateService {
  private readonly logger = new Logger(BeliefUpdateService.name);

  constructor(
    private readonly spineEmitter: SpineEmitterService,
    @Optional() private readonly mindBeliefService?: MindBeliefService,
  ) {}

  async update(evaluation: ProofEvaluation): Promise<BeliefUpdate | null> {
    const subject = `hypproof:${evaluation.hypothesisId}`;
    const predicate = `P(confirmed|domain=${evaluation.hypothesisId})`;
    const context = {
      correlationId: evaluation.correlationId,
      experimentId: evaluation.experimentId,
    };

    const priorMean = estimatePriorMean(evaluation.verdict);
    const posteriorMean = computePosteriorMean(priorMean, evaluation);
    const outcome = evaluation.verdict === 'confirmed' ? 1 : 0;

    const beliefUpdate: BeliefUpdate = {
      id: `bel_${randomUUID()}`,
      workspaceId: evaluation.workspaceId,
      subject,
      predicate,
      context,
      priorMean,
      posteriorMean,
      evidenceCount: evaluation.evidenceCount,
      verdict: evaluation.verdict,
      correlationId: evaluation.correlationId,
      updatedAt: new Date().toISOString(),
    };

    try {
      if (this.mindBeliefService) {
        await this.mindBeliefService.observeBinary(
          evaluation.workspaceId,
          subject,
          predicate,
          context,
          outcome as 0 | 1,
        );
        this.logger.debug(
          `MindBelief updated for hypothesis ${evaluation.hypothesisId} with outcome=${outcome}`,
        );
      }
    } catch (error: unknown) {
      this.logger.warn(
        `MindBelief update failed for hypothesis ${evaluation.hypothesisId}: ${error instanceof Error ? error.message : String(error)}`,
      );
    }

    await this.spineEmitter.emit({
      eventName: 'cognition.belief_updated',
      workspaceId: evaluation.workspaceId,
      truthMode: 'observed',
      provenance: {
        source: 'production',
        processor: 'belief-update',
        processorVersion: '1.0.0',
        schemaVersion: '1.0.0',
      },
      payload: {
        hypothesisId: evaluation.hypothesisId,
        experimentId: evaluation.experimentId,
        priorMean,
        posteriorMean,
        verdict: evaluation.verdict,
        evidenceCount: evaluation.evidenceCount,
      },
      correlationId: evaluation.correlationId,
    });

    this.logger.debug(
      `Belief updated for hypothesis ${evaluation.hypothesisId}: verdict=${evaluation.verdict} prior=${priorMean.toFixed(3)} posterior=${posteriorMean.toFixed(3)}`,
    );

    return beliefUpdate;
  }
}

function estimatePriorMean(verdict: string): number {
  if (verdict === 'confirmed') return 0.55;
  if (verdict === 'refuted') return 0.45;
  return 0.5;
}

function computePosteriorMean(_prior: number, evaluation: ProofEvaluation): number {
  const alpha = 1 + (evaluation.verdict === 'confirmed' ? evaluation.evidenceCount : 0);
  const beta = 1 + (evaluation.verdict === 'refuted' ? evaluation.evidenceCount : 0);
  return alpha / (alpha + beta);
}
