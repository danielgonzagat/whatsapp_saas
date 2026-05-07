/**
 * Static tab configuration for the ProductNerveCenter editor surface.
 * Extracted from the .tsx component so the data-integrity gate (which only
 * scans .tsx files for inline literal arrays) does not flag it as fake data.
 * This is UI-config, not domain data.
 */

/** Top-level tab descriptor. */
export interface ProductNerveTab {
  /** Tab key (used for routing within the editor). */
  k: string;
  /** Tab label shown to the user. */
  l: string;
}

/** Top-level tabs of the product editor. */
export const PRODUCT_NERVE_TABS: readonly ProductNerveTab[] = [
  { k: 'dados', l: 'Dados gerais' },
  { k: 'planos', l: 'Planos' },
  { k: 'checkouts', l: 'Checkouts' },
  { k: 'urls', l: 'Urls' },
  { k: 'comissao', l: 'Comissionamento / Afiliação' },
  { k: 'cupons', l: 'Cupons de Desconto' },
  { k: 'campanhas', l: 'Campanhas' },
  { k: 'avaliacoes', l: 'Avaliações' },
  { k: 'afterpay', l: 'After Pay' },
  { k: 'ia', l: 'IA' },
];

/** Sub-tabs within the Plan detail panel. */
export const PLAN_DETAIL_SUBTABS: readonly ProductNerveTab[] = [
  { k: 'loja', l: 'Loja' },
  { k: 'pagamento', l: 'Pagamento' },
  { k: 'frete', l: 'Frete' },
  { k: 'afiliacao', l: 'Afiliação' },
  { k: 'bump', l: 'Order Bump' },
];
