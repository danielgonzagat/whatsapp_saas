/**
 * Pure helpers extracted from CheckoutService.
 * Keeps the service file under the architecture line budget.
 */
import type { CreateCheckoutInput } from './checkout-product.types';

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
    maxInstallments: source.maxInstallments,
    installmentsFee: source.installmentsFee,
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

// ─── Plan-kind predicates ───────────────────────────────────────────────────

/** Minimal duck-type for plan-record predicates. */
export interface PlanLike {
  isActive?: boolean | null;
  kind?: string | null;
  legacyCheckoutEnabled?: boolean | null;
}

/**
 * True when the plan record is active, of PLAN kind, and eligible for
 * legacy checkout migration.
 */
export function isLegacyPlanEligibleForMigration(plan: PlanLike | null | undefined): boolean {
  return !!(plan?.isActive && plan.kind === 'PLAN' && plan.legacyCheckoutEnabled);
}

/** True when the plan record is active and of PLAN kind. */
export function isActivePlanKind(plan: PlanLike | null | undefined): boolean {
  return !!(plan?.isActive && plan.kind === 'PLAN');
}
