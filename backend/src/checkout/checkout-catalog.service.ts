import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { AuditService } from '../audit/audit.service';
import { PrismaService } from '../prisma/prisma.service';
import { CheckoutCatalogConfigService } from './checkout-catalog-config.service';
import {
  VALID_CHARGE_TYPES,
  VALID_DISCOUNT_TYPES,
  VALID_PIXEL_TYPES,
  validateCouponHelper,
} from './checkout-catalog.helpers';

/** Manages order bumps, upsells, coupons, pixels, shipping and config reset. */
/** Idempotency: enforced at HTTP layer via @Idempotent() guard + Stripe idempotencyKey. */
@Injectable()
export class CheckoutCatalogService {
  private readonly logger = new Logger(CheckoutCatalogService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
    private readonly catalogConfigService: CheckoutCatalogConfigService,
  ) {}

  // ─── Order Bumps ──────────────────────────────────────────────────────────

  /** Create bump. */
  async createBump(
    planId: string,
    data: {
      title: string;
      description: string;
      productName: string;
      image?: string;
      priceInCents: number;
      compareAtPrice?: number;
      highlightColor?: string;
      checkboxLabel?: string;
      position?: string;
      sortOrder?: number;
    },
  ) {
    const plan = await this.prisma.checkoutProductPlan.findUnique({
      where: { id: planId },
      select: { id: true },
    });
    if (!plan) {
      throw new BadRequestException('Plan not found');
    }
    return this.prisma.orderBump.create({ data: { planId, ...data } });
  }

