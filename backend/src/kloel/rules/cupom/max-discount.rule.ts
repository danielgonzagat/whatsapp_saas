import { block, pass } from '../kloel-rule-builders';
import type { RuleDefinition, RuleVerdict } from '../kloel-rules.types';

/**
 * Nome: max_discount
 * Motivacao: cupom nunca pode ultrapassar teto do produto.
 * Autor: Kloel
 * Data: 2026-05-09
 * Versao: 1
 * Propriedades: teto de cupom; trace completo de decisao.
 */
export const MAX_DISCOUNT_RULE: RuleDefinition = {
  id: 'max_discount',
  category: 'coupon',
  description: 'Bloqueia desconto que excede o teto permitido do produto.',
  evaluate(ctx): RuleVerdict {
    if (
      typeof ctx.discountPercent === 'number' &&
      typeof ctx.maxDiscountPercent === 'number' &&
      ctx.discountPercent > ctx.maxDiscountPercent
    ) {
      return block('max_discount', 'coupon', 'Desconto excede o teto permitido do produto.');
    }
    return pass('max_discount', 'coupon');
  },
};
