import { block, pass } from '../kloel-rule-builders';
import type { RuleDefinition, RuleVerdict } from '../kloel-rules.types';

/**
 * Nome: opt_out
 * Motivacao: contato que saiu da lista nunca recebe acao externa automatica.
 * Autor: Kloel
 * Data: 2026-05-09
 * Versao: 1
 * Propriedades: opt-out absoluto; trace completo de decisao.
 */
export const CONTACT_OPT_OUT_RULE: RuleDefinition = {
  id: 'opt_out',
  category: 'opt_out',
  description: 'Bloqueia qualquer ação quando o contato possui opt-out registrado.',
  evaluate(ctx): RuleVerdict {
    if (ctx.contactOptOut) {
      return block('opt_out', 'opt_out', 'Contato possui opt-out registrado.');
    }
    return pass('opt_out', 'opt_out');
  },
};
