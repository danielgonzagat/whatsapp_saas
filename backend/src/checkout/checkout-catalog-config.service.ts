import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { buildCheckoutShippingQuote } from './checkout-shipping-profile.util';

/** Handles shipping calculation and config reset for checkout catalog. */
@Injectable()
export class CheckoutCatalogConfigService {
  private readonly logger = new Logger(CheckoutCatalogConfigService.name);

  constructor(private readonly prisma: PrismaService) {}

  /** Calculate shipping. */
  // PULSE_OK: rate-limited by CheckoutPublicController
  async calculateShipping(slug: string, cep: string) {
    this.logger.log({ operation: 'calculateShipping', slug, cep });
    const plan = await this.prisma.checkoutProductPlan.findUnique({
      where: { slug },
      include: { checkoutConfig: true },
    });
    if (!plan) {
      throw new NotFoundException('Plano nao encontrado');
    }
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

  /** Reset config to defaults. */
  // PULSE_OK: rate-limited by CheckoutPublicController
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
            shippingUseKloelCalculator: false,
            affiliateCustomCommissionEnabled: false,
            affiliateCustomCommissionType: null,
            affiliateCustomCommissionAmountInCents: null,
            affiliateCustomCommissionPercent: null,
            customCSS: null,
          },
        });
      },
      { isolationLevel: 'ReadCommitted' },
    );
  }
}
