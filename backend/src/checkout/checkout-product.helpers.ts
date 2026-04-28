/**
 * Pure helpers and Prisma include builders for CheckoutProductService.
 * Extracted to keep the service file under the architecture line budget.
 */
import type { Prisma } from '@prisma/client';

const PLAN_LINK_CHECKOUT_SELECT = {
  id: true,
  name: true,
  isActive: true,
  checkoutConfig: {
    select: {
      theme: true,
      enableCreditCard: true,
      enablePix: true,
      enableBoleto: true,
    },
  },
} as const;

const CHECKOUT_LINK_PLAN_SELECT = {
  id: true,
  name: true,
  priceInCents: true,
  isActive: true,
} as const;

const PRIMARY_THEN_CREATED_ORDER = [
  { isPrimary: 'desc' },
  { createdAt: 'asc' },
] as const satisfies ReadonlyArray<Prisma.CheckoutPlanLinkOrderByWithRelationInput>;

/** Build the deeply-nested include shape used to fetch a product with its plans. */
export function buildProductWithPlansInclude(): Prisma.ProductInclude {
  return {
    checkoutPlans: {
      include: {
        checkoutConfig: true,
        orderBumps: true,
        upsells: true,
        planLinks: {
          include: { checkout: { select: PLAN_LINK_CHECKOUT_SELECT } },
          orderBy: [...PRIMARY_THEN_CREATED_ORDER],
        },
        checkoutLinks: {
          include: { plan: { select: CHECKOUT_LINK_PLAN_SELECT } },
          orderBy: [...PRIMARY_THEN_CREATED_ORDER],
        },
      },
    },
  };
}

/** Apply business rules to a CheckoutConfig update payload (coupon flags, autoCouponCode). */
export function normalizeCheckoutConfigUpdate(
  data: Prisma.CheckoutConfigUpdateInput,
): Prisma.CheckoutConfigUpdateInput {
  const normalized: Prisma.CheckoutConfigUpdateInput = { ...data };

  if (typeof data.autoCouponCode === 'string') {
    normalized.autoCouponCode = data.autoCouponCode.trim().toUpperCase() || null;
  }
  if (data.enableCoupon === false) {
    normalized.showCouponPopup = false;
    normalized.autoCouponCode = null;
  }
  if (data.showCouponPopup === false) {
    normalized.autoCouponCode = null;
  }

  return normalized;
}
