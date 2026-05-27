/**
 * @deprecated Use {@link ./mind/coordination/mind-autonomy-coordinator.service.ts MindAutonomyCoordinator}.
 * ADR-0013 Wave M1 alias window (4 weeks). The @Injectable() lives here so
 * NestJS DI keeps booting; new callers should import from the canonical path.
 *
 * @cluster Mind/Coordination
 * @canonical backend/src/kloel/mind/coordination/mind-autonomy-coordinator.service.ts
 * @see docs/adr/0013-kloel-mind-unification.md
 */
import { Injectable } from '@nestjs/common';
import { StructuredLogger } from '../logging/structured-logger';
import { BrainCommercialGraphService } from './brain-commercial-graph.service';
import { BrainEventSpineService } from './brain-event-spine.service';

export interface BrainAutonomyProposal {
  action: string;
  confidence: number;
  mode: 'fix' | 'scale';
  reason: string;
  requiresHumanApproval: boolean;
}

@Injectable()
export class BrainAutonomyService {
  private readonly logger = StructuredLogger.from(BrainAutonomyService.name);

  constructor(
    private readonly graph: BrainCommercialGraphService,
    private readonly events: BrainEventSpineService,
  ) {
    this.logger.debug?.(`BrainAutonomyService initialized`);
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
