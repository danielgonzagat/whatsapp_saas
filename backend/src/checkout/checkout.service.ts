import { randomUUID } from 'node:crypto';
import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { StructuredLogger } from '../logging/structured-logger';
import { PrismaService } from '../prisma/prisma.service';
import { CheckoutCatalogService } from './checkout-catalog.service';
import { CheckoutOrderService } from './checkout-order.service';
import { CheckoutProductService } from './checkout-product.service';
import { CheckoutPublicPayloadBuilder } from './checkout-public-payload.builder';
import { CheckoutEventEmitterService } from '../kloel/checkout-emitter/checkout-event-emitter.service';
import { getCheckoutByCode as companionGetCheckoutByCode } from './checkout-code-lookup.helper';
import {
  buildDuplicateCheckoutInput,
  CHECKOUT_PLAN_LINK_INCLUDE,
  isActivePlanKind,
  isLegacyPlanEligibleForMigration,
  mapPixelsForDuplicate,
  PLAN_INCLUDE,
  stripConfigMetadata,
} from './checkout.service.helpers';
import type { CreateCheckoutInput } from './checkout-product.types';
import type { UnknownRecord } from '../common/types';
import type { SetCheckoutThemeDto } from './dto/set-checkout-theme.dto';
import type { SetCheckoutCouponsDto } from './dto/set-checkout-coupons.dto';
import type { SetCheckoutTimerDto } from './dto/set-checkout-timer.dto';
import type { SetCheckoutSocialProofDto } from './dto/set-checkout-social-proof.dto';

export type { CheckoutOrderStatusValue } from './checkout-order-status';

/**
 * Checkout façade — delegates product/plan, catalog, and order concerns to
 * focused sub-services and owns the public-lookup (slug / code) flows that
 * must coordinate across all sub-domains.
 */
/** Idempotency: enforced at HTTP layer via @Idempotent() guard + Stripe idempotencyKey. */
@Injectable()
export class CheckoutService {
  private readonly logger = StructuredLogger.from(CheckoutService.name);
  private readonly publicPayloadBuilder: CheckoutPublicPayloadBuilder;

  constructor(
    private readonly prisma: PrismaService,
    private readonly productService: CheckoutProductService,
    private readonly catalogService: CheckoutCatalogService,
    private readonly orderService: CheckoutOrderService,
    private readonly eventEmitter: CheckoutEventEmitterService,
  ) {
    this.publicPayloadBuilder = new CheckoutPublicPayloadBuilder(prisma);
  }

  private logCheckoutEvent(event: string, payload: Record<string, unknown>) {
    this.logger.log(JSON.stringify({ event, ...payload }));
  }

  // ─── Product delegation ───────────────────────────────────────────────────
  async createProduct(...args: Parameters<CheckoutProductService['createProduct']>) {
    return this.productService.createProduct(...args);
  }
  async updateProduct(...args: Parameters<CheckoutProductService['updateProduct']>) {
    return this.productService.updateProduct(...args);
  }
  async listProducts(...args: Parameters<CheckoutProductService['listProducts']>) {
    return this.productService.listProducts(...args);
  }
  async getProduct(...args: Parameters<CheckoutProductService['getProduct']>) {
    return this.productService.getProduct(...args);
  }
  async deleteProduct(...args: Parameters<CheckoutProductService['deleteProduct']>) {
    return this.productService.deleteProduct(...args);
  }
  async createPlan(...args: Parameters<CheckoutProductService['createPlan']>) {
    return this.productService.createPlan(...args);
  }
  async updatePlan(...args: Parameters<CheckoutProductService['updatePlan']>) {
    return this.productService.updatePlan(...args);
  }
  async deletePlan(...args: Parameters<CheckoutProductService['deletePlan']>) {
    return this.productService.deletePlan(...args);
  }
  async updateConfig(...args: Parameters<CheckoutProductService['updateConfig']>) {
    return this.productService.updateConfig(...args);
  }
  async getConfig(...args: Parameters<CheckoutProductService['getConfig']>) {
    return this.productService.getConfig(...args);
  }
  async createCheckout(...args: Parameters<CheckoutProductService['createCheckout']>) {
    return this.productService.createCheckout(...args);
  }
  async syncCheckoutLinks(...args: Parameters<CheckoutProductService['syncCheckoutLinks']>) {
    return this.productService.syncCheckoutLinks(...args);
  }
  async resetConfig(...args: Parameters<CheckoutProductService['resetConfig']>) {
    return this.productService.resetConfig(...args);
  }

