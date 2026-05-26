/**
 * EVOL types — Camada XXXII: Self-Evolution under absolute human governance.
 *
 * UTP-EVOL-001..016. All types are read-only at the contract level.
 * Defines the shape of runtime metrics, capability registry entries,
 * detected gaps, and improvement proposals with governance metadata.
 */

type GapSeverity = 'critical' | 'high' | 'medium' | 'low';

export type CommercialImpact =
  | 'revenue_blocking'
  | 'trust_eroding'
  | 'quality_degrading'
  | 'opportunity_missed'
  | 'neutral';

export type RTier =
  | 'tier_1_functional'
  | 'tier_2_partial'
  | 'tier_3_facade'
  | 'tier_4_shell';

type RiskClass = 'safe' | 'normal' | 'high' | 'critical';

type ProposalStatus = 'draft' | 'submitted' | 'authorized' | 'rejected';

export interface DomainRiskProfile {
  readonly severity: GapSeverity;
  readonly impact: CommercialImpact;
  readonly baseRiskCents: number;
  readonly knownDomains: readonly string[];
}

export interface RuntimeMetric {
  readonly name: string;
  readonly workspaceId: string;
  readonly value: number;
  readonly threshold: number;
  readonly collectedAt: string;
}

export interface CapabilityEntry {
  readonly capabilityId: string;
  readonly domain: string;
  readonly declaredTier: RTier;
  readonly evidence: readonly string[];
  readonly evidenceScore: number;
  readonly lastVerifiedAt: string;
}

// RTierDelta is the canonical interface in ./types — re-export to keep the
// 3 evol.types.ts consumers (gap-detector/proposal-builder/spec) working.
export type { RTierDelta } from './types';

export interface Gap {
  readonly id: string;
  readonly workspaceId: string;
  readonly domain: string;
  readonly description: string;
  readonly severity: GapSeverity;
  readonly commercialImpact: CommercialImpact;
  readonly estimatedRevenueRiskCents: number;
  readonly detectedAt: string;
  readonly sourceEvidence: readonly string[];
  readonly confidence: number;
  readonly truthMode: 'observed';
}

export interface ImprovementProposal {
  readonly id: string;
  readonly gapId: string;
  readonly workspaceId: string;
  readonly domain: string;
  readonly description: string;
  readonly hypothesisToTest: string;
  readonly requiresHumanApproval: boolean;
  readonly riskClass: RiskClass;
  readonly expectedRTierDelta: string;
  readonly rollbackPlan: string;
  readonly targetFiles: readonly string[];
  readonly evidence: readonly string[];
  readonly generatedAt: string;
  readonly status: ProposalStatus;
}

export const DOMAIN_RISK_PROFILES: Readonly<Record<string, DomainRiskProfile>> = {
  payments: {
    severity: 'critical',
    impact: 'revenue_blocking',
    baseRiskCents: 100000,
    knownDomains: ['payments', 'commerce.payment'],
  },
  wallet: {
    severity: 'critical',
    impact: 'revenue_blocking',
    baseRiskCents: 50000,
    knownDomains: ['wallet', 'commerce.wallet'],
  },
  checkout: {
    severity: 'high',
    impact: 'revenue_blocking',
    baseRiskCents: 75000,
    knownDomains: ['checkout', 'commerce.cart'],
  },
  whatsapp: {
    severity: 'high',
    impact: 'revenue_blocking',
    baseRiskCents: 30000,
    knownDomains: ['whatsapp', 'commerce.whatsapp'],
  },
  auth: {
    severity: 'high',
    impact: 'trust_eroding',
    baseRiskCents: 20000,
    knownDomains: ['auth'],
  },
  kyc: {
    severity: 'high',
    impact: 'trust_eroding',
    baseRiskCents: 15000,
    knownDomains: ['kyc'],
  },
  billing: {
    severity: 'medium',
    impact: 'revenue_blocking',
    baseRiskCents: 10000,
    knownDomains: ['billing'],
  },
  autopilot: {
    severity: 'medium',
    impact: 'quality_degrading',
    baseRiskCents: 8000,
    knownDomains: ['autopilot'],
  },
  crm: {
    severity: 'medium',
    impact: 'opportunity_missed',
    baseRiskCents: 5000,
    knownDomains: ['crm', 'commerce.crm'],
  },
  flows: {
    severity: 'low',
    impact: 'quality_degrading',
    baseRiskCents: 3000,
    knownDomains: ['flows'],
  },
  dashboard: {
    severity: 'low',
    impact: 'quality_degrading',
    baseRiskCents: 2000,
    knownDomains: ['dashboard'],
  },
};

const KNOWN_DOMAINS: ReadonlySet<string> = new Set(Object.keys(DOMAIN_RISK_PROFILES));

export function resolveDomain(rawDomain: string): string | null {
  for (const [key, profile] of Object.entries(DOMAIN_RISK_PROFILES)) {
    for (const known of profile.knownDomains) {
      if (rawDomain === known || rawDomain.startsWith(known + '.')) return key;
    }
  }
  if (KNOWN_DOMAINS.has(rawDomain)) return rawDomain;
  return null;
}

import { clamp } from '../../common/math';
export { clamp };

// Canonical impls live in ./types.
export { commercialImpactWeight, tierToNumber } from './types';

export function isRTier3Or4(tier: RTier): boolean {
  return tier === 'tier_3_facade' || tier === 'tier_4_shell';
}
