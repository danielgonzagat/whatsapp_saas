import type {
  PublicCheckoutConfig,
  PublicCheckoutMerchantInfo,
  PublicCheckoutPlan,
  PublicCheckoutProduct,
} from '@/lib/public-checkout-contract';
import { type CreateOrderData } from './useCheckout';
import type { CheckoutExperienceFormState } from './useCheckoutExperience.types';
import {
  resolvePaymentMethodCode,
  resolveShippingMethodLabel,
} from './useCheckoutExperience.utils';

/** Parameters used to assemble a CreateOrderData payload from checkout state. */
export interface BuildOrderPayloadParams {
  checkoutCode: string | undefined;
  form: {
    name: string;
    email: string;
    cpf: string;
    phone: string;
    cep: string;
    street: string;
    number: string;
    neighborhood: string;
    complement: string;
    city: string;
    state: string;
    destinatario: string;
    cardName: string;
  };
  payMethod: 'card' | 'pix' | 'boleto';
  shippingMode: string;
  shippingInCents: number;
  qty: number;
  subtotal: number;
  discount: number;
  total: number;
  couponApplied: boolean;
  couponCode: string;
  installments: number;
  affiliateWorkspaceId?: string | undefined;
  acceptedBumps?: string[] | undefined;
  bumpTotalInCents?: number | undefined;
}

/** Build the CreateOrderData payload that finalizeOrder sends to the backend. */
export function buildOrderPayload(
  resolvedPlanId: string,
  resolvedWorkspaceId: string,
  params: BuildOrderPayloadParams,
): CreateOrderData {
  const payload: CreateOrderData = {
    planId: resolvedPlanId,
    workspaceId: resolvedWorkspaceId,
    checkoutCode: params.checkoutCode,
    customerName: params.form.name.trim(),
    customerEmail: params.form.email.trim(),
    customerCPF: params.form.cpf,
    customerPhone: params.form.phone,
    shippingAddress: {
      cep: params.form.cep,
      street: params.form.street,
      number: params.form.number,
      neighborhood: params.form.neighborhood,
      complement: params.form.complement,
      city: params.form.city,
      state: params.form.state,
      destinatario: params.form.destinatario || params.form.name,
    },
    shippingMethod: resolveShippingMethodLabel(params.shippingMode, params.shippingInCents),
    shippingPrice: params.shippingInCents,
    orderQuantity: params.qty,
    subtotalInCents: params.subtotal,
    discountInCents: params.discount,
    totalInCents: params.total,
    couponCode: params.couponApplied ? params.couponCode : undefined,
    couponDiscount: params.couponApplied ? params.discount : undefined,
    paymentMethod: resolvePaymentMethodCode(params.payMethod),
    installments: params.payMethod === 'card' ? params.installments : 1,
    affiliateId: params.affiliateWorkspaceId,
    acceptedBumps:
      params.acceptedBumps && params.acceptedBumps.length > 0 ? params.acceptedBumps : undefined,
    bumpTotalInCents: params.bumpTotalInCents ? params.bumpTotalInCents : undefined,
  };

  if (params.payMethod === 'card') {
    payload.cardHolderName = params.form.cardName || params.form.name;
  }
  return payload;
}

/** Map a successful createOrder response onto the next-step redirect path. */
export function resolveSuccessRedirect(
  result: Record<string, unknown>,
  payMethod: string,
): string | null {
  const data = result?.data as Record<string, unknown> | undefined;
  const orderId = result?.id || data?.id;
  if (!orderId) {
    return null;
  }
  if (payMethod === 'pix') {
    return `/order/${orderId}/pix`;
  }
  if (payMethod === 'boleto') {
    return `/order/${orderId}/boleto`;
  }
  const paymentData = result?.paymentData as Record<string, unknown> | undefined;
  const planData = result?.plan as Record<string, unknown> | undefined;
  if (
    paymentData?.approved &&
    Array.isArray(planData?.upsells) &&
    (planData.upsells as unknown[]).length > 0
  ) {
    return `/order/${orderId}/upsell`;
  }
  return `/order/${orderId}/success`;
}

/**
 * Resolve the headline product name shown in the checkout summary.
 * Precedence: config override → plan name → product name → static default.
 */
export function resolveProductName(
  config: PublicCheckoutConfig | undefined,
  plan: PublicCheckoutPlan | undefined,
  product: PublicCheckoutProduct | undefined,
  fallback: string,
): string {
  return config?.productDisplayName || plan?.name || product?.name || fallback;
}

/**
 * Resolve the brand label used in copy, footer, and testimonial normalization.
 * Precedence: config override → merchant company → merchant workspace → product name → static default.
 */
export function resolveBrandName(
  config: PublicCheckoutConfig | undefined,
  merchant: PublicCheckoutMerchantInfo | undefined,
  product: PublicCheckoutProduct | undefined,
  fallback: string,
): string {
  return (
    config?.brandName ||
    merchant?.companyName ||
    merchant?.workspaceName ||
    product?.name ||
    fallback
  );
}

