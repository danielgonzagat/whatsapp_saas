import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class CouponService {
  constructor(private readonly prisma: PrismaService) {}

  async create(_workspaceId: string, data: { productId: string; code: string; discountType: string; discountValue: number; maxUses?: number; expiresInDays?: number }) {
    const expiresAt = data.expiresInDays ? new Date(Date.now() + data.expiresInDays * 86400000) : null;
    const coupon = await this.prisma.productCoupon.create({
      data: { productId: data.productId, code: data.code, discountType: data.discountType, discountValue: data.discountValue, maxUses: data.maxUses ?? null, expiresAt, active: true },
    });
    return { success: true, coupon: { id: coupon.id, code: coupon.code, discountType: coupon.discountType, discountValue: coupon.discountValue } };
  }

  async list(_workspaceId: string, productId?: string) {
    const coupons = await this.prisma.productCoupon.findMany({
      where: { ...(productId ? { productId } : {}) },
      select: { id: true, code: true, discountType: true, discountValue: true, active: true, expiresAt: true },
    });
    return { success: true, coupons };
  }

  async validate(productId: string, code: string) {
    const coupon = await this.prisma.productCoupon.findFirst({
      where: { productId, code, active: true, OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }] },
    });
    if (!coupon) {return { success: false, error: 'coupon_invalid_or_expired' };}
    return { success: true, coupon: { id: coupon.id, code: coupon.code, discountType: coupon.discountType, discountValue: coupon.discountValue } };
  }

  async delete(_workspaceId: string, couponId: string) {
    const coupon = await this.prisma.productCoupon.findFirst({ where: { id: couponId } });
    if (!coupon) {return { success: false, error: 'coupon_not_found' };}
    await this.prisma.productCoupon.delete({ where: { id: couponId } });
    return { success: true, message: `Cupom "${coupon.code}" removido.` };
  }
}
