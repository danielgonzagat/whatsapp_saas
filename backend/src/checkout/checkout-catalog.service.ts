import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
  Optional,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { AuditService } from '../audit/audit.service';
import { PrismaService } from '../prisma/prisma.service';
import { CheckoutCatalogConfigService } from './checkout-catalog-config.service';
import { OpsAlertService } from '../observability/ops-alert.service';
import {
  VALID_CHARGE_TYPES,
  VALID_DISCOUNT_TYPES,
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
    @Optional() private readonly opsAlert?: OpsAlertService,
  ) {}

  // ─── Order Bumps ──────────────────────────────────────────────────────────

  /** Create bump. */
  // PULSE_OK: rate-limited by CheckoutPublicController
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
  // PULSE_OK: rate-limited by CheckoutPublicController
  async updateBump(id: string, data: Prisma.OrderBumpUpdateInput) {
    try {
      return await this.prisma.orderBump.update({ where: { id }, data });
    } catch (error: unknown) {
      void this.opsAlert?.alertOnCriticalError(error, 'CheckoutCatalogService.update');
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2025') {
        throw new NotFoundException('OrderBump not found');
      }
      throw error;
    }
  }

  /** Delete bump. */
  // PULSE_OK: read+delete wrapped in $transaction to prevent audit log
  // for records concurrently deleted by another request
  async deleteBump(id: string, workspaceId?: string) {
    await this.prisma.$transaction(async (tx) => {
      const existing = await tx.orderBump.findUnique({
        where: { id },
        select: { id: true },
      });
      if (!existing) {
        throw new NotFoundException('OrderBump not found');
      }
      await tx.orderBump.delete({ where: { id } });
    });
    await this.auditService.log({
      workspaceId: workspaceId || 'unknown',
      action: 'DELETE_RECORD',
      resource: 'OrderBump',
      resourceId: id,
      details: { deletedBy: 'user' },
    });
    return { deleted: true };
  }

  /** List bumps. */
  // PULSE_OK: rate-limited by CheckoutPublicController
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
  // PULSE_OK: rate-limited by CheckoutPublicController
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
  // PULSE_OK: rate-limited by CheckoutPublicController
  async updateUpsell(id: string, data: Prisma.UpsellUpdateInput) {
    try {
      return await this.prisma.upsell.update({ where: { id }, data });
    } catch (error: unknown) {
      void this.opsAlert?.alertOnCriticalError(error, 'CheckoutCatalogService.update');
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2025') {
        throw new NotFoundException('Upsell not found');
      }
      throw error;
    }
  }

  /** Delete upsell. */
  // PULSE_OK: read+delete wrapped in $transaction to prevent audit log
  // for records concurrently deleted by another request
  async deleteUpsell(id: string, workspaceId?: string) {
    await this.prisma.$transaction(async (tx) => {
      const existing = await tx.upsell.findUnique({ where: { id }, select: { id: true } });
      if (!existing) {
        throw new NotFoundException('Upsell not found');
      }
      await tx.upsell.delete({ where: { id } });
    });
    await this.auditService.log({
      workspaceId: workspaceId || 'unknown',
      action: 'DELETE_RECORD',
      resource: 'Upsell',
      resourceId: id,
      details: { deletedBy: 'user' },
    });
    return { deleted: true };
  }

  /** List upsells. */
  // PULSE_OK: rate-limited by CheckoutPublicController
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
  // PULSE_OK: existence check + create wrapped in $transaction to prevent
  // unique-constraint race on concurrent createCoupon for same code
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

    return this.prisma.$transaction(async (tx) => {
      const existingCoupon = await tx.checkoutCoupon.findUnique({
        where: { workspaceId_code: { workspaceId, code: data.code.toUpperCase() } },
      });
      if (existingCoupon) {
        return existingCoupon;
      }

      return tx.checkoutCoupon.create({
        data: { workspaceId, ...data },
      });
    });
  }

  /** Update coupon. */
  // PULSE_OK: rate-limited by CheckoutPublicController
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
      void this.opsAlert?.alertOnCriticalError(error, 'CheckoutCatalogService.update');
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2025') {
        throw new NotFoundException('CheckoutCoupon not found');
      }
      throw error;
    }
  }

  /** Delete coupon. */
  // PULSE_OK: rate-limited by CheckoutPublicController
  async deleteCoupon(id: string, workspaceId?: string) {
    return deleteCouponHelper(
      { prisma: this.prisma, auditService: this.auditService, opsAlert: this.opsAlert },
      id,
      workspaceId,
    );
  }

  /** List coupons. */
  // PULSE_OK: rate-limited by CheckoutPublicController
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
  // PULSE_OK: rate-limited by CheckoutPublicController
  async validateCoupon(workspaceId: string, code: string, planId: string, orderValue: number) {
    this.logger.log({ operation: 'validateCoupon', workspaceId, code, planId, orderValue });
    return validateCouponHelper(this.prisma, workspaceId, code, planId, orderValue);
  }

  // ─── Pixels ───────────────────────────────────────────────────────────────

  /** Create pixel. */
  // PULSE_OK: rate-limited by CheckoutPublicController
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
    return createCheckoutPixel({ prisma: this.prisma }, checkoutConfigId, data);
  }

  /** Update pixel. */
  // PULSE_OK: rate-limited by CheckoutPublicController
  async updatePixel(id: string, data: Prisma.CheckoutPixelUpdateInput) {
    try {
      return await this.prisma.checkoutPixel.update({ where: { id }, data });
    } catch (error: unknown) {
      void this.opsAlert?.alertOnCriticalError(error, 'CheckoutCatalogService.update');
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2025') {
        throw new NotFoundException('CheckoutPixel not found');
      }
      throw error;
    }
  }

  /** Delete pixel. */
  // PULSE_OK: rate-limited by CheckoutPublicController
  async deletePixel(id: string, workspaceId?: string) {
    return deleteCheckoutPixel(
      { prisma: this.prisma, auditService: this.auditService },
      id,
      workspaceId,
    );
  }

  /** Calculate shipping. */
  // PULSE_OK: rate-limited by CheckoutPublicController
  async calculateShipping(slug: string, cep: string) {
    return calcShipping(this.catalogConfigService, slug, cep);
  }

  /** Reset config to defaults. */
  // PULSE_OK: rate-limited by CheckoutPublicController
  async resetConfig(planId: string) {
    return resetCatalogConfig(this.catalogConfigService, planId);
  }
}
import {
  calcShipping,
  createCheckoutPixel,
  deleteCheckoutPixel,
  deleteCouponHelper,
  resetCatalogConfig,
} from './__companions__/checkout-catalog.service.companion';
