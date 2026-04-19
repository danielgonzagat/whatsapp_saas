import { DiscountType } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

function buildPendingPlanToken(productId: string) {
  return `product:${productId}:pending-plans`;
}

function mapProductCouponTypeToCheckoutType(discountType: string | null | undefined): DiscountType {
  return String(discountType || '').toUpperCase() === 'FIXED'
    ? DiscountType.FIXED
    : DiscountType.PERCENTAGE;
}

function mapProductCouponValueToCheckoutValue(
  discountType: string | null | undefined,
  discountValue: number | null | undefined,
) {
  const numericValue = Number(discountValue || 0);
  if (String(discountType || '').toUpperCase() === 'FIXED') {
    return Math.max(0, Math.round(numericValue * 100));
  }

  return Math.max(0, Math.round(numericValue));
}

export async function findConflictingProductCouponInWorkspace(
  prisma: PrismaService,
  workspaceId: string,
  code: string,
  ignoreCouponId?: string,
) {
  return prisma.productCoupon.findFirst({
    where: {
      code,
      ...(ignoreCouponId ? { id: { not: ignoreCouponId } } : {}),
      product: {
        workspaceId,
      },
    },
    include: {
      product: {
        select: {
          id: true,
          name: true,
        },
      },
    },
  });
}

export async function syncWorkspaceCheckoutCouponForProduct(
  prisma: PrismaService,
  workspaceId: string,
  productId: string,
  couponCode: string,
) {
  const normalizedCode = String(couponCode || '')
    .trim()
    .toUpperCase();
  if (!normalizedCode) {
    return null;
  }

  const [productCoupon, checkoutPlans, existingCheckoutCoupon] = await Promise.all([
    prisma.productCoupon.findFirst({
      where: {
        productId,
        code: normalizedCode,
      },
    }),
    prisma.checkoutProductPlan.findMany({
      where: {
        productId,
        isActive: true,
        kind: 'PLAN',
      },
      select: {
        id: true,
      },
    }),
    prisma.checkoutCoupon.findUnique({
      where: {
        workspaceId_code: {
          workspaceId,
          code: normalizedCode,
        },
      },
    }),
  ]);

  if (!productCoupon) {
    if (existingCheckoutCoupon) {
      await prisma.checkoutCoupon.delete({
        where: {
          id: existingCheckoutCoupon.id,
        },
      });
    }

    return null;
  }

  const appliesTo = checkoutPlans.length
    ? checkoutPlans.map((plan) => plan.id)
    : [buildPendingPlanToken(productId)];

  const payload = {
    code: normalizedCode,
    discountType: mapProductCouponTypeToCheckoutType(productCoupon.discountType),
    discountValue: mapProductCouponValueToCheckoutValue(
      productCoupon.discountType,
      productCoupon.discountValue,
    ),
    maxUses: productCoupon.maxUses ?? null,
    expiresAt: productCoupon.expiresAt ?? null,
    appliesTo,
    isActive: Boolean(productCoupon.active) && checkoutPlans.length > 0,
  };

  if (existingCheckoutCoupon) {
    return prisma.checkoutCoupon.update({
      where: {
        id: existingCheckoutCoupon.id,
      },
      data: payload,
    });
  }

  return prisma.checkoutCoupon.create({
    data: {
      workspaceId,
      ...payload,
    },
  });
}

export async function syncAllWorkspaceCheckoutCouponsForProduct(
  prisma: PrismaService,
  workspaceId: string,
  productId: string,
) {
  const coupons = await prisma.productCoupon.findMany({
    where: {
      productId,
    },
    select: {
      code: true,
    },
  });

  // biome-ignore lint/performance/noAwaitInLoops: sequential coupon sync with external payment provider
  for (const coupon of coupons) {
    // biome-ignore lint/performance/noAwaitInLoops: per-coupon workspace sync must be sequential to avoid duplicate upserts
    await syncWorkspaceCheckoutCouponForProduct(prisma, workspaceId, productId, coupon.code);
  }
}
