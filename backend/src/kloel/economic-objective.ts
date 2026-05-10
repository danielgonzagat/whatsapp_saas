import type { MindJson } from './mind.types';

export type EconomicObjectiveProfile = 'b2c_ecommerce' | 'b2b_saas' | 'recurring_subscription';

export type EconomicObjectiveBreakdown = {
  attentionCost: number;
  compliance: number;
  conversion: number;
  expectedMargin: number;
  fatigue: number;
  profile: EconomicObjectiveProfile;
  retention: number;
  score: number;
};

function readNumber(value: unknown, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function readProfile(context: MindJson): EconomicObjectiveProfile {
  const candidate = context.economicProfile ?? context.profile;
  const raw = typeof candidate === 'string' ? candidate.trim() : '';
  if (raw === 'b2b_saas' || raw === 'recurring_subscription') return raw;
  return 'b2c_ecommerce';
}

function weightsFor(profile: EconomicObjectiveProfile) {
  if (profile === 'b2b_saas') {
    return { margin: 0.32, conversion: 0.24, retention: 0.28, compliance: 0.12, fatigue: 0.04 };
  }
  if (profile === 'recurring_subscription') {
    return { margin: 0.25, conversion: 0.2, retention: 0.38, compliance: 0.12, fatigue: 0.05 };
  }
  return { margin: 0.4, conversion: 0.28, retention: 0.14, compliance: 0.12, fatigue: 0.06 };
}

export function evaluateEconomicObjective(input: {
  action: string;
  beliefMean: number;
  context: MindJson;
  decisionType: string;
}): EconomicObjectiveBreakdown {
  const profile = readProfile(input.context);
  const weights = weightsFor(profile);
  const revenue = readNumber(input.context.expectedRevenue, readNumber(input.context.price, 100));
  const marginPercent = readNumber(input.context.marginPercent, 40);
  const attentionCost = readNumber(input.context.attentionCost, 1);
  const retentionProbability = readNumber(input.context.retentionProbability, 0.25);
  const fatigueRisk = readNumber(input.context.fatigueRisk, 0.1);
  const complianceScore = readNumber(input.context.complianceScore, 1);
  const expectedMargin = (revenue * marginPercent) / 100 - attentionCost;
  const conversion = input.beliefMean * revenue;
  const retention = retentionProbability * revenue;
  const fatigue = fatigueRisk * attentionCost;
  const normalizedMargin = expectedMargin / Math.max(revenue, 1);
  const normalizedConversion = conversion / Math.max(revenue, 1);
  const normalizedRetention = retention / Math.max(revenue, 1);
  const score =
    normalizedMargin * weights.margin +
    normalizedConversion * weights.conversion +
    normalizedRetention * weights.retention +
    complianceScore * weights.compliance -
    fatigue * weights.fatigue;

  return {
    attentionCost,
    compliance: complianceScore,
    conversion,
    expectedMargin,
    fatigue,
    profile,
    retention,
    score,
  };
}
