// Wave 68 Phase 2 — redes sociais / garantia/exit/after-pay / listar afiliados /
// marketplace / vendas físicas / multi-canal / redes sociais (dup) / estornos /
// antecipações / avaliações / order bump / social proof / editar cupom /
// whatsapp / frete / assinaturas / produtos físicos / dados fiscais /
// upload imagem / pixel / email-marketing intent dispatch.
// See docs/architecture/WAVE_60_GUEST_CHAT_ACTION_INTENT_DECOMP_PLAN.md.
// Order invariant: MULTI-CANAL antes de REDES SOCIAIS (dup) — keep both
// instances in original order. No re-ordering within or across sections.

import { extractCouponArgs } from './guest-chat.action-intent.coupon-args.helpers';
import { extractFiscalArgs } from './guest-chat.action-intent.fiscal-args.helpers';
import { extractProductName } from './guest-chat.action-intent.product-args.helpers';
import type { ActionIntent } from './guest-chat.action-intent.self-awareness.match';

export function detectCommerceExtrasIntent(msg: string, message: string): ActionIntent {
  // ── REDES SOCIAIS ──
  if (/redes sociais/.test(msg)) {
    return { tool: 'get_social_channels', args: {} };
  }

  // ── GARANTIA / EXIT INTENT / AFTER PAY ──
  if (/garantia|warranty/.test(msg)) {
    const wmatch = msg.match(/(\d+)\s*(?:dias?|days?)/i);
    const wdays = wmatch?.[1] ? parseInt(wmatch[1], 10) : undefined;
    return {
      tool: 'configure_warranty',
      args: { productName: extractProductName(message), warrantyDays: wdays },
    };
  }
  if (/exit intent|popup.*sa[ií]da/.test(msg)) {
    return { tool: 'configure_exit_intent', args: { productName: extractProductName(msg) } };
  }
  if (/after pay|pagamento.*depois|comprar.*depois/.test(msg)) {
    return { tool: 'configure_after_pay', args: { productName: extractProductName(msg) } };
  }

  // ── LISTAR AFILIADOS ──
  if (/(?:lista|mostra|ver|meus)\s+(?:afiliados?|partners?)/.test(msg)) {
    return { tool: 'list_affiliates', args: {} };
  }

  // ── MARKETPLACE / AFILIAR-SE ──
  if (/marketplace|afiliar.se|afiliar a|produtos.*p[uú]blicos/.test(msg)) {
    return { tool: 'browse_marketplace', args: {} };
  }

  // ── VENDAS FÍSICAS / ENVIO / RASTREIO ──
  if (/fulfillment|dropshipping|transportadora/.test(msg)) {
    return { tool: 'configure_shipping', args: { productName: extractProductName(msg) } };
  }

  // ── MULTI-CANAL ── (antes de redes sociais)
  if (/conectar\s+(instagram|facebook|tiktok|email)/.test(msg)) {
    const channel = msg.match(/(instagram|facebook|tiktok|email)/i)?.[1] || '';
    return { tool: 'connect_channel', args: { channel } };
  }
  if (/(?:enviar|mandar|disparar)\s+(?:por\s+)?(instagram|facebook|tiktok|email)/.test(msg)) {
    return {
      tool: 'send_channel_message',
      args: { channel: msg.match(/(instagram|facebook|tiktok|email)/i)?.[1] || '' },
    };
  }

  // ── REDES SOCIAIS ── (duplicate in original; preserved intentionally)
  if (/redes sociais/.test(msg)) {
    return { tool: 'get_social_channels', args: {} };
  }

  // ── ESTORNOS ── (mutation verbs before read-only nouns)
  if (
    /(?:estorna|reembolsa|faz\s+(?:o\s+)?refund|processa\s+(?:o\s+)?refund|solicita\s+(?:o\s+)?estorno)\b/i.test(
      msg,
    ) ||
    (/\brefund\b/i.test(msg) && !/lista|hist[oó]rico|relat[oó]rio|meus|todos/i.test(msg))
  ) {
    return { tool: 'sales.refund', args: { confirmRequired: true } };
  }
  if (
    /(?:meus |todos |lista |hist[oó]rico |relat[oó]rio )?(?:estornos?|reembolsos?|refunds?|devolu[cç][oõ]es)/.test(
      msg,
    ) || /cancelar\s+(venda|pedido)/.test(msg)
  ) {
    return { tool: 'list_refunds', args: {} };
  }

  // ── ANTECIPAÇÕES ──
  if (/antecipa[cç][aã]o|adiantar\s+receb/.test(msg)) {
    return { tool: 'request_anticipation', args: {} };
  }

  // ── AVALIAÇÕES ──
  if (/avalia[cç][oõ]es|reviews/.test(msg)) {
    return { tool: 'get_product_reviews', args: { productName: extractProductName(msg) } };
  }

  // ── ORDER BUMP ──
  if (/order bump|upsell|downsell/.test(msg)) {
    return { tool: 'configure_order_bump', args: { productName: extractProductName(msg) } };
  }

  // ── SOCIAL PROOF ──
  if (/social proof|prova social/.test(msg)) {
    return { tool: 'configure_social_proof', args: { productName: extractProductName(msg) } };
  }

  // ── EDITAR CUPOM ──
  if (
    /(?:edita(?:r|ndo)?|atualiza(?:r|ndo)?|muda(?:r|ndo)?|altera(?:r|ndo)?)\s+(?:o\s+)?cupom/.test(
      msg,
    )
  ) {
    return { tool: 'update_coupon', args: extractCouponArgs(msg) };
  }

  // ── WHATSAPP ──
  if (
    /whatsapp.*(conectar|conex[aã]o|status|verificar)/.test(msg) ||
    /status\s+(do\s+)?whatsapp/.test(msg) ||
    /whatsapp.*(est[aá]|como)/.test(msg)
  ) {
    return { tool: 'get_whatsapp_status', args: {} };
  }
  if (
    /(?:envia|manda|dispara|enviar|mandar|disparar)\s+(?:uma?\s+)?(?:mensagem|msg|zap)\s+(?:no|via|por|pra|para|pelo|pela)\s+(?:whatsapp|whats|zap|wpp)/i.test(
      msg,
    )
  ) {
    return { tool: 'send_whatsapp_message', args: { message: msg } };
  }
  if (/lista\s+(contatos|chats)\s+whatsapp/.test(msg)) {
    return { tool: 'list_whatsapp_chats', args: {} };
  }

  // ── INSTAGRAM ──
  if (
    /(?:dm|direct|mensagem)\s+(?:no|do|via|por|pelo)\s+(?:insta|instagram)/i.test(msg) ||
    /manda(?:r)?\s+(?:uma?\s+)?direct/i.test(msg) ||
    /(?:envia|manda|dispara|enviar|mandar|disparar)\s+(?:uma?\s+)?(?:mensagem|msg|dm)\s+(?:no|via|por|pelo)\s+(?:insta|instagram)/i.test(
      msg,
    )
  ) {
    return { tool: 'send_instagram_dm', args: { message: msg } };
  }

  // ── FRETE / ENTREGA ──
  if (
    /(configura(r|ndo)?|defini(r|ndo)?|alterar|mudar)\s+(frete|entreg[a]|envio|transportadora)/.test(
      msg,
    )
  ) {
    return { tool: 'configure_shipping', args: { productName: extractProductName(msg) } };
  }

  // ── ASSINATURAS ──
  if (/minhas\s+assinaturas|gest[aã]o\s+de\s+assinatura|lista(r|ndo)?\s+assinatura/.test(msg)) {
    return { tool: 'list_subscriptions', args: {} };
  }

  // ── PRODUTOS FÍSICOS ──
  if (/(status|rastreio|tracking)\s+(do|de)\s+(envio|pedido|produto)/.test(msg)) {
    return { tool: 'get_order_details', args: { productName: extractProductName(msg) } };
  }

  // ── DADOS FISCAIS / DOCUMENTOS ──
  if (
    /(atualiza(?:r|ndo)?|salva(?:r|ndo)?|altera(?:r|ndo)?)\s+(meus\s+)?(dados\s+(fiscais|pessoais|banc[aá]rios)|documento)/.test(
      msg,
    )
  ) {
    return { tool: 'update_fiscal_data', args: extractFiscalArgs(msg) };
  }
  if (/envia(?:r|ndo)?\s+(documento|contrato|identidade|cnpj)/.test(msg)) {
    return {
      tool: 'upload_document',
      args: { docType: msg.match(/(identidade|contrato|cnpj)/i)?.[1] || 'document' },
    };
  }

  // ── UPLOAD / IMAGEM ──
  if (
    /(faz\s+)?(upload|envia|sobe|essa é a|imagem do|foto do)\s+(?:da\s+)?(imagem|foto|arquivo)\b/.test(
      msg,
    )
  ) {
    return { tool: 'upload_product_image', args: { productName: extractProductName(msg) } };
  }

  // ── PIXEL ──
  if (/pixel\s+(facebook|google|meta|ads)/.test(msg) || /configura\s+pixel/.test(msg)) {
    return { tool: 'configure_pixel', args: { productName: extractProductName(msg) } };
  }

  // ── E-MAIL / MARKETING ──
  if (
    /(?:manda|envia|dispara|mandar|enviar|disparar)\s+(?:um\s+)?e[\s-]?mail/i.test(msg) &&
    !/broadcast|campanha|disparo/i.test(msg)
  ) {
    return { tool: 'send_email', args: { message: msg } };
  }
  if (
    /(envia(?:r|ndo)?|manda(?:r|ndo)?|dispara(?:r|ndo)?)\s+(email|campanha|broadcast)/.test(msg)
  ) {
    return { tool: 'create_broadcast', args: { name: extractProductName(msg) } };
  }

  return null;
}
