import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import * as Sentry from '@sentry/node';
import { Prisma } from '@prisma/client';
import { AuditService } from '../audit/audit.service';
import { PrismaService } from '../prisma/prisma.service';
import { CheckoutPlanLinkManager } from './checkout-plan-link.manager';
import { CheckoutProductConfigService } from './checkout-product-config.service';

/** Checkout product service — handles Product and Plan CRUD. */
@Injectable()
export class CheckoutProductService {
  private readonly logger = new Logger(CheckoutProductService.name);
  private readonly planLinkManager: CheckoutPlanLinkManager;

  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
    private readonly productConfigService: CheckoutProductConfigService,
  ) {
    this.planLinkManager = new CheckoutPlanLinkManager(prisma);
  }

  /** Build default checkout config input. */
  buildDefaultCheckoutConfigInput(brandName: string): Prisma.CheckoutConfigCreateWithoutPlanInput {
    return this.productConfigService.buildDefaultCheckoutConfigInput(brandName);
  }

  /** Resolve marketplace fee percent for a given payment method and base total. */
  async resolveMarketplaceFeePercent(
    paymentMethod: 'CREDIT_CARD' | 'PIX' | 'BOLETO',
    baseTotalInCents: number,
  ): Promise<number> {
    return this.productConfigService.resolveMarketplaceFeePercent(paymentMethod, baseTotalInCents);
  }

  /** Ensure a legacy checkout exists for the given plan. */
  async ensureLegacyCheckoutForPlan(planId: string) {
    return this.productConfigService.ensureLegacyCheckoutForPlan(planId, this.planLinkManager);
  }

  private async ensureLegacyCheckoutsForProduct(productId: string) {
    return this.productConfigService.ensureLegacyCheckoutsForProduct(
      productId,
      this.planLinkManager,
    );
  }

  // ─── Products ──────────────────────────────────────────────────────────────

  /** Create product. */
  async createProduct(
    workspaceId: string,
    data: {
      name: string;
      slug?: string;
      description?: string;
      images?: Prisma.InputJsonValue;
      weight?: number;
      dimensions?: Prisma.InputJsonValue;
      sku?: string;
      stock?: number;
      category?: string;
      status?: string;
      price?: number;
    },
  ) {
    return this.prisma.product.create({
      data: { workspaceId, price: data.price || 0, ...data },
    });
  }

  /** Update product. */
  async updateProduct(id: string, workspaceId: string, data: Prisma.ProductUpdateInput) {
    await this.prisma.product.updateMany({
      where: { id, workspaceId },
      data,
    });
    return this.prisma.product.findFirst({ where: { id, workspaceId } });
  }

  /** List products. */
  async listProducts(workspaceId: string) {
    return this.prisma.product.findMany({
      take: 200,
      where: { workspaceId },
      include: {
        checkoutPlans: {
          where: { kind: 'PLAN' },
          select: {
            id: true,
            name: true,
            slug: true,
            priceInCents: true,
            isActive: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  /** Get product. */
  async getProduct(id: string, workspaceId: string) {
    const baseProduct = await this.prisma.product.findFirst({
      where: { id, workspaceId },
      select: { id: true },
    });
    if (!baseProduct) {
      throw new NotFoundException('Product not found');
    }

    await this.ensureLegacyCheckoutsForProduct(baseProduct.id);

    const product = await this.prisma.product.findFirst({
      where: { id, workspaceId },
      include: {
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
      },
    });
    if (!product) {
      throw new NotFoundException('Product not found');
    }

    const checkoutNodes = await this.planLinkManager.ensurePlansReferenceCodes(
      product.checkoutPlans,
    );
    const checkoutPlans = checkoutNodes.filter((entry) => entry.kind === 'PLAN');
    const checkoutTemplates = checkoutNodes.filter((entry) => entry.kind === 'CHECKOUT');
    return { ...product, checkoutPlans, checkoutTemplates };
  }

  /** Delete product. */
  async deleteProduct(id: string, workspaceId: string) {
    await this.auditService.log({
      workspaceId,
      action: 'DELETE_RECORD',
      resource: 'CheckoutProduct',
      resourceId: id,
      details: { deletedBy: 'user' },
    });
    await this.prisma.product.deleteMany({ where: { id, workspaceId } });
    return { deleted: true };
  }

  // ─── Plans ─────────────────────────────────────────────────────────────────

  /** Create plan. */
  async createPlan(
    productId: string,
    data: {
      name: string;
      slug?: string;
      priceInCents: number;
      compareAtPrice?: number;
      currency?: string;
      maxInstallments?: number;
      installmentsFee?: boolean;
      quantity?: number;
      freeShipping?: boolean;
      shippingPrice?: number;
      brandName?: string;
    },
  ) {
    const { brandName, ...planData } = data;
    const referenceCode = await this.planLinkManager.generatePublicCheckoutCode();
    return this.prisma.$transaction(
      async (tx) => {
        const plan = await tx.checkoutProductPlan.create({
          data: {
            productId,
            kind: 'PLAN',
            legacyCheckoutEnabled: false,
            referenceCode,
            ...planData,
          } as Prisma.CheckoutProductPlanUncheckedCreateInput,
        });

        await tx.checkoutConfig.create({
          data: {
            planId: plan.id,
            ...this.buildDefaultCheckoutConfigInput(brandName || data.name),
          },
        });

        return tx.checkoutProductPlan.findUnique({
          where: { id: plan.id },
          include: { checkoutConfig: true },
        });
      },
      { isolationLevel: 'ReadCommitted' },
    );
  }

  /** Update plan. */
  async updatePlan(id: string, data: Prisma.CheckoutProductPlanUpdateInput) {
    return this.prisma.checkoutProductPlan.update({
      where: { id },
      data,
      include: { checkoutConfig: true },
    });
  }

  /** Delete plan. */
  async deletePlan(id: string, workspaceId?: string) {
    await this.auditService.log({
      workspaceId: workspaceId || 'unknown',
      action: 'DELETE_RECORD',
      resource: 'CheckoutProductPlan',
      resourceId: id,
      details: { deletedBy: 'user' },
    });
    await this.prisma.checkoutProductPlan.delete({ where: { id } });
    return { deleted: true };
  }

  // ─── Checkout Config ──────────────────────────────────────────────────────

  /** Update checkout config. */
  async updateConfig(planId: string, data: Prisma.CheckoutConfigUpdateInput) {
    const normalizedData: Prisma.CheckoutConfigUpdateInput = { ...data };

    if (typeof data.autoCouponCode === 'string') {
      normalizedData.autoCouponCode = data.autoCouponCode.trim().toUpperCase() || null;
    }
    if (data.enableCoupon === false) {
      normalizedData.showCouponPopup = false;
      normalizedData.autoCouponCode = null;
    }
    if (data.showCouponPopup === false) {
      normalizedData.autoCouponCode = null;
    }

    return this.prisma.checkoutConfig.update({
      where: { planId },
      data: normalizedData,
      include: { pixels: true },
    });
  }

  /** Get checkout config. */
  async getConfig(planId: string) {
    const config = await this.prisma.checkoutConfig.findUnique({
      where: { planId },
      include: {
        pixels: true,
        plan: {
          include: {
            checkoutLinks: {
              include: {
                plan: { select: { id: true, name: true, priceInCents: true, isActive: true } },
              },
              orderBy: [{ isPrimary: 'desc' }, { createdAt: 'asc' }],
            },
          },
        },
      },
    });
    if (!config) {
      throw new NotFoundException('Config nao encontrada');
    }
    const baseTotalInCents = Number(config.plan.priceInCents || 0);
    const pricing = await this.productConfigService.buildPricingPreview(baseTotalInCents);
    return { ...config, pricing };
  }

  // ─── Checkout (CHECKOUT kind) ─────────────────────────────────────────────

  /** Create checkout. */
  async createCheckout(
    productId: string,
    data: {
      name: string;
      slug?: string;
      priceInCents: number;
      compareAtPrice?: number;
      currency?: string;
      maxInstallments?: number;
      installmentsFee?: boolean;
      quantity?: number;
      freeShipping?: boolean;
      shippingPrice?: number;
      brandName?: string;
    },
  ) {
    const { brandName, ...checkoutData } = data;
    const slug = await this.planLinkManager.generateCheckoutSlug(
      data.slug || `${data.name}-checkout`,
    );
    const referenceCode = await this.planLinkManager.generatePublicCheckoutCode();

    return this.prisma.$transaction(
      async (tx) => {
        const checkout = await tx.checkoutProductPlan.create({
          data: {
            productId,
            kind: 'CHECKOUT',
            legacyCheckoutEnabled: false,
            slug,
            referenceCode,
            ...checkoutData,
          } as Prisma.CheckoutProductPlanUncheckedCreateInput,
        });

        await tx.checkoutConfig.create({
          data: {
            planId: checkout.id,
            ...this.buildDefaultCheckoutConfigInput(brandName || data.name),
          },
        });

        return tx.checkoutProductPlan.findUnique({
          where: { id: checkout.id },
          include: {
            checkoutConfig: true,
            checkoutLinks: {
              include: { plan: { select: { id: true, name: true } } },
            },
          },
        });
      },
      { isolationLevel: 'ReadCommitted' },
    );
  }

  /** Sync checkout links. */
  async syncCheckoutLinks(checkoutId: string, planIds: string[]) {
    try {
      return await this.planLinkManager.syncCheckoutLinks(checkoutId, planIds);
    } catch (error) {
      Sentry.captureException(error, {
        tags: { type: 'checkout_alert', operation: 'checkout_link_sync' },
        extra: { checkoutId, planIds },
        level: 'error',
      });
      if ((error as Error)?.message === 'CHECKOUT_NOT_FOUND') {
        throw new NotFoundException('Checkout nao encontrado');
      }
      if ((error as Error)?.message === 'INVALID_PLAN_SELECTION') {
        throw new BadRequestException(
          'Um ou mais planos selecionados nao pertencem a este produto',
        );
      }
      throw error;
    }
  }

  /** Reset checkout config to defaults. */
  async resetConfig(planId: string) {
    return this.productConfigService.resetConfig(planId);
  }

  /** Get plan link manager (for use by CheckoutService). */
  getPlanLinkManager(): CheckoutPlanLinkManager {
    return this.planLinkManager;
  }

  private logCheckoutEvent(event: string, payload: Record<string, unknown>) {
    this.logger.log(JSON.stringify({ event, ...payload }));
  }
}
