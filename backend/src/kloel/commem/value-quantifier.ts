import { Injectable } from '@nestjs/common';
import type { ValueQuantification } from './commem.types';
import { workspaceFilter, eventDomain, clamp } from './commem.types';
import type { SpineEventRef } from '../mind/mind.types';

const DOMAIN_VALUE_WEIGHTS: Readonly<Record<string, number>> = {
  'commerce.payment': 3.0,
  'commerce.crm': 2.5,
  'commerce.lead': 2.0,
  'commerce.post_sale': 2.0,
  'commerce.kyc': 1.5,
  'commerce.whatsapp': 1.5,
  'commerce.campaign': 1.0,
  'commerce.member_area': 1.5,
  'commerce.affiliate': 1.0,
  'lineage': 2.0,
  'cognition': 2.5,
  'goal_field': 1.0,
  'pulse': 0.5,
  'legitimacy': 1.5,
  'incentive': 1.0,
  'evolution': 2.0,
};

const BASE_CAPITAL_CENTS_PER_EVENT = 100n;

function computeKnowledgeMaturity(
  events: readonly SpineEventRef[],
  domainCount: number,
): number {
  if (events.length === 0) {return 0;}

  const observedRatio =
    events.filter((e) => e.truthMode === 'observed').length / events.length;
  const inferredRatio =
    events.filter((e) => e.truthMode === 'inferred').length / events.length;

  const dimensionBonus = Math.min(1, domainCount / 10);
  return clamp(observedRatio * 0.5 + inferredRatio * 0.3 + dimensionBonus * 0.2, 0, 1);
}

@Injectable()
export class ValueQuantifier {
  public quantify(
    events: readonly SpineEventRef[],
    workspaceId: string,
  ): ValueQuantification {
    const scoped = workspaceFilter(events, workspaceId);

    const domains = new Set<string>();
    let weightedSum = 0;

    for (const e of scoped) {
      const domain = eventDomain(e.eventName);
      domains.add(domain);
      weightedSum += DOMAIN_VALUE_WEIGHTS[domain] ?? 0.5;
    }

    const commercialDensity =
      scoped.length > 0
        ? clamp(weightedSum / (scoped.length * 3.0), 0, 1)
        : 0;

    const knowledgeMaturity = computeKnowledgeMaturity(scoped, domains.size);

    const capitalValue =
      BASE_CAPITAL_CENTS_PER_EVENT * BigInt(scoped.length) +
      BigInt(Math.floor(weightedSum * 1000));

    return {
      workspaceId,
      quantifiedAtMs: Date.now(),
      totalEventCount: scoped.length,
      distinctDomains: domains.size,
      commercialDensity: Math.round(commercialDensity * 10000) / 10000,
      knowledgeMaturityScore: Math.round(knowledgeMaturity * 10000) / 10000,
      estimatedCapitalValue: capitalValue,
    };
  }

  public compare(
    before: ValueQuantification,
    after: ValueQuantification,
  ): QuantificationDelta {
    return {
      workspaceId: before.workspaceId,
      eventCountDelta: after.totalEventCount - before.totalEventCount,
      domainDelta: after.distinctDomains - before.distinctDomains,
      commercialDensityDelta:
        Math.round((after.commercialDensity - before.commercialDensity) * 10000) / 10000,
      maturityDelta:
        Math.round((after.knowledgeMaturityScore - before.knowledgeMaturityScore) * 10000) /
        10000,
      capitalDelta: after.estimatedCapitalValue - before.estimatedCapitalValue,
    };
  }
}

export interface QuantificationDelta {
  readonly workspaceId: string;
  readonly eventCountDelta: number;
  readonly domainDelta: number;
  readonly commercialDensityDelta: number;
  readonly maturityDelta: number;
  readonly capitalDelta: bigint;
}
