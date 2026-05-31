/**
 * MindAutonomyCoordinator — canonical autonomy proposal service for the
 * unified Kloel Mind (ADR-0013 Wave M1).
 *
 * Turns recommendations from {@link MindCommercialGraph} into auditable
 * autonomy proposals and records each proposal cycle on the cognitive event
 * spine.
 *
 * Legacy alias: {@link BrainAutonomyService} (kept exported for the 4-week
 * ADR-0013 alias window; imports from `kloel/brain-autonomy.service` continue
 * to work as deprecated re-exports).
 *
 * @cluster Mind/Coordination
 * @see docs/adr/0013-kloel-mind-unification.md
 */
import { Injectable } from '@nestjs/common';

import { StructuredLogger } from '../../../logging/structured-logger';
import { MindCommercialGraph } from './mind-commercial-graph.service';
import { MindEventSpine } from './mind-event-spine.service';

export interface BrainAutonomyProposal {
  action: string;
  confidence: number;
  mode: 'fix' | 'scale';
  reason: string;
  requiresHumanApproval: boolean;
}

/** Lightweight proposal surface for chat cognitive state exposure. */
export interface Proposal {
  id: string;
  title: string;
  rationale: string;
  confidence: number;
  suggestedCapabilityId: string;
}

@Injectable()
export class MindAutonomyCoordinator {
  private readonly logger = StructuredLogger.from(MindAutonomyCoordinator.name);

  constructor(
    private readonly graph: MindCommercialGraph,
    private readonly events: MindEventSpine,
  ) {
    this.logger.debug?.(`MindAutonomyCoordinator initialized`);
  }

  async propose(workspaceId: string): Promise<{
    proposals: BrainAutonomyProposal[];
    status: 'empty' | 'ready';
    window: { eventCount: number; take: number };
  }> {
    const recommendationState = await this.graph.recommendNextActions(workspaceId);
    const proposals = recommendationState.recommendations.map((recommendation) => {
      const isFix = recommendation.reason.startsWith('Priorizar');
      return {
        action: recommendation.action,
        confidence: recommendation.confidence,
        mode: isFix ? 'fix' : 'scale',
        reason: recommendation.reason,
        requiresHumanApproval: !isFix && recommendation.confidence < 0.85,
      } satisfies BrainAutonomyProposal;
    });

    await this.events.record({
      workspaceId,
      intent: 'autonomy.propose',
      action: 'brain.autonomy.propose',
      status: 'executed',
      meta: {
        proposalCount: proposals.length,
        actions: proposals.map((proposal) => proposal.action),
      },
    });

    return {
      status: proposals.length > 0 ? 'ready' : 'empty',
      proposals,
      window: recommendationState.window,
    };
  }

  /** Return up to `limit` pending proposals in a shape suitable for chat cognitive state. */
  async listPendingProposals(workspaceId: string, limit: number): Promise<Proposal[]> {
    const result = await this.propose(workspaceId);
    const proposals = result.proposals.slice(0, limit).map((proposal, index) => {
      const title =
        proposal.mode === 'fix' ? `Corrigir: ${proposal.action}` : `Escalar: ${proposal.action}`;
      return {
        id: `proposal-${workspaceId}-${index}`,
        title,
        rationale: proposal.reason,
        confidence: proposal.confidence,
        suggestedCapabilityId: proposal.action,
      } satisfies Proposal;
    });
    return proposals;
  }
}

/**
 * @deprecated Use {@link MindAutonomyCoordinator} instead. Kept as an alias
 * during the ADR-0013 Wave M1 4-week migration window so existing imports
 * (e.g. `import { BrainAutonomyService } from 'kloel/brain-autonomy.service'`)
 * continue to resolve to the canonical class.
 */
export const BrainAutonomyService = MindAutonomyCoordinator;
export type BrainAutonomyService = MindAutonomyCoordinator;
