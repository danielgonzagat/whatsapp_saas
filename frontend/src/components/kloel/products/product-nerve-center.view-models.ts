import { buildCheckoutDisplayCode } from '@/lib/checkout-links';

/** Product editor plan view shape. */
export interface ProductEditorPlanView {
  /** Id property. */
  id: string;
  /** Name property. */
  name: string;
  /** Slug property. */
  slug: string | null;
  /** Has real slug property. */
  hasRealSlug: boolean;
  /** Reference code property. */
  referenceCode: string | null;
  /** Ref property. */
  ref: string;
  /** Price property. */
  price: number;
  /** Qty property. */
  qty: number;
  /** Active property. */
  active: boolean;
  /** Sales property. */
  sales: number;
  /** Inst property. */
  inst: number;
  /** Vis property. */
  vis: boolean;
  /** Free ship property. */
  freeShip: boolean;
  /** Checkout links property. */
  checkoutLinks: unknown[];
}

/** Product editor checkout view shape. */
export interface ProductEditorCheckoutView {
  /** Id property. */
  id: string;
  /** Code property. */
  code: string;
  /** Slug property. */
  slug: string | null;
  /** Has real slug property. */
  hasRealSlug: boolean;
  /** Reference code property. */
  referenceCode: string | null;
  /** Desc property. */
  desc: string;
  /** Mt property. */
  mt: string[];
  /** Sales property. */
  sales: number;
  /** Active property. */
  active: boolean;
  /** Installments property. */
  installments: number;
  /** Quantity property. */
  quantity: number;
  /** Coupon property. */
  coupon: boolean;
  /** Urgency property. */
  urgency: boolean;
  /** Popup property. */
  popup: boolean;
  /** Linked plans property. */
  linkedPlans: unknown[];
}

interface RawPlan {
  id: string;
  name?: string;
  slug?: string | null;
  referenceCode?: string | null;
  priceInCents?: number;
  quantity?: number;
  isActive?: boolean;
  active?: boolean;
  salesCount?: number;
  maxInstallments?: number;
  visibleToAffiliates?: boolean;
  freeShipping?: boolean;
  planLinks?: unknown[];
}

interface RawCheckoutConfig {
  enablePix?: boolean;
  enableCreditCard?: boolean;
  enableBoleto?: boolean;
  enableCoupon?: boolean;
  enableTimer?: boolean;
  showStockCounter?: boolean;
  showCouponPopup?: boolean;
}

interface RawCheckout {
  id: string;
  name?: string;
  slug?: string | null;
  referenceCode?: string | null;
  checkoutConfig?: RawCheckoutConfig;
  salesCount?: number;
  isActive?: boolean;
  active?: boolean;
  maxInstallments?: number;
  quantity?: number;
  checkoutLinks?: unknown[];
}

/** Map product editor plans. */
export function mapProductEditorPlans(rawPlans: unknown): ProductEditorPlanView[] {
  if (!Array.isArray(rawPlans)) {
    return [];
  }

  return (rawPlans as RawPlan[]).map((plan) => ({
    id: plan.id,
    name: plan.name || 'Sem nome',
    slug: plan.slug || null,
    hasRealSlug: Boolean(plan.slug),
    referenceCode: buildCheckoutDisplayCode(plan.referenceCode) || null,
    ref: buildCheckoutDisplayCode(plan.referenceCode, plan.id) || '---',
    price: Number(plan.priceInCents || 0),
    qty: Number(plan.quantity || 1),
    active: plan.isActive !== false && plan.active !== false,
    sales: Number(plan.salesCount || 0),
    inst: Number(plan.maxInstallments || 1),
    vis: plan.visibleToAffiliates !== false,
    freeShip: plan.freeShipping === true,
    checkoutLinks: Array.isArray(plan.planLinks) ? plan.planLinks : [],
  }));
}

/** Map product editor checkouts. */
export function mapProductEditorCheckouts(rawCheckouts: unknown): ProductEditorCheckoutView[] {
  if (!Array.isArray(rawCheckouts)) {
    return [];
  }

  return (rawCheckouts as RawCheckout[]).map((checkout) => {
    const cfg: RawCheckoutConfig = checkout.checkoutConfig || {};
    const paymentMethods: string[] = [];
    if (cfg.enablePix !== false) {
      paymentMethods.push('PIX');
    }
    if (cfg.enableCreditCard !== false) {
      paymentMethods.push('CARTÃO');
    }
    if (cfg.enableBoleto) {
      paymentMethods.push('BOLETO');
    }

    return {
      id: checkout.id,
      code:
        buildCheckoutDisplayCode(checkout.referenceCode, checkout.id) ||
        checkout.slug ||
        String(checkout.id || '').slice(0, 8),
      slug: checkout.slug || null,
      hasRealSlug: Boolean(checkout.slug),
      referenceCode: buildCheckoutDisplayCode(checkout.referenceCode) || null,
      desc: checkout.name || 'Checkout',
      mt: paymentMethods,
      sales: Number(checkout.salesCount || 0),
      active: checkout.isActive !== false && checkout.active !== false,
      installments: Number(checkout.maxInstallments || 1),
      quantity: Number(checkout.quantity || 1),
      coupon: cfg.enableCoupon !== false,
      urgency: Boolean(cfg.enableTimer || cfg.showStockCounter),
      popup: Boolean(cfg.showCouponPopup),
      linkedPlans: Array.isArray(checkout.checkoutLinks) ? checkout.checkoutLinks : [],
    };
  });
}
