import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { forEachSequential } from '../common/async-sequence';
import { PrismaService } from '../prisma/prisma.service';
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
  workspaceId?: string | null;
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
    private readonly prisma: PrismaService,
  ) {}

  async runApprovedOrderEffects(orderId: string, workspaceId: string) {
    const order = await this.prisma.checkoutOrder.findUnique({
      where: { id: orderId },
      select: {
        id: true,
        orderNumber: true,
        customerName: true,
        customerEmail: true,
        customerPhone: true,
        totalInCents: true,
        ipAddress: true,
        userAgent: true,
        workspaceId: true,
        metadata: true,
        plan: {
          select: {
            productId: true,
            product: { select: { name: true } },
            checkoutConfig: { select: { pixels: true } },
          },
        },
      },
    });

    if (!order || order.workspaceId !== workspaceId) {
      return;
    }

    await this.markLeadConverted(order, workspaceId);
    await this.sendPurchaseSignals(order, workspaceId);
  }

  /** Mark lead converted. */
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

  /** Send purchase signals. */
  async sendPurchaseSignals(order: CheckoutOrderForEffects, workspaceId?: string) {
    await this.sendFacebookPurchaseEvent(order, workspaceId);
  }

  private readOrderMetadata(metadata: Prisma.JsonValue | null | undefined) {
    if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) {
      return {} as Record<string, unknown>;
    }
    return metadata as Record<string, unknown>;
  }

  private async sendFacebookPurchaseEvent(order: CheckoutOrderForEffects, workspaceId?: string) {
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
        const resourceId = `${order.id || 'unknown'}:${pixel.pixelId}`;
        if (workspaceId && order.id) {
          const alreadySent = await this.prisma.auditLog.findFirst({
            where: {
              workspaceId,
              action: 'facebook_capi_purchase_sent',
              resource: 'CheckoutOrder',
              resourceId,
            },
            select: { id: true },
          });
          if (alreadySent) {
            return;
          }
        }

        const sent = await this.facebookCAPI.sendEvent({
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
        if (sent && workspaceId && order.id) {
          await this.prisma.auditLog.create({
            data: {
              workspaceId,
              action: 'facebook_capi_purchase_sent',
              resource: 'CheckoutOrder',
              resourceId,
              details: {
                pixelId: pixel.pixelId,
                orderId: order.id,
              },
            },
          });
        }
      });
    } catch (error) {
      this.logger.error(`Facebook CAPI lookup error: ${error}`);
    }
  }
}
