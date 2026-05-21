import { block, pass } from '../kloel-rule-builders';
import type { RuleDefinition, RuleVerdict } from '../kloel-rules.types';

/**
 * Nome: minimum_margin
 * Motivacao: cupom nunca pode tornar margem efetiva negativa.
 * Autor: Kloel
 * Data: 2026-05-09
 * Versao: 1
 * Propriedades: margem minima; trace completo de decisao.
 */
export const MINIMUM_MARGIN_RULE: RuleDefinition = {
  id: 'minimum_margin',
  category: 'coupon',
  description: 'Bloqueia desconto que reduziria a margem abaixo do mínimo.',
  evaluate(ctx): RuleVerdict {
    if (typeof ctx.minMarginPercent === 'number' && ctx.minMarginPercent < 0) {
      return block('minimum_margin', 'coupon', 'Desconto reduziria a margem abaixo do mínimo.');
    }
    return pass('minimum_margin', 'coupon');
  },
};
