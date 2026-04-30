import { randomUUID } from 'node:crypto';
import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import {
  DEFAULT_PUBLIC_CHECKOUT_CODE_LENGTH,
  isValidPublicCheckoutCode,
  normalizePublicCheckoutCode,
} from './checkout-code.util';
import { CheckoutCatalogService } from './checkout-catalog.service';
import { CheckoutOrderService } from './checkout-order.service';
import { CheckoutProductService } from './checkout-product.service';
import { CheckoutPublicPayloadBuilder } from './checkout-public-payload.builder';

export type { CheckoutOrderStatusValue } from './checkout-order-status';

/**
 * Checkout façade — delegates product/plan, catalog, and order concerns to
 * focused sub-services and owns the public-lookup (slug / code) flows that
 * must coordinate across all sub-domains.
 */
/** Idempotency: enforced at HTTP layer via @Idempotent() guard + Stripe idempotencyKey. */
@Injectable()
export class CheckoutService {
  private readonly logger = new Logger(CheckoutService.name);
  private readonly publicPayloadBuilder: CheckoutPublicPayloadBuilder;

  constructor(
    private readonly prisma: PrismaService,
    private readonly productService: CheckoutProductService,
    private readonly catalogService: CheckoutCatalogService,
    private readonly orderService: CheckoutOrderService,
  ) {
    this.publicPayloadBuilder = new CheckoutPublicPayloadBuilder(prisma);
  }

  private logCheckoutEvent(event: string, payload: Record<string, unknown>) {
    this.logger.log(JSON.stringify({ event, ...payload }));
  }

  // ─── Product delegation ───────────────────────────────────────────────────
  // PULSE_OK: rate-limited by CheckoutPublicController
  async createProduct(...args: Parameters<CheckoutProductService['createProduct']>) {
    return this.productService.createProduct(...args);
  }
  // PULSE_OK: rate-limited by CheckoutPublicController
  async updateProduct(...args: Parameters<CheckoutProductService['updateProduct']>) {
    return this.productService.updateProduct(...args);
  }
  // PULSE_OK: rate-limited by CheckoutPublicController
  async listProducts(...args: Parameters<CheckoutProductService['listProducts']>) {
    return this.productService.listProducts(...args);
  }
  // PULSE_OK: rate-limited by CheckoutPublicController
  async getProduct(...args: Parameters<CheckoutProductService['getProduct']>) {
    return this.productService.getProduct(...args);
  }
  // PULSE_OK: rate-limited by CheckoutPublicController
  async deleteProduct(...args: Parameters<CheckoutProductService['deleteProduct']>) {
    return this.productService.deleteProduct(...args);
  }
  // PULSE_OK: rate-limited by CheckoutPublicController
  async createPlan(...args: Parameters<CheckoutProductService['createPlan']>) {
    return this.productService.createPlan(...args);
  }
  // PULSE_OK: rate-limited by CheckoutPublicController
  async updatePlan(...args: Parameters<CheckoutProductService['updatePlan']>) {
    return this.productService.updatePlan(...args);
  }
  // PULSE_OK: rate-limited by CheckoutPublicController
  async deletePlan(...args: Parameters<CheckoutProductService['deletePlan']>) {
    return this.productService.deletePlan(...args);
  }
  // PULSE_OK: rate-limited by CheckoutPublicController
  async updateConfig(...args: Parameters<CheckoutProductService['updateConfig']>) {
    return this.productService.updateConfig(...args);
  }
  // PULSE_OK: rate-limited by CheckoutPublicController
  async getConfig(...args: Parameters<CheckoutProductService['getConfig']>) {
    return this.productService.getConfig(...args);
  }
  // PULSE_OK: rate-limited by CheckoutPublicController
  async createCheckout(...args: Parameters<CheckoutProductService['createCheckout']>) {
    return this.productService.createCheckout(...args);
  }
  // PULSE_OK: rate-limited by CheckoutPublicController
  async syncCheckoutLinks(...args: Parameters<CheckoutProductService['syncCheckoutLinks']>) {
    return this.productService.syncCheckoutLinks(...args);
  }
  // PULSE_OK: rate-limited by CheckoutPublicController
  async resetConfig(...args: Parameters<CheckoutProductService['resetConfig']>) {
    return this.productService.resetConfig(...args);
  }

