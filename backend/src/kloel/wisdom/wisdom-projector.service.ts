import { Injectable } from '@nestjs/common';
import type { AbiWisdomPattern } from '../abi/abi-schema';
import type { WisdomPattern } from './wisdom.types';

/**
 * WISDOM-005 — Wisdom Projector.
 *
 * Converts internal WisdomPattern objects to AbiWisdomPattern[]
 * sized for ABI consumption. The ABI only receives patternId,
 * description, applicableConditions, evidenceWorkspacesCount,
 * and confidence — no internal fields leak.
 *
 * Instantiates ABI contract type from PCI.2 §3.13.
 */
@Injectable()
export class WisdomProjectorService {
  /**
   * Project a list of WisdomPattern into AbiWisdomPattern for ABI
   * consumption. Silently drops patterns with empty descriptions
   * (filtered out by anonymizer/validator).
   */
  public project(patterns: readonly WisdomPattern[]): AbiWisdomPattern[] {
    return patterns
      .filter(p => p.description.length > 0)
      .map(p => ({
        patternId: p.patternId,
        description: p.description,
        applicableConditions: p.applicableConditions,
        evidenceWorkspacesCount: p.evidenceWorkspacesCount,
        confidence: p.confidence,
      }));
  }

  /**
   * Project a single WisdomPattern.
   */
  public projectOne(pattern: WisdomPattern): AbiWisdomPattern {
    return {
      patternId: pattern.patternId,
      description: pattern.description,
      applicableConditions: pattern.applicableConditions,
      evidenceWorkspacesCount: pattern.evidenceWorkspacesCount,
      confidence: pattern.confidence,
    };
  }

  /**
   * Cap the number of patterns to fit within a token budget.
   * Sorts by confidence descending and takes the top N.
   */
  public capByBudget(
    patterns: readonly AbiWisdomPattern[],
    maxPatterns: number,
  ): AbiWisdomPattern[] {
    if (patterns.length <= maxPatterns) {return [...patterns];}
    return [...patterns]
      .sort((a, b) => b.confidence - a.confidence)
      .slice(0, maxPatterns);
  }
}
