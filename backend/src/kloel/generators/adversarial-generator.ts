import { generateLeads } from './lead-generator';

export function generateAdversarialScenarios(seed: string | number) {
  const [lead] = generateLeads(`${seed}:adversarial`, 1);
  return [
    { kind: 'opt_out_after_first_contact', lead: { ...lead, optedOut: true } },
    { kind: 'conflicting_identity', identifiers: ['email:a@kloel.com', 'whatsapp:+550000'] },
    { kind: 'duplicate_payment', idempotencyKey: `idem-${lead.id}` },
    { kind: 'coupon_exact_limit', discountPercent: 20, maxDiscountPercent: 20 },
  ];
}
