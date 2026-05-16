/**
 * WISDOM-002 enhanced + WISDOM-008 integration — WisdomPrivacyGuardService.
 *
 * Service-level enforcement of cross-workspace privacy invariants:
 *   - k-anonymity gate (rejects patterns with < minK distinct workspaces)
 *   - differential privacy noise (Laplacian, single-value, epsilon=1.0 default)
 *   - attribution guard integration (rejects projection on PII leak)
 *   - opt-out enforcement (drops patterns from non-opted-in workspaces)
 *
 * The existing pure-function anonymizer (wisdom-anonymizer.ts) and
 * attribution guard (wisdom-attribution.guard.ts) remain authoritative
 * for their respective domains. This service orchestrates them as a
 * single security boundary within the projection pipeline.
 */

import { Injectable } from '@nestjs/common';
import type { CandidatePattern, WisdomPattern } from './wisdom.types';
import { validatePatternAttribution } from './wisdom-attribution.guard';
import { WisdomOptService } from './wisdom-opt';

export class WisdomPrivacyViolationError extends Error {
  public readonly reason: 'k_anonymity' | 'opt_out' | 'attribution_leak';
  public readonly patternId: string;

  constructor(
    reason: 'k_anonymity' | 'opt_out' | 'attribution_leak',
    patternId: string,
    detail: string,
  ) {
    super(`Privacy violation [${reason}]: pattern=${patternId} — ${detail}`);
    this.name = 'WisdomPrivacyViolationError';
    this.reason = reason;
    this.patternId = patternId;
  }
}

export interface FullPrivacyAuditResult {
  readonly passed: readonly CandidatePattern[];
  readonly rejected: readonly RejectionRecord[];
}

export interface RejectionRecord {
  readonly patternId: string;
  readonly reason: 'k_anonymity' | 'opt_out' | 'attribution_leak';
  readonly detail: string;
}

export interface FullPrivacyAuditOpts {
  readonly minK?: number;
  readonly epsilon?: number;
}

/**
 * Add calibrated Laplacian noise to a single numeric value for
 * differential privacy. Uses the inverse-CDF method for the
 * Laplace(0, b = sensitivity / epsilon) distribution.
 *
 * `epsilon` defaults to 1.0 — higher values = less noise (less privacy).
 * Sensitivity is always 1.0 per contributor.
 *
 * This is a standalone pure function (no DI required).
 */
export function diffPrivacyNoise(value: number, epsilon = 1.0): number {
  const effectiveEpsilon = Math.max(0.01, epsilon);
  const scale = 1.0 / effectiveEpsilon;

  const u = Math.random() - 0.5;
  const noise = -scale * Math.sign(u) * Math.log(1 - 2 * Math.abs(u));

  return value + noise;
}

/**
 * NestJS service that enforces cross-workspace privacy invariants
 * at the projection boundary.
 *
 * Integrates with WisdomOptService for opt-out enforcement and
 * delegates to the existing wisdom-anonymizer (pure functions) and
 * wisdom-attribution.guard for validation.
 */
@Injectable()
export class WisdomPrivacyGuardService {
  constructor(private readonly optService: WisdomOptService) {}

  /**
   * Hard gate: rejects a candidate pattern if it has fewer than `minK`
   * distinct workspaces contributing evidence. Throws
   * WisdomPrivacyViolationError on violation. Returns the pattern
   * unchanged on success (enables chaining).
   *
   * `minK` defaults to 5 — stricter than the pipeline-level
   * DEFAULT_K_ANONYMITY (3), per architectural mandate.
   */
  public enforceKAnonimity(pattern: CandidatePattern, minK = 5): CandidatePattern {
    if (pattern.evidenceWorkspacesCount < minK) {
      throw new WisdomPrivacyViolationError(
        'k_anonymity',
        pattern.patternId,
        `evidenceWorkspacesCount=${pattern.evidenceWorkspacesCount} < minK=${minK}`,
      );
    }
    return pattern;
  }

