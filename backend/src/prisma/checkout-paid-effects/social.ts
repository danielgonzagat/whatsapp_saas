import { CheckoutSocialLeadStatus, Prisma } from '@prisma/client';
import {
  appendAuditEventIfMissing,
  PaidCheckoutEffectClient,
  readPaidCheckoutOrderScope,
} from './shared';

export async function markCheckoutSocialLeadConvertedFromPaidUpdate(
  prisma: PaidCheckoutEffectClient,
  args: Prisma.CheckoutOrderUpdateManyArgs,
) {
  const scope = args.data.status === 'PAID' ? readPaidCheckoutOrderScope(args) : null;
  if (!scope) return;
  const order = await prisma.checkoutOrder.findUnique({
    where: { id: scope.orderId },
    select: { id: true, workspaceId: true, customerEmail: true, customerPhone: true },
  });
  if (!order || order.workspaceId !== scope.workspaceId) return;
  const lead = await prisma.checkoutSocialLead.findFirst({
    where: {
      workspaceId: scope.workspaceId,
      status: { in: [CheckoutSocialLeadStatus.CAPTURED, CheckoutSocialLeadStatus.ENRICHED] },
      OR: [
        ...(order.customerEmail ? [{ email: order.customerEmail }] : []),
        ...(order.customerPhone ? [{ phone: order.customerPhone }] : []),
      ],
    },
    orderBy: { createdAt: 'desc' },
    select: { id: true },
  });
  if (!lead) return;
  await prisma.checkoutSocialLead.update({
    where: { id: lead.id },
    data: {
      status: CheckoutSocialLeadStatus.CONVERTED,
      convertedAt: new Date(),
      convertedOrderId: order.id,
      stepReached: 3,
    },
  });
  await appendAuditEventIfMissing(prisma, {
    workspaceId: scope.workspaceId,
    action: 'checkout_social_lead_converted',
    resource: 'CheckoutSocialLead',
    resourceId: lead.id,
    details: { orderId: order.id, source: 'checkout_order_paid_hook' },
  });
}
