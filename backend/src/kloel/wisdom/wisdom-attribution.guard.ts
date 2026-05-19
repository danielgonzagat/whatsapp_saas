/**
 * WISDOM-008 — Attribution Guard.
 *
 * Assertion service proving NO identifiable data leaks across workspace
 * boundaries. Verifies that pattern descriptions never contain
 * workspaceIds, leadIds, productIds, userIds, or PII keywords.
 *
 * Pure function specification with runtime enforcement.
 */

import type { WisdomPattern } from './wisdom.types';
import { PII_KEYWORD_PATTERNS } from './wisdom.types';

export interface AttributionGuardResult {
  readonly ok: boolean;
  readonly violations: readonly AttributionViolation[];
}

export interface AttributionViolation {
  readonly patternId: string;
  readonly matchedKeyword: string;
  readonly position: number;
}

/**
 * Check a single description string against all PII keyword patterns.
 * Returns the first matched pattern (null if clean).
 */
function checkDescription(description: string): RegExp | null {
  for (const pattern of PII_KEYWORD_PATTERNS) {
    if (pattern.test(description)) return pattern;
  }
  return null;
}

/**
 * Validate a single WisdomPattern for attribution leaks.
 * Returns an array of violations found in the pattern's description
 * and applicableConditions.
 */
export function validatePatternAttribution(
  pattern: WisdomPattern,
): AttributionViolation[] {
  const violations: AttributionViolation[] = [];

  for (const pattern_ of PII_KEYWORD_PATTERNS) {
    pattern_.lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = pattern_.exec(pattern.description)) !== null) {
      violations.push({
        patternId: pattern.patternId,
        matchedKeyword: match[0],
        position: match.index,
      });
    }
  }

  for (const condition of pattern.applicableConditions) {
    for (const pattern_ of PII_KEYWORD_PATTERNS) {
      pattern_.lastIndex = 0;
      let match: RegExpExecArray | null;
      while ((match = pattern_.exec(condition)) !== null) {
        violations.push({
          patternId: pattern.patternId,
          matchedKeyword: match[0],
          position: match.index,
        });
      }
    }
  }

  return violations;
}

/**
 * Validate all patterns for attribution leaks.
 * Returns a result with ok=false if a violation is found.
 */
export function validateAttribution(
  patterns: readonly WisdomPattern[],
): AttributionGuardResult {
  const allViolations: AttributionViolation[] = [];

  for (const pattern of patterns) {
    allViolations.push(...validatePatternAttribution(pattern));
  }

  return {
    ok: allViolations.length === 0,
    violations: allViolations,
  };
}

/**
 * Assert that a pattern description contains no identifiable data.
 * Throws an error with details if a violation is found.
 * Use this at the ABI projection boundary.
 */
export function assertNoAttributionLeak(
  patterns: readonly WisdomPattern[],
): void {
  const result = validateAttribution(patterns);
  if (!result.ok) {
    const ids = [...new Set(result.violations.map(v => v.patternId))].join(', ');
    throw new Error(
      `Attribution guard failed: PII leak in patterns [${ids}]. ` +
        `${result.violations.length} violations detected.`,
    );
  }
}

/**
 * Spec-level invariant: pattern descriptions produced by WISDOM-001
 * (WisdomPatternExtractorService) use templated descriptions that never
 * contain workspace IDs or entity IDs.
 *
 * This function is a self-check for the spec test file.
 */
export function patternDescriptionIsClean(description: string): boolean {
  return checkDescription(description) === null;
}
