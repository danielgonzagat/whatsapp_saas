/**
 * UTP-MATURITY-005 — Maturity Guard.
 *
 * Pure function that blocks recommendation of wrong-phase goals.
 * Given a GoalCandidate summary and a MaturityVerdict, returns
 * { ok: false, reason } when the goal's summary matches keywords
 * from a LATER stage only.
 *
 * Example: blocking a scale-only suggestion in validacao stage.
 * Example: blocking a bootstrap-only suggestion in otimizacao stage.
 *
 * The guard operates on the principle that goals matching LATER
 * stages without matching current or earlier stages are premature
 * and should be refused.
 */
import type { GoalCandidate } from '../goal-field/goal-field.types';
import type { GuardVerdict, MaturityStage, MaturityVerdict } from './maturity.types';

const STAGE_ORDERED: readonly MaturityStage[] = [
  'validacao',
  'tracao',
  'crescimento',
  'maturidade',
  'otimizacao',
];

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
  ],
  tracao: [
    'conversão',
    'conversion',
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

export function refuse(
  goal: GoalCandidate,
  verdict: MaturityVerdict,
): GuardVerdict {
  const summaryLower = goal.summary.toLowerCase();
  const currentIdx = STAGE_ORDERED.indexOf(verdict.stage);

  for (let i = STAGE_ORDERED.length - 1; i > currentIdx; i--) {
    const laterStage = STAGE_ORDERED[i] as MaturityStage;
    const keywords = STAGE_KEYWORDS[laterStage];

    if (keywords.some((kw) => summaryLower.includes(kw))) {
      const match = keywords.find((kw) => summaryLower.includes(kw));
      return {
        ok: false,
        reason: `goal "${goal.summary}" matches "${match}" — keyword reserved for stage "${laterStage}" (current stage: "${verdict.stage}")`,
      };
    }
  }

  return { ok: true };
}
