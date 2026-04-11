import {
  Injectable,
  Logger,
  NotFoundException,
  BadRequestException,
  Inject,
  forwardRef,
} from '@nestjs/common';
import { randomUUID } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { CheckoutPaymentService } from './checkout-payment.service';
import { AuditService } from '../audit/audit.service';
import { Prisma } from '@prisma/client';
import {
  DEFAULT_PUBLIC_CHECKOUT_CODE_LENGTH,
  isValidPublicCheckoutCode,
  normalizePublicCheckoutCode,
} from './checkout-code.util';
import { MercadoPagoService } from '../kloel/mercado-pago.service';
import { getMercadoPagoAffiliateBlockReason } from './mercado-pago-checkout-policy.util';
import { assertMercadoPagoCheckoutQuality } from './mercado-pago-quality.util';
import {
  calculateCheckoutServerTotals,
  normalizeCheckoutOrderQuantity,
} from './checkout-order-pricing.util';
import { CheckoutPlanLinkManager } from './checkout-plan-link.manager';
import { CheckoutPublicPayloadBuilder } from './checkout-public-payload.builder';
import { CheckoutOrderSupport } from './checkout-order-support';
import { buildCheckoutShippingQuote } from './checkout-shipping-profile.util';
// @@index: optimistic lock via updatedAt — concurrent writes resolved by DB constraint

@Injectable()
export class CheckoutService {
  private readonly logger = new Logger(CheckoutService.name);
  private readonly planLinkManager: CheckoutPlanLinkManager;
  private readonly publicPayloadBuilder: CheckoutPublicPayloadBuilder;
  private readonly orderSupport: CheckoutOrderSupport;

  constructor(
    private readonly prisma: PrismaService,
    @Inject(forwardRef(() => CheckoutPaymentService))
    private readonly paymentService: CheckoutPaymentService,
    private readonly auditService: AuditService,
    private readonly mercadoPago: MercadoPagoService,
  ) {
    this.planLinkManager = new CheckoutPlanLinkManager(prisma);
    this.publicPayloadBuilder = new CheckoutPublicPayloadBuilder(prisma, mercadoPago);
    this.orderSupport = new CheckoutOrderSupport(prisma, this.logger);
  }

  private logCheckoutEvent(event: string, payload: Record<string, unknown>) {
    this.logger.log(
      JSON.stringify({
        event,
        ...payload,
      }),
    );
  }