  /** Update bump. */
  async updateBump(id: string, data: Prisma.OrderBumpUpdateInput) {
    try {
      return await this.prisma.orderBump.update({ where: { id }, data });
    } catch (error: unknown) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2025') {
        throw new NotFoundException('OrderBump not found');
      }
      throw error;
    }
  }

  /** Delete bump. */
  async deleteBump(id: string, workspaceId?: string) {
    const existing = await this.prisma.orderBump.findUnique({
      where: { id },
      select: { id: true },
    });
    if (!existing) {
      throw new NotFoundException('OrderBump not found');
    }
    await this.auditService.log({
      workspaceId: workspaceId || 'unknown',
      action: 'DELETE_RECORD',
      resource: 'OrderBump',
      resourceId: id,
      details: { deletedBy: 'user' },
    });
    await this.prisma.orderBump.delete({ where: { id } });
    return { deleted: true };
  }

  /** List bumps. */
  async listBumps(planId: string) {
    return this.prisma.orderBump.findMany({
      where: { planId },
      select: {
        id: true,
        planId: true,
        title: true,
        description: true,
        productName: true,
        image: true,
        priceInCents: true,
        compareAtPrice: true,
        checkboxLabel: true,
        sortOrder: true,
        isActive: true,
        createdAt: true,
      },
      orderBy: { sortOrder: 'asc' },
      take: 20,
    });
  }

  // ─── Upsells ──────────────────────────────────────────────────────────────

  /** Create upsell. */
  async createUpsell(
    planId: string,
    data: {
      title: string;
      headline: string;
      description: string;
      productName: string;
      image?: string;
      priceInCents: number;
      compareAtPrice?: number;
      acceptBtnText?: string;
      declineBtnText?: string;
      timerSeconds?: number;
      chargeType?: 'ONE_CLICK' | 'NEW_PAYMENT';
      sortOrder?: number;
    },
  ) {
    if (data.chargeType && !VALID_CHARGE_TYPES.includes(data.chargeType)) {
      throw new BadRequestException(
        `Invalid chargeType: ${data.chargeType}. Must be one of: ${VALID_CHARGE_TYPES.join(', ')}`,
      );
    }

    const plan = await this.prisma.checkoutProductPlan.findUnique({
      where: { id: planId },
      select: { id: true },
    });
    if (!plan) {
      throw new BadRequestException('Plan not found');
    }

    return this.prisma.upsell.create({ data: { planId, ...data } });
  }

  /** Update upsell. */
  async updateUpsell(id: string, data: Prisma.UpsellUpdateInput) {
    try {
      return await this.prisma.upsell.update({ where: { id }, data });
    } catch (error: unknown) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2025') {
        throw new NotFoundException('Upsell not found');
      }
      throw error;
    }
  }

  /** Delete upsell. */
  async deleteUpsell(id: string, workspaceId?: string) {
    const existing = await this.prisma.upsell.findUnique({ where: { id }, select: { id: true } });
    if (!existing) {
      throw new NotFoundException('Upsell not found');
    }
    await this.auditService.log({
      workspaceId: workspaceId || 'unknown',
      action: 'DELETE_RECORD',
      resource: 'Upsell',
      resourceId: id,
      details: { deletedBy: 'user' },
    });
    await this.prisma.upsell.delete({ where: { id } });
    return { deleted: true };
  }

  /** List upsells. */
  async listUpsells(planId: string) {
    return this.prisma.upsell.findMany({
      where: { planId },
      select: {
        id: true,
        planId: true,
        title: true,
        headline: true,
        description: true,
        productName: true,
        priceInCents: true,
        sortOrder: true,
        isActive: true,
        createdAt: true,
      },
      orderBy: { sortOrder: 'asc' },
      take: 20,
    });
  }

  // ─── Coupons ──────────────────────────────────────────────────────────────

  /** Create coupon. */
  async createCoupon(
    workspaceId: string,
    data: {
      code: string;
      discountType: 'PERCENTAGE' | 'FIXED';
      discountValue: number;
      minOrderValue?: number;
      maxUses?: number;
      maxUsesPerUser?: number;
      startsAt?: Date;
      expiresAt?: Date;
      appliesTo?: Prisma.InputJsonValue;
    },
  ) {
    if (data.discountType && !VALID_DISCOUNT_TYPES.includes(data.discountType)) {
      throw new BadRequestException(
        `Invalid discountType: ${data.discountType}. Must be one of: ${VALID_DISCOUNT_TYPES.join(', ')}`,
      );
    }

    const existingCoupon = await this.prisma.checkoutCoupon.findUnique({
      where: { workspaceId_code: { workspaceId, code: data.code.toUpperCase() } },
    });
    if (existingCoupon) {
      return existingCoupon;
    }

    return this.prisma.checkoutCoupon.create({
      data: { workspaceId, ...data },
    });
  }

  /** Update coupon. */
  async updateCoupon(
    id: string,
    workspaceId: string | undefined,
    data: Prisma.CheckoutCouponUpdateInput,
  ) {
    if (!workspaceId) {
      throw new BadRequestException('workspaceId is required');
    }
    try {
      return await this.prisma.checkoutCoupon.update({
        where: { id, workspaceId },
        data,
      });
    } catch (error: unknown) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2025') {
        throw new NotFoundException('CheckoutCoupon not found');
      }
      throw error;
    }
  }

  /** Delete coupon. */
  async deleteCoupon(id: string, workspaceId?: string) {
    if (!workspaceId) {
      throw new BadRequestException('workspaceId is required');
    }
    const existing = await this.prisma.checkoutCoupon.findFirst({
      where: { id, workspaceId },
      select: { id: true },
    });
    if (!existing) {
      throw new NotFoundException('CheckoutCoupon not found');
    }
    await this.auditService.log({
      workspaceId,
      action: 'DELETE_RECORD',
      resource: 'CheckoutCoupon',
      resourceId: id,
      details: { deletedBy: 'user' },
    });
    await this.prisma.checkoutCoupon.deleteMany({ where: { id, workspaceId } });
    return { deleted: true };
  }

  /** List coupons. */
  async listCoupons(workspaceId: string) {
    return this.prisma.checkoutCoupon.findMany({
      where: { workspaceId },
      select: {
        id: true,
        workspaceId: true,
        code: true,
        discountType: true,
        discountValue: true,
        isActive: true,
        usedCount: true,
        maxUses: true,
        expiresAt: true,
        createdAt: true,
      },
      orderBy: { createdAt: 'desc' },
      take: 200,
    });
  }

  /** Validate coupon. */
  async validateCoupon(workspaceId: string, code: string, planId: string, orderValue: number) {
    this.logger.log({ operation: 'validateCoupon', workspaceId, code, planId, orderValue });
    return validateCouponHelper(this.prisma, workspaceId, code, planId, orderValue);
  }

  // ─── Pixels ───────────────────────────────────────────────────────────────

  /** Create pixel. */
  async createPixel(
    checkoutConfigId: string,
    data: {
      type:
        | 'FACEBOOK'
        | 'GOOGLE_ADS'
        | 'GOOGLE_ANALYTICS'
        | 'TIKTOK'
        | 'KWAI'
        | 'TABOOLA'
        | 'CUSTOM';
      pixelId: string;
      accessToken?: string;
      trackPageView?: boolean;
      trackInitiateCheckout?: boolean;
      trackAddPaymentInfo?: boolean;
      trackPurchase?: boolean;
    },
  ) {
    if (data.type && !VALID_PIXEL_TYPES.includes(data.type)) {
      throw new BadRequestException(
        `Invalid pixel type: ${data.type}. Must be one of: ${VALID_PIXEL_TYPES.join(', ')}`,
      );
    }

    const config = await this.prisma.checkoutConfig.findUnique({
      where: { id: checkoutConfigId },
      select: { id: true },
    });
    if (!config) {
      throw new BadRequestException('Checkout config not found');
    }

    return this.prisma.checkoutPixel.create({
      data: { checkoutConfigId, ...data },
    });
  }

  /** Update pixel. */
  async updatePixel(id: string, data: Prisma.CheckoutPixelUpdateInput) {
    try {
      return await this.prisma.checkoutPixel.update({ where: { id }, data });
    } catch (error: unknown) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2025') {
        throw new NotFoundException('CheckoutPixel not found');
      }
      throw error;
    }
  }

  /** Delete pixel. */
  async deletePixel(id: string, workspaceId?: string) {
    const existing = await this.prisma.checkoutPixel.findUnique({
      where: { id },
      select: { id: true },
    });
    if (!existing) {
      throw new NotFoundException('CheckoutPixel not found');
    }
    await this.auditService.log({
      workspaceId: workspaceId || 'unknown',
      action: 'DELETE_RECORD',
      resource: 'CheckoutPixel',
      resourceId: id,
      details: { deletedBy: 'user' },
    });
    await this.prisma.checkoutPixel.delete({ where: { id } });
    return { deleted: true };
  }

  // ─── Shipping ──────────────────────────────────────────────────────────────

  /** Calculate shipping. */
  async calculateShipping(slug: string, cep: string) {
    return this.catalogConfigService.calculateShipping(slug, cep);
  }

  // ─── Config Reset ─────────────────────────────────────────────────────────

  /** Reset config to defaults. */
  async resetConfig(planId: string) {
    return this.catalogConfigService.resetConfig(planId);
  }
}
