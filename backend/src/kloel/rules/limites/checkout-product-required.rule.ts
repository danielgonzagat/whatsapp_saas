import { block, pass } from '../kloel-rule-builders';
import type { RuleDefinition, RuleVerdict } from '../kloel-rules.types';

/**
 * Nome: checkout_product_required
 * Motivacao: link de checkout precisa apontar para produto real do workspace.
 * Autor: Kloel
 * Data: 2026-05-09
 * Versao: 1
 * Propriedades: limite operacional; trace completo de decisao.
 */
export const CHECKOUT_PRODUCT_REQUIRED_RULE: RuleDefinition = {
  id: 'checkout_product_required',
  category: 'limits',
  description: 'Bloqueia ação de checkout quando não há produto definido.',
  evaluate(ctx): RuleVerdict {
    if (ctx.action.includes('checkout') && !ctx.productId) {
      return block('checkout_product_required', 'limits', 'Link de checkout exige produto.');
    }
    return pass('checkout_product_required', 'limits');
  },
};
