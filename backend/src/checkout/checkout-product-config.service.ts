import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { buildCheckoutMarketplacePricing } from './checkout-marketplace-pricing.util';
import { CheckoutPlanLinkManager } from './checkout-plan-link.manager';

const DEFAULT_MARKETPLACE_FEE_PERCENT = 9.9;

/** Helpers for default config, marketplace fee resolution, and legacy checkout provisioning. */
/** Idempotency: enforced at HTTP layer via @Idempotent() guard + Stripe idempotencyKey. */
@Injectable()
export class CheckoutProductConfigService {
  constructor(private readonly prisma: PrismaService) {}

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

  /** Build pricing preview using marketplace fee resolution. */
  async buildPricingPreview(baseTotalInCents: number) {
    const marketplaceFeePercent = await this.resolveMarketplaceFeePercent('PIX', baseTotalInCents);
    return buildCheckoutMarketplacePricing({
      baseTotalInCents,
      paymentMethod: 'PIX',
      installments: 1,
      marketplaceFeePercent,
      installmentInterestMonthlyPercent: 3.99,
      gatewayFeePercent: 0,
    });
  }

  /** Build cloned checkout config input from an existing config record. */
  buildClonedCheckoutConfigInput(
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
    };
  }

  /** Ensure a legacy checkout exists for the given plan. */
  async ensureLegacyCheckoutForPlan(planId: string, planLinkManager: CheckoutPlanLinkManager) {
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

    const slug = await planLinkManager.generateCheckoutSlug(`${plan.name}-checkout`);
    const referenceCode = await planLinkManager.generatePublicCheckoutCode();

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
          },
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

  /** Ensure legacy checkouts exist for all PLAN-kind entries of a product. */
  async ensureLegacyCheckoutsForProduct(
    productId: string,
    planLinkManager: CheckoutPlanLinkManager,
  ) {
    const legacyPlans = await this.prisma.checkoutProductPlan.findMany({
      where: {
        productId,
        kind: 'PLAN',
        legacyCheckoutEnabled: true,
      },
      select: { id: true },
    });

    for (const legacyPlan of legacyPlans) {
      await this.ensureLegacyCheckoutForPlan(legacyPlan.id, planLinkManager);
    }
  }
}
