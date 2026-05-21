export interface OfferQualityInput {
  readonly commissionPct: number;
  readonly conversionRateHistorical: number;
  readonly supportQuality: number;
  readonly refundRate: number;
  readonly audienceFitScore: number;
}

export interface OfferQualityOutput {
  readonly score: number;
  readonly classification: 'excellent' | 'good' | 'average' | 'poor';
  readonly recommendation: string;
}

export interface ProducerTrustInput {
  readonly paymentReliability: number;
  readonly refundResolutionTime: number;
  readonly complianceHistory: number;
  readonly communicationScore: number;
}

export interface ProducerTrustOutput {
  readonly trustScore: number;
}
