/**
 * Pure helpers and Prisma include builders for CheckoutProductService.
 * Extracted to keep the service file under the architecture line budget.
 */
import type { Prisma } from '@prisma/client';

/** Build the deeply-nested include shape used to fetch a product with its plans. */
export function buildProductWithPlansInclude(): Prisma.ProductInclude {
  return {
    checkoutPlans: {
      include: {
        checkoutConfig: true,
        orderBumps: true,
        upsells: true,
        planLinks: {
          include: {
            checkout: {
              select: {
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
              },
            },
          },
          orderBy: [{ isPrimary: 'desc' }, { createdAt: 'asc' }],
        },
        checkoutLinks: {
          include: {
            plan: {
              select: {
                id: true,
                name: true,
                priceInCents: true,
                isActive: true,
              },
            },
          },
          orderBy: [{ isPrimary: 'desc' }, { createdAt: 'asc' }],
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
