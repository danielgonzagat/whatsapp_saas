jest.mock('./helpers/common.helpers', () => ({
  ensureWorkspaceProductAccess: jest.fn(),
  getWorkspaceId: jest.fn().mockReturnValue('workspace-1'),
}));

jest.mock('./helpers/plan.helpers', () => ({
  buildCouponData: jest.fn((body: Record<string, unknown>) => body),
  serializeCoupon: jest.fn((coupon: Record<string, unknown>) => ({ ...coupon, serialized: true })),
}));

import { NotFoundException } from '@nestjs/common';
import { ProductCouponDomainService } from '../product-coupon-domain.service';
import { ProductCouponController } from './product-coupon.controller';
import { getWorkspaceId } from './helpers/common.helpers';

const getWorkspaceIdMock = getWorkspaceId as jest.Mock;

describe('ProductCouponController', () => {
  const deleteProductCoupon = jest.fn();

  const prisma = {} as never;
  const productCouponDomain = { deleteProductCoupon } as unknown as ProductCouponDomainService;
  const req = { user: { sub: 'user-1', workspaceId: 'workspace-1' }, headers: {} } as never;

  let controller: ProductCouponController;

  beforeEach(() => {
    jest.clearAllMocks();
    getWorkspaceIdMock.mockReturnValue('workspace-1');
    deleteProductCoupon.mockResolvedValue({
      id: 'coupon-1',
      productId: 'product-1',
      code: 'PDRN10',
    });
    controller = new ProductCouponController(prisma, productCouponDomain);
  });

  it('deletes through ProductCouponDomainService so UI and chat share the same domain path', async () => {
    const result = await controller.delete('product-1', 'coupon-1', req);

    expect(getWorkspaceIdMock).toHaveBeenCalledWith(req);
    expect(deleteProductCoupon).toHaveBeenCalledWith({
      workspaceId: 'workspace-1',
      productId: 'product-1',
      couponId: 'coupon-1',
      deletedBy: 'user',
      notFoundMessage: 'Cupom não encontrado',
    });
    expect(result).toEqual({ id: 'coupon-1', productId: 'product-1', code: 'PDRN10' });
  });

  it('propagates the existing not-found controller exception shape from the shared domain service', async () => {
    deleteProductCoupon.mockRejectedValue(new NotFoundException('Cupom não encontrado'));

    await expect(controller.delete('product-1', 'missing-coupon', req)).rejects.toThrow(
      NotFoundException,
    );
  });
});
