import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import * as Sentry from '@sentry/node';
import { Prisma } from '@prisma/client';
import { AuditService } from '../audit/audit.service';
import { PrismaService } from '../prisma/prisma.service';
import { buildCheckoutMarketplacePricing } from './checkout-marketplace-pricing.util';
import { CheckoutPlanLinkManager } from './checkout-plan-link.manager';

const DEFAULT_MARKETPLACE_FEE_PERCENT = 9.9;

/** Checkout product service — handles Product and Plan CRUD. */
@Injectable()
export class CheckoutProductService {
  private readonly logger = new Logger(CheckoutProductService.name);
  private readonly planLinkManager: CheckoutPlanLinkManager;

  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
  ) {
    this.planLinkManager = new CheckoutPlanLinkManager(prisma);
  }

  /** Build default checkout config input. */
  buildDefaultCheckoutConfigInput(brandName: string): Prisma.CheckoutConfigCreateWithoutPlanInput {
    return {
      brandName: brandName || 'Checkout',
      enableCreditCard: true,
      enablePix: true,
      enableBoleto: false,
      enableCoupon: true,
      showCouponPopup: false,
      couponPopupDelay: 1800,
      couponPopupTitle: 'Cupom exclusivo liberado',
      couponPopupDesc: 'Seu desconto já está pronto para ser aplicado neste pedido.',
      couponPopupBtnText: 'Aplicar cupom',
      couponPopupDismiss: 'Agora não',
      autoCouponCode: null,
    };
  }

  /** Resolve marketplace fee percent for a given payment method and base total. */
  async resolveMarketplaceFeePercent(
    paymentMethod: 'CREDIT_CARD' | 'PIX' | 'BOLETO',
    baseTotalInCents: number,
  ): Promise<number> {
    const now = new Date();
    const volumeInCents = BigInt(Math.max(0, Math.round(baseTotalInCents)));
    const feeRows = await this.prisma.marketplaceFee.findMany({
      where: {
        method: { in: [paymentMethod, '*'] },
        activeFrom: { lte: now },
        volumeFloorInCents: { lte: volumeInCents },
        AND: [
          {
            OR: [{ volumeCeilingInCents: null }, { volumeCeilingInCents: { gte: volumeInCents } }],
          },
        ],
      },
      orderBy: [{ activeFrom: 'desc' }, { volumeFloorInCents: 'desc' }],
      take: 10,
    });

    const selectedFee =
      feeRows.find((row) => row.method === paymentMethod) ||
      feeRows.find((row) => row.method === '*') ||
      null;

    return selectedFee ? selectedFee.feeBps / 100 : DEFAULT_MARKETPLACE_FEE_PERCENT;
  }

  private buildClonedCheckoutConfigInput(
    config: Record<string, unknown> | null | undefined,
    fallbackBrandName: string,
  ): Prisma.CheckoutConfigCreateWithoutPlanInput {
    if (!config) {
      return this.buildDefaultCheckoutConfigInput(fallbackBrandName);
    }

    const {
      id: _id,
      planId: _planId,
      plan: _plan,
      pixels: _pixels,
      createdAt: _createdAt,
      updatedAt: _updatedAt,
      ...rest
    } = config;

    return {
      ...rest,
      brandName:
        typeof rest.brandName === 'string' && rest.brandName ? rest.brandName : fallbackBrandName,
    } as Prisma.CheckoutConfigCreateWithoutPlanInput;
  }

  /** Ensure a legacy checkout exists for the given plan. */
  async ensureLegacyCheckoutForPlan(planId: string) {
    const plan = await this.prisma.checkoutProductPlan.findUnique({
      where: { id: planId },
      include: {
        product: {
          select: { id: true, workspaceId: true, name: true },
        },
        checkoutConfig: true,
        checkoutLinks: {
          where: { isPrimary: true, isActive: true },
          select: { id: true },
          take: 1,
        },
      },
    });

    if (!plan || plan.kind !== 'PLAN') {
      return;
    }

    if (plan.checkoutLinks.length > 0) {
      return;
    }

    const slug = await this.planLinkManager.generateCheckoutSlug(`${plan.name}-checkout`);
    const referenceCode = await this.planLinkManager.generatePublicCheckoutCode();

    await this.prisma.$transaction(
      async (tx) => {
        const checkout = await tx.checkoutProductPlan.create({
          data: {
            productId: plan.productId,
            kind: 'CHECKOUT',
            name: `${plan.name} — Checkout`,
            slug,
            referenceCode,
            priceInCents: plan.priceInCents,
            currency: plan.currency,
            maxInstallments: plan.maxInstallments,
            installmentsFee: plan.installmentsFee,
            legacyCheckoutEnabled: false,
          } as Prisma.CheckoutProductPlanUncheckedCreateInput,
        });

        await tx.checkoutConfig.create({
          data: {
            planId: checkout.id,
            ...this.buildClonedCheckoutConfigInput(
              plan.checkoutConfig as Record<string, unknown> | null,
              plan.product.name,
            ),
          },
        });

        await tx.checkoutPlanLink.create({
          data: {
            checkoutId: checkout.id,
            planId: plan.id,
            slug: plan.slug || slug,
            isPrimary: true,
            isActive: true,
          },
        });
      },
      { isolationLevel: 'ReadCommitted' },
    );
  }

  private async ensureLegacyCheckoutsForProduct(productId: string) {
    const legacyPlans = await this.prisma.checkoutProductPlan.findMany({
      where: {
        productId,
        kind: 'PLAN',
        legacyCheckoutEnabled: true,
      },
      select: { id: true },
    });

    for (const legacyPlan of legacyPlans) {
      await this.ensureLegacyCheckoutForPlan(legacyPlan.id);
    }
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
    const marketplaceFeePercent = await this.resolveMarketplaceFeePercent('PIX', baseTotalInCents);
    const pricing = buildCheckoutMarketplacePricing({
      baseTotalInCents,
      paymentMethod: 'PIX',
      installments: 1,
      marketplaceFeePercent,
      installmentInterestMonthlyPercent: 3.99,
      gatewayFeePercent: 0,
    });
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
    return this.prisma.$transaction(
      async (tx) => {
        const plan = await tx.checkoutProductPlan.findUnique({
          where: { id: planId },
          include: { product: true },
        });
        if (!plan) {
          throw new NotFoundException('Plano nao encontrado');
        }

        return tx.checkoutConfig.update({
          where: { planId },
          data: {
            theme: 'BLANC',
            accentColor: null,
            accentColor2: null,
            backgroundColor: null,
            cardColor: null,
            textColor: null,
            mutedTextColor: null,
            fontBody: null,
            fontDisplay: null,
            brandName: plan.product.name,
            brandLogo: null,
            headerMessage: null,
            headerSubMessage: null,
            productImage: null,
            productDisplayName: null,
            btnStep1Text: 'Ir para Entrega',
            btnStep2Text: 'Ir para Pagamento',
            btnFinalizeText: 'Finalizar compra',
            enableCreditCard: true,
            enablePix: true,
            enableBoleto: false,
            enableCoupon: true,
            showCouponPopup: false,
            couponPopupDelay: 1800,
            couponPopupTitle: 'Cupom exclusivo liberado',
            couponPopupDesc: 'Seu desconto já está pronto para ser aplicado neste pedido.',
            couponPopupBtnText: 'Aplicar cupom',
            couponPopupDismiss: 'Agora não',
            autoCouponCode: null,
            enableTimer: false,
            enableExitIntent: false,
            enableFloatingBar: false,
            shippingMode: null,
            shippingOriginZip: null,
            shippingVariableMinInCents: null,
            shippingVariableMaxInCents: null,
            affiliateCustomCommissionAmountInCents: null,
            affiliateCustomCommissionPercent: null,
            customCSS: null,
          },
        });
      },
      { isolationLevel: 'ReadCommitted' },
    );
  }

  /** Get plan link manager (for use by CheckoutService). */
  getPlanLinkManager(): CheckoutPlanLinkManager {
    return this.planLinkManager;
  }

  private logCheckoutEvent(event: string, payload: Record<string, unknown>) {
    this.logger.log(JSON.stringify({ event, ...payload }));
  }
}
