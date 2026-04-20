// Pure helpers extracted from ProductNerveCenter.tsx to reduce cyclomatic
// complexity of the product-sync and plan-checkout-config sync useEffects.
// Behaviour is byte-identical to the original inline implementation.

export interface ProductSyncTargets {
  /** Set edit name property. */
  setEditName: (value: string) => void;
  /** Set edit desc property. */
  setEditDesc: (value: string) => void;
  /** Set edit category property. */
  setEditCategory: (value: string) => void;
  /** Set edit tags property. */
  setEditTags: (value: string) => void;
  /** Set edit warranty property. */
  setEditWarranty: (value: number) => void;
  /** Set edit sales url property. */
  setEditSalesUrl: (value: string) => void;
  /** Set edit thank url property. */
  setEditThankUrl: (value: string) => void;
  /** Set edit thank pix property. */
  setEditThankPix: (value: string) => void;
  /** Set edit thank boleto property. */
  setEditThankBoleto: (value: string) => void;
  /** Set edit reclame property. */
  setEditReclame: (value: string) => void;
  /** Set edit support email property. */
  setEditSupportEmail: (value: string) => void;
  /** Set edit active property. */
  setEditActive: (value: boolean) => void;
  /** Set edit format property. */
  setEditFormat: (value: string) => void;
}

/** Product sync source shape. */
export interface ProductSyncSource {
  /** Name property. */
  name?: string | null;
  /** Description property. */
  description?: string | null;
  /** Category property. */
  category?: string | null;
  /** Tags property. */
  tags?: unknown;
  /** Warranty days property. */
  warrantyDays?: number | null;
  /** Sales page url property. */
  salesPageUrl?: string | null;
  /** Thankyou url property. */
  thankyouUrl?: string | null;
  /** Thankyou pix url property. */
  thankyouPixUrl?: string | null;
  /** Thankyou boleto url property. */
  thankyouBoletoUrl?: string | null;
  /** Reclame aqui url property. */
  reclameAquiUrl?: string | null;
  /** Support email property. */
  supportEmail?: string | null;
  /** Active property. */
  active?: boolean | null;
  /** Format property. */
  format?: string | null;
}

function toTagsString(tags: unknown): string {
  if (Array.isArray(tags)) {
    return tags.join(', ');
  }
  return typeof tags === 'string' ? tags : '';
}

/** Apply product sync. */
export function applyProductSync(p: ProductSyncSource, targets: ProductSyncTargets): void {
  targets.setEditName(p.name || '');
  targets.setEditDesc(p.description || '');
  targets.setEditCategory(p.category || '');
  targets.setEditTags(toTagsString(p.tags));
  targets.setEditWarranty(Math.max(7, Number(p.warrantyDays || 7)));
  targets.setEditSalesUrl(p.salesPageUrl || '');
  targets.setEditThankUrl(p.thankyouUrl || '');
  targets.setEditThankPix(p.thankyouPixUrl || '');
  targets.setEditThankBoleto(p.thankyouBoletoUrl || '');
  targets.setEditReclame(p.reclameAquiUrl || '');
  targets.setEditSupportEmail(p.supportEmail || '');
  targets.setEditActive(p.active !== false);
  targets.setEditFormat(p.format || 'DIGITAL');
}

/** Plan checkout config shape. */
export interface PlanCheckoutConfig {
  /** Enable credit card property. */
  enableCreditCard?: unknown;
  /** Enable pix property. */
  enablePix?: unknown;
  /** Enable boleto property. */
  enableBoleto?: unknown;
  /** Enable coupon property. */
  enableCoupon?: unknown;
  /** Show coupon popup property. */
  showCouponPopup?: unknown;
  /** Auto coupon code property. */
  autoCouponCode?: unknown;
  /** Product image property. */
  productImage?: unknown;
  /** Shipping mode property. */
  shippingMode?: unknown;
  /** Shipping origin zip property. */
  shippingOriginZip?: unknown;
  /** Shipping variable min in cents property. */
  shippingVariableMinInCents?: unknown;
  /** Shipping variable max in cents property. */
  shippingVariableMaxInCents?: unknown;
  /** Shipping use kloel calculator property. */
  shippingUseKloelCalculator?: unknown;
  /** Affiliate custom commission enabled property. */
  affiliateCustomCommissionEnabled?: unknown;
  /** Affiliate custom commission type property. */
  affiliateCustomCommissionType?: unknown;
  /** Affiliate custom commission amount in cents property. */
  affiliateCustomCommissionAmountInCents?: unknown;
  /** Affiliate custom commission percent property. */
  affiliateCustomCommissionPercent?: unknown;
  [key: string]: unknown;
}

