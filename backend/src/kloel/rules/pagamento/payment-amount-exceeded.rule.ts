import { block, pass } from '../kloel-rule-builders';
import type { RuleDefinition, RuleVerdict } from '../kloel-rules.types';

/**
 * Nome: payment_amount_exceeded
 * Motivacao: pagamento executado nao pode exceder teto deterministico.
 * Autor: Kloel
 * Data: 2026-05-09
 * Versao: 1
 * Propriedades: idempotencia de cobranca; trace completo de decisao.
 */
export const PAYMENT_AMOUNT_EXCEEDED_RULE: RuleDefinition = {
  id: 'payment_amount_exceeded',
  category: 'payment',
  description: 'Bloqueia pagamento que excede o valor máximo permitido.',
  evaluate(ctx): RuleVerdict {
    if (
      ctx.action.includes('payment') &&
      typeof ctx.paymentAmount === 'number' &&
      typeof ctx.maxPaymentAmount === 'number' &&
      ctx.paymentAmount > ctx.maxPaymentAmount
    ) {
      return block(
        'payment_amount_exceeded',
        'payment',
        `Valor do pagamento (${ctx.paymentAmount}) excede o máximo permitido (${ctx.maxPaymentAmount}).`,
      );
    }
    return pass('payment_amount_exceeded', 'payment');
  },
};