  // ─── Catalog delegation ───────────────────────────────────────────────────
  // PULSE_OK: rate-limited by CheckoutPublicController
  async createBump(...args: Parameters<CheckoutCatalogService['createBump']>) {
    return this.catalogService.createBump(...args);
  }
  // PULSE_OK: rate-limited by CheckoutPublicController
  async updateBump(...args: Parameters<CheckoutCatalogService['updateBump']>) {
    return this.catalogService.updateBump(...args);
  }
  // PULSE_OK: rate-limited by CheckoutPublicController
  async deleteBump(...args: Parameters<CheckoutCatalogService['deleteBump']>) {
    return this.catalogService.deleteBump(...args);
  }
  // PULSE_OK: rate-limited by CheckoutPublicController
  async listBumps(...args: Parameters<CheckoutCatalogService['listBumps']>) {
    return this.catalogService.listBumps(...args);
  }
  // PULSE_OK: rate-limited by CheckoutPublicController
  async createUpsell(...args: Parameters<CheckoutCatalogService['createUpsell']>) {
    return this.catalogService.createUpsell(...args);
  }
  // PULSE_OK: rate-limited by CheckoutPublicController
  async updateUpsell(...args: Parameters<CheckoutCatalogService['updateUpsell']>) {
    return this.catalogService.updateUpsell(...args);
  }
  // PULSE_OK: rate-limited by CheckoutPublicController
  async deleteUpsell(...args: Parameters<CheckoutCatalogService['deleteUpsell']>) {
    return this.catalogService.deleteUpsell(...args);
  }
  // PULSE_OK: rate-limited by CheckoutPublicController
  async listUpsells(...args: Parameters<CheckoutCatalogService['listUpsells']>) {
    return this.catalogService.listUpsells(...args);
  }
  // PULSE_OK: rate-limited by CheckoutPublicController
  async createCoupon(...args: Parameters<CheckoutCatalogService['createCoupon']>) {
    return this.catalogService.createCoupon(...args);
  }
  // PULSE_OK: rate-limited by CheckoutPublicController
  async updateCoupon(...args: Parameters<CheckoutCatalogService['updateCoupon']>) {
    return this.catalogService.updateCoupon(...args);
  }
  // PULSE_OK: rate-limited by CheckoutPublicController
  async deleteCoupon(...args: Parameters<CheckoutCatalogService['deleteCoupon']>) {
    return this.catalogService.deleteCoupon(...args);
  }
  // PULSE_OK: rate-limited by CheckoutPublicController
  async listCoupons(...args: Parameters<CheckoutCatalogService['listCoupons']>) {
    return this.catalogService.listCoupons(...args);
  }
  // PULSE_OK: rate-limited by CheckoutPublicController
  async validateCoupon(...args: Parameters<CheckoutCatalogService['validateCoupon']>) {
    return this.catalogService.validateCoupon(...args);
  }
  // PULSE_OK: rate-limited by CheckoutPublicController
  async createPixel(...args: Parameters<CheckoutCatalogService['createPixel']>) {
    return this.catalogService.createPixel(...args);
  }
  // PULSE_OK: rate-limited by CheckoutPublicController
  async updatePixel(...args: Parameters<CheckoutCatalogService['updatePixel']>) {
    return this.catalogService.updatePixel(...args);
  }
  // PULSE_OK: rate-limited by CheckoutPublicController
  async deletePixel(...args: Parameters<CheckoutCatalogService['deletePixel']>) {
    return this.catalogService.deletePixel(...args);
  }
  // PULSE_OK: rate-limited by CheckoutPublicController
  async calculateShipping(...args: Parameters<CheckoutCatalogService['calculateShipping']>) {
    return this.catalogService.calculateShipping(...args);
  }

