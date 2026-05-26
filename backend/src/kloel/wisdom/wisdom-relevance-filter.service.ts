import { Injectable } from '@nestjs/common';
import { StructuredLogger } from '../../logging/structured-logger';
import { filterByRelevance } from './wisdom-relevance-filter';
import type { TargetWorkspaceContext, WisdomPattern } from './wisdom.types';

/**
 * WISDOM-006 — Relevance Filter Service.
 *
 * Injectable wrapper around the pure filterByRelevance function.
 * Consumed by MindPolicyService at choose-time to apply wisdom
 * patterns as Beta prior nudges (CIA Gap 9).
 *
 * Patterns are loaded from a caller-supplied source; this service
 * is stateless — it only scores and filters.
 */
@Injectable()
export class WisdomRelevanceFilter {
  private readonly logger = StructuredLogger.from(WisdomRelevanceFilter.name);

  /**
   * Filter wisdom patterns relevant to a workspace + decision context.
   *
   * @param patterns - the pool of wisdom patterns to filter
   * @param workspaceId - the requesting workspace
   * @param decisionContext - channel, vertical, ticket, stage hints from the decision
   * @returns patterns sorted by relevance score (desc), threshold ≥ 0.2
   */
  filter(
    patterns: readonly WisdomPattern[],
    workspaceId: string,
    decisionContext?: {
      channel?: string;
      vertical?: string;
      ticketRange?: 'low' | 'medium' | 'high';
      maturityStage?: string;
      activeChannels?: readonly string[];
      decisionType?: string;
    },
  ): WisdomPattern[] {
    if (!patterns || patterns.length === 0) {
      return [];
    }

    const target: TargetWorkspaceContext = {
      workspaceId,
      vertical: decisionContext?.vertical,
      ticketRange: decisionContext?.ticketRange,
      maturityStage: decisionContext?.maturityStage,
      activeChannels:
        decisionContext?.activeChannels ??
        (decisionContext?.channel ? [decisionContext.channel] : undefined),
    };

    const filtered = filterByRelevance(patterns, target, 0.2);

    if (filtered.length > 0) {
      this.logger.debug?.({
        operation: 'wisdom_relevance_filter.filter',
        status: 'ok',
        workspaceId,
        inputCount: patterns.length,
        matchedCount: filtered.length,
        topConfidence: filtered[0]?.confidence,
        topSignalKind: filtered[0]?.signalKind,
      });
    }

    return filtered;
  }
}
