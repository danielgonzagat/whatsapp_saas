/**
 * WISDOM-006 — Relevance Filter.
 *
 * Filters wisdom patterns by vertical/ticket/stage/channel relevance
 * to a target workspace. Pure functions — no side effects.
 *
 * Uses the taxonomy tags (WISDOM-004) attached to each pattern
 * to determine relevance to a target workspace context.
 */

import type { PatternTaxonomy, TargetWorkspaceContext, WisdomPattern } from './wisdom.types';

/**
 * Score how relevant a pattern's taxonomy is to a target workspace.
 * Returns a score in [0, 1] where 1 is most relevant.
 *
 * Scoring weights:
 *   - vertical match: 0.30
 *   - ticket match:   0.25
 *   - stage match:    0.25
 *   - channel match:  0.20
 */
export function relevanceScore(
  taxonomy: PatternTaxonomy,
  target: TargetWorkspaceContext,
): number {
  let score = 0;

  if (target.vertical && taxonomy.verticalHint) {
    if (target.vertical === taxonomy.verticalHint) {score += 0.30;}
  }

  if (target.ticketRange && taxonomy.tickethint) {
    if (
      target.ticketRange === taxonomy.tickethint ||
      taxonomy.tickethint === 'all'
    ) {
      score += 0.25;
    }
  }

  if (target.maturityStage && taxonomy.stageHint) {
    if (target.maturityStage === taxonomy.stageHint) {score += 0.25;}
  }

  if (target.activeChannels && taxonomy.channelHint) {
    if (target.activeChannels.includes(taxonomy.channelHint)) {score += 0.20;}
  }

  return Math.min(1, score);
}

/**
 * Filter patterns to only those with relevance score >= threshold
 * for the given target workspace context.
 */
export function filterByRelevance(
  patterns: readonly WisdomPattern[],
  target: TargetWorkspaceContext,
  threshold = 0.2,
): WisdomPattern[] {
  return patterns
    .map(p => ({ pattern: p, score: relevanceScore(p.taxonomy, target) }))
    .filter(({ score }) => score >= threshold)
    .sort((a, b) => b.score - a.score)
    .map(({ pattern }) => pattern);
}

/**
 * Drop patterns that are NOT relevant to any given workspace context.
 * Returns only patterns with any positive relevance score.
 */
export function filterIrrelevant(
  patterns: readonly WisdomPattern[],
  target: TargetWorkspaceContext,
): WisdomPattern[] {
  return patterns.filter(p => relevanceScore(p.taxonomy, target) > 0);
}