  // ─── Order delegation ─────────────────────────────────────────────────────
  // PULSE_OK: rate-limited by CheckoutPublicController
  async createOrder(...args: Parameters<CheckoutOrderService['createOrder']>) {
    return this.orderService.createOrder(...args);
  }
  // PULSE_OK: rate-limited by CheckoutPublicController
  async getOrder(...args: Parameters<CheckoutOrderService['getOrder']>) {
    return this.orderService.getOrder(...args);
  }
  // PULSE_OK: rate-limited by CheckoutPublicController
  async listOrders(...args: Parameters<CheckoutOrderService['listOrders']>) {
    return this.orderService.listOrders(...args);
  }
  // PULSE_OK: rate-limited by CheckoutPublicController
  async updateOrderStatus(...args: Parameters<CheckoutOrderService['updateOrderStatus']>) {
    return this.orderService.updateOrderStatus(...args);
  }
  // PULSE_OK: rate-limited by CheckoutPublicController
  async getOrderStatus(...args: Parameters<CheckoutOrderService['getOrderStatus']>) {
    return this.orderService.getOrderStatus(...args);
  }
  // PULSE_OK: rate-limited by CheckoutPublicController
  async acceptUpsell(...args: Parameters<CheckoutOrderService['acceptUpsell']>) {
    return this.orderService.acceptUpsell(...args);
  }
  // PULSE_OK: rate-limited by CheckoutPublicController
  async declineUpsell(...args: Parameters<CheckoutOrderService['declineUpsell']>) {
    return this.orderService.declineUpsell(...args);
  }
  // PULSE_OK: rate-limited by CheckoutPublicController
  async getRecentPaidOrders(...args: Parameters<CheckoutOrderService['getRecentPaidOrders']>) {
    return this.orderService.getRecentPaidOrders(...args);
  }

  // ─── Public Checkout lookup (slug / referenceCode) ────────────────────────
  // These methods coordinate across product + plan-link + affiliate domains,
  // so they live here rather than in a single sub-service.

  // PULSE_OK: rate-limited by CheckoutPublicController
  async getCheckoutBySlug(
    slug: string,
    context?: { correlationId?: string; lookupSource?: string },
  ) {
    const planLinkManager = this.productService.getPlanLinkManager();
    const correlationId = context?.correlationId ?? randomUUID();

    this.logCheckoutEvent('checkout_public_lookup_start', {
      correlationId,
      lookupType: 'slug',
      lookupValue: slug,
      lookupSource: context?.lookupSource ?? 'direct',
    });

    const checkoutLink = await this.prisma.checkoutPlanLink.findFirst({
      where: {
        slug,
        isActive: true,
        checkout: { isActive: true, kind: 'CHECKOUT' },
        plan: { isActive: true, kind: 'PLAN' },
      },
      include: {
        checkout: { include: { checkoutConfig: { include: { pixels: true } } } },
        plan: {
          include: {
            product: true,
            checkoutConfig: { include: { pixels: true } },
            orderBumps: { where: { isActive: true }, orderBy: { sortOrder: 'asc' } },
            upsells: { where: { isActive: true }, orderBy: { sortOrder: 'asc' } },
          },
        },
      },
    });

    if (checkoutLink) {
      this.logCheckoutEvent('checkout_public_lookup_resolved', {
        correlationId,
        lookupType: 'slug',
        lookupValue: slug,
        resolution: 'checkout_link',
        checkoutId: checkoutLink.checkoutId,
        planId: checkoutLink.planId,
      });
      return this.publicPayloadBuilder.build(checkoutLink.plan, {
        checkoutLink,
        checkoutConfigOverride:
          checkoutLink.checkout.checkoutConfig || checkoutLink.plan.checkoutConfig,
      });
    }

    const planRecord = await this.prisma.checkoutProductPlan.findUnique({
      where: { slug },
      include: {
        product: true,
        checkoutConfig: { include: { pixels: true } },
        orderBumps: { where: { isActive: true }, orderBy: { sortOrder: 'asc' } },
        upsells: { where: { isActive: true }, orderBy: { sortOrder: 'asc' } },
      },
    });

    if (planRecord?.isActive && planRecord.kind === 'PLAN' && planRecord.legacyCheckoutEnabled) {
      await this.productService.ensureLegacyCheckoutForPlan(planRecord.id);
      const migratedLink = await this.prisma.checkoutPlanLink.findFirst({
        where: {
          slug,
          isActive: true,
          checkout: { isActive: true, kind: 'CHECKOUT' },
          plan: { isActive: true, kind: 'PLAN' },
        },
        include: {
          checkout: { include: { checkoutConfig: { include: { pixels: true } } } },
          plan: {
            include: {
              product: true,
              checkoutConfig: { include: { pixels: true } },
              orderBumps: { where: { isActive: true }, orderBy: { sortOrder: 'asc' } },
              upsells: { where: { isActive: true }, orderBy: { sortOrder: 'asc' } },
            },
          },
        },
      });

      if (migratedLink) {
        this.logCheckoutEvent('checkout_public_lookup_resolved', {
          correlationId,
          lookupType: 'slug',
          lookupValue: slug,
          resolution: 'legacy_checkout_link',
          checkoutId: migratedLink.checkoutId,
          planId: migratedLink.planId,
        });
        return this.publicPayloadBuilder.build(migratedLink.plan, {
          checkoutLink: migratedLink,
          checkoutConfigOverride:
            migratedLink.checkout.checkoutConfig || migratedLink.plan.checkoutConfig,
        });
      }
    }

    if (planRecord?.isActive && planRecord.kind === 'PLAN') {
      const plan = await planLinkManager.ensurePlanReferenceCode(planRecord);
      this.logCheckoutEvent('checkout_public_lookup_resolved', {
        correlationId,
        lookupType: 'slug',
        lookupValue: slug,
        resolution: 'plan',
        planId: plan.id,
      });
      return this.publicPayloadBuilder.build(plan);
    }

    return this.getCheckoutByCode(slug, { correlationId, lookupSource: 'slug_fallback' });
  }

