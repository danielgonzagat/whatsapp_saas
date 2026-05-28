/**
 * Product-centric intent patterns: plans, reviews, urls, coupon management,
 * document upload, subscriptions, shipping, warranty, and exit-intent popups.
 */

import { isDeactivation, type IntentPattern } from '../intent-router.parsers';

export const PRODUCT_INTENT_PATTERNS: IntentPattern[] = [
  // === Product plans/reviews/urls ===
  {
    regex: /(?:quais?\s+(?:s[aã]o\s+)?(?:os?\s+)?|meus?\s+|ver\s+|mostr[ae]r?\s+)planos?/i,
    capabilityId: 'get_product_plans',
    extract: () => ({}),
  },
  {
    regex: /(?:avalia[cç][oõ]es?|reviews?)/i,
    capabilityId: 'get_product_reviews',
    extract: () => ({}),
  },
  {
    regex: /(?:urls?\s+(?:do\s+)?produto|p[aá]ginas?\s+(?:do\s+)?produto)/i,
    capabilityId: 'get_product_urls',
    extract: () => ({}),
  },

  // === Coupon management ===
  {
    regex: /(?:exclu[ui]r?|remov[ae]r?|delet[ae]r?|apag[ae]r?)\s+(?:o\s+|a\s+)?cupom/i,
    capabilityId: 'delete_coupon',
    extract: () => ({}),
  },
  {
    regex: /valid[ae]r?\s+(?:o\s+|a\s+)?cupom/i,
    capabilityId: 'validate_coupon',
    extract: () => ({}),
  },

  // === Document upload ===
  {
    regex:
      /(?:envi[ae]r?|upload|anex[ae]r?)\s+(?:meu\s+)?(?:documento|contrato|rg|cpf|cnpj|identidade)/i,
    capabilityId: 'upload_document',
    extract: (match) => ({
      documentType: match[0].match(/contrato/i)
        ? 'contract'
        : match[0].match(/(?:rg|identidad)/i)
          ? 'identity'
          : match[0].match(/cnpj/i)
            ? 'cnpj_card'
            : 'document',
    }),
  },
  {
    regex: /envi[ae]r?\s+(?:meu\s+)?(?:pdf|arquivo)/i,
    capabilityId: 'upload_document',
    extract: () => ({}),
  },

  // === Subscriptions ===
  {
    regex: /(?:minhas?\s+)?(?:assinaturas?|assinantes?|subscriptions?)/i,
    capabilityId: 'list_subscriptions',
    extract: () => ({}),
  },

  // === Shipping ===
  {
    regex: /(?:configur[ae]r?|defin[ei]r?)\s+(?:o\s+)?(?:frete|entreg[ae]?)/i,
    capabilityId: 'configure_shipping',
    extract: () => ({}),
  },

  // === Warranty ===
  {
    regex: /(?:configur[ae]r?|defin[ei]r?|qual\s+(?:a\s+)?)\s*(?:garantia|warranty)/i,
    capabilityId: 'configure_warranty',
    extract: (match) => {
      const days = match[0].match(/(\d+)\s*(?:dias?|days?)/i);
      return days?.[1] ? { warrantyDays: parseInt(days[1], 10) } : {};
    },
  },

  // === Exit intent ===
  {
    regex: /(?:exit\s+intent|popup\s+(?:de\s+)?sa[ií]da)/i,
    capabilityId: 'configure_exit_intent',
    extract: (match) => ({
      enabled: !isDeactivation(match[0]),
    }),
  },
];
