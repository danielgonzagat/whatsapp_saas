import { Prisma } from '@prisma/client';
import { PaidCheckoutEffectClient, readPaidCheckoutOrderScope } from './shared';

type CheckoutPixelForPostPayment = {
  pixelId: string;
  accessToken: string | null;
  type: string;
  trackPurchase: boolean;
  isActive: boolean;
};

export async function sendFacebookCapiPurchaseFromPaidUpdate(
  prisma: PaidCheckoutEffectClient,
  args: Prisma.CheckoutOrderUpdateManyArgs,
) {
  const scope = args.data.status === 'PAID' ? readPaidCheckoutOrderScope(args) : null;
  if (!scope) return;
  const order = await prisma.checkoutOrder.findUnique({
    where: { id: scope.orderId },
    select: {
      id: true,
      workspaceId: true,
      customerEmail: true,
      customerPhone: true,
      totalInCents: true,
      ipAddress: true,
      userAgent: true,
      plan: {
        select: {
          productId: true,
          checkoutConfig: {
            select: {
              pixels: {
                select: {
                  pixelId: true,
                  accessToken: true,
                  type: true,
                  trackPurchase: true,
                  isActive: true,
                },
              },
            },
          },
        },
      },
    },
  });
  if (!order || order.workspaceId !== scope.workspaceId) return;
  const pixels: CheckoutPixelForPostPayment[] = order.plan.checkoutConfig?.pixels || [];
  const FacebookCAPIServiceClass = (await import('../../checkout/facebook-capi.service'))
    .FacebookCAPIService;
  const facebookCapi = new FacebookCAPIServiceClass();
  for (const pixel of pixels) {
    if (
      pixel.type !== 'FACEBOOK' ||
      !pixel.isActive ||
      !pixel.trackPurchase ||
      !pixel.accessToken
    ) {
      continue;
    }
    const resourceId = `${order.id}:${pixel.pixelId}`;
    const existing = await prisma.auditLog.findFirst({
      where: {
        workspaceId: scope.workspaceId,
        action: 'facebook_capi_purchase_sent',
        resource: 'CheckoutOrder',
        resourceId,
      },
      select: { id: true },
    });
    if (existing) continue;
    const sent = await facebookCapi.sendEvent({
      pixelId: pixel.pixelId,
      accessToken: pixel.accessToken,
      eventName: 'Purchase',
      email: order.customerEmail || undefined,
      phone: order.customerPhone || undefined,
      amount: order.totalInCents,
      currency: 'BRL',
      productId: order.plan.productId,
      ip: order.ipAddress || undefined,
      userAgent: order.userAgent || undefined,
    });
    if (sent) {
      await prisma.auditLog.create({
        data: {
          workspaceId: scope.workspaceId,
          action: 'facebook_capi_purchase_sent',
          resource: 'CheckoutOrder',
          resourceId,
          details: { orderId: order.id, pixelId: pixel.pixelId },
        },
      });
    }
  }
}