  // ─── Catalog delegation ───────────────────────────────────────────────────
  async createBump(...args: Parameters<CheckoutCatalogService['createBump']>) {
    return this.catalogService.createBump(...args);
  }
  async updateBump(...args: Parameters<CheckoutCatalogService['updateBump']>) {
    return this.catalogService.updateBump(...args);
  }
  async deleteBump(...args: Parameters<CheckoutCatalogService['deleteBump']>) {
    return this.catalogService.deleteBump(...args);
  }
  async listBumps(...args: Parameters<CheckoutCatalogService['listBumps']>) {
    return this.catalogService.listBumps(...args);
  }
  async createUpsell(...args: Parameters<CheckoutCatalogService['createUpsell']>) {
    return this.catalogService.createUpsell(...args);
  }
  async updateUpsell(...args: Parameters<CheckoutCatalogService['updateUpsell']>) {
    return this.catalogService.updateUpsell(...args);
  }
  async deleteUpsell(...args: Parameters<CheckoutCatalogService['deleteUpsell']>) {
    return this.catalogService.deleteUpsell(...args);
  }
  async listUpsells(...args: Parameters<CheckoutCatalogService['listUpsells']>) {
    return this.catalogService.listUpsells(...args);
  }
  async createCoupon(...args: Parameters<CheckoutCatalogService['createCoupon']>) {
    return this.catalogService.createCoupon(...args);
  }
  async updateCoupon(...args: Parameters<CheckoutCatalogService['updateCoupon']>) {
    return this.catalogService.updateCoupon(...args);
  }
  async deleteCoupon(...args: Parameters<CheckoutCatalogService['deleteCoupon']>) {
    return this.catalogService.deleteCoupon(...args);
  }
  async listCoupons(...args: Parameters<CheckoutCatalogService['listCoupons']>) {
    return this.catalogService.listCoupons(...args);
  }
  async validateCoupon(...args: Parameters<CheckoutCatalogService['validateCoupon']>) {
    return this.catalogService.validateCoupon(...args);
  }
  async createPixel(...args: Parameters<CheckoutCatalogService['createPixel']>) {
    return this.catalogService.createPixel(...args);
  }
  async updatePixel(...args: Parameters<CheckoutCatalogService['updatePixel']>) {
    return this.catalogService.updatePixel(...args);
  }
  async deletePixel(...args: Parameters<CheckoutCatalogService['deletePixel']>) {
    return this.catalogService.deletePixel(...args);
  }
  async calculateShipping(...args: Parameters<CheckoutCatalogService['calculateShipping']>) {
    return this.catalogService.calculateShipping(...args);
  }

