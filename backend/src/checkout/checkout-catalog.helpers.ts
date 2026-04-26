/**
 * Pure helpers for CheckoutCatalogService — coupon validation, enum guards.
 * Extracted to keep the service file under the architecture line budget.
 */
import type { PrismaService } from '../prisma/prisma.service';

export const VALID_CHARGE_TYPES: readonly string[] = ['ONE_CLICK', 'NEW_PAYMENT'];
export const VALID_DISCOUNT_TYPES: readonly string[] = ['PERCENTAGE', 'FIXED'];
export const VALID_PIXEL_TYPES: readonly string[] = [
  'FACEBOOK',
  'GOOGLE_ADS',
  'GOOGLE_ANALYTICS',
  'TIKTOK',
  'KWAI',
  'TABOOLA',
  'CUSTOM',
];

export interface CouponValidationResult {
  valid: boolean;
  message?: string;
  code?: string;
  discountType?: string;
  discountValue?: number;
  discountAmount?: number;
}

const INVALID_RESULT: CouponValidationResult = {
  valid: false,
  message: 'Cupom invalido ou expirado',
};

interface CouponLike {
  code: string;
  discountType: string;
  discountValue: number;
  isActive: boolean;
  usedCount: number;
  maxUses: number | null;
  minOrderValue: number | null;
  startsAt: Date | null;
  expiresAt: Date | null;
  appliesTo: unknown;
}

function isCouponEligible(coupon: CouponLike, planId: string, orderValue: number): boolean {
  if (!coupon.isActive) return false;
  const now = new Date();
  if (coupon.startsAt && coupon.startsAt > now) return false;
  if (coupon.expiresAt && coupon.expiresAt < now) return false;
  if (coupon.maxUses && coupon.usedCount >= coupon.maxUses) return false;
  if (coupon.minOrderValue && orderValue < coupon.minOrderValue) return false;
  const appliesTo = coupon.appliesTo as string[] | null;
  if (appliesTo && appliesTo.length > 0 && !appliesTo.includes(planId)) return false;
  return true;
}

function computeDiscountAmount(coupon: CouponLike, orderValue: number): number {
  const raw =
    coupon.discountType === 'PERCENTAGE'
      ? Math.round((orderValue * coupon.discountValue) / 100)
      : coupon.discountValue;
  return Math.min(raw, orderValue);
}

/** Validate and price a coupon for a given plan and order value. */
export async function validateCouponHelper(
  prisma: PrismaService,
  workspaceId: string,
  code: string,
  planId: string,
  orderValue: number,
): Promise<CouponValidationResult> {
  const coupon = await prisma.checkoutCoupon.findUnique({
    where: { workspaceId_code: { workspaceId, code: code.toUpperCase() } },
  });
  if (!coupon || !isCouponEligible(coupon as CouponLike, planId, orderValue)) {
    return INVALID_RESULT;
  }
  return {
    valid: true,
    code: coupon.code,
    discountType: coupon.discountType,
    discountValue: coupon.discountValue,
    discountAmount: computeDiscountAmount(coupon as CouponLike, orderValue),
  };
}
