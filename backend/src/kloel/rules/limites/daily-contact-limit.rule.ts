import { block, pass } from '../kloel-rule-builders';
import type { RuleDefinition, RuleVerdict } from '../kloel-rules.types';

/**
 * Nome: daily_contact_limit
 * Motivacao: limitar fadiga de contato por dia antes de qualquer envio externo.
 * Autor: Kloel
 * Data: 2026-05-09
 * Versao: 1
 * Propriedades: limite de envio diario; trace completo de decisao.
 */
export const DAILY_CONTACT_LIMIT_RULE: RuleDefinition = {
  id: 'daily_contact_limit',
  category: 'limits',
  description: 'Bloqueia ação quando o contato já recebeu 20+ mensagens no dia.',
  evaluate(ctx): RuleVerdict {
    if (typeof ctx.contactMessagesToday === 'number' && ctx.contactMessagesToday >= 20) {
      return block('daily_contact_limit', 'limits', 'Limite diário de mensagens atingido.');
    }
    return pass('daily_contact_limit', 'limits');
  },
};
