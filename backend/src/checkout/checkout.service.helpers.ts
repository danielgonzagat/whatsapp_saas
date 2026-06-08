/**
 * Pure helpers extracted from CheckoutService.
 * Keeps the service file under the architecture line budget.
 */
import type { Prisma } from '@prisma/client';
import type { CreateCheckoutInput } from './checkout-product.types';
import type { UnknownRecord } from '../common/types';

/** True when value is a finite number. */
function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

/**
 * Map a routing/resolver `args` record into the CreateCheckoutInput DTO.
 * Pure input coercion — applies the same defaults the service relied on
 * (name → 'Checkout', priceInCents → amount fallback → 0). Optional fields
 * stay undefined when absent so callers can spread cleanly.
 */
export function buildCreateCheckoutInput(args: UnknownRecord): CreateCheckoutInput {
  const priceInCents = isFiniteNumber(args.priceInCents)
    ? args.priceInCents
    : isFiniteNumber(args.amount)
      ? Math.round(args.amount)
      : 0;

  return {
    name: typeof args.name === 'string' ? args.name : 'Checkout',
    priceInCents,
    compareAtPrice: isFiniteNumber(args.compareAtPrice) ? args.compareAtPrice : undefined,
    currency: typeof args.currency === 'string' ? args.currency : undefined,
    maxInstallments: isFiniteNumber(args.maxInstallments) ? args.maxInstallments : undefined,
    installmentsFee: typeof args.installmentsFee === 'boolean' ? args.installmentsFee : undefined,
    quantity: isFiniteNumber(args.quantity) ? args.quantity : undefined,
    freeShipping: typeof args.freeShipping === 'boolean' ? args.freeShipping : undefined,
    shippingPrice: isFiniteNumber(args.shippingPrice) ? args.shippingPrice : undefined,
    brandName: typeof args.brandName === 'string' ? args.brandName : undefined,
  };
}

/** Strip the routing-only checkoutId key, returning the config payload subset. */
export function stripCheckoutId(args: UnknownRecord): UnknownRecord {
  const rest: UnknownRecord = {};
  for (const [key, value] of Object.entries(args)) {
    if (key !== 'checkoutId') {
      rest[key] = value;
    }
  }
  return rest;
}

/** Build the testimonials config-update payload from resolver args. */
export function buildTestimonialsConfig(args: UnknownRecord): Prisma.CheckoutConfigUpdateInput {
  const config: Prisma.CheckoutConfigUpdateInput = {};
  if (typeof args.enableTestimonials === 'boolean') {
    config.enableTestimonials = args.enableTestimonials;
  }
  if (typeof args.testimonials === 'string') {
    config.testimonials = args.testimonials;
  } else if (Array.isArray(args.testimonials)) {
    config.testimonials = args.testimonials as Prisma.InputJsonValue;
  }
  return config;
}

/** Build the money-back warranty/guarantee config-update payload from resolver args. */
export function buildWarrantyConfig(args: UnknownRecord): Prisma.CheckoutConfigUpdateInput {
  const config: Prisma.CheckoutConfigUpdateInput = {};
  if (typeof args.enableGuarantee === 'boolean') {
    config.enableGuarantee = args.enableGuarantee;
  }
  if (typeof args.guaranteeTitle === 'string') {
    config.guaranteeTitle = args.guaranteeTitle;
  }
  if (typeof args.guaranteeText === 'string') {
    config.guaranteeText = args.guaranteeText;
  }
  if (isFiniteNumber(args.guaranteeDays)) {
    config.guaranteeDays = args.guaranteeDays;
  }
  return config;
}

/** Payment-method literal accepted by the order service. */
type ResolverPaymentMethod = 'PIX' | 'CREDIT_CARD' | 'BOLETO';

/** Customer/contact fields parsed from resolver args for a manual order. */
export interface ResolverOrderCustomerFields {
  customerName: string;
  customerEmail: string;
  paymentMethod: ResolverPaymentMethod;
}

