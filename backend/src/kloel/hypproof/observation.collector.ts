import { Injectable, Logger } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import type { ExperimentRun, Observation } from './types';

interface RawObservation {
  readonly metricName: string;
  readonly observedValue: number;
  readonly confidence: number;
}

@Injectable()
export class ObservationCollectorService {
  private readonly logger = new Logger(ObservationCollectorService.name);
  private readonly observations = new Map<string, Observation[]>();

  collect(
    run: ExperimentRun,
    baselineValue: number,
    rawObservations: readonly RawObservation[],
  ): Observation[] {
    const key = this.collectionKey(run.workspaceId, run.experimentId);
    const now = new Date().toISOString();

    if (rawObservations.length === 0) {
      this.logger.warn(`Zero raw observations for run ${run.id}`);
      return [];
    }

    const collected: Observation[] = rawObservations.map((raw, _i) => {
      const delta = raw.observedValue - baselineValue;
      let validRaw = raw;
      if (raw.confidence < 0 || raw.confidence > 1) {
        this.logger.warn(`Observation confidence out of range: ${raw.confidence}, clamping`);
        validRaw = { ...raw, confidence: Math.max(0, Math.min(1, raw.confidence)) };
      }
      return {
        id: `obs_${randomUUID()}`,
        runId: run.id,
        experimentId: run.experimentId,
        workspaceId: run.workspaceId,
        correlationId: run.correlationId,
        metricName: validRaw.metricName,
        baselineValue,
        observedValue: validRaw.observedValue,
        delta,
        confidence: validRaw.confidence,
        truthMode: 'observed' as const,
        evidenceCount: rawObservations.length,
        observedAt: now,
      };
    });

    const existing = this.observations.get(key) ?? [];
    this.observations.set(key, [...existing, ...collected]);

    this.logger.debug(
      `Collected ${collected.length} observations for experiment ${run.experimentId}`,
    );

    return collected;
  }

  getByExperiment(workspaceId: string, experimentId: string): Observation[] {
    const key = this.collectionKey(workspaceId, experimentId);
    return this.observations.get(key) ?? [];
  }

  totalEvidence(workspaceId: string, experimentId: string): number {
    const obs = this.getByExperiment(workspaceId, experimentId);
    if (obs.length === 0) {return 0;}
    return Math.max(...obs.map((o) => o.evidenceCount));
  }

  private collectionKey(workspaceId: string, experimentId: string): string {
    return `${workspaceId}:${experimentId}`;
  }
}