/** Resolve the unit price (in cents) for the active plan, clamped to a non-negative integer. */
export function resolveUnitPriceInCents(
  plan: PublicCheckoutPlan | undefined,
  fallback: number,
): number {
  return Math.max(0, Math.round(Number(plan?.priceInCents || fallback)));
}

/** Resolve the fixed shipping cost (in cents) advertised by the plan, clamped non-negative. */
export function resolveFixedShippingInCents(plan: PublicCheckoutPlan | undefined): number {
  return Math.max(0, Math.round(Number(plan?.shippingPrice || 0)));
}

/** Resolve the floor (in cents) used when shipping is dynamically computed. */
export function resolveVariableShippingFloorInCents(
  config: PublicCheckoutConfig | undefined,
): number {
  return Math.max(0, Math.round(Number(config?.shippingVariableMinInCents || 0)));
}

/** Subtotal = unitPriceInCents × qty (no clamping; caller controls inputs). */
export function computeSubtotal(unitPriceInCents: number, qty: number): number {
  return unitPriceInCents * qty;
}

/** Total = max(0, subtotal + shipping − discount). */
export function computeTotal(
  subtotal: number,
  shippingInCents: number,
  discount: number,
): number {
  return Math.max(0, subtotal + shippingInCents - discount);
}

/**
 * Parse a free-form installments string (from a select element) into a positive integer.
 * Empty / invalid / NaN / negative input collapses to 1 — matches the legacy `|| 1` chain.
 */
export function parseInstallments(raw: string | undefined | null): number {
  const parsed = Number.parseInt((raw || '1').toString(), 10);
  return Math.max(1, Number.isFinite(parsed) ? parsed : 1);
}

/** Canonicalize the auto-coupon code: trim whitespace and upper-case. */
export function normalizePopupCouponCode(autoCouponCode: string | undefined): string {
  return String(autoCouponCode || '').trim().toUpperCase();
}

/**
 * The coupon-popup may run when the coupon flow is enabled, the popup is opted-in,
 * and a non-empty popup code is configured.
 */
export function isCouponPopupEligible(
  config: PublicCheckoutConfig | undefined,
  popupCouponCode: string,
): boolean {
  return (
    config?.enableCoupon !== false &&
    config?.showCouponPopup === true &&
    Boolean(popupCouponCode)
  );
}

/**
 * Build the legal footer line. Honors config override; otherwise builds the
 * "Copyright {year} {company}{ - CNPJ: {cnpj}}" pattern used by the marketing shell.
 * `currentYear` is injected so the helper stays pure / deterministic in tests.
 */
export function resolveFooterLegal(
  config: PublicCheckoutConfig | undefined,
  merchant: PublicCheckoutMerchantInfo | undefined,
  brandName: string,
  formatCnpj: (value?: string | null) => string,
  currentYear: number,
): string {
  if (config?.footerText) {
    return config.footerText;
  }
  const company = merchant?.companyName || brandName;
  const cnpjSuffix = merchant?.cnpj ? ` - CNPJ: ${formatCnpj(merchant.cnpj)}` : '';
  return `Copyright ${currentYear} ${company}${cnpjSuffix}`;
}

/** Resolve the bold header line, defaulting to the marketing copy. */
export function resolveHeaderPrimary(config: PublicCheckoutConfig | undefined): string {
  return config?.headerMessage || 'Envio Imediato após o Pagamento';
}

/** Resolve the secondary header line, defaulting to the marketing copy. */
export function resolveHeaderSecondary(config: PublicCheckoutConfig | undefined): string {
  return config?.headerSubMessage || 'OFERTA ESPECIAL DO MÊS!!!';
}

const DIGITS_RE = /\D/g;

/**
 * Step-1 validity gate (personal data). Mirrors the hook's `validateStep1`:
 * - name + email required (after trim)
 * - cpf ≥ 11 digits when `requireCPF` is not explicitly false
 * - phone ≥ 10 digits when `requirePhone` is not explicitly false
 */
export function isStep1Valid(
  form: Pick<CheckoutExperienceFormState, 'name' | 'email' | 'cpf' | 'phone'>,
  config: PublicCheckoutConfig | undefined,
): boolean {
  if (!form.name.trim() || !form.email.trim()) {
    return false;
  }
  if ((config?.requireCPF ?? true) && form.cpf.replace(DIGITS_RE, '').length < 11) {
    return false;
  }
  if ((config?.requirePhone ?? true) && form.phone.replace(DIGITS_RE, '').length < 10) {
    return false;
  }
  return true;
}

/** Step-2 validity gate (shipping address). All address fields must be non-empty after trim. */
export function isStep2Valid(
  form: Pick<
    CheckoutExperienceFormState,
    'cep' | 'street' | 'number' | 'neighborhood' | 'city' | 'state'
  >,
): boolean {
  return Boolean(
    form.cep.trim() &&
      form.street.trim() &&
      form.number.trim() &&
      form.neighborhood.trim() &&
      form.city.trim() &&
      form.state.trim(),
  );
}

/** Convert a thrown value into a user-facing message for the finalizeOrder failure path. */
export function resolveSubmitErrorMessage(error: unknown): string {
  return error instanceof Error
    ? error.message
    : 'Erro ao processar o checkout. Tente novamente.';
}
