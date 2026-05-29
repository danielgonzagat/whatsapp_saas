import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CouponService } from './coupon.service';

describe('CouponService.update', () => {
  let service: CouponService;
  let prisma: {
    productCoupon: {
      findFirst: jest.Mock;
      update: jest.Mock;
    };
  };

  const ws = 'ws-1';

  const makeCoupon = (overrides: Record<string, unknown> = {}) => ({
    id: 'coupon-1',
    productId: 'prod-1',
    code: 'SAVE10',
    discountType: 'percentage',
    discountValue: 10,
    active: true,
    maxUses: null,
    expiresAt: null,
    ...overrides,
  });

  beforeEach(async () => {
    prisma = {
      productCoupon: {
        findFirst: jest.fn(),
        update: jest.fn().mockImplementation(({ where, data }: { where: { id: string }; data: Record<string, unknown> }) =>
          Promise.resolve({ id: where.id, productId: 'prod-1', ...data }),
        ),
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CouponService,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();
    service = module.get(CouponService);
  });

  it('updates coupon when it belongs to workspace', async () => {
    prisma.productCoupon.findFirst.mockResolvedValue(makeCoupon());
    const result = await service.update(ws, { couponId: 'coupon-1', active: false });
    expect(result.success).toBe(true);
    expect(result.coupon.active).toBe(false);
    expect(prisma.productCoupon.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'coupon-1' },
        data: { active: false },
      }),
    );
  });

  it('throws NotFoundException when coupon not in workspace', async () => {
    prisma.productCoupon.findFirst.mockResolvedValue(null);
    await expect(
      service.update(ws, { couponId: 'coupon-other' }),
    ).rejects.toThrow(NotFoundException);
  });

  it('cross-workspace isolation prevents update from wrong workspace', async () => {
    prisma.productCoupon.findFirst.mockResolvedValue(null);
    await expect(
      service.update('ws-other', { couponId: 'coupon-1', active: false }),
    ).rejects.toThrow(NotFoundException);
  });

  it('returns error when no fields to update', async () => {
    prisma.productCoupon.findFirst.mockResolvedValue(makeCoupon());
    const result = await service.update(ws, { couponId: 'coupon-1' });
    expect(result.success).toBe(false);
    expect(result.error).toBe('no_fields_to_update');
  });
});
