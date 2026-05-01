import { BadRequestException, NotFoundException } from '@nestjs/common';

const VALID_PIXEL_TYPES = [
  'FACEBOOK',
  'GOOGLE_ADS',
  'GOOGLE_ANALYTICS',
  'TIKTOK',
  'KWAI',
  'TABOOLA',
  'CUSTOM',
];

export async function createCheckoutPixel(
  deps: { prisma: any },
  checkoutConfigId: string,
  data: {
    type: 'FACEBOOK' | 'GOOGLE_ADS' | 'GOOGLE_ANALYTICS' | 'TIKTOK' | 'KWAI' | 'TABOOLA' | 'CUSTOM';
    pixelId: string;
    accessToken?: string;
    trackPageView?: boolean;
    trackInitiateCheckout?: boolean;
    trackAddPaymentInfo?: boolean;
    trackPurchase?: boolean;
  },
) {
  if (data.type && !VALID_PIXEL_TYPES.includes(data.type)) {
    throw new BadRequestException(
      `Invalid pixel type: ${data.type}. Must be one of: ${VALID_PIXEL_TYPES.join(', ')}`,
    );
  }
  const config = await deps.prisma.checkoutConfig.findUnique({
    where: { id: checkoutConfigId },
    select: { id: true },
  });
  if (!config) {
    throw new BadRequestException('Checkout config not found');
  }
  return deps.prisma.checkoutPixel.create({ data: { checkoutConfigId, ...data } });
}

export async function calcShipping(
  catalogConfigService: { calculateShipping(slug: string, cep: string): Promise<unknown> },
  slug: string,
  cep: string,
) {
  return catalogConfigService.calculateShipping(slug, cep);
}

export async function resetCatalogConfig(
  catalogConfigService: { resetConfig(planId: string): Promise<unknown> },
  planId: string,
) {
  return catalogConfigService.resetConfig(planId);
}

export async function deleteCheckoutPixel(
  deps: { prisma: any; auditService: any },
  id: string,
  workspaceId?: string,
) {
  const existing = await deps.prisma.checkoutPixel.findUnique({
    where: { id },
    select: { id: true },
  });
  if (!existing) {
    throw new NotFoundException('CheckoutPixel not found');
  }
  await deps.auditService.log({
    workspaceId: workspaceId || 'unknown',
    action: 'DELETE_RECORD',
    resource: 'CheckoutPixel',
    resourceId: id,
    details: { deletedBy: 'user' },
  });
  await deps.prisma.checkoutPixel.delete({ where: { id } });
  return { deleted: true };
}

export async function deleteCouponHelper(
  deps: { prisma: any; auditService: any; opsAlert?: any },
  id: string,
  workspaceId?: string,
) {
  if (!workspaceId) {
    throw new BadRequestException('workspaceId is required');
  }
  const existing = await deps.prisma.checkoutCoupon.findFirst({
    where: { id, workspaceId },
    select: { id: true },
  });
  if (!existing) {
    throw new NotFoundException('CheckoutCoupon not found');
  }
  await deps.auditService.log({
    workspaceId,
    action: 'DELETE_RECORD',
    resource: 'CheckoutCoupon',
    resourceId: id,
    details: { deletedBy: 'user' },
  });
  await deps.prisma.checkoutCoupon.deleteMany({ where: { id, workspaceId } });
  return { deleted: true };
}
