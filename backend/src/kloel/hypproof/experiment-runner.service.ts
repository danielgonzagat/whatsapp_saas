import { Injectable, Logger } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import type { MicroExperiment, ExperimentRun, SpineSignal } from './types';

@Injectable()
export class ExperimentRunnerService {
  private readonly logger = new Logger(ExperimentRunnerService.name);
  private readonly runs = new Map<string, ExperimentRun>();
  private readonly idempotencyKeys = new Set<string>();

  run(
    experiment: MicroExperiment,
    observedEvents: readonly SpineSignal[],
  ): ExperimentRun | null {
    if (observedEvents.length === 0) {
      this.logger.warn(
        `Cannot run experiment ${experiment.id}: no observed events provided`,
      );
      return null;
    }

    const key = `run:${experiment.correlationId}:${experiment.id}`;
    if (this.idempotencyKeys.has(key)) {
      const existing = [...this.runs.values()].find(
        (r) => r.experimentId === experiment.id && r.status !== 'failed',
      );
      if (existing) {
        this.logger.debug(`Experiment ${experiment.id} already executed, returning existing run`);
        return existing;
      }
    }

    this.idempotencyKeys.add(key);

    const run: ExperimentRun = {
      id: `run_${randomUUID()}`,
      experimentId: experiment.id,
      hypothesisId: experiment.hypothesisId,
      workspaceId: experiment.workspaceId,
      correlationId: experiment.correlationId,
      status: 'running',
      startedAt: new Date().toISOString(),
      completedAt: null,
      error: null,
    };

    this.runs.set(run.id, run);
    this.logger.debug(
      `Experiment run started: ${run.id} for experiment ${experiment.id} with ${observedEvents.length} observed events`,
    );
    return run;
  }

  complete(runId: string, workspaceId: string): ExperimentRun | null {
    const run = this.runs.get(runId);
    if (!run) {
      this.logger.warn(`Run ${runId} not found`);
      return null;
    }
    if (run.workspaceId !== workspaceId) {
      this.logger.warn(`Run ${runId} workspace mismatch`);
      return null;
    }
    if (run.status === 'completed') {
      return run;
    }
    const completed: ExperimentRun = {
      ...run,
      status: 'completed',
      completedAt: new Date().toISOString(),
    };
    this.runs.set(runId, completed);
    return completed;
  }

  fail(runId: string, workspaceId: string, error: string): ExperimentRun | null {
    const run = this.runs.get(runId);
    if (!run) {
      this.logger.warn(`Run ${runId} not found`);
      return null;
    }
    if (run.workspaceId !== workspaceId) {
      return null;
    }
    const failed: ExperimentRun = {
      ...run,
      status: 'failed',
      completedAt: new Date().toISOString(),
      error,
    };
    this.runs.set(runId, failed);
    return failed;
  }

  getRun(runId: string): ExperimentRun | null {
    return this.runs.get(runId) ?? null;
  }

  listByWorkspace(workspaceId: string): ExperimentRun[] {
    return [...this.runs.values()].filter((r) => r.workspaceId === workspaceId);
  }
}