/**
 * Parse the non-financial customer/contact fields for a resolver-initiated
 * manual order. Amounts are resolved by the caller — this only coerces the
 * name / email / payment-method, applying the legacy defaults.
 */
export function buildResolverOrderCustomerFields(
  resolverArgs: UnknownRecord,
): ResolverOrderCustomerFields {
  return {
    customerName:
      typeof resolverArgs.customerName === 'string' ? resolverArgs.customerName : 'Venda Manual',
    customerEmail:
      typeof resolverArgs.customerEmail === 'string'
        ? resolverArgs.customerEmail
        : `venda-${Date.now()}@kloel.app`,
    paymentMethod:
      typeof resolverArgs.paymentMethod === 'string'
        ? (resolverArgs.paymentMethod as ResolverPaymentMethod)
        : 'PIX',
  };
}

/** Build the exit-intent popup config-update payload from resolver args. */
export function buildExitIntentConfig(args: UnknownRecord): Prisma.CheckoutConfigUpdateInput {
  const config: Prisma.CheckoutConfigUpdateInput = {};
  if (typeof args.enableExitIntent === 'boolean') {
    config.enableExitIntent = args.enableExitIntent;
  }
  if (typeof args.exitIntentTitle === 'string') {
    config.exitIntentTitle = args.exitIntentTitle;
  }
  if (typeof args.exitIntentDescription === 'string') {
    config.exitIntentDescription = args.exitIntentDescription;
  }
  if (typeof args.exitIntentCouponCode === 'string') {
    config.exitIntentCouponCode = args.exitIntentCouponCode;
  }
  return config;
}

/** Input shape for buildDuplicateCheckoutInput. */
export interface DuplicateCheckoutSource {
  name: string;
  priceInCents: number;
  currency: string;
  maxInstallments: number | null;
  installmentsFee: boolean | null;
  quantity: number;
  freeShipping: boolean;
  compareAtPrice: number | null;
  shippingPrice: number | null;
  checkoutConfig?: { brandName?: string | null } | null;
}

/** Build the CreateCheckoutInput for duplicating a checkout record. */
export function buildDuplicateCheckoutInput(source: DuplicateCheckoutSource): CreateCheckoutInput {
  const input: CreateCheckoutInput = {
    name: `${source.name} (Copia)`,
    priceInCents: source.priceInCents,
    currency: source.currency,
    maxInstallments: source.maxInstallments ?? undefined,
    installmentsFee: source.installmentsFee ?? undefined,
    quantity: source.quantity,
    freeShipping: source.freeShipping,
    brandName: source.checkoutConfig?.brandName ?? source.name,
  };

  if (source.compareAtPrice != null) {
    input.compareAtPrice = source.compareAtPrice;
  }
  if (source.shippingPrice != null) {
    input.shippingPrice = source.shippingPrice;
  }

  return input;
}

/**
 * Map original checkout pixels into createMany input rows for the duplicated config.
 * Generic over the pixel row shape so Prisma enum types (e.g. PixelType) flow
 * through from the caller without requiring an explicit Prisma import.
 */
export function mapPixelsForDuplicate<
  TPixel extends {
    type: unknown;
    pixelId: unknown;
    accessToken?: string | null;
    trackPageView?: boolean;
    trackInitiateCheckout?: boolean;
    trackAddPaymentInfo?: boolean;
    trackPurchase?: boolean;
  },
