import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { OrderStatus, PaymentStatus, Prisma } from '@prisma/client';
import { StripeService } from '../../billing/stripe.service';
import { WalletLedgerService } from '../../kloel/wallet-ledger.service';
import { PrismaService } from '../../prisma/prisma.service';
import { AdminAuditService } from '../audit/admin-audit.service';
import { AdminTransactionAction } from './dto/operate-transaction.dto';
import {
  listAdminTransactions,
  type AdminTransactionRow,
  type ListTransactionsInput,
  type ListTransactionsResult,
} from './queries/list-transactions.query';

type OrderForOperation = {
  id: string;
  orderNumber: string;
  workspaceId: string;
  status: OrderStatus;
  totalInCents: number;
  refundedAt: Date | null;
  metadata: Prisma.JsonValue | null;
  payment: {
    id: string;
    gateway: string;
    externalId: string | null;
    status: PaymentStatus;
  } | null;
};

type LinkedSaleRefundState = {
  id: string;
  status: string;
};

@Injectable()
export class AdminTransactionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AdminAuditService,
    private readonly walletLedger: WalletLedgerService,
    private readonly stripeService: StripeService,
  ) {}

  async list(input: ListTransactionsInput): Promise<ListTransactionsResult> {
    return listAdminTransactions(this.prisma, input);
  }

  async operate(
    orderId: string,
    actorId: string,
    action: AdminTransactionAction,
    note?: string,
    idempotencyKey?: string,
  ): Promise<void> {
    const order = await this.getOrderForOperation(orderId);

    if (action === AdminTransactionAction.REFUND) {
      await this.refund(order, actorId, note, idempotencyKey);
      return;
    }

    await this.chargeback(order, actorId, note);
  }

  private async refund(
    order: OrderForOperation,
    actorId: string,
    note?: string,
    idempotencyKey?: string,
  ) {
    if (order.status !== OrderStatus.PAID) {
      throw new BadRequestException('Somente pedidos pagos podem ser estornados.');
    }

    if (!order.payment) {
      throw new BadRequestException('Pedido sem pagamento vinculado.');
    }

    if (order.payment.status === PaymentStatus.REFUNDED) {
      return;
    }

    const linkedSale = await this.findLinkedSaleRefundState(order);

    if (linkedSale && this.isRefundAlreadyRequested(linkedSale.status)) {
      await this.audit.append({
        adminUserId: actorId,
        action: 'admin.transactions.refund_requested',
        entityType: 'CheckoutOrder',
        entityId: order.id,
        details: {
          workspaceId: order.workspaceId,
          orderNumber: order.orderNumber,
          paymentId: order.payment.id,
          paymentGateway: order.payment.gateway,
          externalPaymentId: order.payment.externalId,
          note: note ?? null,
          mode: 'already_requested',
          idempotencyKey: idempotencyKey ?? null,
          saleStatus: linkedSale.status,
          saleRecordsUpdated: 0,
        },
      });
      return;
    }

    await this.runGatewayRefund(order, idempotencyKey);

    if (this.normalizeGateway(order.payment.gateway) === 'stripe') {
      const saleRecordsUpdated = await this.markLinkedSaleRefundRequested(order);
      await this.audit.append({
        adminUserId: actorId,
        action: 'admin.transactions.refund_requested',
        entityType: 'CheckoutOrder',
        entityId: order.id,
        details: {
          workspaceId: order.workspaceId,
          orderNumber: order.orderNumber,
          paymentId: order.payment.id,
          paymentGateway: order.payment.gateway,
          externalPaymentId: order.payment.externalId,
          note: note ?? null,
          mode: 'webhook_driven',
          idempotencyKey: idempotencyKey ?? null,
          saleStatus: saleRecordsUpdated > 0 ? 'refund_requested' : null,
          saleRecordsUpdated,
        },
      });
      return;
    }

    await this.persistNegativeAdjustment(order, actorId, 'REFUNDED', note);
  }

  private async chargeback(order: OrderForOperation, actorId: string, note?: string) {
    if (!order.payment) {
      throw new BadRequestException('Pedido sem pagamento vinculado.');
    }

    if (
      order.payment.status === PaymentStatus.CHARGEBACK ||
      order.status === OrderStatus.CHARGEBACK
    ) {
      return;
    }

    if (this.normalizeGateway(order.payment.gateway) === 'stripe') {
      throw new BadRequestException(
        'Chargeback manual não é suportado no runtime Stripe-only. Aguarde o webhook do provedor.',
      );
    }

    await this.persistNegativeAdjustment(order, actorId, 'CHARGEBACK', note);
  }

  private async runGatewayRefund(order: OrderForOperation, idempotencyKey?: string) {
    const externalId = String(order.payment?.externalId || '').trim();
    if (!externalId) {
      return;
    }

    const gateway = this.normalizeGateway(order.payment?.gateway);
    if (gateway === 'stripe') {
      await this.stripeService.stripe.refunds.create(
        { payment_intent: externalId },
        idempotencyKey ? { idempotencyKey } : undefined,
      );
      return;
    }

    throw new BadRequestException(
      `Gateway ${order.payment?.gateway} não é suportado no runtime Stripe-only.`,
    );
  }

  private async persistNegativeAdjustment(
    order: OrderForOperation,
    actorId: string,
    targetStatus: 'REFUNDED' | 'CHARGEBACK',
    note?: string,
  ) {
    const isRefund = targetStatus === 'REFUNDED';
    const paymentStatus = isRefund ? PaymentStatus.REFUNDED : PaymentStatus.CHARGEBACK;
    const orderStatus = isRefund ? OrderStatus.REFUNDED : OrderStatus.CHARGEBACK;
    const reason = isRefund ? 'refund_debit' : 'chargeback_debit';
    const txType = isRefund ? 'refund' : 'chargeback';
    const metadata = this.readRecord(order.metadata);
    const producerNetInCents = this.resolveProducerNetInCents(order.totalInCents, metadata);
    const externalPaymentId = order.payment?.externalId || null;

    await this.prisma.$transaction(async (tx) => {
      if (order.payment) {
        await tx.checkoutPayment.update({
          where: { id: order.payment.id },
          data: {
            status: paymentStatus,
            webhookData: this.mergeWebhookData(metadata, {
              source: 'admin',
              action: targetStatus,
              note: note ?? null,
              operatedAt: new Date().toISOString(),
            }),
          },
        });
      }

      await tx.checkoutOrder.update({
        where: { id: order.id },
        data: {
          status: orderStatus,
          refundedAt: new Date(),
        },
      });

      if (externalPaymentId) {
        await tx.kloelSale.updateMany({
          where: { workspaceId: order.workspaceId, externalPaymentId },
          data: { status: isRefund ? 'refunded' : 'chargeback' },
        });
      }

      if (producerNetInCents > 0) {
        const wallet = await tx.kloelWallet.findUnique({
          where: { workspaceId: order.workspaceId },
        });

        if (wallet) {
          const amount = producerNetInCents / 100;
          const balanceBucket =
            wallet.pendingBalanceInCents >= BigInt(producerNetInCents) ? 'pending' : 'available';

          await tx.kloelWallet.update({
            where: { id: wallet.id },
            data:
              balanceBucket === 'pending'
                ? {
                    pendingBalance: { decrement: amount },
                    pendingBalanceInCents: { decrement: BigInt(producerNetInCents) },
                  }
                : {
                    availableBalance: { decrement: amount },
                    availableBalanceInCents: { decrement: BigInt(producerNetInCents) },
                  },
          });

          const walletTx = await tx.kloelWalletTransaction.create({
            data: {
              walletId: wallet.id,
              type: txType,
              amount: -amount,
              amountInCents: BigInt(-producerNetInCents),
              description: `${isRefund ? 'Estorno' : 'Chargeback'} administrativo: pedido #${order.orderNumber}`,
              reference: order.id,
              status: 'completed',
              metadata: {
                checkoutOrderId: order.id,
                externalPaymentId,
                producerNetInCents,
                source: 'admin',
                note: note ?? null,
              },
            },
          });

          await this.walletLedger.appendWithinTx(tx, {
            workspaceId: order.workspaceId,
            walletId: wallet.id,
            transactionId: walletTx.id,
            direction: 'debit',
            bucket: balanceBucket,
            amountInCents: BigInt(producerNetInCents),
            reason,
            metadata: {
              checkoutOrderId: order.id,
              externalPaymentId,
              source: 'admin',
              note: note ?? null,
            },
          });
        }
      }
    });

    await this.audit.append({
      adminUserId: actorId,
      action: isRefund ? 'admin.transactions.refunded' : 'admin.transactions.chargebacked',
      entityType: 'CheckoutOrder',
      entityId: order.id,
      details: {
        workspaceId: order.workspaceId,
        orderNumber: order.orderNumber,
        previousStatus: order.status,
        nextStatus: orderStatus,
        paymentId: order.payment?.id ?? null,
        paymentStatus,
        note: note ?? null,
      },
    });
  }

  private async getOrderForOperation(orderId: string): Promise<OrderForOperation> {
    const order = await this.prisma.checkoutOrder.findUnique({
      where: { id: orderId },
      select: {
        id: true,
        orderNumber: true,
        workspaceId: true,
        status: true,
        totalInCents: true,
        refundedAt: true,
        metadata: true,
        payment: {
          select: {
            id: true,
            gateway: true,
            externalId: true,
            status: true,
          },
        },
      },
    });

    if (!order) {
      throw new NotFoundException('Pedido não encontrado.');
    }

    return order;
  }

  private async findLinkedSaleRefundState(
    order: OrderForOperation,
  ): Promise<LinkedSaleRefundState | null> {
    const externalPaymentId = order.payment?.externalId?.trim();
    if (!externalPaymentId) {
      return null;
    }

    return this.prisma.kloelSale.findFirst({
      where: {
        workspaceId: order.workspaceId,
        externalPaymentId,
      },
      select: {
        id: true,
        status: true,
      },
    });
  }

  private async markLinkedSaleRefundRequested(order: OrderForOperation): Promise<number> {
    const externalPaymentId = order.payment?.externalId?.trim();
    if (!externalPaymentId) {
      return 0;
    }

    const result = await this.prisma.kloelSale.updateMany({
      where: {
        workspaceId: order.workspaceId,
        externalPaymentId,
      },
      data: {
        status: 'refund_requested',
      },
    });

    return result.count;
  }

  private isRefundAlreadyRequested(status: string) {
    return status === 'refund_requested' || status === 'refunded';
  }

  private resolveProducerNetInCents(totalInCents: number, metadata: Record<string, unknown>) {
    const candidates = [
      metadata.producerNetInCents,
      metadata.sellerReceivableInCents,
      metadata.baseTotalInCents,
      totalInCents,
    ];

    for (const candidate of candidates) {
      const parsed = Number(candidate);
      if (Number.isFinite(parsed) && parsed > 0) {
        return Math.round(parsed);
      }
    }

    return 0;
  }

  private mergeWebhookData(metadata: Record<string, unknown>, extra: Record<string, unknown>) {
    return JSON.parse(
      JSON.stringify({
        ...metadata,
        adminOperation: extra,
      }),
    ) as Prisma.InputJsonValue;
  }

  private readRecord(value: Prisma.JsonValue | null | undefined): Record<string, unknown> {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      return {};
    }
    return value as Record<string, unknown>;
  }

  private normalizeGateway(value?: string | null) {
    return String(value || '')
      .trim()
      .toLowerCase();
  }
}

export type { AdminTransactionRow, ListTransactionsResult };
