import { Prisma } from '@prisma/client';
import {
  appendAuditEventIfMissing,
  PaidCheckoutEffectClient,
  readJsonObject,
  readPaidCheckoutOrderScope,
  readPositiveInteger,
  readPositiveNumber,
  readString,
} from './shared';

export async function createAffiliateCommissionFromPaidCheckoutUpdate(
  prisma: PaidCheckoutEffectClient,
  args: Prisma.CheckoutOrderUpdateManyArgs,
) {
  const scope = args.data.status === 'PAID' ? readPaidCheckoutOrderScope(args) : null;
  if (!scope) return;

  await prisma.$transaction(async (tx) => {
    const order = await tx.checkoutOrder.findUnique({
      where: { id: scope.orderId },
      select: {
        id: true,
        workspaceId: true,
        totalInCents: true,
        affiliateId: true,
        metadata: true,
      },
    });

    if (!order || order.workspaceId !== scope.workspaceId) {
      return;
    }

    const metadata = readJsonObject(order.metadata);
    const affiliateLinkId = readString(metadata?.affiliateLinkId);
    const affiliateWorkspaceId = readString(metadata?.affiliateWorkspaceId) || order.affiliateId;
    const affiliateCode = readString(metadata?.affiliateCode);
    const commissionPct = readPositiveNumber(metadata?.affiliateCommissionPct);
    const commissionInCents = readPositiveInteger(metadata?.affiliateCommissionInCents);

    if (!affiliateWorkspaceId || !affiliateLinkId || commissionInCents <= 0) {
      return;
    }

    const lockKey = `${scope.workspaceId}:${order.id}:affiliate_commission`;
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${lockKey}, 0))`;

    const created = await appendAuditEventIfMissing(tx, {
      workspaceId: scope.workspaceId,
      action: 'affiliate_commission_created',
      resource: 'CheckoutOrder',
      resourceId: order.id,
      details: {
        status: 'pending',
        affiliateLinkId,
        affiliateWorkspaceId,
        affiliateCode,
        commissionPct,
        commissionInCents,
        grossInCents: order.totalInCents,
        source: 'checkout_order_paid_hook',
      },
    });

    if (!created) {
      return;
    }

    const grossAmount = order.totalInCents / 100;
    const commissionAmount = commissionInCents / 100;
    const link = await tx.affiliateLink.update({
      where: { id: affiliateLinkId },
      data: {
        sales: { increment: 1 },
        revenue: { increment: grossAmount },
        commissionEarned: { increment: commissionAmount },
      },
      select: { affiliateProductId: true },
    });

    await tx.affiliateProduct.update({
      where: { id: link.affiliateProductId },
      data: {
        totalSales: { increment: 1 },
        totalRevenue: { increment: grossAmount },
      },
    });

    await tx.affiliatePartner.updateMany({
      where: {
        workspaceId: scope.workspaceId,
        OR: [{ partnerWorkspaceId: affiliateWorkspaceId }, { affiliateCode: affiliateCode || '' }],
      },
      data: {
        totalSales: { increment: 1 },
        totalRevenue: { increment: grossAmount },
        totalCommission: { increment: commissionAmount },
      },
    });
  });
}
