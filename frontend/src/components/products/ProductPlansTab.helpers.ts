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
  return Array.isArray(response) ? (response as Plan[]) : [];
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
