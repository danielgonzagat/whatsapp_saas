// Wave 68 Phase 2 — broadcast / checkout / coupon / manual-order intent dispatch.
// See docs/architecture/WAVE_60_GUEST_CHAT_ACTION_INTENT_DECOMP_PLAN.md.
// Order invariant: matches original top-to-bottom evaluation order — do not
// re-order regexes within or across sections.

import { extractCouponArgs } from './guest-chat.action-intent.coupon-args.helpers';
import { extractPaymentArgs } from './guest-chat.action-intent.payment-args.helpers';
import { extractPlanArgs } from './guest-chat.action-intent.plan-args.helpers';
import { extractProductName } from './guest-chat.action-intent.product-args.helpers';
import type { ActionIntent } from './guest-chat.action-intent.self-awareness.match';

export function detectBroadcastCheckoutIntent(msg: string, message: string): ActionIntent {
  // ── BROADCAST / CAMPANHA ──
  if (/cria(?:r|ndo)?\s+(?:uma\s+)?(?:campanha|broadcast|disparo)/i.test(msg)) {
    const campaignNameMatch = message.match(
      /(?:campanha|broadcast|disparo)\s+([A-Za-zÀ-ÿ0-9\s\-.,!?%$@]{2,80}?)(?:\s+(?:mensagem|msg|texto)\b|$)/i,
    );
    const campaignName =
      campaignNameMatch?.[1]?.trim() || extractProductName(message) || 'Campanha';
    const msgMatch = message.match(
      /(?:mensagem|msg|texto)\s*:?\s*['"]?([A-Za-zÀ-ÿ0-9\s\-.,!?%$@]{5,200}?)(?:\s*(?:,|\.|R\$|$))/i,
    );
    return {
      tool: 'create_broadcast',
      args: {
        name: campaignName,
        message: msgMatch?.[1]?.trim() || 'Campanha promocional',
        productName: campaignName,
      },
    };
  }

  // ── CHECKOUTS ──
  if (/cria(r|ndo)?\s+(?:um[a]?\s+)?(?:o\s+|a\s+)?checkout/.test(msg)) {
    return { tool: 'checkouts.create', args: extractPlanArgs(msg) };
  }
  if (
    /(?:vincula|adiciona|linka)(?:r|ndo)?\s+(?:o\s+|a\s+)?plano\s+[A-Za-zÀ-ÿ0-9\s\-.]+\s+(?:no|ao)\s+checkout/i.test(
      msg,
    )
  ) {
    return { tool: 'checkouts.update', args: extractPlanArgs(msg) };
  }
  if (
    /(?:lista(?:r|ndo)?|meus|ver|mostra)\s+(?:os\s+|as\s+)?(?:checkouts?|p[aá]ginas?\s+(?:de\s+)?checkouts?)/.test(
      msg,
    )
  ) {
    return { tool: 'list_checkouts', args: {} };
  }

  // ── CUPONS ──
  if (/cria(r|ndo)?\s+(?:um[a]?\s+)?(?:o\s+|a\s+)?cupom/.test(msg)) {
    return { tool: 'coupons.create', args: extractCouponArgs(msg) };
  }
  if (/lista(r|ndo)?\s+(?:meus\s+)?cupons?/.test(msg)) {
    return { tool: 'list_coupons', args: {} };
  }
  if (/(apaga|deleta|exclui|remove)(?:r|ndo)?\s+(?:o\s+|a\s+)?cupom/.test(msg)) {
    return { tool: 'coupons.delete', args: extractCouponArgs(msg) };
  }

  // ── CRIAR VENDA / PEDIDO MANUAL ──
  if (
    /(cria|gera|nova|novo)(?:r|ndo)?\s+(?:um[a]?\s+)?(?:o\s+|a\s+)?(venda|pedido|order)/.test(msg)
  ) {
    return { tool: 'create_order', args: extractPaymentArgs(msg) };
  }

  return null;
}
