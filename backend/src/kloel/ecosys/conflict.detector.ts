import { Injectable } from '@nestjs/common';
import type { ConflictDetection, RoleFitMatch } from './ecosys.types';

/**
 * UTP-ECOSYS-008 — Detects conflicts of interest in cross-role
 * recommendations. Triggers silence (B0.18) when self-deal, cross-bet,
 * or workspace overlap detected.
 */

export interface ConflictContext {
  readonly platformInternalRevenueShareForFit?: ReadonlyMap<string, number>;
  readonly sharedOwnerByWorkspace?: ReadonlyMap<string, string>;
  readonly userOptedOutWorkspaces?: ReadonlySet<string>;
}

@Injectable()
export class ConflictDetectorService {
  public detect(
    fits: readonly RoleFitMatch[],
    ctx: ConflictContext = {},
  ): readonly ConflictDetection[] {
    const out: ConflictDetection[] = [];
    for (const fit of fits) {
      // Self-deal: same owner controls both fingerprints
      const ownerA = ctx.sharedOwnerByWorkspace?.get(fit.producerWorkspaceFingerprint);
      const ownerB = ctx.sharedOwnerByWorkspace?.get(fit.partnerWorkspaceFingerprint);
      if (ownerA && ownerB && ownerA === ownerB) {
        out.push({
          conflictId: `conflict_self_${fit.fitId}`,
          kind: 'self-deal',
          description: 'Both workspaces share the same owner — recommendation suppressed',
          silenceRecommended: true,
        });
        continue;
      }
      // Workspace overlap (literal duplicate)
      if (fit.producerWorkspaceFingerprint === fit.partnerWorkspaceFingerprint) {
        out.push({
          conflictId: `conflict_overlap_${fit.fitId}`,
          kind: 'workspace-overlap',
          description: 'Producer and partner are the same workspace',
          silenceRecommended: true,
        });
        continue;
      }
      // Opted out
      if (
        ctx.userOptedOutWorkspaces?.has(fit.producerWorkspaceFingerprint) ||
        ctx.userOptedOutWorkspaces?.has(fit.partnerWorkspaceFingerprint)
      ) {
        out.push({
          conflictId: `conflict_optout_${fit.fitId}`,
          kind: 'incentive-bias',
          description: 'User opted out of ecosystem recommendations',
          silenceRecommended: true,
        });
        continue;
      }
      // Internal revenue bias above threshold
      const internalRev = ctx.platformInternalRevenueShareForFit?.get(fit.fitId);
      if (internalRev !== undefined && internalRev > 0.5) {
        out.push({
          conflictId: `conflict_bias_${fit.fitId}`,
          kind: 'incentive-bias',
          description: `Platform internal revenue share too high (${(internalRev * 100).toFixed(0)}%) — bias risk`,
          silenceRecommended: true,
        });
      }
    }
    return out;
  }
}
