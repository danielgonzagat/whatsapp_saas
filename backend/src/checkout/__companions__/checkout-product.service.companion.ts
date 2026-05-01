import { NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { CreateCheckoutInput } from '../checkout-product.types';
import type { CheckoutPlanLinkManager } from '../checkout-plan-link.manager';

export interface CreateCheckoutDeps {
  prisma: any;
  buildDefaultCheckoutConfigInput(brandName: string): Prisma.CheckoutConfigCreateWithoutPlanInput;
  planLinkManager: CheckoutPlanLinkManager;
}

export async function createCheckout(
  deps: CreateCheckoutDeps,
  productId: string,
  data: CreateCheckoutInput,
  workspaceId: string,
) {
  const product = await deps.prisma.product.findFirst({
    where: { id: productId, workspaceId },
    select: { id: true },
  });
  if (!product) {
    throw new NotFoundException('Product not found');
  }

  const { brandName, ...checkoutData } = data;
  const slug = await deps.planLinkManager.generateCheckoutSlug(
    data.slug || `${data.name}-checkout`,
  );
  const referenceCode = await deps.planLinkManager.generatePublicCheckoutCode();

  return deps.prisma.$transaction(
    async (tx: any) => {
      const checkout = await tx.checkoutProductPlan.create({
        data: {
          productId,
          kind: 'CHECKOUT',
          legacyCheckoutEnabled: false,
          slug,
          referenceCode,
          ...checkoutData,
        },
      });

      await tx.checkoutConfig.create({
        data: {
          planId: checkout.id,
          ...deps.buildDefaultCheckoutConfigInput(brandName || data.name),
        },
      });

      return tx.checkoutProductPlan.findUnique({
        where: { id: checkout.id },
        include: {
          checkoutConfig: true,
          checkoutLinks: {
            include: { plan: { select: { id: true, name: true } } },
          },
        },
      });
    },
    { isolationLevel: 'ReadCommitted' },
  );
}
