import { block, pass } from '../kloel-rule-builders';
import type { RuleDefinition, RuleVerdict } from '../kloel-rules.types';

/**
 * Nome: escalation_in_progress
 * Motivacao: evitar duplicidade de transferencia humana para o mesmo contato.
 * Autor: Kloel
 * Data: 2026-05-09
 * Versao: 1
 * Propriedades: trace completo de decisao.
 */
export const ESCALATION_IN_PROGRESS_RULE: RuleDefinition = {
  id: 'escalation_in_progress',
  category: 'transfer',
  description: 'Bloqueia nova escalação quando já existe uma em andamento.',
  evaluate(ctx): RuleVerdict {
    if (ctx.action.includes('escalation') && ctx.escalationInProgress) {
      return block(
        'escalation_in_progress',
        'transfer',
        'Já existe uma escalação em andamento para este contato.',
      );
    }
    return pass('escalation_in_progress', 'transfer');
  },
};
