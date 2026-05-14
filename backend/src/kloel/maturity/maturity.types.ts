/**
 * UTP-MATURITY-001..005 — Camada VIII (Commercial Maturity Recognition).
 *
 * Classifies workspace commercial stage from spine event signals, not
 * from declaration. Implements:
 *   - validacao  — first sales, product-market fit exploration
 *   - tracao     — growing conversions, repeat customers
 *   - crescimento — scaling: campaigns, team, volume
 *   - maturidade  — stable operation, predictable metrics
 *   - otimizacao  — fine-tuning, portfolio expansion, LTV maximisation
 */

import type { GoalCandidate } from '../goal-field/goal-field.types';

export type MaturityStage =
  | 'validacao'
  | 'tracao'
  | 'crescimento'
  | 'maturidade'
  | 'otimizacao';

export const MATURITY_STAGES_ORDERED: readonly MaturityStage[] = [
  'validacao',
  'tracao',
  'crescimento',
  'maturidade',
  'otimizacao',
] as const;

export function maturityStageIndex(stage: MaturityStage): number {
  return MATURITY_STAGES_ORDERED.indexOf(stage);
}

/**
 * Aggregated commercial signals extracted from spine events by the
 * signals collector (UTP-MATURITY-001). All counts are derived from
 * events within the observation window (default 30 days).
 */
export interface SignalSummary {
  readonly conversionsPerMonth: number;
  readonly uniqueLeads: number;
  readonly repeatPaymentRate: number;
  readonly churnRate: number;
  readonly productCount: number;
  readonly campaignCount: number;
  readonly refundRate: number;
  readonly dealsClosedRate: number;
  readonly supportToSalesRatio: number;
  readonly observationWindowDays: number;
  readonly workspaceId: string;
}

/**
 * Classification verdict produced by the rule-based classifier
 * (UTP-MATURITY-002). confidence ∈ [0, 1] reflects how well the
 * signals match the declared stage.
 */
export interface MaturityVerdict {
  readonly stage: MaturityStage;
  readonly confidence: number;
  readonly signals: SignalSummary;
  readonly classifiedAt: string;
  readonly transition?: TransitionRecord;
}

/**
 * Transition detected by the transition detector (UTP-MATURITY-004)
 * from a sequence of historical verdicts.
 */
export interface TransitionRecord {
  readonly fromStage: MaturityStage;
  readonly toStage: MaturityStage;
  readonly observedAt: string;
  readonly confidence: number;
}

/**
 * Guard verdict (UTP-MATURITY-005) — whether a goal is appropriate
 * for the current maturity stage.
 */
export interface GuardVerdict {
  readonly ok: boolean;
  readonly reason?: string;
}

/**
 * Stage-appropriate goal tags. The goal-filter uses these to determine
 * which GoalCandidates belong to which stage.
 */
export type GoalTag =
  | 'bootstrap'
  | 'first_sale'
  | 'product_market_fit'
  | 'conversion'
  | 'lead_generation'
  | 'retention'
  | 'repeat_purchase'
  | 'scale'
  | 'campaign'
  | 'automation'
  | 'team'
  | 'efficiency'
  | 'optimization'
  | 'portfolio'
  | 'ecosystem'
  | 'ltv'
  | 'cost_reduction';

export interface StageFilterResult {
  readonly stage: MaturityStage;
  readonly allowed: readonly GoalCandidate[];
  readonly filteredOut: readonly GoalCandidate[];
}

export const MATURITY_STAGE_DESCRIPTIONS: Readonly<Record<MaturityStage, string>> =
  {
    validacao:
      'Explorando product-market fit. Primeiras vendas, leads esparsos, alta incerteza.',
    tracao:
      'Conversões crescendo de forma consistente. Primeiros clientes recorrentes.',
    crescimento:
      'Escalando ativamente — campanhas, time, automação. Volume alto.',
    maturidade:
      'Operação estável com métricas previsíveis. Refinamento e eficiência.',
    otimizacao:
      'Fine-tuning avançado. Portfolio, ecossistema, maximização de LTV.',
  };
