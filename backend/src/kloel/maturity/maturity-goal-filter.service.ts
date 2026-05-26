/**
 * UTP-MATURITY-003 — Maturity Goal Filter Service.
 *
 * Takes a list of GoalCandidates (from GoalFieldService) and a
 * MaturityVerdict, and returns the subset appropriate for the
 * current stage. Goals carry a `summary` string that is matched
 * against per-stage keyword patterns.
 *
 * Stage-appropriate goal rules:
 *
 *   validacao — bootstrap, first_sale, product_market_fit goals
 *   tracao    — conversion, lead_generation, retention, repeat_purchase goals
 *   crescimento — scale, campaign, automation, team goals
 *   maturidade  — efficiency, optimization goals
 *   otimizacao  — portfolio, ecosystem, ltv, cost_reduction goals
 *
 * A goal is ALLOWED when its summary matches any keyword associated
 * with the current stage or any EARLIER stage (cumulative). Goals
 * matching ONLY later stages are filtered out.
 */
import { Injectable } from '@nestjs/common';
import type { GoalCandidate } from '../goal-field/goal-field.types';
import type { MaturityStage, MaturityVerdict, StageFilterResult } from './maturity.types';

/**
 * Stage keyword map. Every stage can see goals for its own keywords
 * AND all earlier stages (cumulative knowledge).
 */
const STAGE_KEYWORDS: Readonly<Record<MaturityStage, readonly string[]>> = {
  validacao: [
    'bootstrap',
    'primeira venda',
    'first sale',
    'product market fit',
    'pmf',
    'validação',
    'validacao',
    'oferta',
    'offer',
    'lead sem resposta',
    'hot lead',
    'carrinho abandonado',
  ],
  tracao: [
    'conversão',
    'conversion',
    'lead',
    'captura',
    'capture',
    'retenção',
    'retention',
    'recorrente',
    'recurring',
    'recompra',
    'repurchase',
    'churn',
    'objeção',
    'objection',
    'qualificação',
    'qualification',
  ],
  crescimento: [
    'escala',
    'scale',
    'campanha',
    'campaign',
    'anúncio',
    'ad',
    'automação',
    'automation',
    'time',
    'team',
    'handoff',
    'vendas',
    'sales volume',
    'crescimento',
    'growth',
    'tráfego',
    'traffic',
  ],
  maturidade: [
    'eficiência',
    'eficiencia',
    'efficiency',
    'otimização',
    'optimization',
    'margem',
    'margin',
    'refund',
    'reembolso',
    'qualidade',
    'quality',
    'nps',
    'satisfação',
    'satisfaction',
    'previsibilidade',
    'predictability',
  ],
  otimizacao: [
    'portfólio',
    'portfolio',
    'ecossistema',
    'ecosystem',
    'ltv',
    'lifetime value',
    'custo',
    'cost',
    'receita',
    'revenue',
    'expansão',
    'expansion',
    'upsell',
    'cross-sell',
    'afiliado',
    'affiliate',
  ],
};

@Injectable()
export class MaturityGoalFilterService {
  /**
   * Returns goals appropriate for the verdict's stage. Only goals
   * whose summary matches the current stage or any earlier stage
   * are allowed.
   */
  public filterForStage(
    candidates: readonly GoalCandidate[],
    verdict: MaturityVerdict,
  ): StageFilterResult {
    const allowedKeywords = this.keywordsForStage(verdict.stage);

    const allowed: GoalCandidate[] = [];
    const filteredOut: GoalCandidate[] = [];

    for (const c of candidates) {
      const summaryLower = c.summary.toLowerCase();
      if (allowedKeywords.some((kw) => summaryLower.includes(kw))) {
        allowed.push(c);
      } else {
        filteredOut.push(c);
      }
    }

    return { stage: verdict.stage, allowed, filteredOut };
  }

  /**
   * Collects keywords for this stage AND all earlier stages.
   * Knowledge is cumulative — a maturidade workspace still
   * gets validacao/tracao/crescimento goals shown.
   */
  public keywordsForStage(stage: MaturityStage): readonly string[] {
    const idx = this.stageIndex(stage);
    const kw: string[] = [];
    for (let i = 0; i <= idx; i++) {
      const s = STAGE_ORDERED[i];
      if (s) {kw.push(...STAGE_KEYWORDS[s]);}
    }
    return kw;
  }

  private stageIndex(stage: MaturityStage): number {
    return STAGE_ORDERED.indexOf(stage);
  }
}

const STAGE_ORDERED: readonly MaturityStage[] = [
  'validacao',
  'tracao',
  'crescimento',
  'maturidade',
  'otimizacao',
];
