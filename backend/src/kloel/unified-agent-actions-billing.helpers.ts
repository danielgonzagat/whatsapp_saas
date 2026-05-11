import { PrismaService } from '../prisma/prisma.service';

export async function createFunnelFlows(
  prisma: PrismaService,
  workspaceId: string,
  funnelName: string,
  stages: unknown[],
  productName: string,
  productPrice: number,
  includeFollowUps: unknown,
) {
  const normalizedStages = stages.map((stage) => String(stage || '').trim()).filter(Boolean);
  const stagesToCreate = normalizedStages.length
    ? normalizedStages
    : ['awareness', 'interest', 'purchase'];

  return Promise.all(
    stagesToCreate.map((stage, index) =>
      prisma.flow.create({
        data: {
          workspaceId,
          name: `${funnelName} - ${stage}`,
          description: `Funil para ${productName} (${productPrice})`,
          nodes: [
            {
              id: 'trigger',
              type: 'trigger',
              position: { x: 100, y: 100 },
              data: { trigger: stage, includeFollowUps: Boolean(includeFollowUps) },
            },
            {
              id: 'message',
              type: 'message',
              position: { x: 100, y: 220 },
              data: { message: `Etapa ${index + 1}: ${stage}` },
            },
          ],
          edges: [{ id: 'trigger-message', source: 'trigger', target: 'message' }],
          isActive: false,
          triggerType: 'MANUAL',
          triggerCondition: stage,
        },
      }),
    ),
  );
}

export async function getProductPlans(prisma: PrismaService, productId: string) {
  return {
    plans: await prisma.productPlan.findMany({
      where: { productId },
      select: {
        id: true,
        name: true,
        price: true,
        billingType: true,
        maxInstallments: true,
        createdAt: true,
      },
      orderBy: { createdAt: 'desc' },
      take: 20,
    }),
  };
}

export async function getProductAIConfig(prisma: PrismaService, productId: string) {
  return { config: await prisma.productAIConfig.findUnique({ where: { productId } }) };
}

export async function getProductReviews(prisma: PrismaService, productId: string) {
  return {
    reviews: await prisma.productReview.findMany({
      where: { productId },
      orderBy: { createdAt: 'desc' },
      take: 20,
    }),
  };
}

export async function getProductUrls(prisma: PrismaService, productId: string) {
  return {
    urls: await prisma.productUrl.findMany({
      where: { productId, active: true },
      select: { id: true, productId: true, url: true, description: true, active: true },
      take: 20,
    }),
  };
}

export async function validateCoupon(prisma: PrismaService, productId: string, code: string) {
  const coupon = await prisma.productCoupon.findFirst({ where: { productId, code, active: true } });
  if (!coupon) return { valid: false, reason: 'not_found' };
  if (coupon.maxUses && coupon.usedCount >= coupon.maxUses)
    return { valid: false, reason: 'max_uses_reached' };
  if (coupon.expiresAt && coupon.expiresAt < new Date()) return { valid: false, reason: 'expired' };
  return { valid: true, coupon };
}
