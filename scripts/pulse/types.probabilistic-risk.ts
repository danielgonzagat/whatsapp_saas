// PULSE — Wave 7: Probabilistic Risk Model (Bayesian)
// Type definitions for capability reliability tracking.

export interface CapabilityReliability {
  capabilityId: string;
  capabilityName: string;
  /** Beta distribution successes + prior. */
  alpha: number;
  /** Beta distribution failures + prior. */
  beta: number;
  /** alpha/(alpha+beta) = P(works in production). */
  reliabilityP: number;
  /** [lower, upper] 95% confidence interval. */
  confidenceInterval: [number, number];
  observations: number;
  lastUpdate: string;
  /** 0..1, relative to all traffic. */
  trafficShare: number;
  /** (1-reliabilityP) * trafficShare. */
  expectedImpact: number;
  trend: 'improving' | 'stable' | 'degrading' | 'unknown';
  /** Temporal decay factor on old evidence. */
  decayFactor: number;
}

export interface ProbabilisticRiskState {
  generatedAt: string;
  summary: {
    totalCapabilities: number;
    avgReliability: number;
    minReliability: number;
    capabilitiesWithLowReliability: number;
    topImpactCapabilities: Array<{ capabilityId: string; expectedImpact: number }>;
  };
  reliabilities: CapabilityReliability[];
  /** Capability IDs ordered by expectedImpact descending. */
  prioritizedPlan: string[];
}
