// Wave 68 Phase 2 — products / plans / URL CRUD / details / delete intent dispatch.
// See docs/architecture/WAVE_60_GUEST_CHAT_ACTION_INTENT_DECOMP_PLAN.md.
// Order invariant: matches original top-to-bottom evaluation order — do not
// re-order regexes within or across sections.

import { extractPlanArgs } from './guest-chat.action-intent.plan-args.helpers';
import {
  extractProductArgs,
  extractProductName,
} from './guest-chat.action-intent.product-args.helpers';
import { extractUrlArgs } from './guest-chat.action-intent.url-args.helpers';
import type { ActionIntent } from './guest-chat.action-intent.self-awareness.match';

export function detectProductsIntent(msg: string): ActionIntent {
  // ── PRODUTOS ──
  if (
    /cria(r|ndo)?\s+(?:um[a]?\s+)?(?:o\s+|a\s+)?(produto|oferta|novo)/.test(msg) ||
    /cadastra(r|ndo)?\s+(?:um[a]?\s+)?(?:o\s+|a\s+)?produto/.test(msg)
  ) {
    return { tool: 'products.create', args: extractProductArgs(msg) };
  }
  if (/lista(r|ndo)? (produtos|meus produtos|ofertas|cat[aá]logo)/.test(msg)) {
    return { tool: 'list_products', args: {} };
  }
  if (
    /(?:edita|atualiza|muda|altera|desativa|pausa|desabilita)(?:r|ndo)?\s+(?:um[a]?\s+)?(?:o\s+)?produto/.test(
      msg,
    )
  ) {
    return { tool: 'products.update', args: extractProductArgs(msg) };
  }
  if (/(apaga|deleta|exclui|remove)(?:r|ndo)?\s+(?:um[a]?\s+)?(?:o\s+)?produto/.test(msg)) {
    return { tool: 'delete_product', args: { productName: extractProductName(msg) } };
  }

  // ── DELETAR PLANO / CHECKOUT ──
  if (
    /(apaga(?:r|ndo)?|deleta(?:r|ndo)?|exclui(?:r|ndo)?|remove(?:r|ndo)?)\s+(?:o\s+)?plano/.test(
      msg,
    )
  ) {
    return {
      tool: 'delete_plan',
      args: { planName: extractProductName(msg), productName: extractProductName(msg) },
    };
  }
  if (
    /(apaga(?:r|ndo)?|deleta(?:r|ndo)?|exclui(?:r|ndo)?|remove(?:r|ndo)?)\s+(?:o\s+)?checkout/.test(
      msg,
    )
  ) {
    return {
      tool: 'delete_checkout',
      args: { checkoutName: extractProductName(msg), productName: extractProductName(msg) },
    };
  }

  // ── URL CRUD ──
  if (/(adiciona(?:r|ndo)?|cria(?:r|ndo)?|nova|novo)\s+(?:o\s+|a\s+)?url/.test(msg)) {
    return { tool: 'add_url', args: extractUrlArgs(msg) };
  }
  if (
    /(edita(?:r|ndo)?|atualiza(?:r|ndo)?|muda(?:r|ndo)?|altera(?:r|ndo)?)\s+(?:o\s+|a\s+)?url/.test(
      msg,
    )
  ) {
    return { tool: 'update_url', args: extractUrlArgs(msg) };
  }
  if (/(apaga|deleta|exclui|remove)(?:r|ndo)?\s+(?:o\s+|a\s+)?url/.test(msg)) {
    const urlArgs = extractUrlArgs(msg);
    return { tool: 'delete_url', args: { urlLabel: extractProductName(msg), url: urlArgs.url } };
  }

  // ── DETALHES DO PRODUTO ──
  if (/(detalhes|info|mostra|ver|exib)\s+(do|o|sobre)\s+(produto|oferta)/.test(msg)) {
    return { tool: 'get_product_details', args: { productName: extractProductName(msg) } };
  }

  // ── PLANOS ──
  if (/cria(r|ndo)?\s+(?:um[a]?\s+)?(?:o\s+|a\s+)?(plano|parcelamento)/.test(msg)) {
    return { tool: 'plans.create', args: extractPlanArgs(msg) };
  }
  if (
    /(?:lista(?:r|ndo)?|mostra(?:r|ndo)?|ve(?:r|ndo)?|quais?\s+(?:s[aã]o\s+)?(?:os?\s+)?|meus?\s+)planos?/i.test(
      msg,
    )
  ) {
    return { tool: 'get_product_plans', args: { productName: extractProductName(msg) } };
  }
  if (
    /(?:edita|atualiza|muda|altera|desativa|pausa|desabilita|ativa|restaura|habilita)(?:r|ndo)?\s+(?:o\s+|a\s+)?plano/.test(
      msg,
    )
  ) {
    return { tool: 'plans.update', args: extractPlanArgs(msg) };
  }

  return null;
}
