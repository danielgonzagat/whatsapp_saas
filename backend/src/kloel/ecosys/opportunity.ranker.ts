import { Injectable } from '@nestjs/common';
import type { OpportunityRanking, RoleFitMatch } from './ecosys.types';

/**
 * UTP-ECOSYS-006 — Ranks role-fit matches into deliverable opportunities.
 * Score: impact * viability * (1 - conflictRisk).
 */
@Injectable()
export class OpportunityRankerService {
  public rank(
    fits: readonly RoleFitMatch[],
    opts: {
      readonly conflictRiskByFitId?: ReadonlyMap<string, number>;
      readonly viabilityByFitId?: ReadonlyMap<string, number>;
      readonly cap?: number;
    } = {},
  ): readonly OpportunityRanking[] {
    const ranked = fits
      .map((fit) => {
        const conflictRisk = opts.conflictRiskByFitId?.get(fit.fitId) ?? 0.1;
        const viability = opts.viabilityByFitId?.get(fit.fitId) ?? 0.7;
        const impact = fit.score;
        const composite = impact * viability * (1 - conflictRisk);
        return {
          opportunityId: `opp_${fit.fitId}`,
          description: `Cross-role match between ${fit.roleA} and ${fit.roleB}`,
          impactScore: impact,
          viability,
          conflictRisk,
          composite,
        };
      })
      .filter((o) => o.composite > 0)
      .sort((a, b) => b.composite - a.composite);
    const sliced = opts.cap !== undefined ? ranked.slice(0, opts.cap) : ranked;
    return sliced.map((o, idx) => ({
      opportunityId: o.opportunityId,
      description: o.description,
      impactScore: o.impactScore,
      viability: o.viability,
      conflictRisk: o.conflictRisk,
      rank: idx + 1,
    }));
  }
}
