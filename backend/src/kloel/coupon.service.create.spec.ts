import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CouponService } from './coupon.service';

describe('CouponService.create', () => {
  let service: CouponService;
  let prisma: {
    product: { findFirst: jest.Mock };
    productCoupon: { create: jest.Mock };
  };

  const ws = 'ws-1';

  beforeEach(async () => {
    prisma = {
      product: { findFirst: jest.fn() },
      productCoupon: {
        create: jest.fn().mockImplementation(({ data }: { data: Record<string, unknown> }) =>
          Promise.resolve({ id: 'coupon-1', ...data }),
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

  it('creates coupon when product belongs to workspace', async () => {
    prisma.product.findFirst.mockResolvedValue({ id: 'prod-1' });
    const result = await service.create(ws, {
      productId: 'prod-1',
      code: 'SAVE10',
      discountType: 'percentage',
      discountValue: 10,
    });
    expect(result.success).toBe(true);
    expect(result.coupon).toBeDefined();
    expect(prisma.productCoupon.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ code: 'SAVE10', productId: 'prod-1' }),
      }),
    );
  });

  it('throws NotFoundException when product not in workspace', async () => {
    prisma.product.findFirst.mockResolvedValue(null);
    await expect(
      service.create(ws, {
        productId: 'prod-other',
        code: 'X',
        discountType: 'fixed',
        discountValue: 5,
      }),
    ).rejects.toThrow(NotFoundException);
  });

  it('rejects missing productId or code', async () => {
    const result = await service.create(ws, {
      productId: '',
      code: '',
      discountType: 'fixed',
      discountValue: 5,
    });
    expect(result.success).toBe(false);
    expect(result.error).toBe('productId and code are required');
  });

  it('accepts usageLimit as alias for maxUses', async () => {
    prisma.product.findFirst.mockResolvedValue({ id: 'prod-1' });
    await service.create(ws, {
      productId: 'prod-1',
      code: 'LIMIT50',
      discountType: 'fixed',
      discountValue: 20,
      usageLimit: 50,
    });
    expect(prisma.productCoupon.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ maxUses: 50 }),
      }),
    );
  });
});
