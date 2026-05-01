import { NotFoundException } from '@nestjs/common';

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
