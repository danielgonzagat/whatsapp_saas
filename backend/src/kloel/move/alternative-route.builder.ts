import { Injectable, Logger } from '@nestjs/common';
import { randomUUID } from 'crypto';
import type { AlternativeRoute } from './types';

interface AlternativeRouteInput {
  readonly workspaceId: string;
  readonly blockedAction: string;
  readonly blocker: string;
  readonly blockedActionEffortMinutes: number;
  readonly availableResources: readonly string[];
  readonly constraints: readonly string[];
  readonly desiredOutcome: string;
}

interface RouteTemplate {
  readonly strategy: string;
  readonly effortRatio: number;
  readonly outcomeProximity: number;
}

const ROUTE_STRATEGIES: RouteTemplate[] = [
  { strategy: 'delegate_to_available_resource', effortRatio: 0.3, outcomeProximity: 0.85 },
  { strategy: 'simplify_to_minimum_viable', effortRatio: 0.4, outcomeProximity: 0.7 },
  { strategy: 'change_approach_materially', effortRatio: 0.6, outcomeProximity: 0.8 },
  { strategy: 'sequence_differently', effortRatio: 0.5, outcomeProximity: 0.75 },
  { strategy: 'use_alternative_tool', effortRatio: 0.7, outcomeProximity: 0.65 },
  { strategy: 'start_with_partial_outcome', effortRatio: 0.25, outcomeProximity: 0.5 },
];

@Injectable()
export class AlternativeRouteBuilderService {
  private readonly logger = new Logger(AlternativeRouteBuilderService.name);

  build(input: AlternativeRouteInput): AlternativeRoute | null {
    const viableRoutes = this.rankRoutes(input);

    if (viableRoutes.length === 0) {
      this.logger.debug(`No viable alternative routes for "${input.blockedAction.slice(0, 40)}"`);
      return null;
    }

    const best = viableRoutes[0]!;
    const alternativeAction = this.formatAlternative(best.strategy, input);

    this.logger.debug(
      `Built alternative route: ${best.strategy} (effort=${best.effortRatio}, proximity=${best.outcomeProximity})`,
    );

    return {
      id: randomUUID(),
      workspaceId: input.workspaceId,
      blockedAction: input.blockedAction,
      blocker: input.blocker,
      alternativeAction,
      effortRatio: Math.round(best.effortRatio * 1000) / 1000,
      outcomeProximity: Math.round(best.outcomeProximity * 1000) / 1000,
      generatedAt: new Date().toISOString(),
    };
  }

  private rankRoutes(input: AlternativeRouteInput): RouteTemplate[] {
    const applicable = ROUTE_STRATEGIES.filter((r) => {
      if (r.strategy === 'delegate_to_available_resource' && input.availableResources.length === 0) {
        return false;
      }
      if (r.strategy === 'use_alternative_tool' && input.availableResources.length === 0) {
        return false;
      }
      return true;
    });

    return applicable
      .map((r) => ({ ...r, score: this.scoreRoute(r, input) }))
      .filter((r) => r.score > 0.3)
      .sort((a, b) => b.score - a.score);
  }

  private scoreRoute(route: RouteTemplate, input: AlternativeRouteInput): number {
    let score = route.outcomeProximity * 0.5 + (1 - route.effortRatio) * 0.3;

    if (input.availableResources.length > 0 && route.strategy === 'delegate_to_available_resource') {
      score += 0.2;
    }

    if (input.constraints.length === 0) {
      score += 0.1;
    }

    if (input.constraints.length >= 3) {
      score -= 0.5;
    }

    if (input.blockedActionEffortMinutes > 120 && route.effortRatio < 0.5) {
      score += 0.15;
    }

    return Math.min(score, 1);
  }

  private formatAlternative(strategy: string, input: AlternativeRouteInput): string {
    switch (strategy) {
      case 'delegate_to_available_resource':
        return `Use ${input.availableResources[0] ?? 'available resources'} to advance: ${input.desiredOutcome}`;
      case 'simplify_to_minimum_viable':
        return `Strip "${input.blockedAction}" to its minimum viable version: ${input.desiredOutcome}`;
      case 'change_approach_materially':
        return `Change approach to "${input.blockedAction}" bypassing "${input.blocker}": ${input.desiredOutcome}`;
      case 'sequence_differently':
        return `Re-sequence: start with a part of "${input.blockedAction}" that does not depend on "${input.blocker}"`;
      case 'use_alternative_tool':
        return `Use an alternative method to achieve "${input.desiredOutcome}" without "${input.blocker}"`;
      case 'start_with_partial_outcome':
        return `Start with a partial version of "${input.desiredOutcome}" that avoids "${input.blocker}" entirely`;
      default:
        return `Alternative path to "${input.desiredOutcome}" avoiding "${input.blocker}"`;
    }
  }
}
