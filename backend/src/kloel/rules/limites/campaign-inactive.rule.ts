import { block, pass } from '../kloel-rule-builders';
import type { RuleDefinition, RuleVerdict } from '../kloel-rules.types';

/**
 * Nome: campaign_inactive
 * Motivacao: campanha inativa nao pode disparar mensagens ou automacoes.
 * Autor: Kloel
 * Data: 2026-05-09
 * Versao: 1
 * Propriedades: limite operacional; trace completo de decisao.
 */
export const CAMPAIGN_INACTIVE_RULE: RuleDefinition = {
  id: 'campaign_inactive',
  category: 'limits',
  description: 'Bloqueia ação de campanha quando a campanha não está ativa.',
  evaluate(ctx): RuleVerdict {
    if (ctx.action.includes('campaign') && ctx.campaignActive === false) {
      return block('campaign_inactive', 'limits', 'Campanha não está ativa no momento.');
    }
    return pass('campaign_inactive', 'limits');
  },
};
