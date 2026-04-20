import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { forEachSequential } from '../common/async-sequence';
import { escapeHtml } from '../common/utils/html-escape.util';
import { CheckoutSocialLeadService } from './checkout-social-lead.service';
import { FacebookCAPIService } from './facebook-capi.service';

type CheckoutPixelConfig = {
  type?: string | null;
  isActive?: boolean | null;
  trackPurchase?: boolean | null;
  accessToken?: string | null;
  pixelId?: string | null;
};

type CheckoutOrderForEffects = {
  id?: string;
  orderNumber?: string | null;
  customerName?: string | null;
  customerEmail?: string | null;
  customerPhone?: string | null;
  totalInCents?: number | null;
  ipAddress?: string | null;
  userAgent?: string | null;
  metadata?: Prisma.JsonValue | null;
  plan?: {
    productId?: string | null;
    product?: { name?: string | null } | null;
    checkoutConfig?: { pixels?: CheckoutPixelConfig[] | null } | null;
  } | null;
};

/** Checkout post payment effects service. */
@Injectable()
export class CheckoutPostPaymentEffectsService {
  private readonly logger = new Logger(CheckoutPostPaymentEffectsService.name);

  constructor(
    private readonly facebookCAPI: FacebookCAPIService,
    private readonly checkoutSocialLeadService: CheckoutSocialLeadService,
  ) {}

  async markLeadConverted(order: CheckoutOrderForEffects, workspaceId?: string) {
    if (!workspaceId || !order.id) {
      return;
    }

    const orderMetadata = this.readOrderMetadata(order.metadata);
    const capturedLeadId =
      typeof orderMetadata.capturedLeadId === 'string' ? orderMetadata.capturedLeadId : null;
    const deviceFingerprint =
      typeof orderMetadata.deviceFingerprint === 'string' ? orderMetadata.deviceFingerprint : null;

    await this.checkoutSocialLeadService
      .markConvertedFromOrder({
        workspaceId,
        orderId: order.id,
        capturedLeadId,
        customerEmail: order.customerEmail || undefined,
        customerPhone: order.customerPhone || undefined,
        deviceFingerprint,
      })
      .catch(() => undefined);
  }

  async sendPurchaseSignals(order: CheckoutOrderForEffects, chargedAmount: number) {
    await this.sendFacebookPurchaseEvent(order);
    await this.sendPaymentConfirmationEmail(order, chargedAmount);
  }

  private readOrderMetadata(metadata: Prisma.JsonValue | null | undefined) {
    if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) {
      return {} as Record<string, unknown>;
    }
    return metadata as Record<string, unknown>;
  }

  private async sendFacebookPurchaseEvent(order: CheckoutOrderForEffects) {
    try {
      const pixels = order.plan?.checkoutConfig?.pixels || [];
      const fbPixels = pixels.filter(
        (pixel) =>
          pixel.type === 'FACEBOOK' &&
          pixel.isActive === true &&
          pixel.trackPurchase === true &&
          Boolean(pixel.accessToken),
      );

      await forEachSequential(fbPixels, async (pixel) => {
        if (!pixel.pixelId || !pixel.accessToken) {
          return;
        }
        await this.facebookCAPI.sendEvent({
          pixelId: pixel.pixelId,
          accessToken: pixel.accessToken,
          eventName: 'Purchase',
          email: order.customerEmail || undefined,
          phone: order.customerPhone || undefined,
          amount: Number(order.totalInCents || 0),
          currency: 'BRL',
          productId: order.plan?.productId || undefined,
          ip: order.ipAddress || undefined,
          userAgent: order.userAgent || undefined,
        });
      });
    } catch (error) {
      this.logger.error(`Facebook CAPI lookup error: ${error}`);
    }
  }

  private async sendPaymentConfirmationEmail(
    order: CheckoutOrderForEffects,
    chargedAmount: number,
  ) {
    try {
      const emailService = new (await import('../auth/email.service')).EmailService();
      await emailService.sendEmail({
        to: order.customerEmail || '',
        subject: `Pagamento confirmado — ${order.plan?.product?.name || 'Seu pedido'}`,
        html: `<div style="font-family:sans-serif;max-width:600px;margin:0 auto;background:#0A0A0C;color:#e0e0e0;padding:40px;">
      <h1 style="color:#E85D30;">KLOEL</h1>
      <p>Ola ${escapeHtml(order.customerName || '')},</p>
      <p>Seu pagamento foi confirmado!</p>
      <div style="background:#151517;padding:20px;border-radius:6px;margin:20px 0;">
        <p><strong>Produto:</strong> ${escapeHtml(order.plan?.product?.name || '\u2014')}</p>
        <p><strong>Valor:</strong> R$ ${Number((chargedAmount || Number(order.totalInCents || 0) / 100).toFixed(2))}</p>
        <p><strong>Pedido:</strong> #${escapeHtml(order.orderNumber || order.id || '')}</p>
      </div>
    </div>`,
      });
    } catch (error) {
      this.logger.warn(`Payment confirmation email failed: ${error}`);
    }
  }
}
