// Wave 68 Phase 2 — NPS/CHURN / URLs/PÁGINAS / VENDAS / CRM-LEADS intent dispatch.
// See docs/architecture/WAVE_60_GUEST_CHAT_ACTION_INTENT_DECOMP_PLAN.md.
// Order invariant: NPS/CHURN before VENDAS (avoid capturing); URLs/PÁGINAS
// before VENDAS (capture "pagina de vendas"); analytics/relatorio before
// vendas/pedidos. Keep section order exactly as in source.

import { extractProductName } from './guest-chat.action-intent.product-args.helpers';
import type { ActionIntent } from './guest-chat.action-intent.self-awareness.match';

export function detectCrmSalesIntent(msg: string): ActionIntent {
  // ── NPS / CHURN (antes de vendas para nao capturar) ──
  if (/nps|net\s+promoter/i.test(msg)) {
    return { tool: 'get_nps', args: {} };
  }
  if (/churn|cancelamento/i.test(msg)) {
    return { tool: 'get_churn', args: {} };
  }

  // ── URLs / PÁGINAS ── (antes de vendas para capturar "pagina de vendas")
  if (/lista(?:r|ndo)?\s+(?:as\s+|os\s+)?urls?/.test(msg)) {
    return { tool: 'get_product_urls', args: { productName: extractProductName(msg) } };
  }
  if (/urls?.*(produto|p[aá]gina)/.test(msg) || /p[aá]gina.*vendas/.test(msg)) {
    return { tool: 'get_product_urls', args: { productName: extractProductName(msg) } };
  }

  // ── VENDAS ── (metricas/analytics antes de vendas)
  if (/m[eé]tricas|analytics|dashboard/.test(msg)) {
    return { tool: 'get_analytics', args: {} };
  }
  if (/relatorio|resumo.*venda/.test(msg)) {
    return { tool: 'get_sales_summary', args: {} };
  }
  if (/(minhas |meus )?vendas|pedidos/.test(msg)) {
    return { tool: 'list_orders', args: {} };
  }
  if (/(?:carrinhos?\s+)?abandon(?:os?|ados?|ou)/.test(msg)) {
    return { tool: 'get_abandonments', args: {} };
  }

  // ── CRM / LEADS ──
  if (
    /(busca(?:r|ndo)?|procura(?:r|ndo)?|pesquisa(?:r|ndo)?).*(lead|cliente|contato|comprador)/.test(
      msg,
    )
  ) {
    return { tool: 'search_agent_memory', args: { query: msg } };
  }

  return null;
}
