// Wave 67 Phase 1 split — see docs/architecture/WAVE_60_GUEST_CHAT_ACTION_INTENT_DECOMP_PLAN.md.
import { extractProductName } from './guest-chat.action-intent.product-args.helpers';

export function extractPaymentArgs(msg: string): Record<string, unknown> {
  const args: Record<string, unknown> = {};
  const name = extractProductName(msg);
  if (name) {
    args.productName = name;
    args.description = name; // for smart-payment compatibility
  }
  const am = msg.match(/R\$\s*(\d+[.,]?\d*)/i);
  if (am && am[1]) {
    const val = parseFloat(am[1].replace(',', '.'));
    args.amount = val;
  }
  // Also try "de R$ X" / "de X reais" patterns
  if (!args.amount) {
    const am2 =
      msg.match(/de\s+R\$\s*(\d+[.,]?\d*)/i) || msg.match(/de\s+(\d+[.,]?\d*)\s*(reais|real)/i);
    if (am2?.[1]) {
      args.amount = parseFloat(am2[1].replace(',', '.'));
    }
  }
  const nm = msg.match(
    /para\s+(?:o\s+|a\s+)?(?:comprador[a]?|client[e]?|lead\s+)?([A-Za-zÀ-ÿ]{2,25}(?:\s+[A-Za-zÀ-ÿ]{2,25})?)(?:\s+(?:comprar|adquirir|pagar|para)\b|$)/i,
  );
  if (nm && nm[1]) {
    args.customerName = nm[1].trim();
  }
  return args;
}