  // ─── Order delegation ─────────────────────────────────────────────────────
  async createOrder(
    workspaceIdOrData: string | Parameters<CheckoutOrderService['createOrder']>[0],
    resolverArgs?: UnknownRecord,
  ) {
    if (resolverArgs !== undefined) {
      const workspaceId = workspaceIdOrData as string;
      const productId = typeof resolverArgs.productId === 'string' ? resolverArgs.productId : '';
      if (!productId) {
        throw new BadRequestException('productId required');
      }

      const product = await this.prisma.product.findFirst({
        where: { id: productId, workspaceId },
        select: { id: true },
      });
      if (!product) {
        throw new NotFoundException('Produto nao encontrado');
      }

      const plan = await this.prisma.checkoutProductPlan.findFirst({
        where: { productId, kind: 'PLAN', isActive: true },
        select: { id: true, priceInCents: true },
      });
      if (!plan) {
        throw new NotFoundException('Nenhum plano ativo encontrado para o produto');
      }

      const amountInCents =
        typeof resolverArgs.amount === 'number' && Number.isFinite(resolverArgs.amount)
          ? Math.round(resolverArgs.amount)
          : plan.priceInCents;

      return this.orderService.createOrder({
        planId: plan.id,
        workspaceId,
        customerName:
          typeof resolverArgs.customerName === 'string'
            ? resolverArgs.customerName
            : 'Venda Manual',
        customerEmail:
          typeof resolverArgs.customerEmail === 'string'
            ? resolverArgs.customerEmail
            : `venda-${Date.now()}@kloel.app`,
        subtotalInCents: amountInCents,
        totalInCents: amountInCents,
        paymentMethod:
          typeof resolverArgs.paymentMethod === 'string'
            ? (resolverArgs.paymentMethod as 'PIX' | 'CREDIT_CARD' | 'BOLETO')
            : 'PIX',
        shippingAddress: {},
      });
    }
    return this.orderService.createOrder(
      workspaceIdOrData as Parameters<CheckoutOrderService['createOrder']>[0],
    );
  }
  async getOrder(...args: Parameters<CheckoutOrderService['getOrder']>) {
    return this.orderService.getOrder(...args);
  }
  async listOrders(...args: Parameters<CheckoutOrderService['listOrders']>) {
    return this.orderService.listOrders(...args);
  }
  async updateOrderStatus(...args: Parameters<CheckoutOrderService['updateOrderStatus']>) {
    return this.orderService.updateOrderStatus(...args);
  }
  async getOrderStatus(...args: Parameters<CheckoutOrderService['getOrderStatus']>) {
    return this.orderService.getOrderStatus(...args);
  }
  async acceptUpsell(...args: Parameters<CheckoutOrderService['acceptUpsell']>) {
    return this.orderService.acceptUpsell(...args);
  }
  async declineUpsell(...args: Parameters<CheckoutOrderService['declineUpsell']>) {
    return this.orderService.declineUpsell(...args);
  }
  async getRecentPaidOrders(...args: Parameters<CheckoutOrderService['getRecentPaidOrders']>) {
    return this.orderService.getRecentPaidOrders(...args);
  }

