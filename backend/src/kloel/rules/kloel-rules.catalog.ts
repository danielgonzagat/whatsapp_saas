import { MAX_DISCOUNT_RULE } from './cupom/max-discount.rule';
import { MINIMUM_MARGIN_RULE } from './cupom/minimum-margin.rule';
import { COMPLIANCE_WINDOW_RULE } from './janelas/compliance-window.rule';
import { CAMPAIGN_BUDGET_EXHAUSTED_RULE } from './limites/campaign-budget-exhausted.rule';
import { CAMPAIGN_INACTIVE_RULE } from './limites/campaign-inactive.rule';
import { CHECKOUT_PRODUCT_REQUIRED_RULE } from './limites/checkout-product-required.rule';
import { DAILY_CONTACT_LIMIT_RULE } from './limites/daily-contact-limit.rule';
import { UNSUPPORTED_AUDIO_RULE } from './limites/unsupported-audio.rule';
import { UNSUPPORTED_DOCUMENT_RULE } from './limites/unsupported-document.rule';
import { CONTACT_OPT_OUT_RULE } from './opt-out/contact-opt-out.rule';
import { DUPLICATE_PAYMENT_RULE } from './pagamento/duplicate-payment.rule';
import { PAYMENT_AMOUNT_EXCEEDED_RULE } from './pagamento/payment-amount-exceeded.rule';
import { ESCALATION_IN_PROGRESS_RULE } from './transferencia/escalation-in-progress.rule';
import { NO_HUMAN_AVAILABLE_RULE } from './transferencia/no-human-available.rule';
import type { RuleDefinition } from './kloel-rules.types';

export const KLOEL_RULE_CATALOG: RuleDefinition[] = [
  CONTACT_OPT_OUT_RULE,
  COMPLIANCE_WINDOW_RULE,
  DAILY_CONTACT_LIMIT_RULE,
  CAMPAIGN_BUDGET_EXHAUSTED_RULE,
  CAMPAIGN_INACTIVE_RULE,
  CHECKOUT_PRODUCT_REQUIRED_RULE,
  UNSUPPORTED_AUDIO_RULE,
  UNSUPPORTED_DOCUMENT_RULE,
  MAX_DISCOUNT_RULE,
  MINIMUM_MARGIN_RULE,
  ESCALATION_IN_PROGRESS_RULE,
  NO_HUMAN_AVAILABLE_RULE,
  DUPLICATE_PAYMENT_RULE,
  PAYMENT_AMOUNT_EXCEEDED_RULE,
] as const satisfies RuleDefinition[];

export function findRuleDefinition(ruleId: string): RuleDefinition | null {
  return KLOEL_RULE_CATALOG.find((rule) => rule.id === ruleId) ?? null;
}
