import { Prisma, PrismaClient } from '@prisma/client';
import { readPaidCheckoutOrderScope } from './shared';

type WalletPaidCheckoutClient = Pick<
  PrismaClient,
  '$transaction' | 'checkoutOrder' | 'kloelWallet' | 'kloelWalletTransaction' | 'kloelWalletLedger'
>;

type PaidCheckoutWalletOrder = {
  id: string;
  workspaceId: string;
  orderNumber: string;
  totalInCents: number;
  plan?: {
    product?: {
      name?: string | null;
    } | null;
  } | null;
};

function computeNetAmountInCents(grossAmountInCents: number) {
  const gatewayFeeInCents = Math.round((grossAmountInCents * 2.99) / 100);
  const kloelFeeInCents = Math.round((grossAmountInCents * 5) / 100);
  return {
    gatewayFeeInCents,
    kloelFeeInCents,
    netAmountInCents: grossAmountInCents - gatewayFeeInCents - kloelFeeInCents,
  };
}

export async function creditWalletFromPaidCheckoutUpdate(
  prisma: WalletPaidCheckoutClient,
  args: Prisma.CheckoutOrderUpdateManyArgs,
) {
  const scope = readPaidCheckoutOrderScope(args);
  if (!scope) {
    return false;
  }

  const order = (await prisma.checkoutOrder.findFirst({
    where: {
      id: scope.orderId,
      workspaceId: scope.workspaceId,
      status: 'PAID',
    },
    select: {
      id: true,
      workspaceId: true,
      orderNumber: true,
      totalInCents: true,
      plan: {
        select: {
          product: { select: { name: true } },
        },
      },
    },
  })) as PaidCheckoutWalletOrder | null;

  if (!order || order.totalInCents <= 0) {
    return false;
  }

  const reference = `checkout:${order.id}`;
  const productName = order.plan?.product?.name || order.orderNumber;
  const { gatewayFeeInCents, kloelFeeInCents, netAmountInCents } = computeNetAmountInCents(
    order.totalInCents,
  );
  if (netAmountInCents <= 0) {
    return false;
  }

  return prisma.$transaction(
    async (tx: Prisma.TransactionClient) => {
      const wallet = await tx.kloelWallet.upsert({
        where: { workspaceId: order.workspaceId },
        create: { workspaceId: order.workspaceId },
        update: {},
        select: { id: true, workspaceId: true, updatedAt: true },
      });

      const existing = await tx.kloelWalletTransaction.findFirst({
        where: {
          walletId: wallet.id,
          reference,
          type: 'credit',
        },
        select: { id: true },
      });
      if (existing) {
        return false;
      }

      const netAmount = netAmountInCents / 100;
      const credited = await tx.kloelWallet.updateMany({
        where: { id: wallet.id, workspaceId: order.workspaceId, updatedAt: wallet.updatedAt },
        data: {
          pendingBalance: { increment: netAmount },
          pendingBalanceInCents: { increment: BigInt(netAmountInCents) },
        },
      });
      if (credited.count === 0) {
        throw new Error('checkout_wallet_credit_race_lost');
      }

      const transaction = await tx.kloelWalletTransaction.create({
        data: {
          walletId: wallet.id,
          type: 'credit',
          amount: netAmount,
          amountInCents: BigInt(netAmountInCents),
          description: `Checkout pago: ${productName}`,
          reference,
          status: 'pending',
          metadata: {
            checkoutOrderId: order.id,
            orderNumber: order.orderNumber,
            grossAmountInCents: order.totalInCents,
            gatewayFeeInCents,
            kloelFeeInCents,
            netAmountInCents,
          },
        },
      });

      await tx.kloelWalletLedger.create({
        data: {
          workspaceId: order.workspaceId,
          walletId: wallet.id,
          transactionId: transaction.id,
          direction: 'credit',
          bucket: 'pending',
          amountInCents: BigInt(netAmountInCents),
          reason: 'sale_credit',
          metadata: {
            checkoutOrderId: order.id,
            orderNumber: order.orderNumber,
            grossAmountInCents: order.totalInCents,
            gatewayFeeInCents,
            kloelFeeInCents,
          },
        },
      });

      return true;
    },
    { isolationLevel: 'ReadCommitted' },
  );
}