>(
  pixels: ReadonlyArray<TPixel>,
  checkoutConfigId: string,
): Array<{
  checkoutConfigId: string;
  type: TPixel['type'];
  pixelId: TPixel['pixelId'];
  accessToken: string | null;
  trackPageView: boolean;
  trackInitiateCheckout: boolean;
  trackAddPaymentInfo: boolean;
  trackPurchase: boolean;
}> {
  return pixels.map((pixel) => ({
    checkoutConfigId,
    type: pixel.type,
    pixelId: pixel.pixelId,
    accessToken: pixel.accessToken ?? null,
    trackPageView: pixel.trackPageView ?? true,
    trackInitiateCheckout: pixel.trackInitiateCheckout ?? true,
    trackAddPaymentInfo: pixel.trackAddPaymentInfo ?? true,
    trackPurchase: pixel.trackPurchase ?? true,
  }));
}

/** Strip Prisma metadata fields from a config record, leaving only business payload. */
export function stripConfigMetadata(config: Record<string, unknown>): Record<string, unknown> {
  const {
    id: _id,
    planId: _planId,
    pixels: _pixels,
    createdAt: _createdAt,
    updatedAt: _updatedAt,
    ...rest
  } = config;
  return rest;
}

// ─── Shared Prisma include objects ──────────────────────────────────────────

/**
 * Prisma include for checkoutPlanLink with full plan / product / pixels
 * cascade. Used by both slug-based and code-based public lookup flows.
 */
export const CHECKOUT_PLAN_LINK_INCLUDE = {
  checkout: { include: { checkoutConfig: { include: { pixels: true } } } },
  plan: {
    include: {
      product: true,
      checkoutConfig: { include: { pixels: true } },
      orderBumps: { where: { isActive: true }, orderBy: { sortOrder: 'asc' as const } },
      upsells: { where: { isActive: true }, orderBy: { sortOrder: 'asc' as const } },
    },
  },
};

/**
 * Prisma include for a solo plan lookup with product / config / bumps /
 * upsells cascade.
 */
export const PLAN_INCLUDE = {
  product: true,
  checkoutConfig: { include: { pixels: true } },
  orderBumps: { where: { isActive: true }, orderBy: { sortOrder: 'asc' as const } },
  upsells: { where: { isActive: true }, orderBy: { sortOrder: 'asc' as const } },
};

/**
 * Prisma include for listing CHECKOUT records with their config and the
 * linked plans (id/name/price/active) ordered primary-first. Shared by the
 * workspace-wide `list` and per-product `findByProduct` flows.
 */
export const CHECKOUT_LIST_INCLUDE = {
  checkoutConfig: true,
  checkoutLinks: {
    include: {
      plan: { select: { id: true, name: true, priceInCents: true, isActive: true } },
    },
    orderBy: [{ isPrimary: 'desc' as const }, { createdAt: 'asc' as const }],
  },
};

// ─── Plan-kind predicates ───────────────────────────────────────────────────

/** Minimal duck-type for plan-record predicates. */
export interface PlanLike {
  isActive?: boolean | null;
  kind?: string | null;
  legacyCheckoutEnabled?: boolean | null;
  product?: {
    active?: boolean | null;
    status?: string | null;
  } | null;
}

export const PUBLIC_CHECKOUT_PRODUCT_WHERE = { active: true, status: 'APPROVED' } as const;

function hasPublishedProduct(plan: PlanLike | null | undefined): boolean {
  return !!(
    plan?.product?.active === PUBLIC_CHECKOUT_PRODUCT_WHERE.active &&
    plan.product.status === PUBLIC_CHECKOUT_PRODUCT_WHERE.status
  );
}

/**
 * True when the plan record is active, of PLAN kind, backed by a published
 * product, and eligible for legacy checkout migration.
 */
export function isLegacyPlanEligibleForMigration(plan: PlanLike | null | undefined): boolean {
  return !!(
    plan?.isActive &&
    plan.kind === 'PLAN' &&
    plan.legacyCheckoutEnabled &&
    hasPublishedProduct(plan)
  );
}

/** True when the plan record is active, of PLAN kind, and commercially published. */
export function isActivePlanKind(plan: PlanLike | null | undefined): boolean {
  return !!(plan?.isActive && plan.kind === 'PLAN' && hasPublishedProduct(plan));
}