/** Plan payment config shape. */
export interface PlanPaymentConfig {
  /** Enable credit card property. */
  enableCreditCard: boolean;
  /** Enable pix property. */
  enablePix: boolean;
  /** Enable boleto property. */
  enableBoleto: boolean;
  /** Enable coupon property. */
  enableCoupon: boolean;
  /** Show coupon popup property. */
  showCouponPopup: boolean;
  /** Auto coupon code property. */
  autoCouponCode: string;
}

/** Derive default shipping mode. */
export function deriveDefaultShippingMode(
  planCheckoutConfig: PlanCheckoutConfig,
  hasFreeShipFlag: boolean,
  hasShippingPrice: boolean,
): string {
  const explicit = planCheckoutConfig.shippingMode;
  if (explicit) {
    return String(explicit);
  }
  if (hasFreeShipFlag) {
    return 'FREE';
  }
  return hasShippingPrice ? 'FIXED' : 'FREE';
}

/** Build plan payment config. */
export function buildPlanPaymentConfig(planCheckoutConfig: PlanCheckoutConfig): PlanPaymentConfig {
  return {
    enableCreditCard: planCheckoutConfig.enableCreditCard !== false,
    enablePix: planCheckoutConfig.enablePix !== false,
    enableBoleto: !!planCheckoutConfig.enableBoleto,
    enableCoupon: planCheckoutConfig.enableCoupon !== false,
    showCouponPopup: !!planCheckoutConfig.showCouponPopup,
    autoCouponCode: String(planCheckoutConfig.autoCouponCode || '').toUpperCase(),
  };
}

/** Normalize commission percent. */
export function normalizeCommissionPercent(
  planCheckoutConfig: PlanCheckoutConfig,
  fallbackProductCommission: unknown,
): string {
  const value =
    planCheckoutConfig.affiliateCustomCommissionPercent ?? fallbackProductCommission ?? 30;
  return String(value).replace('.', ',');
}

/** Checkout bump product shape. */
export interface CheckoutBumpProduct {
  /** Name property. */
  name?: string;
  /** Image url property. */
  imageUrl?: string;
  /** Images property. */
  images?: string[];
}

/** Checkout bump plan shape. */
export interface CheckoutBumpPlan {
  /** Name property. */
  name?: string;
  /** Price in cents property. */
  priceInCents?: unknown;
  /** Compare at price property. */
  compareAtPrice?: number | null;
  /** Checkout config property. */
  checkoutConfig?: { productImage?: string | null };
}

/** Create bump payload shape. */
export interface CreateBumpPayload {
  /** Title property. */
  title: string;
  /** Description property. */
  description: string;
  /** Product name property. */
  productName: string;
  /** Image property. */
  image?: string;
  /** Price in cents property. */
  priceInCents: number;
  /** Compare at price property. */
  compareAtPrice?: number | null;
  /** Checkbox label property. */
  checkboxLabel: string;
}

function resolveBumpImage(
  plan: CheckoutBumpPlan,
  product: CheckoutBumpProduct,
): string | undefined {
  return plan.checkoutConfig?.productImage || product.imageUrl || product.images?.[0] || undefined;
}

/** Build bump payload. */
export function buildBumpPayload(
  product: CheckoutBumpProduct,
  plan: CheckoutBumpPlan,
): CreateBumpPayload {
  const displayName = plan.name || product.name || '';
  return {
    title: displayName,
    description: `Oferta adicional do plano ${displayName}.`,
    productName: product.name || plan.name || '',
    image: resolveBumpImage(plan, product),
    priceInCents: Math.max(0, Math.round(Number(plan.priceInCents || 0))),
    compareAtPrice: plan.compareAtPrice || undefined,
    checkboxLabel: 'Sim, eu quero!',
  };
}
