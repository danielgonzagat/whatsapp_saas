// Pure helpers extracted from ProductNerveCenter.tsx to reduce cyclomatic
// complexity of the product-sync and plan-checkout-config sync useEffects.
// Behaviour is byte-identical to the original inline implementation.

export interface ProductSyncTargets {
  setEditName: (value: string) => void;
  setEditDesc: (value: string) => void;
  setEditCategory: (value: string) => void;
  setEditTags: (value: string) => void;
  setEditWarranty: (value: number) => void;
  setEditSalesUrl: (value: string) => void;
  setEditThankUrl: (value: string) => void;
  setEditThankPix: (value: string) => void;
  setEditThankBoleto: (value: string) => void;
  setEditReclame: (value: string) => void;
  setEditSupportEmail: (value: string) => void;
  setEditActive: (value: boolean) => void;
  setEditFormat: (value: string) => void;
}

/** Product sync source shape. */
export interface ProductSyncSource {
  name?: string | null;
  description?: string | null;
  category?: string | null;
  tags?: unknown;
  warrantyDays?: number | null;
  salesPageUrl?: string | null;
  thankyouUrl?: string | null;
  thankyouPixUrl?: string | null;
  thankyouBoletoUrl?: string | null;
  reclameAquiUrl?: string | null;
  supportEmail?: string | null;
  active?: boolean | null;
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
  enableCreditCard?: unknown;
  enablePix?: unknown;
  enableBoleto?: unknown;
  enableCoupon?: unknown;
  showCouponPopup?: unknown;
  autoCouponCode?: unknown;
  productImage?: unknown;
  shippingMode?: unknown;
  shippingOriginZip?: unknown;
  shippingVariableMinInCents?: unknown;
  shippingVariableMaxInCents?: unknown;
  shippingUseKloelCalculator?: unknown;
  affiliateCustomCommissionEnabled?: unknown;
  affiliateCustomCommissionType?: unknown;
  affiliateCustomCommissionAmountInCents?: unknown;
  affiliateCustomCommissionPercent?: unknown;
  [key: string]: unknown;
}

/** Plan payment config shape. */
export interface PlanPaymentConfig {
  enableCreditCard: boolean;
  enablePix: boolean;
  enableBoleto: boolean;
  enableCoupon: boolean;
  showCouponPopup: boolean;
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
  name?: string;
  imageUrl?: string;
  images?: string[];
}

/** Checkout bump plan shape. */
export interface CheckoutBumpPlan {
  name?: string;
  priceInCents?: unknown;
  compareAtPrice?: number | null;
  checkoutConfig?: { productImage?: string | null };
}

/** Create bump payload shape. */
export interface CreateBumpPayload {
  title: string;
  description: string;
  productName: string;
  image?: string;
  priceInCents: number;
  compareAtPrice?: number | null;
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
