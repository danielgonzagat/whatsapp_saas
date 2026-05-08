import type { RuleDefinition, RuleCategory, RuleContext, RuleVerdict } from './kloel-rules.types';

function block(ruleId: string, category: RuleCategory, reason: string): RuleVerdict {
  return { ruleId, category, passed: false, reason };
}

function pass(ruleId: string, category: RuleCategory): RuleVerdict {
  return {
    ruleId,
    category,
    passed: true,
    reason: 'Regra satisfeita — sem bloqueio.',
  };
}

export const KLOEL_RULE_CATALOG: RuleDefinition[] = [
  {
    id: 'opt_out',
    category: 'opt_out',
    description: 'Bloqueia qualquer ação quando o contato possui opt-out registrado.',
    evaluate(ctx: RuleContext): RuleVerdict {
      if (ctx.contactOptOut) {
        return block('opt_out', 'opt_out', 'Contato possui opt-out registrado.');
      }
      return pass('opt_out', 'opt_out');
    },
  },

  {
    id: 'compliance_window',
    category: 'compliance_window',
    description: 'Bloqueia envio fora da janela de compliance quando não há template aprovado.',
    evaluate(ctx: RuleContext): RuleVerdict {
      if (ctx.withinComplianceWindow === false && !ctx.templateApproved) {
        return block(
          'compliance_window',
          'compliance_window',
          'Mensagem fora da janela do canal exige template aprovado.',
        );
      }
      return pass('compliance_window', 'compliance_window');
    },
  },

  {
    id: 'daily_contact_limit',
    category: 'limits',
    description: 'Bloqueia ação quando o contato já recebeu 20+ mensagens no dia.',
    evaluate(ctx: RuleContext): RuleVerdict {
      if (typeof ctx.contactMessagesToday === 'number' && ctx.contactMessagesToday >= 20) {
        return block('daily_contact_limit', 'limits', 'Limite diário de mensagens atingido.');
      }
      return pass('daily_contact_limit', 'limits');
    },
  },

  {
    id: 'campaign_budget_exhausted',
    category: 'limits',
    description: 'Bloqueia ação de campanha quando o orçamento está esgotado.',
    evaluate(ctx: RuleContext): RuleVerdict {
      if (ctx.action.includes('campaign') && ctx.campaignBudgetExhausted) {
        return block('campaign_budget_exhausted', 'limits', 'Orçamento da campanha esgotado.');
      }
      return pass('campaign_budget_exhausted', 'limits');
    },
  },

  {
    id: 'campaign_inactive',
    category: 'limits',
    description: 'Bloqueia ação de campanha quando a campanha não está ativa.',
    evaluate(ctx: RuleContext): RuleVerdict {
      if (ctx.action.includes('campaign') && ctx.campaignActive === false) {
        return block('campaign_inactive', 'limits', 'Campanha não está ativa no momento.');
      }
      return pass('campaign_inactive', 'limits');
    },
  },

  {
    id: 'checkout_product_required',
    category: 'limits',
    description: 'Bloqueia ação de checkout quando não há produto definido.',
    evaluate(ctx: RuleContext): RuleVerdict {
      if (ctx.action.includes('checkout') && !ctx.productId) {
        return block('checkout_product_required', 'limits', 'Link de checkout exige produto.');
      }
      return pass('checkout_product_required', 'limits');
    },
  },

  {
    id: 'unsupported_audio',
    category: 'limits',
    description: 'Bloqueia envio de áudio quando o canal não suporta.',
    evaluate(ctx: RuleContext): RuleVerdict {
      if (ctx.action.includes('audio') && ctx.supportsAudio === false) {
        return block('unsupported_audio', 'limits', 'Canal não suporta áudio nativo.');
      }
      return pass('unsupported_audio', 'limits');
    },
  },

  {
    id: 'unsupported_document',
    category: 'limits',
    description: 'Bloqueia envio de documento quando o canal não suporta.',
    evaluate(ctx: RuleContext): RuleVerdict {
      if (ctx.action.includes('document') && ctx.supportsDocument === false) {
        return block('unsupported_document', 'limits', 'Canal não suporta documento.');
      }
      return pass('unsupported_document', 'limits');
    },
  },

  {
    id: 'max_discount',
    category: 'coupon',
    description: 'Bloqueia desconto que excede o teto permitido do produto.',
    evaluate(ctx: RuleContext): RuleVerdict {
      if (
        typeof ctx.discountPercent === 'number' &&
        typeof ctx.maxDiscountPercent === 'number' &&
        ctx.discountPercent > ctx.maxDiscountPercent
      ) {
        return block('max_discount', 'coupon', 'Desconto excede o teto permitido do produto.');
      }
      return pass('max_discount', 'coupon');
    },
  },

  {
    id: 'minimum_margin',
    category: 'coupon',
    description: 'Bloqueia desconto que reduziria a margem abaixo do mínimo.',
    evaluate(ctx: RuleContext): RuleVerdict {
      if (typeof ctx.minMarginPercent === 'number' && ctx.minMarginPercent < 0) {
        return block('minimum_margin', 'coupon', 'Desconto reduziria a margem abaixo do mínimo.');
      }
      return pass('minimum_margin', 'coupon');
    },
  },

  {
    id: 'escalation_in_progress',
    category: 'transfer',
    description: 'Bloqueia nova escalação quando já existe uma em andamento.',
    evaluate(ctx: RuleContext): RuleVerdict {
      if (ctx.action.includes('escalation') && ctx.escalationInProgress) {
        return block(
          'escalation_in_progress',
          'transfer',
          'Já existe uma escalação em andamento para este contato.',
        );
      }
      return pass('escalation_in_progress', 'transfer');
    },
  },

  {
    id: 'no_human_available',
    category: 'transfer',
    description: 'Bloqueia escalação quando não há operador humano disponível.',
    evaluate(ctx: RuleContext): RuleVerdict {
      if (ctx.action.includes('escalation') && ctx.humanAvailable === false) {
        return block(
          'no_human_available',
          'transfer',
          'Nenhum operador humano disponível para escalação no momento.',
        );
      }
      return pass('no_human_available', 'transfer');
    },
  },

  {
    id: 'duplicate_payment',
    category: 'payment',
    description: 'Bloqueia pagamento já processado anteriormente.',
    evaluate(ctx: RuleContext): RuleVerdict {
      if (ctx.action.includes('payment') && ctx.paymentProcessed) {
        return block('duplicate_payment', 'payment', 'Pagamento já processado anteriormente.');
      }
      return pass('duplicate_payment', 'payment');
    },
  },

  {
    id: 'payment_amount_exceeded',
    category: 'payment',
    description: 'Bloqueia pagamento que excede o valor máximo permitido.',
    evaluate(ctx: RuleContext): RuleVerdict {
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
  },
] as const satisfies RuleDefinition[];

export function findRuleDefinition(ruleId: string): RuleDefinition | null {
  return KLOEL_RULE_CATALOG.find((r) => r.id === ruleId) ?? null;
}
