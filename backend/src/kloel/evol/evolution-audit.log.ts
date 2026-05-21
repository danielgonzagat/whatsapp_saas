import { Injectable } from '@nestjs/common';
import type { EvolutionAudit } from './types';

/**
 * EVOL-010 — EvolutionAuditLog.
 *
 * Immutable audit trail for all evolution actions. Every gap detection,
 * proposal, authorization, dispatch, experiment, rollback, firewall
 * block, and codacy check is recorded as an immutable audit entry.
 */

@Injectable()
export class EvolutionAuditLog {
  private entries: EvolutionAudit[] = [];
  private counter = 0;

  record(
    workspaceId: string,
    action: string,
    actor: string,
    payload: Readonly<Record<string, unknown>>,
    correlationId: string,
    authorizationId: string | null = null,
  ): EvolutionAudit {
    this.counter += 1;

    const entry: EvolutionAudit = {
      entryId: `audit-${workspaceId}-${this.counter}`,
      workspaceId,
      action,
      actor,
      payload,
      recordedAt: new Date().toISOString(),
      correlationId,
      authorizationId,
    };

    this.entries.push(entry);
    return entry;
  }

  recordGapDetection(gapId: string, workspaceId: string, correlationId: string): EvolutionAudit {
    return this.record(workspaceId, 'gap_detected', 'GapDetector', { gapId }, correlationId);
  }

  recordProposalCreated(proposalId: string, workspaceId: string, correlationId: string): EvolutionAudit {
    return this.record(workspaceId, 'proposal_created', 'ProposalBuilder', { proposalId }, correlationId);
  }

  recordAuthorization(authId: string, status: string, workspaceId: string, correlationId: string): EvolutionAudit {
    return this.record(workspaceId, `authorization_${status}`, 'HumanAuthorizationGateway', { authId, status }, correlationId, authId);
  }

  recordDispatch(bridgeId: string, workspaceId: string, correlationId: string, authId: string): EvolutionAudit {
    return this.record(workspaceId, 'agent_dispatched', 'AgentOrchestrationBridge', { bridgeId }, correlationId, authId);
  }

  recordExperiment(runId: string, status: string, workspaceId: string, correlationId: string): EvolutionAudit {
    return this.record(workspaceId, `experiment_${status}`, 'ExperimentRunner', { runId, status }, correlationId);
  }

  recordFirewallBlock(violationId: string, filePath: string, correlationId: string): EvolutionAudit {
    return this.record('global', 'firewall_blocked', 'ProtectedFilesFirewall', { violationId, filePath }, correlationId);
  }

  recordCodacyCheck(checkId: string, status: string, correlationId: string): EvolutionAudit {
    return this.record('global', 'codacy_rigor_checked', 'CodacyRigorEnforcer', { checkId, status }, correlationId);
  }

  list(workspaceId?: string): readonly EvolutionAudit[] {
    if (workspaceId) {
      return this.entries.filter((e) => e.workspaceId === workspaceId);
    }
    return [...this.entries];
  }

  recentEntries(sinceMs: number): readonly EvolutionAudit[] {
    const cutoff = Date.now() - sinceMs;
    return this.entries.filter((e) => new Date(e.recordedAt).getTime() >= cutoff);
  }

  count(): number {
    return this.entries.length;
  }

  reset(): void {
    this.entries = [];
    this.counter = 0;
  }
}
