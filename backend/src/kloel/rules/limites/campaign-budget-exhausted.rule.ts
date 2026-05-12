import { block, pass } from '../kloel-rule-builders';
import type { RuleDefinition, RuleVerdict } from '../kloel-rules.types';

/**
 * Nome: campaign_budget_exhausted
 * Motivacao: campanha sem orcamento nao pode produzir novo efeito externo.
 * Autor: Kloel
 * Data: 2026-05-09
 * Versao: 1
 * Propriedades: limite operacional; trace completo de decisao.
 */
export const CAMPAIGN_BUDGET_EXHAUSTED_RULE: RuleDefinition = {
  id: 'campaign_budget_exhausted',
  category: 'limits',
  description: 'Bloqueia ação de campanha quando o orçamento está esgotado.',
  evaluate(ctx): RuleVerdict {
    if (ctx.action.includes('campaign') && ctx.campaignBudgetExhausted) {
      return block('campaign_budget_exhausted', 'limits', 'Orçamento da campanha esgotado.');
    }
    return pass('campaign_budget_exhausted', 'limits');
  },
};
