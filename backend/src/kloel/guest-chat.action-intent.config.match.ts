// Wave 68 Phase 2 — conversas/memória / plan photo / aparência / configurações intent dispatch.
// See docs/architecture/WAVE_60_GUEST_CHAT_ACTION_INTENT_DECOMP_PLAN.md.
// Order invariant: matches original top-to-bottom evaluation order — do not
// re-order regexes within or across sections.

import { extractProductName } from './guest-chat.action-intent.product-args.helpers';
import type { ActionIntent } from './guest-chat.action-intent.self-awareness.match';

export function detectConfigIntent(msg: string): ActionIntent {
  // ── CONVERSAS / MEMÓRIA ──
  if (
    /(busca(?:r|ndo)?|procura(?:r|ndo)?|pesquisa(?:r|ndo)?)\s+(minhas\s+)?(conversas?|mem[oó]rias?|hist[oó]ricos?|sess[oõ]es?)/.test(
      msg,
    )
  ) {
    return { tool: 'search_agent_sessions', args: { query: msg } };
  }

  // ── PLAN PHOTO UPLOAD ──
  if (/(?:faz\s+)?(?:upload|envia|sobe)\s+(?:da\s+)?(?:foto|imagem)\s+(?:do\s+)?plano/i.test(msg)) {
    return {
      tool: 'upload_plan_image',
      args: { planName: extractProductName(msg), productName: extractProductName(msg) },
    };
  }

  // ── APARÊNCIA ──
  if (/modo (escuro|claro)|tema|dark mode/.test(msg)) {
    return { tool: 'toggle_theme', args: { theme: /escuro|dark/.test(msg) ? 'dark' : 'light' } };
  }

  // ── CONFIGURAÇÕES ──
  if (/(?:atualiza|edita|altera|muda)(?:r|ndo)?\s+(?:meus\s+)?dados\s+fiscais/.test(msg)) {
    return { tool: 'update_fiscal_data', args: {} };
  }
  if (/(?:atualiza|edita|altera|muda)(?:r|ndo)?\s+(?:meus\s+)?dados\s+banc[aá]rios/.test(msg)) {
    return { tool: 'get_settings', args: {} };
  }
  if (/(meus |minhas )?dados\s+fiscais|fiscal|c(npj|pf)|raz[aã]o\s+social/i.test(msg)) {
    return { tool: 'get_settings', args: {} };
  }
  if (/(meus |minhas )?dados\s+banc[aá]rios|conta\s+banc[aá]ria|banco/i.test(msg)) {
    return { tool: 'get_settings', args: {} };
  }
  if (/upload.*doc|enviar.*doc|anexar.*doc|subir.*doc|enviar.*pdf|fazer.*upload/i.test(msg)) {
    return {
      tool: 'upload_document',
      args: { documentType: msg.match(/rg|cpf|cnpj|contrato|identidade/i)?.[0] || 'document' },
    };
  }
  if (/(meus |minhas )?configura[cç][oõ]es/.test(msg)) {
    return { tool: 'get_settings', args: {} };
  }

  return null;
}
