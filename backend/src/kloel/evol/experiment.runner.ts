import { Injectable } from '@nestjs/common';
import type { ImprovementProposal, HumanAuthorization, ExperimentRun } from './types';

/**
 * EVOL-005 — ExperimentRunner.
 *
 * Integrates with HYPPROOF to run micro-experiments on improvement
 * proposals before full rollout. Each proposal spawns a hypproof
 * experiment that measures the actual delta. Results are evidence
 * for proposal acceptance or rejection.
 */

@Injectable()
export class ExperimentRunner {
  private runs = new Map<string, ExperimentRun>();
  private counter = 0;

  start(
    proposal: ImprovementProposal,
    authorization: HumanAuthorization,
  ): ExperimentRun | null {
    if (authorization.status !== 'approved') {return null;}

    this.counter += 1;
    const now = new Date().toISOString();

    const run: ExperimentRun = {
      id: `exp-${proposal.workspaceId}-${this.counter}`,
      proposalId: proposal.id,
      workspaceId: proposal.workspaceId,
      hypproofExperimentId: `hypproof-evol-${this.counter}`,
      status: 'running',
      startedAt: now,
      completedAt: null,
      evidenceCount: 0,
      verdict: null,
    };

    this.runs.set(run.id, run);
    return run;
  }

  complete(runId: string, evidenceCount: number, verdict: 'confirmed' | 'refuted' | 'inconclusive'): ExperimentRun | null {
    const run = this.runs.get(runId);
    if (!run) {return null;}
    if (run.status !== 'running') {return run;}

    const completed: ExperimentRun = {
      ...run,
      status: 'completed',
      completedAt: new Date().toISOString(),
      evidenceCount,
      verdict,
    };

    this.runs.set(runId, completed);
    return completed;
  }

  fail(runId: string, _error: string): ExperimentRun | null {
    const run = this.runs.get(runId);
    if (!run) {return null;}

    const failed: ExperimentRun = {
      ...run,
      status: 'failed',
      completedAt: new Date().toISOString(),
    };

    this.runs.set(runId, failed);
    return failed;
  }

  getRun(runId: string): ExperimentRun | undefined {
    return this.runs.get(runId);
  }

  listByProposal(proposalId: string): readonly ExperimentRun[] {
    return [...this.runs.values()].filter((r) => r.proposalId === proposalId);
  }

  resetCounter(): void {
    this.counter = 0;
  }
}
