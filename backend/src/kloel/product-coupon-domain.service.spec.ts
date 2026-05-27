jest.mock('./product-coupon-sync.util', () => ({
  syncWorkspaceCheckoutCouponForProduct: jest.fn(),
}));

jest.mock('./product-sub-resources/helpers/common.helpers', () => ({
  ensureWorkspaceProductAccess: jest.fn().mockResolvedValue({
    id: 'product-1',
    workspaceId: 'workspace-1',
    name: 'PDRN',
  }),
}));

import { NotFoundException } from '@nestjs/common';
import { ProductCouponDomainService } from './product-coupon-domain.service';
import { syncWorkspaceCheckoutCouponForProduct } from './product-coupon-sync.util';
import { ensureWorkspaceProductAccess } from './product-sub-resources/helpers/common.helpers';

const syncWorkspaceCheckoutCouponForProductMock =
  syncWorkspaceCheckoutCouponForProduct as jest.Mock;
const ensureWorkspaceProductAccessMock = ensureWorkspaceProductAccess as jest.Mock;

describe('ProductCouponDomainService', () => {
  const productCouponFindFirst = jest.fn();
  const productCouponDelete = jest.fn();
  const auditLog = jest.fn();

  const prisma = {
    productCoupon: {
      findFirst: productCouponFindFirst,
      delete: productCouponDelete,
    },
  } as never;

  let service: ProductCouponDomainService;

  beforeEach(() => {
    jest.clearAllMocks();
    ensureWorkspaceProductAccessMock.mockResolvedValue({
      id: 'product-1',
      workspaceId: 'workspace-1',
      name: 'PDRN',
    });
    productCouponFindFirst.mockResolvedValue({
      id: 'coupon-1',
      productId: 'product-1',
      code: 'PDRN10',
    });
    productCouponDelete.mockResolvedValue({
      id: 'coupon-1',
      productId: 'product-1',
      code: 'PDRN10',
    });
    syncWorkspaceCheckoutCouponForProductMock.mockResolvedValue(null);
    auditLog.mockResolvedValue(undefined);
    service = new ProductCouponDomainService(prisma, { log: auditLog } as never);
  });

  it('deletes a product coupon through workspace-scoped lookup, audit, and checkout sync', async () => {
    const deleted = await service.deleteProductCoupon({
      workspaceId: 'workspace-1',
      productId: 'product-1',
      couponId: 'coupon-1',
      deletedBy: 'user',
    });

    expect(ensureWorkspaceProductAccessMock).toHaveBeenCalledWith(
      prisma,
      'product-1',
      'workspace-1',
    );
    expect(productCouponFindFirst).toHaveBeenCalledWith({
      where: { id: 'coupon-1', productId: 'product-1', product: { workspaceId: 'workspace-1' } },
    });
    expect(auditLog).toHaveBeenCalledWith({
      workspaceId: 'workspace-1',
      action: 'DELETE_RECORD',
      resource: 'ProductCoupon',
      resourceId: 'coupon-1',
      details: { deletedBy: 'user', productId: 'product-1' },
    });
    expect(productCouponDelete).toHaveBeenCalledWith({ where: { id: 'coupon-1' } });
    expect(syncWorkspaceCheckoutCouponForProductMock).toHaveBeenCalledWith(
      prisma,
      'workspace-1',
      'product-1',
      'PDRN10',
    );
    expect(deleted).toEqual({ id: 'coupon-1', productId: 'product-1', code: 'PDRN10' });
  });

  it('throws without deleting when a coupon id is outside the workspace', async () => {
    productCouponFindFirst.mockResolvedValue(null);

    await expect(
      service.deleteProductCoupon({
        workspaceId: 'workspace-1',
        couponId: 'coupon-other',
        deletedBy: 'kloel-chat',
        notFoundMessage: 'Cupom nao encontrado. Informe o codigo ou ID do cupom.',
      }),
    ).rejects.toThrow(NotFoundException);

    expect(productCouponDelete).not.toHaveBeenCalled();
    expect(auditLog).not.toHaveBeenCalled();
    expect(syncWorkspaceCheckoutCouponForProductMock).not.toHaveBeenCalled();
  });
});
