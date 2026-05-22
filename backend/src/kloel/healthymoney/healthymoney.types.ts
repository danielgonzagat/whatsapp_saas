/**
 * UTP-HEALTHYMONEY-001..008 — Camada XIX (Cognitive Organism — Healthy Money).
 *
 * B0.7: Otimizar dinheiro saudável, não volume bruto.
 * Receita ponderada por margem, refund risk, suporte projetado, churn, LTV,
 * risco reputacional, desgaste de marca. Kloel pode recusar venda ruim.
 *
 * All services are pure logic — no Prisma, no external dependencies.
 * Uses canonical PCI.1 event taxonomy domain `commerce.payment.*`.
 */

export interface RevenueQualityInput {
  readonly amountCents: number;
  readonly marginPct: number;
  readonly refundRiskScore: number;
  readonly supportCostEstimateCents: number;
  readonly churnRiskScore: number;
  readonly brandWearScore: number;
  readonly ltvProjectionCents: number;
}

export type RevenueClassification = 'healthy' | 'borderline' | 'unhealthy';

export interface RevenueQualityResult {
  readonly qualityScore: number;
  readonly classification: RevenueClassification;
  readonly reasoning: string;
  readonly blockerSuggestion?: string;
  readonly evaluatedAt: string;
  readonly dimensions: RevenueQualityDimensions;
}

export interface RevenueQualityDimensions {
  readonly marginScore: number;
  readonly refundScore: number;
  readonly supportScore: number;
  readonly churnScore: number;
  readonly brandScore: number;
  readonly ltvScore: number;
}

export interface RevenueScoringWeights {
  readonly margin: number;
  readonly refundRisk: number;
  readonly supportCost: number;
  readonly churnRisk: number;
  readonly brandWear: number;
  readonly ltvProjection: number;
}

export const DEFAULT_WEIGHTS: RevenueScoringWeights = {
  margin: 0.25,
  refundRisk: 0.2,
  supportCost: 0.2,
  churnRisk: 0.15,
  brandWear: 0.1,
  ltvProjection: 0.1,
};

export const HEALTHY_THRESHOLD = 0.7;
export const UNHEALTHY_THRESHOLD = 0.3;

export const SUPPORT_COST_CAP_RATIO = 0.5;
export const LTV_MULTIPLIER_THRESHOLD = 5;
