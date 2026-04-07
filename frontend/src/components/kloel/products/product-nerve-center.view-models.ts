import { buildCheckoutDisplayCode } from '@/lib/checkout-links';

export interface ProductEditorPlanView {
  id: string;
  name: string;
  slug: string | null;
  hasRealSlug: boolean;
  referenceCode: string | null;
  ref: string;
  price: number;
  qty: number;
  active: boolean;
  sales: number;
  inst: number;
  vis: boolean;
  freeShip: boolean;
  checkoutLinks: unknown[];
}

export interface ProductEditorCheckoutView {
  id: string;
  code: string;
  slug: string | null;
  hasRealSlug: boolean;
  referenceCode: string | null;
  desc: string;
  mt: string[];
  sales: number;
  active: boolean;
  installments: number;
  quantity: number;
  coupon: boolean;
  urgency: boolean;
  popup: boolean;
  linkedPlans: unknown[];
}

export function mapProductEditorPlans(rawPlans: unknown): ProductEditorPlanView[] {
  if (!Array.isArray(rawPlans)) return [];

  return rawPlans.map((plan: any) => ({
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

export function mapProductEditorCheckouts(rawCheckouts: unknown): ProductEditorCheckoutView[] {
  if (!Array.isArray(rawCheckouts)) return [];

  return rawCheckouts.map((checkout: any) => {
    const cfg = checkout.checkoutConfig || {};
    const paymentMethods: string[] = [];
    if (cfg.enablePix !== false) paymentMethods.push('PIX');
    if (cfg.enableCreditCard !== false) paymentMethods.push('CARTÃO');
    if (cfg.enableBoleto) paymentMethods.push('BOLETO');

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
