export interface OfferQuality {
  readonly offerId: string;
  readonly workspaceId: string;
  readonly overallScore: number;
  readonly conversionRate: number;
  readonly refundRate: number;
  readonly avgTicket: number;
  readonly commissionRate: number;
  readonly marketDemand: number;
  readonly saturationRisk: number;
  readonly evaluatedAt: string;
}

export interface ProducerTrust {
  readonly producerId: string;
  readonly workspaceId: string;
  readonly trustScore: number;
  readonly paymentHistoryReliability: number;
  readonly communicationResponsiveness: number;
  readonly productQualityConsistency: number;
  readonly disputeResolutionRate: number;
  readonly productionStability: number;
  readonly evaluatedAt: string;
}

export interface AudienceFit {
  readonly audienceId: string;
  readonly offerId: string;
  readonly workspaceId: string;
  readonly fitScore: number;
  readonly demographicAlignment: number;
  readonly interestOverlap: number;
  readonly behavioralMatch: number;
  readonly purchaseIntentAlignment: number;
  readonly evaluatedAt: string;
}

export interface AngleSuggestion {
  readonly id: string;
  readonly offerId: string;
  readonly workspaceId: string;
  readonly angle: string;
  readonly hook: string;
  readonly body: string;
  readonly targetEmotion: string;
  readonly noveltyScore: number;
  readonly predictedPerformance: number;
  readonly generatedAt: string;
}

export interface AngleFatigue {
  readonly angleId: string;
  readonly workspaceId: string;
  readonly fatigueScore: number;
  readonly impressionCount: number;
  readonly ctrDeclineRate: number;
  readonly conversionDeclineRate: number;
  readonly fatigueThreshold: number;
  readonly recommendation: 'rotate' | 'rest' | 'still_fresh';
  readonly evaluatedAt: string;
}

export interface TrafficWaste {
  readonly id: string;
  readonly campaignId: string;
  readonly workspaceId: string;
  readonly wasteScore: number;
  readonly wastedSpend: number;
  readonly wastefulSegments: readonly string[];
  readonly rootCause: string;
  readonly recommendation: string;
  readonly detectedAt: string;
}

export interface BudgetProtection {
  readonly workspaceId: string;
  readonly campaignId: string;
  readonly dailyBudgetLimit: number;
  readonly currentDailySpend: number;
  readonly stopLossThreshold: number;
  readonly currentLoss: number;
  readonly protectionStatus: 'safe' | 'warning' | 'stopped';
  readonly recommendation: string;
  readonly evaluatedAt: string;
}

export interface AccountProtection {
  readonly workspaceId: string;
  readonly accountId: string;
  readonly riskScore: number;
  readonly policyViolations: readonly string[];
  readonly reputationFlags: readonly string[];
  readonly recommendation: 'safe' | 'review' | 'pause' | 'stop';
  readonly evaluatedAt: string;
}

export interface CommissionEntry {
  readonly offerId: string;
  readonly baseCommissionRate: number;
  readonly effectiveRate: number;
  readonly avgTicket: number;
  readonly expectedMonthlyEarnings: number;
}

export interface CommissionComparison {
  readonly workspaceId: string;
  readonly comparisons: readonly CommissionEntry[];
  readonly bestOfferId: string;
  readonly bestEffectiveRate: number;
  readonly evaluatedAt: string;
}

export interface OfferSwitch {
  readonly id: string;
  readonly workspaceId: string;
  readonly currentOfferId: string;
  readonly suggestedOfferId: string;
  readonly reason: string;
  readonly expectedImprovement: number;
  readonly riskLevel: 'low' | 'medium' | 'high';
  readonly suggestedAt: string;
}

export interface ScaleVsAbandon {
  readonly campaignId: string;
  readonly workspaceId: string;
  readonly decision: 'scale' | 'hold' | 'abandon';
  readonly confidence: number;
  readonly reason: string;
  readonly projectedRevenue: number;
  readonly projectedCost: number;
  readonly breakEvenDays: number;
  readonly decidedAt: string;
}

export interface DiscoveryLoopResult {
  readonly id: string;
  readonly workspaceId: string;
  readonly hypothesisId: string;
  readonly narrativeId: string;
  readonly insight: string;
  readonly actionableRecommendation: string;
  readonly confidence: number;
  readonly generatedAt: string;
}
