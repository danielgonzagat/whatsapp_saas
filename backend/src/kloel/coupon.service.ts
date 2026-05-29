import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

type ToolResult = {
  success: boolean;
  message?: string;
  error?: string;
  [key: string]: unknown;
};

@Injectable()
export class CouponService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Create a coupon, workspace-scoped through product ownership.
   * Resolver-compatible 2-arg signature: (workspaceId, args).
   */
  async create(
    workspaceId: string,
    args: {
      productId: string;
      code: string;
      discountType: string;
      discountValue: number;
      maxUses?: number;
      expiresInDays?: number;
      usageLimit?: number;
    },
  ): Promise<ToolResult> {
    const productId = String(args.productId ?? '');
    const code = String(args.code ?? '').trim();
    const discountType = String(args.discountType ?? 'percentage');
    const discountValue = Number(args.discountValue ?? 0);
    const maxUses = args.maxUses ?? args.usageLimit ?? null;
    const expiresAt = args.expiresInDays
      ? new Date(Date.now() + args.expiresInDays * 86400000)
      : null;

    if (!productId || !code) {
      return { success: false, error: 'productId and code are required' };
    }

    // Workspace isolation: verify product belongs to workspace
    const product = await this.prisma.product.findFirst({
      where: { id: productId, workspaceId },
      select: { id: true },
    });
    if (!product) {
      throw new NotFoundException('Product not found in workspace');
    }

    const coupon = await this.prisma.productCoupon.create({
      data: {
        productId,
        code,
        discountType,
        discountValue,
        maxUses,
        expiresAt,
        active: true,
      },
    });

    return {
      success: true,
      coupon: {
        id: coupon.id,
        code: coupon.code,
        discountType: coupon.discountType,
        discountValue: coupon.discountValue,
        active: coupon.active,
        expiresAt: coupon.expiresAt,
      },
    };
  }

  /**
   * Update a coupon, workspace-scoped through product ownership.
   * Resolver-compatible 2-arg signature: (workspaceId, args).
   */
  async update(
    workspaceId: string,
    args: {
      couponId: string;
      active?: boolean;
      discountValue?: number;
      discountType?: string;
      maxUses?: number;
      expiresAt?: string;
      code?: string;
    },
  ): Promise<ToolResult> {
    const couponId = String(args.couponId ?? '').trim();
    if (!couponId) {
      return { success: false, error: 'couponId is required' };
    }

    // Workspace isolation: verify coupon's product belongs to workspace
    const existing = await this.prisma.productCoupon.findFirst({
      where: { id: couponId, product: { workspaceId } },
    });
    if (!existing) {
      throw new NotFoundException('Coupon not found in workspace');
    }

    const data: Record<string, unknown> = {};
    if (args.active !== undefined) {
      data.active = args.active;
    }
    if (args.discountValue !== undefined) {
      data.discountValue = Number(args.discountValue);
    }
    if (args.discountType !== undefined) {
      data.discountType = String(args.discountType);
    }
    if (args.maxUses !== undefined) {
      data.maxUses = Number(args.maxUses);
    }
    if (args.code !== undefined) {
      data.code = String(args.code).trim();
    }
    if (args.expiresAt !== undefined) {
      data.expiresAt = new Date(String(args.expiresAt));
    }

    if (Object.keys(data).length === 0) {
      return { success: false, error: 'no_fields_to_update' };
    }

    const updated = await this.prisma.productCoupon.update({
      where: { id: couponId },
      data,
    });

    return {
      success: true,
      coupon: {
        id: updated.id,
        code: updated.code,
        discountType: updated.discountType,
        discountValue: updated.discountValue,
        active: updated.active,
        expiresAt: updated.expiresAt,
      },
    };
  }

  /**
   * Delete a coupon, workspace-scoped through product ownership.
   * Resolver-compatible 2-arg signature: (workspaceId, args).
   */
  async delete(workspaceId: string, args: { couponId: string }): Promise<ToolResult> {
    const couponId = String(args.couponId ?? '').trim();
    if (!couponId) {
      return { success: false, error: 'couponId is required' };
    }

    // Workspace isolation: verify coupon's product belongs to workspace
    const existing = await this.prisma.productCoupon.findFirst({
      where: { id: couponId, product: { workspaceId } },
    });
    if (!existing) {
      throw new NotFoundException('Coupon not found in workspace');
    }

    await this.prisma.productCoupon.delete({ where: { id: couponId } });
    return { success: true, message: `Cupom "${existing.code}" removido.` };
  }

  /**
   * List coupons, optionally filtered by productId.
   */
  async list(_workspaceId: string, productId?: string): Promise<ToolResult> {
    const coupons = await this.prisma.productCoupon.findMany({
      where: { ...(productId ? { productId } : {}) },
      select: {
        id: true,
        code: true,
        discountType: true,
        discountValue: true,
        active: true,
        expiresAt: true,
      },
    });
    return { success: true, coupons };
  }

  /**
   * Validate a coupon code for a product.
   */
  async validate(productId: string, code: string): Promise<ToolResult> {
    const coupon = await this.prisma.productCoupon.findFirst({
      where: {
        productId,
        code,
        active: true,
        OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
      },
    });
    if (!coupon) {
      return { success: false, error: 'coupon_invalid_or_expired' };
    }
    return {
      success: true,
      coupon: {
        id: coupon.id,
        code: coupon.code,
        discountType: coupon.discountType,
        discountValue: coupon.discountValue,
      },
    };
  }
}
