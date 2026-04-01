import {
  Controller,
  Post,
  Body,
  Logger,
  HttpCode,
  Headers,
  ForbiddenException,
  Req,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { FacebookCAPIService } from './facebook-capi.service';
import { Public } from '../auth/public.decorator';
import { Throttle } from '@nestjs/throttler';

/** Dynamic Prisma accessor — bypasses generated types for models/relations not yet in schema. */

type PrismaDynamic = Record<string, any> & {
  $transaction: (...args: any[]) => Promise<any>;
};

@Controller('checkout/webhooks')
export class CheckoutWebhookController {
  private readonly logger = new Logger(CheckoutWebhookController.name);
  private readonly prismaAny: PrismaDynamic;

  constructor(
    private readonly prisma: PrismaService,
    private readonly facebookCAPI: FacebookCAPIService,
  ) {
    this.prismaAny = prisma as unknown as PrismaDynamic;
  }

  @Public()
  @Post('asaas')
  @HttpCode(200)
  @Throttle({ default: { limit: 200, ttl: 60000 } })
  async handleAsaasWebhook(
    @Headers('asaas-access-token') accessToken: string,
    @Body() body: any,
    @Req() req: any,
  ) {
    // Signature verification — reject unauthorized webhooks
    const expected = process.env.ASAAS_WEBHOOK_TOKEN;
    if (expected && (!accessToken || accessToken !== expected)) {
      this.logger.warn(`Checkout webhook rejected — invalid token`, {
        ip: req?.ip,
      });
      throw new ForbiddenException('Invalid webhook token');
    }

    const { event, payment } = body;
    this.logger.log(
      `Checkout Asaas webhook: ${event} for payment ${payment?.id}`,
    );

    if (!payment?.id) return { received: true };

    const paymentInclude = {
      order: {
        include: {
          plan: {
            include: {
              product: true,
              checkoutConfig: { include: { pixels: true } },
            },
          },
        },
      },
    };

    // Try finding by externalId first, then by record ID, then by externalReference
    let checkoutPayment = await this.prisma.checkoutPayment.findFirst({
      where: { externalId: payment.id },
      include: paymentInclude,
    });

    if (!checkoutPayment && payment.externalReference) {
      checkoutPayment = await this.prisma.checkoutPayment.findFirst({
        where: {
          OR: [
            { id: payment.externalReference },
            { orderId: payment.externalReference },
          ],
        },
        include: paymentInclude,
      });
    }

    if (!checkoutPayment) {
      this.logger.warn(
        `CheckoutPayment not found for externalId: ${payment.id}, ref: ${payment.externalReference}`,
      );
      return { received: true };
    }

    // ── IDEMPOTENCY CHECK ─────────────────────────────────────────────
    const idempotencyMap: Record<string, string> = {
      PAYMENT_CONFIRMED: 'APPROVED',
      PAYMENT_RECEIVED: 'APPROVED',
      PAYMENT_CREDIT_CARD_CONFIRMED: 'APPROVED',
      PAYMENT_REFUNDED: 'REFUNDED',
      PAYMENT_CHARGEBACK_REQUESTED: 'CHARGEBACK',
    };
    const expectedStatus = idempotencyMap[event];
    if (expectedStatus && checkoutPayment?.status === expectedStatus) {
      this.logger.log(
        `Webhook ${event} for payment ${payment.id} already processed (status: ${checkoutPayment.status}). Skipping.`,
      );
      return { received: true, duplicate: true };
    }

    const statusMap: Record<string, string> = {
      PAYMENT_CONFIRMED: 'APPROVED',
      PAYMENT_RECEIVED: 'APPROVED',
      PAYMENT_CREDIT_CARD_CONFIRMED: 'APPROVED',
      PAYMENT_OVERDUE: 'EXPIRED',
      PAYMENT_DELETED: 'CANCELED',
      PAYMENT_REFUNDED: 'REFUNDED',
      PAYMENT_CHARGEBACK_REQUESTED: 'CHARGEBACK',
    };

    const newStatus = statusMap[event];
    if (!newStatus) return { received: true };

    const order = (checkoutPayment as any).order;
    const product = order?.plan?.product;
    const workspaceId: string | undefined = order?.workspaceId;

    try {
      // ── PAYMENT CONFIRMED FLOW ──────────────────────────────────────
      if (newStatus === 'APPROVED') {
        await this.handlePaymentConfirmed(
          checkoutPayment as any,
          order,
          product,
          workspaceId,
          payment,
        );
      }

      // ── REFUND / CHARGEBACK FLOW ────────────────────────────────────
      if (newStatus === 'REFUNDED' || newStatus === 'CHARGEBACK') {
        await this.handleRefundOrChargeback(
          checkoutPayment as any,
          order,
          workspaceId,
          payment,
          newStatus,
        );
      }

      // ── CANCELED / EXPIRED ──────────────────────────────────────────
      if (newStatus === 'CANCELED' || newStatus === 'EXPIRED') {
        await this.prisma.$transaction(
          // isolationLevel: ReadCommitted
          async (tx) => {
            await tx.checkoutPayment.update({
              where: { id: checkoutPayment.id },
              data: { status: newStatus as any },
            });
            await tx.checkoutOrder.update({
              where: { id: checkoutPayment.orderId },
              data: { status: 'CANCELED' as any, canceledAt: new Date() },
            });
          },
          { isolationLevel: 'ReadCommitted' },
        );
      }
    } catch (err: any) {
      // Webhook must never fail — always return 200
      this.logger.error(
        `Error processing checkout webhook event=${event} paymentId=${payment?.id}: ${err?.message}`,
        err?.stack,
      );
    }

    return { received: true, processed: true };
  }

  // ── PAYMENT CONFIRMED ─────────────────────────────────────────────
  private async handlePaymentConfirmed(
    checkoutPayment: any,
    order: any,
    product: any,
    workspaceId: string | undefined,
    asaasPayment: any,
  ) {
    const now = new Date();
    const amountInCents: number = order?.totalInCents ?? 0;
    const amount = amountInCents / 100;
    const productName: string =
      product?.name || order?.plan?.name || 'Checkout';

    await this.prismaAny.$transaction(async (tx: PrismaDynamic) => {
      // isolationLevel: ReadCommitted
      // 1. Update CheckoutPayment status → APPROVED (=PAID)
      await tx.checkoutPayment.update({
        where: { id: checkoutPayment.id },
        data: { status: 'APPROVED', webhookData: asaasPayment },
      });

      // 2. Update CheckoutOrder status → PAID, set paidAt
      await tx.checkoutOrder.update({
        where: { id: checkoutPayment.orderId },
        data: { status: 'PAID', paidAt: now },
      });

      // 3. Create or update KloelSale
      try {
        const existingSale = await tx.kloelSale.findFirst({
          where: { externalPaymentId: asaasPayment.id },
        });
        if (existingSale) {
          await tx.kloelSale.update({
            where: { id: existingSale.id },
            data: { status: 'paid', paidAt: now, amount },
          });
        } else if (workspaceId) {
          await tx.kloelSale.create({
            data: {
              workspaceId,
              externalPaymentId: asaasPayment.id,
              productName,
              amount,
              status: 'paid',
              paidAt: now,
              paymentMethod:
                asaasPayment.billingType || order?.paymentMethod || null,
              metadata: {
                checkoutOrderId: order?.id,
                checkoutPaymentId: checkoutPayment.id,
                orderNumber: order?.orderNumber,
              },
            },
          });
        }
      } catch (saleErr: any) {
        // PULSE:OK — KloelSale sync is non-critical; webhook processing continues
        this.logger.warn(`KloelSale upsert failed: ${saleErr?.message}`);
      }

      // 4 & 5. Update KloelWallet (increment pendingBalance) + create KloelWalletTransaction
      if (workspaceId) {
        try {
          // Get or create wallet
          let wallet = await tx.kloelWallet.findUnique({
            where: { workspaceId },
          });
          if (!wallet) {
            wallet = await tx.kloelWallet.create({
              data: {
                workspaceId,
                availableBalance: 0,
                pendingBalance: 0,
                blockedBalance: 0,
              },
            });
          }

          // Increment pendingBalance (not availableBalance — funds settle later)
          await tx.kloelWallet.update({
            where: { id: wallet.id },
            data: { pendingBalance: { increment: amount } },
          });

          // Create wallet transaction of type 'sale'
          await tx.kloelWalletTransaction.create({
            data: {
              walletId: wallet.id,
              type: 'sale',
              amount,
              description: `Venda checkout: ${productName} (#${order?.orderNumber || 'N/A'})`,
              reference: checkoutPayment.orderId,
              status: 'pending',
              metadata: {
                checkoutOrderId: order?.id,
                externalPaymentId: asaasPayment.id,
                grossAmount: amount,
                orderNumber: order?.orderNumber,
              },
            },
          });
        } catch (walletErr: any) {
          // PULSE:OK — Wallet update non-critical in webhook; funds reconciled via Asaas later
          this.logger.warn(`Wallet update failed: ${walletErr?.message}`);
        }
      }

      // 6. If the product is physical, create PhysicalOrder with status PROCESSING
      if (workspaceId && product?.format === 'PHYSICAL') {
        try {
          const shippingAddress = order?.shippingAddress || {};
          await tx.physicalOrder.create({
            data: {
              workspaceId,
              customerName: order?.customerName || '',
              customerEmail: order?.customerEmail || null,
              customerPhone: order?.customerPhone || null,
              productId: product.id,
              productName: product.name,
              quantity: order?.plan?.quantity || 1,
              amount,
              status: 'PROCESSING',
              shippingMethod: order?.shippingMethod || null,
              shippingCost: order?.shippingPrice
                ? order.shippingPrice / 100
                : null,
              addressStreet:
                shippingAddress.street || shippingAddress.address || null,
              addressCity: shippingAddress.city || null,
              addressState: shippingAddress.state || null,
              addressZip:
                shippingAddress.zip ||
                shippingAddress.zipCode ||
                shippingAddress.cep ||
                null,
              addressCountry: shippingAddress.country || 'BR',
              paymentMethod: order?.paymentMethod || null,
              paymentStatus: 'PAID',
              saleId: asaasPayment.id,
              metadata: {
                checkoutOrderId: order?.id,
                orderNumber: order?.orderNumber,
              },
            },
          });
        } catch (physicalErr: any) {
          this.logger.warn(
            `PhysicalOrder creation failed: ${physicalErr?.message}`,
          );
        }
      }
    });

    // Send Facebook Conversions API (CAPI) Purchase event — outside transaction (non-critical)
    try {
      const pixels = order?.plan?.checkoutConfig?.pixels;
      if (pixels) {
        const fbPixels = pixels.filter(
          (p: any) =>
            p.type === 'FACEBOOK' &&
            p.isActive &&
            p.trackPurchase &&
            p.accessToken,
        );

        for (const pixel of fbPixels) {
          this.facebookCAPI.sendEvent({
            pixelId: pixel.pixelId,
            accessToken: pixel.accessToken!,
            eventName: 'Purchase',
            email: order.customerEmail,
            phone: order.customerPhone ?? undefined,
            amount: order.totalInCents,
            currency: 'BRL',
            productId: order.plan.productId,
            ip: order.ipAddress ?? undefined,
            userAgent: order.userAgent ?? undefined,
          });
        }
      }
    } catch (capiError) {
      // PULSE:OK — Facebook CAPI is non-critical analytics; webhook must not fail for it
      this.logger.error(`Facebook CAPI lookup error: ${capiError}`);
    }

    // Send payment confirmation email (non-critical)
    try {
      const emailService = new (
        await import('../auth/email.service')
      ).EmailService();
      await emailService.sendEmail({
        to: order.customerEmail,
        subject: `Pagamento confirmado — ${order.plan?.product?.name || 'Seu pedido'}`,
        html: `<div style="font-family:sans-serif;max-width:600px;margin:0 auto;background:#0A0A0C;color:#e0e0e0;padding:40px;">
      <h1 style="color:#E85D30;">KLOEL</h1>
      <p>Ola ${order.customerName},</p>
      <p>Seu pagamento foi confirmado!</p>
      <div style="background:#151517;padding:20px;border-radius:6px;margin:20px 0;">
        <p><strong>Produto:</strong> ${order.plan?.product?.name || '—'}</p>
        <p><strong>Valor:</strong> R$ ${Number(((order.totalInCents || 0) / 100).toFixed(2))}</p>
        <p><strong>Pedido:</strong> #${order.orderNumber || order.id}</p>
      </div>
    </div>`,
      });
    } catch (emailErr) {
      // PULSE:OK — Email delivery is non-critical; webhook already processed payment
      this.logger.warn(`Payment confirmation email failed: ${emailErr}`);
    }
  }

  // ── REFUND / CHARGEBACK ───────────────────────────────────────────
  private async handleRefundOrChargeback(
    checkoutPayment: any,
    order: any,
    workspaceId: string | undefined,
    asaasPayment: any,
    newStatus: 'REFUNDED' | 'CHARGEBACK',
  ) {
    const now = new Date();
    const amountInCents: number = order?.totalInCents ?? 0;
    const amount = amountInCents / 100;
    const isRefund = newStatus === 'REFUNDED';
    const txType = isRefund ? 'refund' : 'chargeback';

    await this.prismaAny.$transaction(async (tx: PrismaDynamic) => {
      // isolationLevel: ReadCommitted
      // 1. Update CheckoutPayment status
      await tx.checkoutPayment.update({
        where: { id: checkoutPayment.id },
        data: { status: newStatus, webhookData: asaasPayment },
      });

      // 2. Update CheckoutOrder status
      await tx.checkoutOrder.update({
        where: { id: checkoutPayment.orderId },
        data: {
          status: newStatus,
          refundedAt: now,
        },
      });

      // 3. Update KloelSale status
      try {
        await tx.kloelSale.updateMany({
          where: { externalPaymentId: asaasPayment.id },
          data: { status: isRefund ? 'refunded' : 'chargeback' },
        });
      } catch (saleErr: any) {
        this.logger.warn(
          `KloelSale ${txType} update failed: ${saleErr?.message}`,
        );
      }

      // 4. Create KloelWalletTransaction of type 'refund' or 'chargeback' and adjust balance
      if (workspaceId && amount > 0) {
        try {
          const wallet = await tx.kloelWallet.findUnique({
            where: { workspaceId },
          });
          if (wallet) {
            // Deduct from pendingBalance first; if already settled, deduct from availableBalance
            if (wallet.pendingBalance >= amount) {
              await tx.kloelWallet.update({
                where: { id: wallet.id },
                data: { pendingBalance: { decrement: amount } },
              });
            } else {
              await tx.kloelWallet.update({
                where: { id: wallet.id },
                data: { availableBalance: { decrement: amount } },
              });
            }

            await tx.kloelWalletTransaction.create({
              data: {
                walletId: wallet.id,
                type: txType,
                amount: -amount,
                description: `${isRefund ? 'Estorno' : 'Chargeback'}: pedido #${order?.orderNumber || 'N/A'}`,
                reference: checkoutPayment.orderId,
                status: 'completed',
                metadata: {
                  checkoutOrderId: order?.id,
                  externalPaymentId: asaasPayment.id,
                  orderNumber: order?.orderNumber,
                },
              },
            });
          }
        } catch (walletErr: any) {
          this.logger.warn(
            `Wallet ${txType} transaction failed: ${walletErr?.message}`,
          );
        }
      }
    });
  }
}
