import { HttpException, HttpStatus, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { AuditService } from '../audit/audit.service';
import { FinancialAlertService } from '../common/financial-alert.service';
import { validatePaymentTransition } from '../common/payment-state-machine';
import type { MercadoPagoCheckoutLineItem } from '../kloel/mercado-pago-order.util';
import { MercadoPagoService } from '../kloel/mercado-pago.service';
import { PrismaService } from '../prisma/prisma.service';
// @@index: optimistic lock via updatedAt — concurrent writes resolved by DB constraint

function serializeMercadoPagoError(error: unknown) {
  if (!error || typeof error !== 'object') {
    return { message: String(error || 'unknown_error') };
  }

  const value = error as {
    message?: string;
    name?: string;
    status?: number;
    statusCode?: number;
    cause?: unknown;
    error?: unknown;
    response?: unknown;
    api_response?: unknown;
    errors?: unknown;
  };

  return {
    name: value.name || null,
    message: value.message || null,
    status: value.status || value.statusCode || null,
    cause: value.cause || null,
    error: value.error || null,
    response: value.response || null,
    apiResponse: value.api_response || null,
    errors: value.errors || null,
  };
}

function resolveProductImage(
  product: { imageUrl?: string | null; images?: unknown } | null | undefined,
) {
  if (!product) return undefined;
  if (product.imageUrl) return product.imageUrl;
  if (Array.isArray(product.images)) {
    const firstImage = product.images.find((entry) => typeof entry === 'string' && entry.trim());
    if (typeof firstImage === 'string') return firstImage;
  }
  return undefined;
}

function mapMercadoPagoStatus(
  status?: string | null,
): 'APPROVED' | 'DECLINED' | 'PENDING' | 'PROCESSING' | 'CANCELED' {
  switch (String(status || '').toLowerCase()) {
    case 'approved':
      return 'APPROVED';
    case 'rejected':
      return 'DECLINED';
    case 'cancelled':
    case 'cancelled_by_user':
      return 'CANCELED';
    case 'authorized':
    case 'in_process':
      return 'PROCESSING';
    default:
      return 'PENDING';
  }
}

@Injectable()
export class CheckoutPaymentService {
  private readonly logger = new Logger(CheckoutPaymentService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly mercadoPago: MercadoPagoService,
    private readonly financialAlert: FinancialAlertService,
    private readonly auditService: AuditService,
  ) {}

  // All dates stored as UTC via Prisma DateTime (toISOString)
  async processPayment(params: {
    orderId: string;
    idempotencyKey?: string;
    workspaceId: string;
    customerName: string;
    customerEmail: string;
    customerCPF?: string;
    customerPhone?: string;
    paymentMethod: 'CREDIT_CARD' | 'PIX' | 'BOLETO';
    totalInCents: number;
    installments?: number;
    cardToken?: string;
    cardPaymentMethodId?: string;
    cardPaymentType?: string;
    cardHolderName?: string;
    cardLast4?: string;
  }) {
    const order = await this.prisma.checkoutOrder.findUnique({
      where: { id: params.orderId },
      include: {
        plan: {
          include: {
            product: true,
          },
        },
      },
    });

    if (!order) {
      throw new NotFoundException('Pedido não encontrado para processar no Mercado Pago.');
    }

    const product = order.plan?.product;
    const productName = product?.name || order.plan?.name || `Pedido ${params.orderId}`;
    const orderMetadata =
      order.metadata && typeof order.metadata === 'object' && !Array.isArray(order.metadata)
        ? (order.metadata as Record<string, any>)
        : {};
    const baseTotalInCents = Number(orderMetadata.baseTotalInCents || order.totalInCents || 0);
    const chargedTotalInCents = Number(
      orderMetadata.chargedTotalInCents || baseTotalInCents || params.totalInCents || 0,
    );
    const marketplaceFeeInCents = Number(
      orderMetadata.marketplaceFeeInCents || orderMetadata.platformNetRevenueInCents || 0,
    );
    const lineItems = Array.isArray(orderMetadata.lineItems)
      ? (orderMetadata.lineItems as MercadoPagoCheckoutLineItem[])
      : [];
    const customerRegistrationDate =
      typeof orderMetadata.customerRegistrationDate === 'string'
        ? orderMetadata.customerRegistrationDate
        : undefined;
    const meliSessionId =
      typeof orderMetadata.meliSessionId === 'string' ? orderMetadata.meliSessionId : undefined;
    const idempotencyKey = params.idempotencyKey || params.orderId;
    const amount = chargedTotalInCents / 100;

    try {
      if (
        params.paymentMethod === 'CREDIT_CARD' &&
        (!params.cardToken || !params.cardPaymentMethodId)
      ) {
        throw new HttpException(
          'Token do cartão do Mercado Pago é obrigatório para pagamentos com cartão.',
          HttpStatus.BAD_REQUEST,
        );
      }

      const { order: mercadoPagoOrder, split } = await this.mercadoPago.createMarketplaceOrder({
        workspaceId: params.workspaceId,
        orderId: params.orderId,
        idempotencyKey,
        orderNumber: order.orderNumber,
        baseTotalInCents,
        chargedTotalInCents,
        marketplaceFeeInCents,
        customerName: params.customerName,
        customerEmail: params.customerEmail,
        customerCPF: params.customerCPF,
        customerPhone: params.customerPhone,
        shippingAddress: order.shippingAddress,
        productName,
        productDescription: product?.description || order.plan?.name || productName,
        productImage: resolveProductImage(product),
        paymentMethod: params.paymentMethod,
        cardToken: params.cardToken,
        cardPaymentMethodId: params.cardPaymentMethodId,
        cardPaymentType: params.cardPaymentType,
        installments: params.installments,
        ipAddress: order.ipAddress || undefined,
        shippingPriceInCents: order.shippingPrice || 0,
        customerRegistrationDate,
        meliSessionId,
        lineItems,
      });

      const primaryPayment = this.mercadoPago.extractPrimaryOrderPayment(mercadoPagoOrder);
      const paymentStatus = mapMercadoPagoStatus(primaryPayment.status);
      const approved = paymentStatus === 'APPROVED';

      const payment = await this.prisma.$transaction(
        async (tx) => {
          const p = await tx.checkoutPayment.create({
            data: {
              orderId: params.orderId,
              gateway: 'mercadopago',
              externalId: primaryPayment.externalId || mercadoPagoOrder.id || null,
              pixQrCode: primaryPayment.pixQrCode,
              pixCopyPaste: primaryPayment.pixCopyPaste,
              pixExpiresAt: primaryPayment.pixExpiresAt
                ? new Date(primaryPayment.pixExpiresAt)
                : params.paymentMethod === 'PIX'
                  ? new Date(Date.now() + 30 * 60 * 1000)
                  : null,
              boletoUrl: primaryPayment.boletoUrl,
              boletoBarcode: primaryPayment.boletoBarcode,
              boletoExpiresAt: primaryPayment.boletoExpiresAt
                ? new Date(primaryPayment.boletoExpiresAt)
                : null,
              cardLast4: params.cardLast4 || null,
              cardBrand: primaryPayment.cardBrand,
              status: paymentStatus,
              webhookData: JSON.parse(
                JSON.stringify({
                  provider: 'mercadopago',
                  order: mercadoPagoOrder,
                  split: {
                    ...split,
                    baseTotalInCents,
                    chargedTotalInCents,
                    marketplaceFeeInCents,
                  },
                }),
              ) as Prisma.InputJsonValue,
            },
          });

          if (approved) {
            // Mercado Pago can approve synchronously, but the order state still
            // moves through PROCESSING before we close it as PAID.
            const currentOrder = await tx.checkoutOrder.findUnique({
              where: { id: params.orderId },
              select: { status: true },
            });
            let currentStatus = currentOrder?.status || 'PENDING';
            const transitionContext = {
              paymentId: p.id,
              provider: 'mercadopago',
              externalId: primaryPayment.externalId || mercadoPagoOrder.id,
            };

            if (currentStatus !== 'PROCESSING') {
              const canEnterProcessing = validatePaymentTransition(
                currentStatus,
                'PROCESSING',
                transitionContext,
              );

              if (!canEnterProcessing) {
                return p;
              }

              await tx.checkoutOrder.update({
                where: { id: params.orderId },
                data: { status: 'PROCESSING' },
              });
              currentStatus = 'PROCESSING';
            }

            const canTransition = validatePaymentTransition(
              currentStatus,
              'APPROVED',
              transitionContext,
            );

            if (canTransition) {
              // Order status is PROCESSING here; approval closes it as PAID.
              await tx.checkoutOrder.update({
                where: { id: params.orderId },
                data: { status: 'PAID', paidAt: new Date() },
              });
            }
          } else if (paymentStatus === 'PROCESSING') {
            await tx.checkoutOrder.update({
              where: { id: params.orderId },
              data: { status: 'PROCESSING' },
            });
          } else if (paymentStatus === 'CANCELED') {
            await tx.checkoutOrder.update({
              where: { id: params.orderId },
              data: { status: 'CANCELED', canceledAt: new Date() },
            });
          }

          await this.auditService.logWithTx(tx, {
            workspaceId: params.workspaceId,
            action: 'CHECKOUT_PAYMENT_CREATED',
            resource: 'CheckoutPayment',
            resourceId: p.id,
            details: {
              method: params.paymentMethod,
              amount,
              orderId: params.orderId,
              gateway: 'mercadopago',
              externalId: primaryPayment.externalId || mercadoPagoOrder.id,
              approved,
              installments: params.installments,
              split,
              paymentStatus: primaryPayment.status,
            },
          });

          return p;
        },
        { isolationLevel: 'ReadCommitted' },
      );

      return {
        payment,
        type: params.paymentMethod,
        approved,
        pixQrCode: primaryPayment.pixQrCode,
        pixCopyPaste: primaryPayment.pixCopyPaste,
        pixExpiresAt: primaryPayment.pixExpiresAt,
        boletoUrl: primaryPayment.boletoUrl,
        boletoBarcode: primaryPayment.boletoBarcode,
        boletoExpiresAt: primaryPayment.boletoExpiresAt,
      };
    } catch (error) {
      const errorDetails = serializeMercadoPagoError(error);
      this.logger.error(
        `Payment processing failed for order ${params.orderId}: ${JSON.stringify(errorDetails)}`,
      );
      this.financialAlert.paymentFailed(error as Error, {
        workspaceId: params.workspaceId,
        orderId: params.orderId,
        amount,
        gateway: 'mercadopago',
      });
      throw error;
    }
  }
}
