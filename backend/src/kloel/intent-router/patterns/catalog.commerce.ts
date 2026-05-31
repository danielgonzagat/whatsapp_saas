/**
 * Commerce/finance intent patterns: sales (PIX/boleto/card), urls, social proof,
 * pixel, checkout listing, agent memory, dashboard, affiliates, wallet, reports,
 * CRM, payment links, withdrawal/anticipation, and order management.
 */

import { parseAmount, type IntentPattern } from '../intent-router.parsers';

export const COMMERCE_INTENT_PATTERNS: IntentPattern[] = [
  // === Sales / PIX / Boleto / Card ===
  {
    regex: /(?:emit[ei]r?|ger[ae]r?|cri[ae]r?)\s.*(?:cart[aã]o|card|cr[eé]dito).*$/i,
    capabilityId: 'sales.create_card_link',
    extract: (match) => ({ amount: parseAmount(match[0]) }),
  },
  {
    regex: /(?:emit[ei]r?|ger[ae]r?|cri[ae]r?)\s.*pix.*$/i,
    capabilityId: 'sales.create_pix',
    extract: (match) => ({ amount: parseAmount(match[0]) }),
  },
  {
    regex: /(?:emit[ei]r?|ger[ae]r?|cri[ae]r?)\s.*bolet.*$/i,
    capabilityId: 'sales.create_boleto',
    extract: (match) => ({ amount: parseAmount(match[0]) }),
  },
  {
    regex:
      /(?:consult[ae]r?\s.*vend[ae]|status\s.*vend[ae]|buscar?\s.*vend[ae]|mostr[ae]r?\s.*vend[ae])/i,
    capabilityId: 'sales.list',
    extract: () => ({}),
  },

  // === URLs ===
  {
    regex: /(?:adicion[ae]r?|cri[ae]r?|nov[ao])\s+(?:o\s+|a\s+)?url/i,
    capabilityId: 'add_url',
    extract: (match) => {
      const urlMatch = match[0].match(/(https?:\/\/[^\s]+)/i);
      return urlMatch ? { url: urlMatch[1] } : {};
    },
  },
  {
    regex: /(?:edit[ae]r?|atualiz[ae]r?|mud[ae]r?|alter[ae]r?)\s+(?:o\s+|a\s+)?url/i,
    capabilityId: 'update_url',
    extract: () => ({}),
  },
  {
    regex: /(?:apag[ae]r?|delet[ae]r?|remov[ae]r?|exclu[ui]r?)\s+(?:o\s+|a\s+)?url/i,
    capabilityId: 'delete_url',
    extract: () => ({}),
  },

  // === Social proof ===
  {
    regex: /(?:social\s+proof|prova\s+social|depoimentos?|ativ[ae]r?\s+(?:prova\s+social|social))/i,
    capabilityId: 'configure_social_proof',
    extract: (match) => ({
      enabled: !/desativ[ae]|remov[ae]/i.test(match[0]),
    }),
  },

  // === Pixel ===
  {
    regex: /(?:configur[ae]r?|ativ[ae]r?)\s+(?:o\s+)?pixel/i,
    capabilityId: 'configure_pixel',
    extract: () => ({}),
  },

  // === Checkout listing ===
  {
    regex: /(?:list[ae]r?|meus?|ver)\s+(?:checkouts?|p[aá]ginas?\s+(?:de\s+)?checkouts?)/i,
    capabilityId: 'list_checkouts',
    extract: () => ({}),
  },

  // === Agent memory/sessions ===
  {
    regex:
      /(?:buscar?|pesquisar?|procur[ae]r?)\s+(?:minhas\s+)?(?:conversas?|mem[oó]rias?|hist[oó]ricos?)/i,
    capabilityId: 'search_agent_memory',
    extract: (match) => ({ query: match[0] }),
  },
  {
    regex: /(?:buscar?|pesquisar?)\s+(?:sess[oõ]es?|minhas\s+sess[oõ]es?)/i,
    capabilityId: 'search_agent_sessions',
    extract: (match) => ({ query: match[0] }),
  },

  // === Dashboard ===
  {
    regex: /(?:dashboard|painel|resumo\s+(?:do\s+)?dia)/i,
    capabilityId: 'get_dashboard_summary',
    extract: () => ({}),
  },

  // === Checkout listing (duplicate from legacy catalogue) ===
  {
    regex: /(?:list[ae]r?|meus?|ver)\s+(?:checkouts?|p[aá]ginas?\s+(?:de\s+)?checkouts?)/i,
    capabilityId: 'list_checkouts',
    extract: () => ({}),
  },

  // === URLs (legacy variant) ===
  {
    regex: /(?:adicion[ae]r?\s.*url|url\s.*nov[oa])/i,
    capabilityId: 'urls.add',
    extract: () => ({}),
  },

  // === Affiliates ===
  {
    regex: /(?:ativ[ae]r?\s.*afil|desativ[ae]r?\s.*afil|configur[ae]r?\s.*afil|programa\s.*afil)/i,
    capabilityId: 'affiliates.configure',
    extract: () => ({}),
  },

  // === Wallet ===
  {
    regex: /(?:saldo|carteir|meu\s.*saldo|quanto\s.*tenho)/i,
    capabilityId: 'wallet.balance',
    extract: () => ({}),
  },
  {
    regex: /(?:saqu[ei]|solicit[ae]r?\s.*saqu|ped[ei]r?\s.*saqu|sac[ae]r?)/i,
    capabilityId: 'wallet.withdraw',
    extract: () => ({}),
  },

  // === Reports ===
  {
    regex: /(?:relat[oó]rio\s.*opera[cç][ãa]o|opera[cç][õo]es)/i,
    capabilityId: 'reports.operations',
    extract: () => ({}),
  },
  {
    regex: /(?:abandon|carrinho abandon)/i,
    capabilityId: 'reports.abandonments',
    extract: () => ({}),
  },

  // === CRM ===
  {
    regex: /(?:pipeline|crm|stage|est[áa]gio)/i,
    capabilityId: 'crm.pipeline',
    extract: () => ({}),
  },
  {
    regex: /(?:pega|preenche|coleta)\s+(?:os?\s+)?dados\s+(?:do|de)\s+(?:comprador|cliente)/i,
    capabilityId: 'sales.fill_buyer_data',
    extract: () => ({}),
  },

  // === Payment link ===
  {
    regex:
      /^(?!.*\b(?:cart[aã]o|card|cr[eé]dito)\b)(?:cri[ae]r?|ger[ae]r?)\s+(?:link\s+(?:de\s+)?pagamento|payment\s+link)/i,
    capabilityId: 'create_payment_link',
    extract: (match) => ({ amount: parseAmount(match[0]) }),
  },

  // === Saque/antecipação ===
  {
    regex: /(?:solicit[ae]r?|ped[ei]r?)\s+(?:meu\s+)?saque/i,
    capabilityId: 'request_withdrawal',
    extract: (match) => ({ amount: parseAmount(match[0]) }),
  },
  {
    regex: /(?:solicit[ae]r?|ped[ei]r?)\s+(?:minha\s+)?antecipa[cç][aã]o/i,
    capabilityId: 'request_anticipation',
    extract: () => ({}),
  },

  // === Subscription ===
  {
    regex: /(?:cancel[ae]r?|paus[ae]r?|desativ[ae]r?)\s+(?:minha\s+)?(?:assinatura|subscri)/i,
    capabilityId: 'update_subscription',
    extract: (match) => ({
      action: /cancel|paus/i.test(match[0]) ? 'cancel' : 'pause',
    }),
  },

  // === Orders ===
  {
    regex: /(?:cri[ae]r?|ger[ae]r?|nov[ao])\s+(?:um[a]?\s+)?(?:pedido|order|venda)/i,
    capabilityId: 'create_order',
    extract: (match) => ({ amount: parseAmount(match[0]) }),
  },
  {
    regex: /(?:detalhes|info|status)\s+(?:do|da)\s+(?:pedido|venda|order)/i,
    capabilityId: 'get_order_details',
    extract: () => ({}),
  },
];
