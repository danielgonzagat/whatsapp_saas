// Wave 67 Phase 1 — arg-extractor families live in sibling files.
// Wave 68 Phase 2 — intent dispatch split by domain into *.match.ts modules.
// See docs/architecture/WAVE_60_GUEST_CHAT_ACTION_INTENT_DECOMP_PLAN.md.
//
// Order invariant: the call sequence below preserves the original top-to-bottom
// evaluation of the monolithic detectActionIntent. Do not reorder.

import { detectAffiliatesIntent } from './guest-chat.action-intent.affiliates.match';
import { detectBroadcastCheckoutIntent } from './guest-chat.action-intent.broadcast-checkout.match';
import { detectCommerceExtrasIntent } from './guest-chat.action-intent.commerce-extras.match';
import { detectConfigIntent } from './guest-chat.action-intent.config.match';
import { detectCrmSalesIntent } from './guest-chat.action-intent.crm-sales.match';
import { detectMetaCodeIntent } from './guest-chat.action-intent.meta-code.match';
import { detectPaymentsWalletIntent } from './guest-chat.action-intent.payments-wallet.match';
import { detectProductsIntent } from './guest-chat.action-intent.products.match';
import { detectSelfAwarenessIntent } from './guest-chat.action-intent.self-awareness.match';

export function detectActionIntent(
  message: string,
): { tool: string; args: Record<string, unknown> } | null {
  const msg = message.toLowerCase().trim();
  return (
    detectSelfAwarenessIntent(msg) ||
    detectProductsIntent(msg) ||
    detectBroadcastCheckoutIntent(msg, message) ||
    detectPaymentsWalletIntent(msg) ||
    detectCrmSalesIntent(msg) ||
    detectConfigIntent(msg) ||
    detectAffiliatesIntent(msg) ||
    detectCommerceExtrasIntent(msg, message) ||
    detectMetaCodeIntent(msg) ||
    null
  );
}

// Re-exports — Wave 67 Phase 1 split. See
// docs/architecture/WAVE_60_GUEST_CHAT_ACTION_INTENT_DECOMP_PLAN.md.
export {
  extractProductName,
  extractProductArgs,
} from './guest-chat.action-intent.product-args.helpers';
export { extractPlanArgs } from './guest-chat.action-intent.plan-args.helpers';
export { extractPaymentArgs } from './guest-chat.action-intent.payment-args.helpers';
export { extractCouponArgs } from './guest-chat.action-intent.coupon-args.helpers';
export { extractUrlArgs } from './guest-chat.action-intent.url-args.helpers';
export { extractAffiliateArgs } from './guest-chat.action-intent.affiliate-args.helpers';
export { extractFiscalArgs } from './guest-chat.action-intent.fiscal-args.helpers';
export { appendToolResultProof, formatToolResult } from './guest-chat.format-tool-result.helpers';
