/**
 * MindAutonomyCoordinator — canonical autonomy proposal service for the
 * unified Kloel Mind (ADR-0013 Wave M1).
 *
 * Turns recommendations from {@link MindCommercialGraph} (currently still
 * imported under its legacy `BrainCommercialGraphService` name) into auditable
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
import { BrainCommercialGraphService } from '../../brain-commercial-graph.service';
import { BrainEventSpineService } from '../../brain-event-spine.service';

export interface BrainAutonomyProposal {
  action: string;
  confidence: number;
  mode: 'fix' | 'scale';
  reason: string;
  requiresHumanApproval: boolean;
}

@Injectable()
export class MindAutonomyCoordinator {
  private readonly logger = StructuredLogger.from(MindAutonomyCoordinator.name);

  constructor(
    private readonly graph: BrainCommercialGraphService,
    private readonly events: BrainEventSpineService,
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
}

/**
 * @deprecated Use {@link MindAutonomyCoordinator} instead. Kept as an alias
 * during the ADR-0013 Wave M1 4-week migration window so existing imports
 * (e.g. `import { BrainAutonomyService } from 'kloel/brain-autonomy.service'`)
 * continue to resolve to the canonical class.
 */
export const BrainAutonomyService = MindAutonomyCoordinator;
export type BrainAutonomyService = MindAutonomyCoordinator;