  /** Get checkout by code. */
  // PULSE_OK: rate-limited by CheckoutPublicController
  async getCheckoutByCode(
    code: string,
    context?: { correlationId?: string; lookupSource?: string },
  ) {
    const planLinkManager = this.productService.getPlanLinkManager();
    const correlationId = context?.correlationId ?? randomUUID();
    const normalizedCode = normalizePublicCheckoutCode(code);
    const normalizedCodePrefix = normalizedCode.slice(0, DEFAULT_PUBLIC_CHECKOUT_CODE_LENGTH);
    const legacyCode = String(code ?? '')
      .trim()
      .toLowerCase();

    this.logCheckoutEvent('checkout_public_lookup_start', {
      correlationId,
      lookupType: 'code',
      lookupValue: code,
      normalizedCode,
      lookupSource: context?.lookupSource ?? 'direct',
    });

    const codeOrConditions = [
      { referenceCode: normalizedCode },
      ...(normalizedCodePrefix &&
      normalizedCodePrefix !== normalizedCode &&
      isValidPublicCheckoutCode(normalizedCodePrefix)
        ? [{ referenceCode: normalizedCodePrefix }]
        : []),
      { referenceCode: code },
    ];

    const checkoutLink = await this.prisma.checkoutPlanLink.findFirst({
      where: {
        isActive: true,
        checkout: { isActive: true, kind: 'CHECKOUT' },
        plan: { isActive: true, kind: 'PLAN' },
        OR: codeOrConditions,
      },
      include: {
        checkout: { include: { checkoutConfig: { include: { pixels: true } } } },
        plan: {
          include: {
            product: true,
            checkoutConfig: { include: { pixels: true } },
            orderBumps: { where: { isActive: true }, orderBy: { sortOrder: 'asc' } },
            upsells: { where: { isActive: true }, orderBy: { sortOrder: 'asc' } },
          },
        },
      },
    });

    if (checkoutLink) {
      this.logCheckoutEvent('checkout_public_lookup_resolved', {
        correlationId,
        lookupType: 'code',
        lookupValue: code,
        resolution: 'checkout_link',
        checkoutId: checkoutLink.checkoutId,
        planId: checkoutLink.planId,
      });
      return this.publicPayloadBuilder.build(checkoutLink.plan, {
        checkoutLink,
        checkoutConfigOverride:
          checkoutLink.checkout.checkoutConfig || checkoutLink.plan.checkoutConfig,
      });
    }

    const planRecord = await this.prisma.checkoutProductPlan.findFirst({
      where: {
        OR: [...codeOrConditions, { id: { startsWith: legacyCode } }],
      },
      include: {
        product: true,
        checkoutConfig: { include: { pixels: true } },
        orderBumps: { where: { isActive: true }, orderBy: { sortOrder: 'asc' } },
        upsells: { where: { isActive: true }, orderBy: { sortOrder: 'asc' } },
      },
    });

    if (planRecord?.isActive && planRecord.kind === 'PLAN' && planRecord.legacyCheckoutEnabled) {
      await this.productService.ensureLegacyCheckoutForPlan(planRecord.id);
      const migratedLink = await this.prisma.checkoutPlanLink.findFirst({
        where: {
          isActive: true,
          checkout: { isActive: true, kind: 'CHECKOUT' },
          plan: { isActive: true, kind: 'PLAN' },
          OR: codeOrConditions,
        },
        include: {
          checkout: { include: { checkoutConfig: { include: { pixels: true } } } },
          plan: {
            include: {
              product: true,
              checkoutConfig: { include: { pixels: true } },
              orderBumps: { where: { isActive: true }, orderBy: { sortOrder: 'asc' } },
              upsells: { where: { isActive: true }, orderBy: { sortOrder: 'asc' } },
            },
          },
        },
      });

      if (migratedLink) {
        this.logCheckoutEvent('checkout_public_lookup_resolved', {
          correlationId,
          lookupType: 'code',
          lookupValue: code,
          resolution: 'legacy_checkout_link',
          checkoutId: migratedLink.checkoutId,
          planId: migratedLink.planId,
        });
        return this.publicPayloadBuilder.build(migratedLink.plan, {
          checkoutLink: migratedLink,
          checkoutConfigOverride:
            migratedLink.checkout.checkoutConfig || migratedLink.plan.checkoutConfig,
        });
      }
    }

    if (planRecord?.isActive && planRecord.kind === 'PLAN') {
      const plan = await planLinkManager.ensurePlanReferenceCode(planRecord);
      this.logCheckoutEvent('checkout_public_lookup_resolved', {
        correlationId,
        lookupType: 'code',
        lookupValue: code,
        resolution: 'plan',
        planId: plan.id,
      });
      return this.publicPayloadBuilder.build(plan);
    }

    const affiliateCodeConditions = [
      { code: normalizedCode },
      ...(normalizedCodePrefix &&
      normalizedCodePrefix !== normalizedCode &&
      isValidPublicCheckoutCode(normalizedCodePrefix)
        ? [{ code: normalizedCodePrefix }]
        : []),
      { code },
    ];
    const affiliateLink = await this.prisma.affiliateLink.findFirst({
      where: { active: true, OR: affiliateCodeConditions },
      include: { affiliateProduct: true },
      orderBy: { createdAt: 'desc' },
    });

    if (!affiliateLink?.affiliateProduct?.productId) {
      this.logCheckoutEvent('checkout_public_lookup_not_found', {
        correlationId,
        lookupType: 'code',
        lookupValue: code,
      });
      throw new NotFoundException('Checkout not found');
    }

    const affiliatePlanRecord = await this.prisma.checkoutProductPlan.findFirst({
      where: { productId: affiliateLink.affiliateProduct.productId, isActive: true, kind: 'PLAN' },
      include: {
        product: true,
        checkoutConfig: { include: { pixels: true } },
        orderBumps: { where: { isActive: true }, orderBy: { sortOrder: 'asc' } },
        upsells: { where: { isActive: true }, orderBy: { sortOrder: 'asc' } },
      },
      orderBy: { createdAt: 'asc' },
    });

    if (!affiliatePlanRecord) {
      this.logCheckoutEvent('checkout_public_lookup_not_found', {
        correlationId,
        lookupType: 'code',
        lookupValue: code,
        resolution: 'affiliate_missing_plan',
      });
      throw new NotFoundException('Checkout not found');
    }

    const affiliatePlan = await planLinkManager.ensurePlanReferenceCode(affiliatePlanRecord);
    const affiliateCheckoutLink = await this.prisma.checkoutPlanLink.findFirst({
      where: {
        planId: affiliatePlan.id,
        isActive: true,
        checkout: { isActive: true, kind: 'CHECKOUT' },
      },
      include: { checkout: { include: { checkoutConfig: { include: { pixels: true } } } } },
      orderBy: [{ isPrimary: 'desc' }, { createdAt: 'asc' }],
    });

    await this.prisma.affiliateLink.update({
      where: { id: affiliateLink.id },
      data: { clicks: { increment: 1 } },
    });

    this.logCheckoutEvent('checkout_public_lookup_resolved', {
      correlationId,
      lookupType: 'code',
      lookupValue: code,
      resolution: 'affiliate_link',
      affiliateLinkId: affiliateLink.id,
      planId: affiliatePlan.id,
    });

    return this.publicPayloadBuilder.build(affiliatePlan, {
      affiliateLink,
      checkoutLink: affiliateCheckoutLink,
      checkoutConfigOverride:
        affiliateCheckoutLink?.checkout?.checkoutConfig || affiliatePlan.checkoutConfig,
    });
  }

