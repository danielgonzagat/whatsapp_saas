import type { CSSProperties } from 'react';

import { colors } from '@/lib/design-tokens';
import { kloelT } from '@/lib/i18n/t';

export interface Plan {
  id: string;
  name: string;
  price: number;
  billingType: string;
  itemsPerPlan: number;
  visibleToAffiliates: boolean;
  active: boolean;
  salesCount: number;
}

export interface NewPlanForm {
  name: string;
  price: string;
  billingType: string;
  itemsPerPlan: number;
}

export const INITIAL_NEW_PLAN: NewPlanForm = {
  name: '',
  price: '',
  billingType: 'ONE_TIME',
  itemsPerPlan: 1,
};

export const PRODUCT_PLANS_COPY = {
  loadError: kloelT(`Falha ao carregar planos`),
  createError: kloelT(`Falha ao criar plano`),
  duplicateError: kloelT(`Falha ao duplicar plano`),
  closeModalAria: kloelT(`Fechar modal`),
  closeErrorAria: kloelT(`Fechar erro`),
  copied: kloelT(`Copiado`),
  copy: kloelT(`Copiar`),
  visible: kloelT(`VISIVEL`),
  hidden: kloelT(`OCULTO`),
  active: kloelT(`ATIVO`),
  inactive: kloelT(`INATIVO`),
  nameInputAria: kloelT(`Nome do plano`),
  priceInputAria: kloelT(`Valor do plano em reais`),
  itemsInputAria: kloelT(`Itens por plano`),
} as const;

/** Normalize unknown error into a human message with fallback. */
export function toPlanErrorMessage(error: unknown, fallback: string): string {
  return error instanceof Error && error.message ? error.message : fallback;
}

export interface PlanCreateBody {
  name: string;
  price: number;
  billingType: string;
  itemsPerPlan: number;
}

/** Parse the new-plan form into a backend-ready body. */
export function parseCreatePlanBody(form: NewPlanForm): PlanCreateBody {
  return {
    name: form.name,
    price: Number.parseFloat(form.price) || 0,
    billingType: form.billingType,
    itemsPerPlan: form.itemsPerPlan,
  };
}

/** Build the duplication body from an existing plan. */
export function buildDuplicatedPlanBody(plan: Plan): PlanCreateBody {
  return {
    name: `${plan.name} (Copia)`,
    price: plan.price,
    billingType: plan.billingType || 'ONE_TIME',
    itemsPerPlan: plan.itemsPerPlan || 1,
  };
}

/** Coerce arbitrary API payload into a Plan list. */
export function normalizePlansResponse(response: unknown): Plan[] {
  if (!Array.isArray(response)) {
    throw new Error('Payload de planos invalido.');
  }
  return response as Plan[];
}

/** Coerce a raw "itens por plano" input string into an integer >= 1.
 *
 * Mirrors the previous inline logic `Number.parseInt(value, 10) || 1`, which
 * falls back to 1 only on NaN/0 — negatives pass through.
 */
export function parseItemsPerPlan(raw: string): number {
  return Number.parseInt(raw, 10) || 1;
}

export interface PlanCheckoutLink {
  label: string;
  url: string;
}

/** Build the operational link list for a product (modal "Links de checkout"). */
export function buildPlanLinks(productId: string, origin: string): PlanCheckoutLink[] {
  return [
    { label: 'Abrir produto', url: `${origin}/products/${productId}` },
    { label: 'Abrir tab de planos', url: `${origin}/products/${productId}?tab=planos` },
    { label: 'Abrir checkouts', url: `${origin}/products/${productId}?tab=checkouts` },
  ];
}

/** SWR cache key matcher: invalidate any /products/* cache entry. */
export function isProductsCacheKey(key: unknown): boolean {
  return typeof key === 'string' && key.startsWith('/products');
}

/** Short display id (8 chars) for tables. */
export function shortPlanId(id: unknown): string {
  return String(id).slice(0, 8);
}

/** Pure factory for the "Novo plano" modal text/number/select input style.
 *
 * Hoisted out of the component so it is not re-allocated on every render.
 * The shape is identical to the previous inline literal — visual contract
 * preserved.
 */
export function buildPlanInputStyle(): CSSProperties {
  return {
    width: '100%',
    borderRadius: 6,
    border: `1px solid ${colors.border.space}`,
    backgroundColor: colors.background.elevated,
    padding: '10px 16px',
    fontSize: 14,
    color: colors.text.silver,
    outline: 'none',
    fontFamily: "'Sora', sans-serif",
  };
}

export interface PlanBadgeVisual {
  label: string;
  style: CSSProperties;
}

/** Resolve the pill rendered in the "Afiliados" column. */
export function resolveAffiliateBadge(visible: boolean): PlanBadgeVisual {
  if (visible) {
    return {
      label: PRODUCT_PLANS_COPY.visible,
      style: {
        backgroundColor: 'rgba(224,221,216,0.12)',
        color: colors.text.silver,
      },
    };
  }
  return {
    label: PRODUCT_PLANS_COPY.hidden,
    style: {
      backgroundColor: colors.background.elevated,
      color: colors.text.muted,
    },
  };
}

/** Resolve the pill rendered in the "Status" column. */
export function resolveActiveBadge(active: boolean): PlanBadgeVisual {
  if (active) {
    return {
      label: PRODUCT_PLANS_COPY.active,
      style: {
        backgroundColor: 'rgba(224,221,216,0.12)',
        color: colors.text.silver,
      },
    };
  }
  return {
    label: PRODUCT_PLANS_COPY.inactive,
    style: {
      backgroundColor: 'rgba(232,93,48,0.12)',
      color: colors.ember.primary,
    },
  };
}

/** Resolve the styling of the "Vendas" column pill based on sales count.
 *
 * `null`/`undefined`/non-numeric ⇒ neutral muted styling.
 */
export function resolveSalesCellStyle(value: unknown): CSSProperties {
  const n = Number(value);
  const hasSales = Number.isFinite(n) && n > 0;
  return {
    backgroundColor: hasSales ? 'rgba(224,221,216,0.12)' : colors.background.elevated,
    color: hasSales ? colors.text.silver : colors.text.dim,
  };
}

/** Render-safe stringification for sales counts (preserves the original
 * `String(v ?? '')` semantics — null/undefined collapse to ''). */
export function formatSalesCount(value: unknown): string {
  return String(value ?? '');
}
