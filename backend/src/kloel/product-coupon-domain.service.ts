import { Injectable, NotFoundException } from '@nestjs/common';
import type { ProductCoupon } from '@prisma/client';

import { AuditService } from '../audit/audit.service';
import { PrismaService } from '../prisma/prisma.service';
import { syncWorkspaceCheckoutCouponForProduct } from './product-coupon-sync.util';
import { ensureWorkspaceProductAccess } from './product-sub-resources/helpers/common.helpers';

export type ProductCouponDeletionActor = 'user' | 'kloel-chat';

export type DeleteProductCouponInput = {
  workspaceId: string;
  productId?: string;
  couponId?: string;
  couponCode?: string;
  deletedBy: ProductCouponDeletionActor;
  notFoundMessage?: string;
};

/** Shared product coupon domain operations used by API controllers and Kloel tools. */
@Injectable()
export class ProductCouponDomainService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
  ) {}

  async deleteProductCoupon(input: DeleteProductCouponInput): Promise<ProductCoupon> {
    const workspaceId = input.workspaceId;
    const productId = input.productId?.trim() ?? '';
    const couponId = input.couponId?.trim() ?? '';
    const couponCode = input.couponCode?.trim() ?? '';
    const notFoundMessage = input.notFoundMessage ?? 'Cupom não encontrado';

    if (!couponId && !couponCode) {
      throw new NotFoundException(notFoundMessage);
    }

    if (productId) {
      await ensureWorkspaceProductAccess(this.prisma, productId, workspaceId);
    }

    const coupon = await this.prisma.productCoupon.findFirst({
      where: {
        ...(couponId ? { id: couponId } : {}),
        ...(couponCode ? { code: couponCode } : {}),
        ...(productId ? { productId } : {}),
        product: { workspaceId },
      },
    });
    if (!coupon) {
      throw new NotFoundException(notFoundMessage);
    }

    await this.auditService.log({
      workspaceId,
      action: 'DELETE_RECORD',
      resource: 'ProductCoupon',
      resourceId: coupon.id,
      details: { deletedBy: input.deletedBy, productId: coupon.productId },
    });

    const deleted = await this.prisma.productCoupon.delete({ where: { id: coupon.id } });
    await syncWorkspaceCheckoutCouponForProduct(
      this.prisma,
      workspaceId,
      coupon.productId,
      deleted.code,
    );

    return deleted;
  }
}