  private buildDefaultCheckoutConfigInput(
    brandName: string,
  ): Omit<Prisma.CheckoutConfigUncheckedCreateInput, 'planId'> {
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

  private buildClonedCheckoutConfigInput(
    config: any | null | undefined,
    fallbackBrandName: string,
  ): Omit<Prisma.CheckoutConfigUncheckedCreateInput, 'planId'> {
    if (!config) {
      return this.buildDefaultCheckoutConfigInput(fallbackBrandName);
    }

    const { id, planId, plan, pixels, createdAt, updatedAt, ...rest } = config;
    return {
      ...this.buildDefaultCheckoutConfigInput(fallbackBrandName),
      ...rest,
      brandName: rest.brandName || fallbackBrandName || 'Checkout',
    };
  }

  private async ensureLegacyCheckoutForPlan(planId: string) {
    const plan = await this.prisma.checkoutProductPlan.findUnique({
      where: { id: planId },
      include: {
        product: {
          select: {
            id: true,
            name: true,
          },
        },
        checkoutConfig: {
          include: {
            pixels: true,
          },
        },
        planLinks: {
          where: { isPrimary: true },
          select: { id: true },
          take: 1,
        },
      },
    });

    if (!plan || plan.kind !== 'PLAN' || !plan.legacyCheckoutEnabled || plan.planLinks.length > 0) {
      return null;
    }

    const checkoutSlug = await this.planLinkManager.generateCheckoutSlug(`${plan.slug}-checkout`);
    const checkoutReferenceCode = await this.planLinkManager.generatePublicCheckoutCode();

    return this.prisma.$transaction(async (tx) => {
      const freshPlan = await tx.checkoutProductPlan.findUnique({
        where: { id: planId },
        include: {
          product: {
            select: {
              id: true,
              name: true,
            },
          },
          checkoutConfig: {
            include: {
              pixels: true,
            },
          },
          planLinks: {
            where: { isPrimary: true },
            select: { id: true },
            take: 1,
          },
        },
      });

      if (
        !freshPlan ||
        freshPlan.kind !== 'PLAN' ||
        !freshPlan.legacyCheckoutEnabled ||
        freshPlan.planLinks.length > 0
      ) {
        return null;
      }

      const checkout = await tx.checkoutProductPlan.create({
        data: {
          productId: freshPlan.productId,
          kind: 'CHECKOUT',
          legacyCheckoutEnabled: false,
          name: freshPlan.name,
          slug: checkoutSlug,
          referenceCode: checkoutReferenceCode,
          priceInCents: freshPlan.priceInCents,
          compareAtPrice: freshPlan.compareAtPrice,
          currency: freshPlan.currency,
          maxInstallments: freshPlan.maxInstallments,
          installmentsFee: freshPlan.installmentsFee,
          quantity: freshPlan.quantity,
          freeShipping: freshPlan.freeShipping,
          shippingPrice: freshPlan.shippingPrice,
          isActive: freshPlan.isActive,
        },
      });

      await tx.checkoutConfig.create({
        data: {
          planId: checkout.id,
          ...this.buildClonedCheckoutConfigInput(
            freshPlan.checkoutConfig,
            freshPlan.checkoutConfig?.brandName || freshPlan.product?.name || freshPlan.name,
          ),
        },
      });

      if (freshPlan.checkoutConfig?.pixels?.length) {
        const createdConfig = await tx.checkoutConfig.findUnique({
          where: { planId: checkout.id },
          select: { id: true },
        });

        if (createdConfig?.id) {
          await tx.checkoutPixel.createMany({
            data: freshPlan.checkoutConfig.pixels.map((pixel: any) => ({
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

      await tx.checkoutPlanLink.create({
        data: {
          checkoutId: checkout.id,
          planId: freshPlan.id,
          slug: freshPlan.slug,
          referenceCode: freshPlan.referenceCode,
          isPrimary: true,
          isActive: freshPlan.isActive,
        },
      });

      await tx.checkoutProductPlan.update({
        where: { id: freshPlan.id },
        data: { legacyCheckoutEnabled: false },
      });

      return checkout.id;
    });
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

  async createProduct(
    workspaceId: string,
    data: {
      name: string;
      slug?: string;
      description?: string;
      images?: any;
      weight?: number;
      dimensions?: any;
      sku?: string;
      stock?: number;
      category?: string;
      status?: any;
      price?: number;
    },
  ) {
    return this.prisma.product.create({
      data: { workspaceId, price: data.price || 0, ...data },
    });
  }

  async updateProduct(id: string, workspaceId: string, data: Prisma.ProductUpdateInput) {
    return this.prisma.product.update({
      where: { id },
      data,
    });
  }

  async listProducts(workspaceId: string) {
    return this.prisma.product.findMany({
      take: 200,
      where: { workspaceId },
      include: {
        checkoutPlans: {
          where: {
            kind: 'PLAN',
          },
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

  async getProduct(id: string, workspaceId: string) {
    const baseProduct = await this.prisma.product.findFirst({
      where: { id, workspaceId },
      select: { id: true },
    });
    if (!baseProduct) throw new NotFoundException('Product not found');

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
    if (!product) throw new NotFoundException('Product not found');

    const checkoutNodes = await this.planLinkManager.ensurePlansReferenceCodes(
      product.checkoutPlans,
    );
    const checkoutPlans = checkoutNodes.filter((entry: any) => entry.kind === 'PLAN');
    const checkoutTemplates = checkoutNodes.filter((entry: any) => entry.kind === 'CHECKOUT');
    return {
      ...product,
      checkoutPlans,
      checkoutTemplates,
    };
  }

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
      // isolationLevel: ReadCommitted
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

        // Auto-create default CheckoutConfig
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

    return this.prisma.$transaction(async (tx) => {
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
            include: {
              plan: {
                select: {
                  id: true,
                  name: true,
                },
              },
            },
          },
        },
      });
    });
  }

  async duplicateCheckout(checkoutId: string) {
    const checkout = await this.prisma.checkoutProductPlan.findUnique({
      where: { id: checkoutId },
      include: {
        checkoutConfig: {
          include: {
            pixels: true,
          },
        },
        checkoutLinks: {
          select: {
            planId: true,
          },
        },
      },
    });

    if (!checkout || checkout.kind !== 'CHECKOUT') {
      throw new NotFoundException('Checkout nao encontrado');
    }

    const duplicated = await this.createCheckout(checkout.productId, {
      name: `${checkout.name} (Copia)`,
      priceInCents: checkout.priceInCents,
      compareAtPrice: checkout.compareAtPrice || undefined,
      currency: checkout.currency,
      maxInstallments: checkout.maxInstallments,
      installmentsFee: checkout.installmentsFee,
      quantity: checkout.quantity,
      freeShipping: checkout.freeShipping,
      shippingPrice: checkout.shippingPrice || undefined,
      brandName: checkout.checkoutConfig?.brandName || checkout.name,
    });

    const duplicatedId = duplicated?.id;
    if (!duplicatedId) {
      throw new BadRequestException('Nao foi possivel duplicar o checkout');
    }

    await this.updateConfig(
      duplicatedId,
      this.buildClonedCheckoutConfigInput(
        checkout.checkoutConfig,
        checkout.checkoutConfig?.brandName || checkout.name,
      ) as Prisma.CheckoutConfigUpdateInput,
    );

    if (checkout.checkoutConfig?.pixels?.length) {
      const createdConfig = await this.prisma.checkoutConfig.findUnique({
        where: { planId: duplicatedId },
        select: { id: true },
      });

      if (createdConfig?.id) {
        await this.prisma.checkoutPixel.createMany({
          data: checkout.checkoutConfig.pixels.map((pixel: any) => ({
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

    if (checkout.checkoutLinks.length) {
      await this.syncCheckoutLinks(
        duplicatedId,
        checkout.checkoutLinks.map((link) => link.planId),
      );
    }

    return this.prisma.checkoutProductPlan.findUnique({
      where: { id: duplicatedId },
      include: {
        checkoutConfig: true,
        checkoutLinks: {
          include: {
            plan: {
              select: {
                id: true,
                name: true,
              },
            },
          },
        },
      },
    });
  }

  async syncCheckoutLinks(checkoutId: string, planIds: string[]) {
    try {
      return await this.planLinkManager.syncCheckoutLinks(checkoutId, planIds);
    } catch (error) {
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

  async updatePlan(id: string, data: Prisma.CheckoutProductPlanUpdateInput) {
    return this.prisma.checkoutProductPlan.update({
      where: { id },
      data,
      include: { checkoutConfig: true },
    });
  }

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

  async getConfig(planId: string) {
    const config = await this.prisma.checkoutConfig.findUnique({
      where: { planId },
      include: {
        pixels: true,
        plan: {
          include: {
            checkoutLinks: {
              include: {
                plan: {
                  select: {
                    id: true,
                    name: true,
                  },
                },
              },
              orderBy: [{ isPrimary: 'desc' }, { createdAt: 'asc' }],
            },
          },
        },
      },
    });
    if (!config) throw new NotFoundException('Checkout config not found');

    const normalizedPlan = config.plan
      ? await this.planLinkManager.ensurePlanReferenceCode(config.plan)
      : config.plan;
    const primaryLinkedCheckout =
      normalizedPlan?.kind === 'CHECKOUT'
        ? normalizedPlan.checkoutLinks?.find((link: any) => link.isPrimary) ||
          normalizedPlan.checkoutLinks?.[0] ||
          null
        : null;

    return {
      ...config,
      plan: normalizedPlan,
      referenceCode: primaryLinkedCheckout?.referenceCode || normalizedPlan?.referenceCode || null,
      slug: primaryLinkedCheckout?.slug || normalizedPlan?.slug || null,
      publicLinks:
        normalizedPlan?.kind === 'CHECKOUT'
          ? (normalizedPlan.checkoutLinks || []).map((link: any) => ({
              id: link.id,
              slug: link.slug,
              referenceCode: link.referenceCode,
              isPrimary: link.isPrimary,
              isActive: link.isActive,
              planId: link.planId,
              planName: link.plan?.name || null,
            }))
          : [],
    };
  }

  // ─── Public Checkout (slug / referenceCode) ───────────────────────────────

  async getCheckoutBySlug(
    slug: string,
    context?: {
      correlationId?: string;
      lookupSource?: string;
    },
  ) {
    const correlationId = context?.correlationId || randomUUID();
    this.logCheckoutEvent('checkout_public_lookup_start', {
      correlationId,
      lookupType: 'slug',
      lookupValue: slug,
      lookupSource: context?.lookupSource || 'direct',
    });

    const checkoutLink = await this.prisma.checkoutPlanLink.findFirst({
      where: {
        slug,
        isActive: true,
        checkout: { isActive: true, kind: 'CHECKOUT' },
        plan: { isActive: true, kind: 'PLAN' },
      },
      include: {
        checkout: {
          include: {
            checkoutConfig: { include: { pixels: true } },
          },
        },
        plan: {
          include: {
            product: true,
            checkoutConfig: { include: { pixels: true } },
            orderBumps: {
              where: { isActive: true },
              orderBy: { sortOrder: 'asc' },
            },
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
        orderBumps: {
          where: { isActive: true },
          orderBy: { sortOrder: 'asc' },
        },
        upsells: { where: { isActive: true }, orderBy: { sortOrder: 'asc' } },
      },
    });

    if (planRecord?.isActive && planRecord.kind === 'PLAN' && planRecord.legacyCheckoutEnabled) {
      await this.ensureLegacyCheckoutForPlan(planRecord.id);
      const migratedCheckoutLink = await this.prisma.checkoutPlanLink.findFirst({
        where: {
          slug,
          isActive: true,
          checkout: { isActive: true, kind: 'CHECKOUT' },
          plan: { isActive: true, kind: 'PLAN' },
        },
        include: {
          checkout: {
            include: {
              checkoutConfig: { include: { pixels: true } },
            },
          },
          plan: {
            include: {
              product: true,
              checkoutConfig: { include: { pixels: true } },
              orderBumps: {
                where: { isActive: true },
                orderBy: { sortOrder: 'asc' },
              },
              upsells: { where: { isActive: true }, orderBy: { sortOrder: 'asc' } },
            },
          },
        },
      });

      if (migratedCheckoutLink) {
        this.logCheckoutEvent('checkout_public_lookup_resolved', {
          correlationId,
          lookupType: 'slug',
          lookupValue: slug,
          resolution: 'legacy_checkout_link',
          checkoutId: migratedCheckoutLink.checkoutId,
          planId: migratedCheckoutLink.planId,
        });
        return this.publicPayloadBuilder.build(migratedCheckoutLink.plan, {
          checkoutLink: migratedCheckoutLink,
          checkoutConfigOverride:
            migratedCheckoutLink.checkout.checkoutConfig ||
            migratedCheckoutLink.plan.checkoutConfig,
        });
      }
    }

    if (planRecord?.isActive && planRecord.kind === 'PLAN') {
      const plan = await this.planLinkManager.ensurePlanReferenceCode(planRecord);
      this.logCheckoutEvent('checkout_public_lookup_resolved', {
        correlationId,
        lookupType: 'slug',
        lookupValue: slug,
        resolution: 'plan',
        planId: plan.id,
      });
      return this.publicPayloadBuilder.build(plan);
    }

    return this.getCheckoutByCode(slug, {
      correlationId,
      lookupSource: 'slug_fallback',
    });
  }

  async getCheckoutByCode(
    code: string,
    context?: {
      correlationId?: string;
      lookupSource?: string;
    },
  ) {
    const correlationId = context?.correlationId || randomUUID();
    const normalizedCode = normalizePublicCheckoutCode(code);
    const normalizedCodePrefix = normalizedCode.slice(0, DEFAULT_PUBLIC_CHECKOUT_CODE_LENGTH);
    const legacyCode = String(code || '')
      .trim()
      .toLowerCase();

    this.logCheckoutEvent('checkout_public_lookup_start', {
      correlationId,
      lookupType: 'code',
      lookupValue: code,
      normalizedCode,
      lookupSource: context?.lookupSource || 'direct',
    });

    const checkoutLink = await this.prisma.checkoutPlanLink.findFirst({
      where: {
        isActive: true,
        checkout: { isActive: true, kind: 'CHECKOUT' },
        plan: { isActive: true, kind: 'PLAN' },
        OR: [
          { referenceCode: normalizedCode },
          ...(normalizedCodePrefix &&
          normalizedCodePrefix !== normalizedCode &&
          isValidPublicCheckoutCode(normalizedCodePrefix)
            ? [{ referenceCode: normalizedCodePrefix }]
            : []),
          { referenceCode: code },
        ],
      },
      include: {
        checkout: {
          include: {
            checkoutConfig: { include: { pixels: true } },
          },
        },
        plan: {
          include: {
            product: true,
            checkoutConfig: { include: { pixels: true } },
            orderBumps: {
              where: { isActive: true },
              orderBy: { sortOrder: 'asc' },
            },
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
        OR: [
          { referenceCode: normalizedCode },
          ...(normalizedCodePrefix &&
          normalizedCodePrefix !== normalizedCode &&
          isValidPublicCheckoutCode(normalizedCodePrefix)
            ? [{ referenceCode: normalizedCodePrefix }]
            : []),
          { referenceCode: code },
          { id: { startsWith: legacyCode } },
        ],
      },
      include: {
        product: true,
        checkoutConfig: { include: { pixels: true } },
        orderBumps: {
          where: { isActive: true },
          orderBy: { sortOrder: 'asc' },
        },
        upsells: { where: { isActive: true }, orderBy: { sortOrder: 'asc' } },
      },
    });

    if (planRecord?.isActive && planRecord.kind === 'PLAN' && planRecord.legacyCheckoutEnabled) {
      await this.ensureLegacyCheckoutForPlan(planRecord.id);
      const migratedCheckoutLink = await this.prisma.checkoutPlanLink.findFirst({
        where: {
          isActive: true,
          checkout: { isActive: true, kind: 'CHECKOUT' },
          plan: { isActive: true, kind: 'PLAN' },
          OR: [
            { referenceCode: normalizedCode },
            ...(normalizedCodePrefix &&
            normalizedCodePrefix !== normalizedCode &&
            isValidPublicCheckoutCode(normalizedCodePrefix)
              ? [{ referenceCode: normalizedCodePrefix }]
              : []),
            { referenceCode: code },
          ],
        },
        include: {
          checkout: {
            include: {
              checkoutConfig: { include: { pixels: true } },
            },
          },
          plan: {
            include: {
              product: true,
              checkoutConfig: { include: { pixels: true } },
              orderBumps: {
                where: { isActive: true },
                orderBy: { sortOrder: 'asc' },
              },
              upsells: { where: { isActive: true }, orderBy: { sortOrder: 'asc' } },
            },
          },
        },
      });

      if (migratedCheckoutLink) {
        this.logCheckoutEvent('checkout_public_lookup_resolved', {
          correlationId,
          lookupType: 'code',
          lookupValue: code,
          resolution: 'legacy_checkout_link',
          checkoutId: migratedCheckoutLink.checkoutId,
          planId: migratedCheckoutLink.planId,
        });
        return this.publicPayloadBuilder.build(migratedCheckoutLink.plan, {
          checkoutLink: migratedCheckoutLink,
          checkoutConfigOverride:
            migratedCheckoutLink.checkout.checkoutConfig ||
            migratedCheckoutLink.plan.checkoutConfig,
        });
      }
    }

    if (planRecord?.isActive && planRecord.kind === 'PLAN') {
      const plan = await this.planLinkManager.ensurePlanReferenceCode(planRecord);
      this.logCheckoutEvent('checkout_public_lookup_resolved', {
        correlationId,
        lookupType: 'code',
        lookupValue: code,
        resolution: 'plan',
        planId: plan.id,
      });
      return this.publicPayloadBuilder.build(plan);
    }

    const affiliateLink = await this.prisma.affiliateLink.findFirst({
      where: {
        active: true,
        OR: [
          { code: normalizedCode },
          ...(normalizedCodePrefix &&
          normalizedCodePrefix !== normalizedCode &&
          isValidPublicCheckoutCode(normalizedCodePrefix)
            ? [{ code: normalizedCodePrefix }]
            : []),
          { code },
        ],
      },
      include: {
        affiliateProduct: true,
      },
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
      where: {
        productId: affiliateLink.affiliateProduct.productId,
        isActive: true,
        kind: 'PLAN',
      },
      include: {
        product: true,
        checkoutConfig: { include: { pixels: true } },
        orderBumps: {
          where: { isActive: true },
          orderBy: { sortOrder: 'asc' },
        },
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

    const affiliatePlan = await this.planLinkManager.ensurePlanReferenceCode(affiliatePlanRecord);

    const affiliateCheckoutLink = await this.prisma.checkoutPlanLink.findFirst({
      where: {
        planId: affiliatePlan.id,
        isActive: true,
        checkout: {
          isActive: true,
          kind: 'CHECKOUT',
        },
      },
      include: {
        checkout: {
          include: {
            checkoutConfig: { include: { pixels: true } },
          },
        },
      },
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

  // ─── Order Bumps ──────────────────────────────────────────────────────────

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
    return this.prisma.orderBump.create({ data: { planId, ...data } });
  }

  async updateBump(id: string, data: Prisma.OrderBumpUpdateInput) {
    return this.prisma.orderBump.update({ where: { id }, data });
  }

  async deleteBump(id: string, workspaceId?: string) {
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
      chargeType?: any;
      sortOrder?: number;
    },
  ) {
    const validChargeTypes = ['ONE_CLICK', 'NEW_PAYMENT'];
    if (data.chargeType && !validChargeTypes.includes(data.chargeType)) {
      throw new BadRequestException(
        `Invalid chargeType: ${data.chargeType}. Must be one of: ${validChargeTypes.join(', ')}`,
      );
    }

    return this.prisma.upsell.create({ data: { planId, ...data } });
  }

  async updateUpsell(id: string, data: Prisma.UpsellUpdateInput) {
    return this.prisma.upsell.update({ where: { id }, data });
  }

  async deleteUpsell(id: string, workspaceId?: string) {
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

  async createCoupon(
    workspaceId: string,
    data: {
      code: string;
      discountType: any;
      discountValue: number;
      minOrderValue?: number;
      maxUses?: number;
      maxUsesPerUser?: number;
      startsAt?: Date;
      expiresAt?: Date;
      appliesTo?: any;
    },
  ) {
    const validDiscountTypes = ['PERCENTAGE', 'FIXED'];
    if (data.discountType && !validDiscountTypes.includes(data.discountType)) {
      throw new BadRequestException(
        `Invalid discountType: ${data.discountType}. Must be one of: ${validDiscountTypes.join(', ')}`,
      );
    }

    return this.prisma.checkoutCoupon.create({
      data: { workspaceId, ...data },
    });
  }

  async updateCoupon(id: string, data: Prisma.CheckoutCouponUpdateInput) {
    return this.prisma.checkoutCoupon.update({ where: { id }, data });
  }

  async deleteCoupon(id: string, workspaceId?: string) {
    await this.auditService.log({
      workspaceId: workspaceId || 'unknown',
      action: 'DELETE_RECORD',
      resource: 'CheckoutCoupon',
      resourceId: id,
      details: { deletedBy: 'user' },
    });
    await this.prisma.checkoutCoupon.delete({ where: { id } });
    return { deleted: true };
  }

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

  async validateCoupon(workspaceId: string, code: string, planId: string, orderValue: number) {
    const coupon = await this.prisma.checkoutCoupon.findUnique({
      where: { workspaceId_code: { workspaceId, code: code.toUpperCase() } },
    });

    if (!coupon || !coupon.isActive) {
      return { valid: false, message: 'Cupom invalido ou expirado' };
    }

    const now = new Date();
    if (coupon.startsAt && coupon.startsAt > now) {
      return { valid: false, message: 'Cupom invalido ou expirado' };
    }
    if (coupon.expiresAt && coupon.expiresAt < now) {
      return { valid: false, message: 'Cupom invalido ou expirado' };
    }
    if (coupon.maxUses && coupon.usedCount >= coupon.maxUses) {
      return { valid: false, message: 'Cupom invalido ou expirado' };
    }
    if (coupon.minOrderValue && orderValue < coupon.minOrderValue) {
      return { valid: false, message: 'Cupom invalido ou expirado' };
    }

    // Check appliesTo filter
    const appliesTo = coupon.appliesTo as string[];
    if (appliesTo && appliesTo.length > 0 && !appliesTo.includes(planId)) {
      return { valid: false, message: 'Cupom invalido ou expirado' };
    }

    let discountAmount: number;
    if (coupon.discountType === 'PERCENTAGE') {
      discountAmount = Math.round((orderValue * coupon.discountValue) / 100);
    } else {
      discountAmount = coupon.discountValue;
    }

    return {
      valid: true,
      code: coupon.code,
      discountType: coupon.discountType,
      discountValue: coupon.discountValue,
      discountAmount: Math.min(discountAmount, orderValue),
    };
  }

  // ─── Pixels ───────────────────────────────────────────────────────────────

  async createPixel(
    checkoutConfigId: string,
    data: {
      type: any;
      pixelId: string;
      accessToken?: string;
      trackPageView?: boolean;
      trackInitiateCheckout?: boolean;
      trackAddPaymentInfo?: boolean;
      trackPurchase?: boolean;
    },
  ) {
    const validPixelTypes = [
      'FACEBOOK',
      'GOOGLE_ADS',
      'GOOGLE_ANALYTICS',
      'TIKTOK',
      'KWAI',
      'TABOOLA',
      'CUSTOM',
    ];
    if (data.type && !validPixelTypes.includes(data.type)) {
      throw new BadRequestException(
        `Invalid pixel type: ${data.type}. Must be one of: ${validPixelTypes.join(', ')}`,
      );
    }

    return this.prisma.checkoutPixel.create({
      data: { checkoutConfigId, ...data },
    });
  }

  async updatePixel(id: string, data: Prisma.CheckoutPixelUpdateInput) {
    return this.prisma.checkoutPixel.update({ where: { id }, data });
  }

  async deletePixel(id: string, workspaceId?: string) {
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

  async calculateShipping(slug: string, cep: string) {
    const plan = await this.prisma.checkoutProductPlan.findUnique({
      where: { slug },
      include: { checkoutConfig: true },
    });
    if (!plan) throw new NotFoundException('Plano nao encontrado');
    const quote = buildCheckoutShippingQuote({
      plan,
      checkoutConfig: plan.checkoutConfig,
      destinationZip: cep,
    });
    return {
      options: [
        {
          name: quote.label,
          label: quote.label,
          carrier: quote.method,
          price: quote.priceInCents,
          days: quote.deliveryEstimate,
        },
      ],
    };
  }

  // ─── Config Reset ─────────────────────────────────────────────────────────

  async resetConfig(planId: string) {
    const plan = await this.prisma.checkoutProductPlan.findUnique({
      where: { id: planId },
      include: { product: true },
    });
    if (!plan) throw new NotFoundException('Plano nao encontrado');

    return this.prisma.checkoutConfig.update({
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
        shippingUseKloelCalculator: false,
        affiliateCustomCommissionEnabled: false,
        affiliateCustomCommissionType: null,
        affiliateCustomCommissionAmountInCents: null,
        affiliateCustomCommissionPercent: null,
        customCSS: null,
      },
    });
  }

  // ─── Orders ───────────────────────────────────────────────────────────────

  async createOrder(data: {
    planId: string;
    workspaceId: string;
    correlationId?: string;
    checkoutCode?: string;
    customerName: string;
    customerEmail: string;
    customerCPF?: string;
    customerPhone?: string;
    shippingAddress: Prisma.InputJsonValue;
    shippingMethod?: string;
    shippingPrice?: number;
    orderQuantity?: number;
    subtotalInCents: number;
    discountInCents?: number;
    bumpTotalInCents?: number;
    totalInCents: number;
    couponCode?: string;
    couponDiscount?: number;
    acceptedBumps?: Prisma.InputJsonValue;
    paymentMethod: Prisma.EnumPaymentMethodFilter['equals'];
    installments?: number;
    affiliateId?: string;
    utmSource?: string;
    utmMedium?: string;
    utmCampaign?: string;
    utmContent?: string;
    utmTerm?: string;
    ipAddress?: string;
    userAgent?: string;
    meliSessionId?: string;
    cardHolderName?: string;
    mercadoPagoToken?: string;
    mercadoPagoPaymentMethodId?: string;
    mercadoPagoPaymentType?: string;
    mercadoPagoCardLast4?: string;
  }) {
    const {
      correlationId: incomingCorrelationId,
      checkoutCode,
      affiliateId,
      meliSessionId,
      cardHolderName,
      mercadoPagoToken,
      mercadoPagoPaymentMethodId,
      mercadoPagoPaymentType,
      mercadoPagoCardLast4,
      orderQuantity,
      ...orderData
    } = data;
    const correlationId = incomingCorrelationId || randomUUID();

    this.logCheckoutEvent('checkout_order_create_start', {
      correlationId,
      planId: orderData.planId,
      workspaceId: orderData.workspaceId,
      paymentMethod: orderData.paymentMethod,
      checkoutCode: checkoutCode || null,
    });

    const planRecord = await this.prisma.checkoutProductPlan.findUnique({
      where: { id: orderData.planId },
      include: {
        product: {
          select: {
            id: true,
            workspaceId: true,
            commissionPercent: true,
            name: true,
            description: true,
            imageUrl: true,
            images: true,
            category: true,
            format: true,
          },
        },
        orderBumps: {
          where: { isActive: true },
          select: {
            id: true,
            title: true,
            description: true,
            productName: true,
            image: true,
            priceInCents: true,
          },
        },
        checkoutConfig: true,
      },
    });

    if (!planRecord) {
      throw new NotFoundException('Plano não encontrado para criar o pedido.');
    }

    if (planRecord.product?.workspaceId !== orderData.workspaceId) {
      throw new BadRequestException('O plano informado não pertence ao workspace informado.');
    }

    let affiliateLink: {
      id: string;
      code: string;
      affiliateWorkspaceId: string;
      affiliateProductId: string;
      affiliateProduct: { commissionPct: number; productId: string };
    } | null = null;

    if (checkoutCode) {
      const normalizedCode = String(checkoutCode).trim().toUpperCase();
      affiliateLink = await this.prisma.affiliateLink.findFirst({
        where: {
          active: true,
          OR: [{ code: normalizedCode }, { code: checkoutCode }],
        },
        include: {
          affiliateProduct: {
            select: {
              commissionPct: true,
              productId: true,
            },
          },
        },
        orderBy: { createdAt: 'desc' },
      });

      if (affiliateLink && affiliateLink.affiliateProduct.productId !== planRecord.productId) {
        throw new BadRequestException('O link de afiliado não corresponde ao plano selecionado.');
      }
    }

    const normalizedOrderQuantity = normalizeCheckoutOrderQuantity(orderQuantity);
    const acceptedBumpIds = this.orderSupport.parseAcceptedBumpIds(orderData.acceptedBumps);
    const shippingQuote = buildCheckoutShippingQuote({
      plan: planRecord,
      checkoutConfig: planRecord.checkoutConfig,
      destinationZip:
        orderData.shippingAddress && typeof orderData.shippingAddress === 'object'
          ? String(
              (orderData.shippingAddress as Record<string, unknown>).cep ||
                (orderData.shippingAddress as Record<string, unknown>).zipCode ||
                '',
            )
          : '',
    });
    let normalizedDiscountInCents = 0;

    if (orderData.couponCode) {
      const couponResult = await this.validateCoupon(
        orderData.workspaceId,
        orderData.couponCode,
        orderData.planId,
        Math.max(0, Math.round(Number(planRecord.priceInCents || 0))) * normalizedOrderQuantity,
      );

      if (!couponResult.valid) {
        throw new BadRequestException(couponResult.message || 'Cupom inválido ou expirado.');
      }

      normalizedDiscountInCents = Math.max(0, Math.round(Number(couponResult.discountAmount || 0)));
    }

    const serverTotals = calculateCheckoutServerTotals({
      planPriceInCents: planRecord.priceInCents,
      orderQuantity: normalizedOrderQuantity,
      shippingInCents: shippingQuote.priceInCents,
      discountInCents: normalizedDiscountInCents,
      orderBumps: planRecord.orderBumps,
      acceptedBumpIds,
    });
    const normalizedSubtotalInCents = serverTotals.subtotalInCents;
    const normalizedShippingInCents = serverTotals.shippingInCents;
    const normalizedBumpTotalInCents = serverTotals.bumpTotalInCents;
    const normalizedBaseTotalInCents = serverTotals.totalInCents;
    const normalizedInstallments =
      orderData.paymentMethod === 'CREDIT_CARD'
        ? Math.max(1, Math.round(Number(orderData.installments || 1)))
        : 1;
    const qualityGate = assertMercadoPagoCheckoutQuality({
      customerName: orderData.customerName,
      customerEmail: orderData.customerEmail,
      customerCPF: orderData.customerCPF,
      customerPhone: orderData.customerPhone,
      shippingAddress: orderData.shippingAddress,
      meliSessionId,
    });
    const lineItems = this.orderSupport.buildMercadoPagoLineItems(
      planRecord,
      serverTotals.acceptedBumpIds,
      normalizedOrderQuantity,
    );
    const customerRegistrationDate = await this.orderSupport.resolveMercadoPagoRegistrationDate({
      workspaceId: orderData.workspaceId,
      customerEmail: orderData.customerEmail,
      customerPhone: qualityGate.phoneDigits,
    });
    const platformSplit = this.mercadoPago.buildChargeSummary({
      baseTotalInCents: normalizedBaseTotalInCents,
      paymentMethod: orderData.paymentMethod as 'CREDIT_CARD' | 'PIX' | 'BOLETO',
      installments: normalizedInstallments,
    });
    const affiliateCommissionPct = Number(affiliateLink?.affiliateProduct?.commissionPct || 0);
    const affiliateCommissionInCents = affiliateLink
      ? Math.round(normalizedBaseTotalInCents * (affiliateCommissionPct / 100))
      : 0;
    const producerNetInCents = Math.max(
      0,
      platformSplit.sellerReceivableInCents - affiliateCommissionInCents,
    );
    const affiliateBlockReason = getMercadoPagoAffiliateBlockReason({
      hasAffiliateContext: Boolean(affiliateLink || affiliateId),
    });

    if (affiliateBlockReason) {
      throw new BadRequestException(affiliateBlockReason);
    }

    await this.mercadoPago.assertPaymentMethodAvailable(
      orderData.workspaceId,
      orderData.paymentMethod as 'CREDIT_CARD' | 'PIX' | 'BOLETO',
    );

    const orderNumber = `KL-${Date.now().toString(36).toUpperCase()}${Math.random().toString(36).substring(2, 8).toUpperCase()}`;

    const order = await this.prisma.checkoutOrder.create({
      data: {
        ...orderData,
        shippingPrice: normalizedShippingInCents,
        acceptedBumps: serverTotals.acceptedBumpIds as unknown as Prisma.InputJsonValue,
        subtotalInCents: normalizedSubtotalInCents,
        discountInCents: normalizedDiscountInCents,
        bumpTotalInCents: normalizedBumpTotalInCents,
        totalInCents: normalizedBaseTotalInCents,
        couponCode: orderData.couponCode ? orderData.couponCode.toUpperCase() : null,
        couponDiscount: normalizedDiscountInCents || null,
        installments: normalizedInstallments,
        affiliateId: affiliateLink?.affiliateWorkspaceId || affiliateId,
        metadata: {
          checkoutCode: checkoutCode || null,
          correlationId,
          qualityGateVersion: 'mercado_pago_fixed_v1',
          meliSessionId: qualityGate.meliSessionId,
          customerDocumentDigits: qualityGate.documentDigits,
          customerPhoneDigits: qualityGate.phoneDigits,
          customerRegistrationDate,
          payerAddress: qualityGate.payerAddress,
          pricingVersion: 'server_reconciled_v2',
          orderQuantity: normalizedOrderQuantity,
          productUnitsPerPlan: Math.max(1, Math.round(Number(planRecord.quantity || 1))),
          subtotalClientInCents: Math.max(0, Math.round(Number(orderData.subtotalInCents || 0))),
          discountClientInCents: Math.max(0, Math.round(Number(orderData.discountInCents || 0))),
          bumpTotalClientInCents: Math.max(0, Math.round(Number(orderData.bumpTotalInCents || 0))),
          totalClientInCents: Math.max(0, Math.round(Number(orderData.totalInCents || 0))),
          lineItems,
          affiliateLinkId: affiliateLink?.id || null,
          affiliateCode: affiliateLink?.code || null,
          affiliateWorkspaceId: affiliateLink?.affiliateWorkspaceId || null,
          affiliateCommissionPct: affiliateCommissionPct || null,
          affiliateCommissionInCents,
          baseTotalInCents: platformSplit.baseTotalInCents,
          chargedTotalInCents: platformSplit.chargedTotalInCents,
          installmentInterestMonthlyPercent: platformSplit.installmentInterestMonthlyPercent,
          installmentInterestInCents: platformSplit.installmentInterestInCents,
          estimatedGatewayFeePercent: platformSplit.gatewayFeePercent,
          estimatedGatewayFeeInCents: platformSplit.estimatedGatewayFeeInCents,
          platformFeePercent: platformSplit.platformFeePercent,
          platformFeeInCents: platformSplit.platformFeeInCents,
          platformGrossRevenueInCents: platformSplit.platformGrossRevenueInCents,
          platformNetRevenueInCents: platformSplit.platformNetRevenueInCents,
          marketplaceFeeInCents: platformSplit.marketplaceFeeInCents,
          sellerReceivableInCents: platformSplit.sellerReceivableInCents,
          producerNetInCents,
          payoutStrategy: affiliateLink
            ? 'marketplace_fee_plus_affiliate_reconciliation'
            : 'marketplace_fee',
        },
        orderNumber,
      },
      include: {
        plan: {
          include: {
            product: true,
            upsells: {
              where: { isActive: true },
              orderBy: { sortOrder: 'asc' },
            },
          },
        },
        payment: true,
      },
    });

    this.logCheckoutEvent('checkout_order_created', {
      correlationId,
      orderId: order.id,
      orderNumber,
      planId: data.planId,
      workspaceId: data.workspaceId,
      totalInCents: normalizedBaseTotalInCents,
    });

    // Idempotent: orderId is used as idempotencyKey inside CheckoutPaymentService.
    // On retry, existingRecord with same externalReference prevents double-charge.
    let paymentData: any = null;
    try {
      paymentData = await this.paymentService.processPayment({
        orderId: order.id,
        idempotencyKey: order.id,
        workspaceId: data.workspaceId,
        customerName: data.customerName,
        customerEmail: data.customerEmail,
        customerCPF: data.customerCPF,
        customerPhone: data.customerPhone,
        paymentMethod: orderData.paymentMethod,
        totalInCents: normalizedBaseTotalInCents,
        installments: normalizedInstallments,
        cardToken: mercadoPagoToken,
        cardPaymentMethodId: mercadoPagoPaymentMethodId,
        cardPaymentType: mercadoPagoPaymentType,
        cardHolderName,
        cardLast4: mercadoPagoCardLast4,
      });

      const contactSync = await this.orderSupport.ensureCheckoutContactRecord({
        workspaceId: data.workspaceId,
        customerName: data.customerName,
        customerEmail: data.customerEmail,
        customerPhone: qualityGate.phoneDigits,
        shippingAddress:
          data.shippingAddress && typeof data.shippingAddress === 'object'
            ? (data.shippingAddress as Record<string, unknown>)
            : undefined,
      });

      if (!contactSync.synced && !contactSync.skipped) {
        this.logCheckoutEvent('checkout_contact_sync_failed', {
          correlationId,
          orderId: order.id,
          orderNumber,
          planId: data.planId,
          workspaceId: data.workspaceId,
          reason: contactSync.reason,
          message: contactSync.errorMessage,
        });
      }

      if (data.couponCode && data.workspaceId) {
        await this.prisma.checkoutCoupon.updateMany({
          where: {
            workspaceId: data.workspaceId,
            code: data.couponCode.toUpperCase(),
          },
          data: { usedCount: { increment: 1 } },
        });
      }
      // PULSE:OK — order is already created in DB; payment failure is returned to caller via paymentData=undefined
    } catch (e) {
      this.logCheckoutEvent('checkout_order_payment_failed', {
        correlationId,
        orderId: order.id,
        orderNumber,
        planId: data.planId,
        workspaceId: data.workspaceId,
        message: (e as Error).message,
      });
      throw e;
    }

    return { ...order, paymentData };
  }

  async getOrder(orderId: string) {
    const order = await this.prisma.checkoutOrder.findUnique({
      where: { id: orderId },
      include: {
        plan: {
          include: {
            product: true,
            upsells: {
              where: { isActive: true },
              orderBy: { sortOrder: 'asc' },
            },
          },
        },
        payment: true,
        upsellOrders: true,
      },
    });
    if (!order) throw new NotFoundException('Order not found');
    return order;
  }

  async listOrders(
    workspaceId: string,
    filters?: { status?: string; page?: number; limit?: number },
  ) {
    const page = filters?.page || 1;
    const limit = filters?.limit || 20;
    const where: any = { workspaceId };
    if (filters?.status) where.status = filters.status;

    const [orders, total] = await this.prisma.$transaction([
      this.prisma.checkoutOrder.findMany({
        where,
        include: {
          plan: { select: { name: true, slug: true } },
          payment: { select: { status: true, gateway: true } },
        },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.checkoutOrder.count({ where }),
    ]);

    const safeLimit = Math.max(1, limit);
    return {
      orders,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / safeLimit),
    };
  }

  async updateOrderStatus(orderId: string, status: any, extra?: Record<string, any>) {
    const validOrderStatuses = [
      'PENDING',
      'PROCESSING',
      'PAID',
      'SHIPPED',
      'DELIVERED',
      'CANCELED',
      'REFUNDED',
      'CHARGEBACK',
    ];
    if (!validOrderStatuses.includes(status)) {
      throw new BadRequestException(
        `Invalid order status: ${status}. Must be one of: ${validOrderStatuses.join(', ')}`,
      );
    }

    const data: any = { status };
    const now = new Date();

    if (status === 'PAID') data.paidAt = now;
    if (status === 'SHIPPED') data.shippedAt = now;
    if (status === 'DELIVERED') data.deliveredAt = now;
    if (status === 'CANCELED') data.canceledAt = now;
    if (status === 'REFUNDED') data.refundedAt = now;

    if (extra) Object.assign(data, extra);

    const existingOrder = await this.prisma.checkoutOrder.findUnique({
      where: { id: orderId },
      select: { workspaceId: true, status: true },
    });
    const updated = await this.prisma.checkoutOrder.update({
      where: { id: orderId },
      data,
    });
    if (existingOrder?.workspaceId) {
      await this.auditService.log({
        workspaceId: existingOrder.workspaceId,
        action: 'ORDER_STATUS_CHANGED',
        resource: 'CheckoutOrder',
        resourceId: orderId,
        details: { previousStatus: existingOrder.status, newStatus: status },
      });
    }
    return updated;
  }

  async getOrderStatus(orderId: string) {
    const order = await this.prisma.checkoutOrder.findUnique({
      where: { id: orderId },
      select: {
        id: true,
        orderNumber: true,
        status: true,
        payment: {
          select: {
            status: true,
            pixQrCode: true,
            pixCopyPaste: true,
            pixExpiresAt: true,
            boletoUrl: true,
            boletoBarcode: true,
            boletoExpiresAt: true,
          },
        },
        plan: {
          select: {
            id: true,
            name: true,
            upsells: {
              where: { isActive: true },
              orderBy: { sortOrder: 'asc' },
              select: {
                id: true,
                title: true,
                headline: true,
                description: true,
                productName: true,
                image: true,
                priceInCents: true,
                compareAtPrice: true,
                acceptBtnText: true,
                declineBtnText: true,
                timerSeconds: true,
              },
            },
          },
        },
        upsellOrders: { select: { id: true, upsellId: true } },
      },
    });
    if (!order) throw new NotFoundException('Order not found');
    return order;
  }

  // ─── Upsell Accept / Decline ────────────────────────────────────────────

  async acceptUpsell(orderId: string, upsellId: string) {
    const order = await this.prisma.checkoutOrder.findUnique({
      where: { id: orderId },
      select: { id: true, status: true },
    });
    if (!order) throw new NotFoundException('Order not found');

    const upsell = await this.prisma.upsell.findUnique({
      where: { id: upsellId },
    });
    if (!upsell) throw new NotFoundException('Upsell not found');

    // Create UpsellOrder
    const upsellOrder = await this.prisma.upsellOrder.create({
      data: {
        orderId,
        upsellId,
        productName: upsell.productName,
        priceInCents: upsell.priceInCents,
        status: upsell.chargeType === 'ONE_CLICK' ? 'PAID' : 'PENDING',
      },
    });

    this.logger.log(`Upsell ${upsellId} accepted for order ${orderId} (${upsell.chargeType})`);

    const fullOrder = await this.prisma.checkoutOrder.findUnique({
      where: { id: orderId },
      select: { workspaceId: true },
    });
    if (fullOrder?.workspaceId) {
      await this.auditService.log({
        workspaceId: fullOrder.workspaceId,
        action: 'UPSELL_ACCEPTED',
        resource: 'UpsellOrder',
        resourceId: upsellOrder.id,
        details: {
          orderId,
          upsellId,
          priceInCents: upsell.priceInCents,
          chargeType: upsell.chargeType,
        },
      });
    }

    return {
      accepted: true,
      upsellOrder,
      chargeType: upsell.chargeType,
    };
  }

  async getRecentPaidOrders(limit: number) {
    return this.prisma.checkoutOrder.findMany({
      where: { status: 'PAID' },
      orderBy: { createdAt: 'desc' },
      take: limit,
      include: { plan: { include: { product: true } } },
    });
  }

  async declineUpsell(orderId: string, upsellId: string) {
    const order = await this.prisma.checkoutOrder.findUnique({
      where: { id: orderId },
      select: { id: true },
    });
    if (!order) throw new NotFoundException('Order not found');

    this.logger.log(`Upsell ${upsellId} declined for order ${orderId}`);

    return { declined: true };
  }
}
