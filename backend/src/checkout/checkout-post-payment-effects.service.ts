import { Injectable } from '@nestjs/common';
import { StructuredLogger } from '../logging/structured-logger';
import { Prisma } from '@prisma/client';
import * as Sentry from '@sentry/node';
import { forEachSequential } from '../common/async-sequence';
import { formatBrlAmount } from '../kloel/money-format.util';
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
  private readonly logger = StructuredLogger.from(CheckoutPostPaymentEffectsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly facebookCAPI: FacebookCAPIService,
    private readonly checkoutSocialLeadService: CheckoutSocialLeadService,
  ) {}

  /** Mark lead converted + auto-enroll in linked member areas. */
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
        ...(capturedLeadId !== null ? { capturedLeadId } : {}),
        ...(order.customerEmail !== undefined && order.customerEmail !== null
          ? { customerEmail: order.customerEmail }
          : {}),
        ...(order.customerPhone !== undefined && order.customerPhone !== null
          ? { customerPhone: order.customerPhone }
          : {}),
        ...(deviceFingerprint !== null ? { deviceFingerprint } : {}),
      })
      .catch(() => undefined);

    await this.autoEnrollInMemberAreas(
      workspaceId,
      order.plan?.productId ?? null,
      order.customerEmail ?? null,
      order.customerName ?? null,
      order.customerPhone ?? null,
    );
  }

  /** Send purchase signals. */
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
          ...(order.customerEmail !== undefined && order.customerEmail !== null
            ? { email: order.customerEmail }
            : {}),
          ...(order.customerPhone !== undefined && order.customerPhone !== null
            ? { phone: order.customerPhone }
            : {}),
          amount: Number(order.totalInCents || 0),
          currency: 'BRL',
          ...(order.plan?.productId !== undefined && order.plan?.productId !== null
            ? { productId: order.plan.productId }
            : {}),
          ...(order.ipAddress !== undefined && order.ipAddress !== null
            ? { ip: order.ipAddress }
            : {}),
          ...(order.userAgent !== undefined && order.userAgent !== null
            ? { userAgent: order.userAgent }
            : {}),
        });
      });
    } catch (error: unknown) {
      this.logger.error(`Facebook CAPI lookup error: ${String(error)}`);
      Sentry.captureException(error, {
        tags: { type: 'financial_post_payment_effect', channel: 'facebook_capi' },
        extra: { orderId: order.id, orderNumber: order.orderNumber },
        level: 'warning',
      });
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
        html: this.buildPaymentConfirmationHtml(order, chargedAmount),
      });
    } catch (error: unknown) {
      this.logger.warn(`Payment confirmation email failed: ${String(error)}`);
      Sentry.captureException(error, {
        tags: { type: 'financial_post_payment_effect', channel: 'email' },
        extra: { orderId: order.id, orderNumber: order.orderNumber },
        level: 'warning',
      });
    }
  }

  private async autoEnrollInMemberAreas(
    workspaceId: string,
    productId: string | null,
    customerEmail: string | null,
    customerName: string | null,
    customerPhone: string | null,
  ) {
    if (!productId || !customerEmail) {
      return;
    }

    try {
      const areas = await this.prisma.memberArea.findMany({
        where: { workspaceId, productId, active: true },
      });

      for (const area of areas) {
        const existing = await this.prisma.memberEnrollment.findFirst({
          where: { workspaceId, memberAreaId: area.id, studentEmail: customerEmail },
        });

        if (!existing) {
          await this.prisma.memberEnrollment.create({
            data: {
              workspaceId,
              memberAreaId: area.id,
              studentName: (customerName || '').trim() || 'Aluno',
              studentEmail: customerEmail,
              studentPhone: customerPhone || null,
            },
          });

          const enrollmentAgg = await this.prisma.memberEnrollment.aggregate({
            where: { memberAreaId: area.id, workspaceId },
            _count: { _all: true },
            _avg: { progress: true },
          });

          await this.prisma.memberArea.updateMany({
            where: { id: area.id, workspaceId },
            data: {
              totalStudents: enrollmentAgg._count._all,
              avgCompletion: Number(enrollmentAgg._avg.progress || 0),
            },
          });

          this.logger.log(
            `Auto-enrolled ${customerEmail} into member area ${area.id} (${area.name})`,
          );
        }
      }
    } catch (error: unknown) {
      this.logger.warn(
        `Auto-enrollment failed for product ${productId}: ${error instanceof Error ? error.message : String(error)}`,
      );
      Sentry.captureException(error, {
        tags: { type: 'financial_post_payment_effect', channel: 'member_area_auto_enroll' },
        extra: { workspaceId, productId, customerEmail },
        level: 'warning',
      });
    }
  }

  private buildPaymentConfirmationHtml(
    order: CheckoutOrderForEffects,
    chargedAmount: number,
  ): string {
    const amountSource = chargedAmount || Number(order.totalInCents || 0) / 100;
    const { renderEmailTemplate } = require('../common/utils/email-template-renderer.util');
    return renderEmailTemplate('payment-confirmation', {
      customerName: order.customerName || '',
      productName: order.plan?.product?.name || '\u2014',
      orderNumber: order.orderNumber || order.id || '',
      formattedAmount: formatBrlAmount(amountSource),
      memberAreaSection: '',
    });
  }
}