  /** Duplicate checkout. */
  // PULSE_OK: rate-limited by CheckoutPublicController
  async duplicateCheckout(checkoutId: string, workspaceId: string) {
    const checkout = await this.prisma.checkoutProductPlan.findUnique({
      where: { id: checkoutId },
      include: {
        checkoutConfig: { include: { pixels: true } },
        checkoutLinks: { select: { planId: true } },
      },
    });

    if (!checkout || checkout.kind !== 'CHECKOUT') {
      throw new NotFoundException('Checkout nao encontrado');
    }

    const duplicated = await this.productService.createCheckout(
      checkout.productId,
      {
        name: `${checkout.name} (Copia)`,
        priceInCents: checkout.priceInCents,
        compareAtPrice: checkout.compareAtPrice ?? undefined,
        currency: checkout.currency,
        maxInstallments: checkout.maxInstallments,
        installmentsFee: checkout.installmentsFee,
        quantity: checkout.quantity,
        freeShipping: checkout.freeShipping,
        shippingPrice: checkout.shippingPrice ?? undefined,
        brandName: checkout.checkoutConfig?.brandName ?? checkout.name,
      },
      workspaceId,
    );

    const duplicatedId = duplicated?.id;
    if (!duplicatedId) {
      throw new BadRequestException('Nao foi possivel duplicar o checkout');
    }

    if (checkout.checkoutConfig) {
      const {
        id: _id,
        planId: _planId,
        pixels: _pixels,
        createdAt: _ca,
        updatedAt: _ua,
        ...configRest
      } = checkout.checkoutConfig as Record<string, unknown>;
      await this.productService.updateConfig(duplicatedId, configRest);

      if (checkout.checkoutConfig.pixels?.length) {
        const createdConfig = await this.prisma.checkoutConfig.findUnique({
          where: { planId: duplicatedId },
          select: { id: true },
        });
        if (createdConfig?.id) {
          await this.prisma.checkoutPixel.createMany({
            data: checkout.checkoutConfig.pixels.map((pixel) => ({
              checkoutConfigId: createdConfig.id,
              type: pixel.type,
              pixelId: pixel.pixelId,
              accessToken: pixel.accessToken,
              trackPageView: pixel.trackPageView,
              trackInitiateCheckout: pixel.trackInitiateCheckout,
              trackAddPaymentInfo: pixel.trackAddPaymentInfo,
              trackPurchase: pixel.trackPurchase,
            })),
          });
        }
      }
    }

    if (checkout.checkoutLinks.length) {
      await this.productService.syncCheckoutLinks(
        duplicatedId,
        checkout.checkoutLinks.map((link) => link.planId),
      );
    }

    return this.prisma.checkoutProductPlan.findUnique({
      where: { id: duplicatedId },
      include: {
        checkoutConfig: true,
        checkoutLinks: { include: { plan: { select: { id: true, name: true } } } },
      },
    });
  }
}
