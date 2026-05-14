import { Injectable, Logger } from '@nestjs/common';
import { randomUUID } from 'crypto';
import type { BlockingPattern } from './types';

interface PatternLearnInput {
  readonly workspaceId: string;
  readonly recentFrictionTypes: readonly string[];
  readonly actionAbandonmentRate: number;
  readonly averageTimeToStartMinutes: number;
  readonly mostCommonBlocker: string;
  readonly mostCommonResponse: string;
  readonly totalEventsObserved: number;
}

const PATTERN_CONFIGS: Readonly<Record<BlockingPattern['patternType'], { signalTypes: string[]; minObservations: number; description: string }>> = {
  analysis_paralysis: {
    signalTypes: ['ambiguity', 'overwhelm'],
    minObservations: 3,
    description: 'Repeated clarity-seeking without action — analysis replaces execution',
  },
  waiting_on_external: {
    signalTypes: ['external_blocker'],
    minObservations: 1,
    description: 'Execution blocked by external dependencies too often',
  },
  fear_of_imperfect: {
    signalTypes: ['perfectionism'],
    minObservations: 2,
    description: 'High standards prevent starting — perfectionism as blocker',
  },
  too_many_options: {
    signalTypes: ['scope_creep', 'overwhelm'],
    minObservations: 3,
    description: 'Too many paths paralyze — no single path chosen',
  },
  low_energy_state: {
    signalTypes: ['overwhelm', 'ambiguity'],
    minObservations: 3,
    description: 'Energy depletion pattern: even small actions feel too large',
  },
  unclear_payoff: {
    signalTypes: ['ambiguity', 'unknown_first_step'],
    minObservations: 3,
    description: 'Action blocked because outcome value is unclear to the owner',
  },
  dependency_chain: {
    signalTypes: ['external_blocker', 'scope_creep'],
    minObservations: 2,
    description: 'Changes require long chain of approvals or dependencies',
  },
  capacity_overload: {
    signalTypes: ['overwhelm', 'scope_creep'],
    minObservations: 4,
    description: 'Too many simultaneous action demands — capacity ceiling hit',
  },
};

@Injectable()
export class PatternLearnerService {
  private readonly logger = new Logger(PatternLearnerService.name);

  learn(input: PatternLearnInput): BlockingPattern[] {
    if (input.totalEventsObserved < 3) {
      this.logger.debug('Insufficient events for pattern learning');
      return [];
    }

    const patterns = this.detectPatterns(input);

    this.logger.debug(`Learned ${patterns.length} blocking patterns from ${input.totalEventsObserved} events`);

    return patterns;
  }

  private detectPatterns(input: PatternLearnInput): BlockingPattern[] {
    const typeCounts = new Map<string, number>();
    for (const t of input.recentFrictionTypes) {
      typeCounts.set(t, (typeCounts.get(t) ?? 0) + 1);
    }

    const patterns: BlockingPattern[] = [];

    for (const [patternType, config] of Object.entries(PATTERN_CONFIGS)) {
      const matchCount = config.signalTypes.reduce((sum, signalType) => sum + (typeCounts.get(signalType) ?? 0), 0);
      if (matchCount >= config.minObservations) {
        patterns.push(this.buildPattern(
          patternType as BlockingPattern['patternType'],
          input,
          config.description,
          matchCount,
        ));
      }
    }

    if (input.actionAbandonmentRate > 0.5 && input.averageTimeToStartMinutes > 60) {
      const existing = patterns.find((p) => p.patternType === 'analysis_paralysis');
      if (!existing) {
        patterns.push(this.buildPattern('analysis_paralysis', input, 'High abandonment rate with long start delays', Math.ceil(input.actionAbandonmentRate * 5)));
      }
    }

    return patterns;
  }

  private buildPattern(
    patternType: BlockingPattern['patternType'],
    input: PatternLearnInput,
    description: string,
    frequency: number,
  ): BlockingPattern {
    const ownerFeed = this.ownerCriterionFeed(patternType, input);
    return {
      id: randomUUID(),
      workspaceId: input.workspaceId,
      patternType,
      frequency,
      lastOccurrenceAt: new Date().toISOString(),
      evidenceTrack: [description, `Most common blocker: ${input.mostCommonBlocker}`, `Most common response: ${input.mostCommonResponse}`],
      ownerCriterionFeed: ownerFeed,
      learnedAt: new Date().toISOString(),
    };
  }

  private ownerCriterionFeed(patternType: BlockingPattern['patternType'], input: PatternLearnInput): string {
    const feed: string[] = [];
    feed.push(`Pattern: ${patternType.replace(/_/g, ' ')}`);
    feed.push(`Frequency: ${input.actionAbandonmentRate > 0.5 ? 'high' : 'moderate'}`);

    if (input.averageTimeToStartMinutes > 120) {
      feed.push('Owner preference inferred: prefers thorough preparation before execution');
    } else if (input.averageTimeToStartMinutes < 15) {
      feed.push('Owner preference inferred: values speed of execution over exhaustive prep');
    } else {
      feed.push('Owner preference inferred: moderate prep, moderate speed');
    }

    return feed.join(' | ');
  }

  getPatternCount(patterns: BlockingPattern[]): number {
    return patterns.length;
  }

  getDominantPattern(patterns: BlockingPattern[]): BlockingPattern | null {
    if (patterns.length === 0) return null;
    return [...patterns].sort((a, b) => b.frequency - a.frequency)[0] ?? null;
  }
}