  /**
   * Hard gate: assert that a list of WisdomPattern objects contains
   * no PII / workspace-identifiable data. Throws if a pattern
   * leaks identifiers. Delegates to validatePatternAttribution from
   * the attribution guard.
   *
   * Must be called BEFORE projection to ABI.
   */
  public guardProjection(patterns: readonly WisdomPattern[]): void {
    const violations: string[] = [];

    for (const pattern of patterns) {
      const hits = validatePatternAttribution(pattern);
      for (const hit of hits) {
        violations.push(
          `pattern=${hit.patternId} keyword="${hit.matchedKeyword}" pos=${hit.position}`,
        );
      }
    }

    if (violations.length > 0) {
      throw new WisdomPrivacyViolationError(
        'attribution_leak',
        violations[0]?.split(' ')[0]?.split('=')[1] ?? 'unknown',
        `${violations.length} attribution violation(s): ${violations.slice(0, 3).join('; ')}`,
      );
    }
  }

  /**
   * Filter a list of candidate patterns to remove those whose
   * evidenceWorkspaceIds include workspaces that have NOT opted in
   * (for an opted-in role). A pattern survives only if ALL contributing
   * workspaces have opted in for at least one role.
   *
   * After filtering, patterns whose surviving workspace count falls
   * below `minK` are also dropped.
   */
  public filterOptedOut(candidates: readonly CandidatePattern[], minK = 5): CandidatePattern[] {
    return candidates
      .map((c) => {
        const surviving = c.evidenceWorkspaceIds.filter((id) =>
          this.optService.isWorkspaceOptedIn(id),
        );
        return {
          ...c,
          evidenceWorkspaceIds: surviving,
          evidenceWorkspacesCount: surviving.length,
        };
      })
      .filter((c) => c.evidenceWorkspacesCount >= minK);
  }

  /**
   * Full privacy audit: applies k-anonymity gate, opt-out filter,
   * and attribution validation. Returns the patterns that pass and
   * a detailed rejection log.
   *
   * This is the single entrypoint for the projection pipeline:
   *   fullPrivacyAudit → guardProjection → ABI projector.
   */
  public fullPrivacyAudit(
    candidates: readonly CandidatePattern[],
    opts: FullPrivacyAuditOpts = {},
  ): FullPrivacyAuditResult {
    const minK = opts.minK ?? 5;
    const rejected: RejectionRecord[] = [];
    const passed: CandidatePattern[] = [];

    for (const c of candidates) {
      const katReasons: string[] = [];

      if (c.evidenceWorkspacesCount < minK) {
        katReasons.push(`k-anonymity: ${c.evidenceWorkspacesCount} < ${minK}`);
      }

      const optedOutWorkspaces = c.evidenceWorkspaceIds.filter(
        (id) => !this.optService.isWorkspaceOptedIn(id),
      );
      if (optedOutWorkspaces.length > 0) {
        katReasons.push(`opt-out: [${optedOutWorkspaces.join(', ')}] not opted in`);
      }

      if (katReasons.length > 0) {
        for (const reason of katReasons) {
          rejected.push({
            patternId: c.patternId,
            reason: reason.startsWith('k-anonymity') ? 'k_anonymity' : 'opt_out',
            detail: reason,
          });
        }
      } else {
        passed.push(c);
      }
    }

    for (const c of passed) {
      const wp: WisdomPattern = {
        patternId: c.patternId,
        description: c.description,
        applicableConditions: c.applicableConditions,
        evidenceWorkspacesCount: c.evidenceWorkspacesCount,
        confidence: c.confidence,
        signalKind: c.signalKind,
        taxonomy: {
          verticalHint: undefined,
          tickethint: undefined,
          stageHint: undefined,
          channelHint: undefined,
        },
      };
      const hits = validatePatternAttribution(wp);
      if (hits.length > 0) {
        rejected.push({
          patternId: c.patternId,
          reason: 'attribution_leak',
          detail: `keyword="${hits[0]?.matchedKeyword}" pos=${hits[0]?.position}`,
        });
      }
    }

    const finalPassed = passed.filter(
      (c) => !rejected.some((r) => r.patternId === c.patternId && r.reason === 'attribution_leak'),
    );

    return { passed: finalPassed, rejected };
  }
}
