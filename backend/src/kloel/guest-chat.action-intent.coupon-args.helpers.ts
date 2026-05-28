// Wave 67 Phase 1 split — see docs/architecture/WAVE_60_GUEST_CHAT_ACTION_INTENT_DECOMP_PLAN.md.
import { extractProductName } from './guest-chat.action-intent.product-args.helpers';

export function extractCouponArgs(msg: string): Record<string, unknown> {
  const args: Record<string, unknown> = {};
  const codeMatch = msg.match(/(?:cupom|desconto)\s+([A-Z0-9_]{3,20})/i);
  if (codeMatch?.[1]) {
    args.code = codeMatch[1].toUpperCase();
  }
  args.productName = extractProductName(msg);
  const pctMatch = msg.match(/(\d+)\s*%/);
  const fixedMatch = msg.match(/(?:R\$\s*|fixo\s+)(\d+[.,]?\d*)/i);
  if (pctMatch?.[1]) {
    // Usage limit
    const limitMatch = msg.match(/(?:limite|max|at[eé])\s+(\d+)\s*(?:usos?|vezes?|compras?)/i);
    if (limitMatch?.[1]) {
      args.usageLimit = parseInt(limitMatch[1], 10);
    }
    // Expiration
    const expMatch = msg.match(
      /(?:expira|v[aá]lido\s+at[eé]|validade)\s*(?:em\s+)?(\d+)\s*(dias?|days?|meses?|months?)/i,
    );
    if (expMatch?.[1]) {
      const num = parseInt(expMatch[1], 10);
      const unit = expMatch[2]?.toLowerCase();
      if (unit?.startsWith('mes')) {
        args.expiresInDays = num * 30;
      } else {
        args.expiresInDays = num;
      }
    }
    args.discountType = 'PERCENT';
    args.discountValue = parseInt(pctMatch[1], 10);
  } else if (fixedMatch?.[1]) {
    args.discountType = 'FIXED';
    args.discountValue = parseFloat(fixedMatch[1].replace(',', '.'));
  }
  return args;
}
