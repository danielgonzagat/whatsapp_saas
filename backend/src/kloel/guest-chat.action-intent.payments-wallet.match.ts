// Wave 68 Phase 2 — payments / wallet / refunds / anticipations intent dispatch.
// See docs/architecture/WAVE_60_GUEST_CHAT_ACTION_INTENT_DECOMP_PLAN.md.
// Order invariant: pagamentos block first, then CARTEIRA (saque before saldo,
// extrato before saldo/carteira) — preserve exactly as in source.

import { extractPaymentArgs } from './guest-chat.action-intent.payment-args.helpers';
import type { ActionIntent } from './guest-chat.action-intent.self-awareness.match';

export function detectPaymentsWalletIntent(msg: string): ActionIntent {
  // ── PAGAMENTOS ──
  if (/(gera|emite|emiti)(?:r|ndo)?.*boleto/.test(msg)) {
    return { tool: 'sales.create_boleto', args: extractPaymentArgs(msg) };
  }
  if (
    /\b(cart[aã]o|card|cr[eé]dito)\b/.test(msg) &&
    /(gera|emite|emiti|cobran[cç]a|pagamento)/.test(msg)
  ) {
    return { tool: 'sales.create_card_link', args: extractPaymentArgs(msg) };
  }
  if (
    /(gera|emiti)(?:r|ndo)?\s+(?:um[a]?\s+)?(?:o\s+|a\s+)?(pix|cobran[cç]a|pagamento)/.test(msg)
  ) {
    return { tool: 'sales.create_pix', args: extractPaymentArgs(msg) };
  }

  // ── CARTEIRA ── (saque antes de saldo, extrato antes de saldo/carteira)
  if (/saque|solicitar saque|(?:quero|preciso|gostaria|vou)\s+sacar/.test(msg)) {
    return { tool: 'request_withdrawal', args: {} };
  }
  if (/antecipa|adiantar\s+receb[ií]vel/.test(msg)) {
    return { tool: 'request_anticipation', args: {} };
  }
  if (/extrato|hist[oó]rico.*financeiro/.test(msg)) {
    return { tool: 'get_wallet_statement', args: {} };
  }
  if (/(meu )?saldo|carteira/.test(msg)) {
    return { tool: 'get_wallet_balance', args: {} };
  }

  return null;
}
