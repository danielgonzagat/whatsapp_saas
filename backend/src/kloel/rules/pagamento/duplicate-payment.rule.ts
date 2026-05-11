import { block, pass } from '../kloel-rule-builders';
import type { RuleDefinition, RuleVerdict } from '../kloel-rules.types';

/**
 * Nome: duplicate_payment
 * Motivacao: pagamento idempotente nunca pode ser processado duas vezes.
 * Autor: Kloel
 * Data: 2026-05-09
 * Versao: 1
 * Propriedades: idempotencia de cobranca; trace completo de decisao.
 */
export const DUPLICATE_PAYMENT_RULE: RuleDefinition = {
  id: 'duplicate_payment',
  category: 'payment',
  description: 'Bloqueia pagamento já processado anteriormente.',
  evaluate(ctx): RuleVerdict {
    if (ctx.action.includes('payment') && ctx.paymentProcessed) {
      return block('duplicate_payment', 'payment', 'Pagamento já processado anteriormente.');
    }
    return pass('duplicate_payment', 'payment');
  },
};
