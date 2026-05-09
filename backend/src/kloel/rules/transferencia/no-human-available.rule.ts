import { block, pass } from '../kloel-rule-builders';
import type { RuleDefinition, RuleVerdict } from '../kloel-rules.types';

/**
 * Nome: no_human_available
 * Motivacao: nao prometer transferencia se nao ha operador disponivel.
 * Autor: Kloel
 * Data: 2026-05-09
 * Versao: 1
 * Propriedades: trace completo de decisao.
 */
export const NO_HUMAN_AVAILABLE_RULE: RuleDefinition = {
  id: 'no_human_available',
  category: 'transfer',
  description: 'Bloqueia escalação quando não há operador humano disponível.',
  evaluate(ctx): RuleVerdict {
    if (ctx.action.includes('escalation') && ctx.humanAvailable === false) {
      return block(
        'no_human_available',
        'transfer',
        'Nenhum operador humano disponível para escalação no momento.',
      );
    }
    return pass('no_human_available', 'transfer');
  },
};