  // ─── Public Checkout lookup (slug / referenceCode) ────────────────────────
  // These methods coordinate across product + plan-link + affiliate domains,
  // so they live here rather than in a single sub-service.

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
      include: CHECKOUT_PLAN_LINK_INCLUDE,
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
      include: PLAN_INCLUDE,
    });

    if (isLegacyPlanEligibleForMigration(planRecord)) {
      await this.productService.ensureLegacyCheckoutForPlan(planRecord.id);
      const migratedLink = await this.prisma.checkoutPlanLink.findFirst({
        where: {
          slug,
          isActive: true,
          checkout: { isActive: true, kind: 'CHECKOUT' },
          plan: { isActive: true, kind: 'PLAN' },
        },
        include: CHECKOUT_PLAN_LINK_INCLUDE,
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

    if (isActivePlanKind(planRecord)) {
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
  async getCheckoutByCode(
    code: string,
    context?: { correlationId?: string; lookupSource?: string },
  ) {
    return companionGetCheckoutByCode(
      {
        prisma: this.prisma,
        productService: this.productService,
        publicPayloadBuilder: this.publicPayloadBuilder,
        logCheckoutEvent: (event, payload) => this.logCheckoutEvent(event, payload),
      },
      code,
      context,
    );
  }

  // ─── PI-008: Checkout page configuration methods ──────────────────────────

  private async verifyCheckoutOwnership(checkoutId: string, workspaceId: string) {
    const checkout = await this.prisma.checkoutProductPlan.findFirst({
      where: { id: checkoutId, kind: 'CHECKOUT', product: { workspaceId } },
      select: { id: true, productId: true },
    });
    if (!checkout) {
      throw new NotFoundException('Checkout nao encontrado');
    }
    return checkout;
  }

  /** Create checkout page — emits checkout.created event. */
  async create(workspaceId: string, args: UnknownRecord) {
    const productId = typeof args.productId === 'string' ? args.productId : '';
    if (!productId) {
      throw new BadRequestException('productId required');
    }

    const dto: CreateCheckoutInput = {
      name: typeof args.name === 'string' ? args.name : 'Checkout',
      priceInCents:
        typeof args.priceInCents === 'number' && Number.isFinite(args.priceInCents)
          ? args.priceInCents
          : typeof args.amount === 'number' && Number.isFinite(args.amount)
            ? Math.round(args.amount)
            : 0,
      compareAtPrice:
        typeof args.compareAtPrice === 'number' && Number.isFinite(args.compareAtPrice)
          ? args.compareAtPrice
          : undefined,
      currency: typeof args.currency === 'string' ? args.currency : undefined,
      maxInstallments:
        typeof args.maxInstallments === 'number' && Number.isFinite(args.maxInstallments)
          ? args.maxInstallments
          : undefined,
      installmentsFee: typeof args.installmentsFee === 'boolean' ? args.installmentsFee : undefined,
      quantity:
        typeof args.quantity === 'number' && Number.isFinite(args.quantity)
          ? args.quantity
          : undefined,
      freeShipping: typeof args.freeShipping === 'boolean' ? args.freeShipping : undefined,
      shippingPrice:
        typeof args.shippingPrice === 'number' && Number.isFinite(args.shippingPrice)
          ? args.shippingPrice
          : undefined,
      brandName: typeof args.brandName === 'string' ? args.brandName : undefined,
    };

    const result = await this.productService.createCheckout(productId, dto, workspaceId);
    if (result?.id) {
      await this.eventEmitter.checkoutCreated({
        workspaceId,
        checkoutId: result.id,
        productId,
      });
    }
    return result;
  }

  /** Update checkout page — emits checkout.updated event. */
  async update(workspaceId: string, args: UnknownRecord) {
    const checkoutId = typeof args.checkoutId === 'string' ? args.checkoutId : '';
    if (!checkoutId) {
      throw new BadRequestException('checkoutId required');
    }

    await this.verifyCheckoutOwnership(checkoutId, workspaceId);

    const { checkoutId: _, ...updateData } = args;
    const result = await this.productService.updatePlan(checkoutId, updateData);
    await this.eventEmitter.checkoutUpdated({ workspaceId, checkoutId });
    return result;
  }

  /** Delete checkout page — workspace-scoped. */
  async delete(workspaceId: string, args: UnknownRecord) {
    const checkoutId = typeof args.checkoutId === 'string' ? args.checkoutId : '';
    if (!checkoutId) {
      throw new BadRequestException('checkoutId required');
    }

    await this.verifyCheckoutOwnership(checkoutId, workspaceId);
    return this.deletePlan(checkoutId, workspaceId);
  }

  /** List all checkouts for a workspace. */
  async list(workspaceId: string, _args?: UnknownRecord) {
    return this.prisma.checkoutProductPlan.findMany({
      where: { kind: 'CHECKOUT', product: { workspaceId } },
      include: {
        checkoutConfig: true,
        checkoutLinks: {
          include: {
            plan: { select: { id: true, name: true, priceInCents: true, isActive: true } },
          },
          orderBy: [{ isPrimary: 'desc' }, { createdAt: 'asc' }],
        },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  /** Find checkouts by product. */
  async findByProduct(workspaceId: string, productId: string) {
    const product = await this.prisma.product.findFirst({
      where: { id: productId, workspaceId },
      select: { id: true },
    });
    if (!product) {
      throw new NotFoundException('Produto nao encontrado');
    }
    return this.prisma.checkoutProductPlan.findMany({
      where: { productId, kind: 'CHECKOUT' },
      include: {
        checkoutConfig: true,
        checkoutLinks: {
          include: {
            plan: { select: { id: true, name: true, priceInCents: true, isActive: true } },
          },
          orderBy: [{ isPrimary: 'desc' }, { createdAt: 'asc' }],
        },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  /** Link plans to checkout. */
  async linkPlans(workspaceId: string, checkoutId: string, planIds: string[]) {
    await this.verifyCheckoutOwnership(checkoutId, workspaceId);
    return this.productService.syncCheckoutLinks(checkoutId, planIds);
  }

  /** Set checkout theme (colors, button text, layout). */
  async setTheme(workspaceId: string, checkoutId: string, theme: SetCheckoutThemeDto) {
    await this.verifyCheckoutOwnership(checkoutId, workspaceId);
    return this.productService.updateConfig(checkoutId, theme);
  }

  /** Set checkout coupon configuration. */
  async setCoupons(workspaceId: string, checkoutId: string, couponConfig: SetCheckoutCouponsDto) {
    await this.verifyCheckoutOwnership(checkoutId, workspaceId);
    return this.productService.updateConfig(checkoutId, couponConfig);
  }

  /** Set checkout timer configuration. */
  async setTimer(workspaceId: string, checkoutId: string, timerConfig: SetCheckoutTimerDto) {
    await this.verifyCheckoutOwnership(checkoutId, workspaceId);
    return this.productService.updateConfig(checkoutId, timerConfig);
  }

  /** Set checkout social proof configuration. */
  async setSocialProof(workspaceId: string, checkoutId: string, config: SetCheckoutSocialProofDto) {
    await this.verifyCheckoutOwnership(checkoutId, workspaceId);
    return this.productService.updateConfig(checkoutId, config);
  }

  /** Set checkout exit intent. */
  async setExitIntent(workspaceId: string, checkoutId: string, enabled: boolean) {
    await this.verifyCheckoutOwnership(checkoutId, workspaceId);
    return this.productService.updateConfig(checkoutId, { enableExitIntent: enabled });
  }

  /** Duplicate checkout. */
  async duplicateCheckout(checkoutId: string, workspaceId: string) {
    const checkout = await this.prisma.checkoutProductPlan.findUnique({
      where: { id: checkoutId, product: { workspaceId } },
      include: {
        checkoutConfig: { include: { pixels: true } },
        checkoutLinks: { select: { planId: true } },
      },
    });

    if (!checkout || checkout.kind !== 'CHECKOUT') {
      throw new NotFoundException('Checkout nao encontrado');
    }

    const createInput = buildDuplicateCheckoutInput(checkout);
    const duplicated = await this.productService.createCheckout(
      checkout.productId,
      createInput,
      workspaceId,
    );

    const duplicatedId = duplicated?.id;
    if (!duplicatedId) {
      throw new BadRequestException('Nao foi possivel duplicar o checkout');
    }

    if (checkout.checkoutConfig) {
      const configRest = stripConfigMetadata(checkout.checkoutConfig);
      await this.productService.updateConfig(duplicatedId, configRest);

      if (checkout.checkoutConfig.pixels?.length) {
        const createdConfig = await this.prisma.checkoutConfig.findUnique({
          where: { planId: duplicatedId, plan: { product: { workspaceId } } },
          select: { id: true },
        });
        if (createdConfig?.id) {
          await this.prisma.checkoutPixel.createMany({
            data: mapPixelsForDuplicate(checkout.checkoutConfig.pixels, createdConfig.id),
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
      where: { id: duplicatedId, product: { workspaceId } },
      include: {
        checkoutConfig: true,
        checkoutLinks: { include: { plan: { select: { id: true, name: true } } } },
      },
    });
  }
}
