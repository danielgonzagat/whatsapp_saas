import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CouponService } from './coupon.service';

describe('CouponService.delete', () => {
  let service: CouponService;
  let prisma: {
    productCoupon: {
      findFirst: jest.Mock;
      delete: jest.Mock;
    };
  };

  const ws = 'ws-1';

  beforeEach(async () => {
    prisma = {
      productCoupon: {
        findFirst: jest.fn(),
        delete: jest.fn().mockResolvedValue({ id: 'coupon-1', code: 'SAVE10' }),
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [CouponService, { provide: PrismaService, useValue: prisma }],
    }).compile();
    service = module.get(CouponService);
  });

  it('deletes coupon when it belongs to workspace', async () => {
    prisma.productCoupon.findFirst.mockResolvedValue({
      id: 'coupon-1',
      code: 'SAVE10',
      productId: 'prod-1',
    });
    const result = await service.delete(ws, { couponId: 'coupon-1' });
    expect(result.success).toBe(true);
    expect(result.message).toContain('SAVE10');
    expect(prisma.productCoupon.delete).toHaveBeenCalledWith({ where: { id: 'coupon-1' } });
  });

  it('throws NotFoundException when coupon not in workspace', async () => {
    prisma.productCoupon.findFirst.mockResolvedValue(null);
    await expect(service.delete(ws, { couponId: 'coupon-other' })).rejects.toThrow(
      NotFoundException,
    );
  });

  it('cross-workspace isolation prevents delete from wrong workspace', async () => {
    prisma.productCoupon.findFirst.mockResolvedValue(null);
    await expect(service.delete('ws-other', { couponId: 'coupon-1' })).rejects.toThrow(
      NotFoundException,
    );
    expect(prisma.productCoupon.delete).not.toHaveBeenCalled();
  });

  it('returns error when couponId is empty', async () => {
    const result = await service.delete(ws, { couponId: '' });
    expect(result.success).toBe(false);
    expect(result.error).toBe('couponId is required');
  });
});
