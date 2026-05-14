import { Injectable, Logger } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import type { MicroExperiment, AuthorizationDecision, ExperimentRun } from './types';

@Injectable()
export class ExperimentRunnerService {
  private readonly logger = new Logger(ExperimentRunnerService.name);
  private readonly runs = new Map<string, ExperimentRun>();
  private readonly idempotencyKeys = new Set<string>();

  start(
    experiment: MicroExperiment,
    authorization: AuthorizationDecision,
  ): ExperimentRun | null {
    if (!authorization.authorized) {
      this.logger.warn(
        `Cannot start experiment ${experiment.id}: not authorized (${authorization.reason})`,
      );
      return null;
    }

    const idempotencyKey = `run:${experiment.correlationId}:${experiment.id}`;
    if (this.idempotencyKeys.has(idempotencyKey)) {
      const existing = [...this.runs.values()].find(
        (r) => r.experimentId === experiment.id && r.status !== 'failed',
      );
      if (existing) {
        this.logger.debug(`Experiment ${experiment.id} already running, returning existing run`);
        return existing;
      }
    }

    this.idempotencyKeys.add(idempotencyKey);

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
      `Experiment run started: ${run.id} for experiment ${experiment.id}`,
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
