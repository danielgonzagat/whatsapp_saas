/**
 * Core intent patterns: self-awareness, products, plans, checkouts, theme,
 * coupons, orders, leads, and wallet.
 *
 * Patterns kept as an `IntentPattern[]` literal so the regex sources remain
 * grep-friendly. The full catalogue lives in `./index.ts` which concatenates
 * the thematic chunks exported by this file.
 */

import { parseAmount, type IntentPattern } from '../intent-router.parsers';

export const CORE_INTENT_PATTERNS: IntentPattern[] = [
  // === Self-awareness ===
  {
    regex:
      /(?:o que|quais|liste|lista|mostre|que)\s.*(?:consegue|capaci|sabe|pode)\s.*(?:fazer?|operar?)/i,
    capabilityId: 'self.capabilities',
    extract: () => ({}),
  },
  {
    regex: /(?:sa[uú]de|health|status|funcionando|quebrad[ao])/i,
    capabilityId: 'self.health',
    extract: () => ({}),
  },
  {
    regex: /(?:gap|lacuna|falt[ae]|incompleto|ausente|nao funciona)/i,
    capabilityId: 'self.gaps',
    extract: () => ({}),
  },
  {
    regex: /(?:log|audit[oó]ria|a[cç][oõ]es?\s.*execut|o que vc fez|historico)/i,
    capabilityId: 'self.audit_log',
    extract: () => ({}),
  },
  {
    regex: /lista(?:r|ndo)?\s+(?:meus\s+)?(?:produtos|ofertas|cat[aá]logo)/i,
    capabilityId: 'list_products',
    extract: () => ({}),
  },

  // === Products ===
  {
    regex: /(?:cri[ae]r?\s.*produt|cadastra\s.*produt|nov[oa]\s.*produt)/i,
    capabilityId: 'products.create',
    extract: (match) => ({
      name: match[0].match(/produto\s+["""']?([^""""'"]+)/i)?.[1] || undefined,
      price: parseAmount(match[0]),
    }),
  },
  {
    regex: /(?:edit[ae]r?\s.*produt|alter[ae]r?\s.*produt|atualiz[ae]r?\s.*produt)/i,
    capabilityId: 'products.update',
    extract: () => ({}),
  },
  {
    regex: /(?:imagem|foto)\s.*(?:produto|subir|anex[ae]r?|coloc[ae]r?)/i,
    capabilityId: 'products.upload_image',
    extract: () => ({}),
  },
  {
    regex: /(?:ativ[ae]r?|desativ[ae]r?|public[ae]r?|dispon[ií]vel)\s.*(?:vend[ae]r?|produt)/i,
    capabilityId: 'products.update',
    extract: () => ({ active: true }),
  },

  // === Plans ===
  {
    regex: /(?:cri[ae]r?\s.*plan|nov[oa]\s.*plan|adicion[ae]r?\s.*plan)/i,
    capabilityId: 'plans.create',
    extract: () => ({}),
  },
  {
    regex: /(?:edit[ae]r?\s.*plan|alter[ae]r?\s.*plan)\s/i,
    capabilityId: 'plans.update',
    extract: () => ({}),
  },

  // === Checkouts ===
  {
    regex: /(?:cri[ae]r?\s.*checkout|nov[oa]\s.*checkout)/i,
    capabilityId: 'checkouts.create',
    extract: () => ({}),
  },
  {
    regex: /(?:edit[ae]r?\s.*checkout|alter[ae]r?\s.*checkou)/i,
    capabilityId: 'checkouts.update',
    extract: () => ({}),
  },

  // === Theme toggle ===
  {
    regex:
      /(?:tem[ae]\s+(?:clar[oa]?|escur[oa]?)|(?:clar[oa]?|escur[oa]?)\s+tem[ae]|(?:dark|light)\s+mode)/i,
    capabilityId: 'ui.theme',
    extract: (match) => ({
      theme: /escur[oa]|dark/i.test(match[0]) ? 'dark' : 'light',
    }),
  },
  // === Coupons ===
  {
    regex: /(?:cri[ae]r?\s.*cupom|cupom\s.*nov[oa]|cadastra\s.*cupom)/i,
    capabilityId: 'coupons.create',
    extract: () => ({}),
  },
  {
    regex: /(?:exclu[ui]r?\s.*cupom|remov[ae]r?\s.*cupom|delet[ae]r?\s.*cupom)/i,
    capabilityId: 'coupons.delete',
    extract: () => ({}),
  },

  // === Orders / Sales ===
  {
    regex: /(?:minhas\s+|meus\s+)?(?:vendas|pedidos|orders?)/i,
    capabilityId: 'list_orders',
    extract: () => ({}),
  },
  {
    regex: /resumo\s+(?:de\s+)?vendas?/i,
    capabilityId: 'get_sales_summary',
    extract: () => ({}),
  },

  // === Leads / CRM ===
  {
    regex: /(?:meus?\s+)?(?:leads?|contatos?|pipeline)/i,
    capabilityId: 'list_leads',
    extract: () => ({}),
  },

  // === Wallet ===
  {
    regex: /(?:extrato|hist[oó]rico\s+(?:de\s+)?(?:transa[cç][aã]o|financeiro))/i,
    capabilityId: 'get_wallet_statement',
    extract: () => ({}),
  },
];
