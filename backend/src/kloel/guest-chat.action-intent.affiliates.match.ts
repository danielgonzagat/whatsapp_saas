// Wave 68 Phase 2 — subscriptions / affiliates (config/list/marketplace) / editar plano|checkout / CRM pipeline intent dispatch.
// See docs/architecture/WAVE_60_GUEST_CHAT_ACTION_INTENT_DECOMP_PLAN.md.
// Order invariant: matches original top-to-bottom evaluation order — do not
// re-order regexes within or across sections.

import { extractAffiliateArgs } from './guest-chat.action-intent.affiliate-args.helpers';
import { extractPlanArgs } from './guest-chat.action-intent.plan-args.helpers';
import { extractProductName } from './guest-chat.action-intent.product-args.helpers';
import type { ActionIntent } from './guest-chat.action-intent.self-awareness.match';

export function detectAffiliatesIntent(msg: string): ActionIntent {
  // ── ASSINATURAS / ASSINANTES ──
  if (/lista(?:r|ndo)?\s+(?:meus\s+)?assinantes/i.test(msg)) {
    return { tool: 'list_subscriptions', args: {} };
  }
  if (/lista(?:r|ndo)?\s+(?:minhas\s+)?assinaturas/i.test(msg)) {
    return { tool: 'list_subscriptions', args: {} };
  }
  if (
    /(?:cancela|pausa|desativa)(?:r|ndo)?\s+(?:a\s+|o\s+)?(?:assinatura|plano\s+enterprise)/i.test(
      msg,
    )
  ) {
    return {
      tool: 'update_subscription',
      args: { action: /cancela/i.test(msg) ? 'cancel' : 'pause' },
    };
  }

  // ── AFILIADOS: MERCHAN / TERMOS / COPRODUÇÃO ──
  if (/termos?\s+(?:de\s+)?afiliad/i.test(msg)) {
    return { tool: 'get_affiliate_config', args: {} };
  }
  if (/merchan|co[-]?produ[cç][aã]o|ger[êe]ncia\s+(?:de\s+)?afiliad/i.test(msg)) {
    return { tool: 'get_affiliate_config', args: {} };
  }

  // ── EDITAR CONFIG AFILIADOS ──
  if (
    /(?:configura(?:r|ndo)?|atualiza(?:r|ndo)?|edita(?:r|ndo)?|muda(?:r|ndo)?|altera(?:r|ndo)?)\s+(?:o\s+)?(?:programa\s+(?:de\s+)?)?(?:comiss[aã]o\s+(?:de\s+)?)?afiliad/.test(
      msg,
    )
  ) {
    return { tool: 'update_affiliate_config', args: extractAffiliateArgs(msg) };
  }

  // ── AFILIADOS ──
  if (/afiliados?|comiss[aã]o|programa.*afiliado/.test(msg)) {
    return { tool: 'get_affiliate_config', args: {} };
  }

  // ── EDITAR PLANO / CHECKOUT ──
  if (
    /(edita(?:r|ndo)?|atualiza(?:r|ndo)?|muda(?:r|ndo)?|altera(?:r|ndo)?)\s+(?:o\s+)?(plano|checkout)/.test(
      msg,
    )
  ) {
    const isCheckout = /checkout/.test(msg);
    return { tool: isCheckout ? 'checkouts.update' : 'plans.update', args: extractPlanArgs(msg) };
  }

  // ── CRM / PIPELINE ──
  if (/(detalhes|info)\s+(do\s+)?lead/.test(msg)) {
    return { tool: 'get_lead_details', args: { leadName: extractProductName(msg) } };
  }

  return null;
}
