import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { PlanService } from './plan.service';

/**
 * Wave7 L2 — fine-grained plan capability adapters (Y-1/Y-2).
 *
 * Covers the resolver-compatible `*FromArgs` adapters that
 * `KloelDomainServiceResolver.tryExecute` invokes with `(workspaceId, args)`,
 * plus the two new domain methods they introduce (`setOrderBump`, `setImage`).
 */
describe('PlanService — Wave7 fine-grained adapters', () => {
  let service: PlanService;
  let prisma: {
    productPlan: { findFirst: jest.Mock; update: jest.Mock };
  };
  const ws = 'ws-1';

  beforeEach(async () => {
    prisma = {
      productPlan: {
        findFirst: jest.fn().mockResolvedValue({ id: 'p1', checkoutImages: {} }),
        update: jest.fn().mockResolvedValue({ id: 'p1' }),
      },
    };
    const m: TestingModule = await Test.createTestingModule({
      providers: [
        PlanService,
        { provide: PrismaService, useValue: prisma },
        { provide: EventEmitter2, useValue: { emit: jest.fn() } },
        { provide: AuditService, useValue: { log: jest.fn().mockResolvedValue(undefined) } },
      ],
    }).compile();
    service = m.get(PlanService);
  });

  afterEach(() => jest.clearAllMocks());

  describe('setPaymentMethodsFromArgs', () => {
    it('forwards payment methods to setPaymentMethods', async () => {
      const r = await service.setPaymentMethodsFromArgs(ws, {
        planId: 'p1',
        card: true,
        pix: true,
        boleto: false,
      });
      expect(r.success).toBe(true);
      expect(prisma.productPlan.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: {
            checkoutImages: expect.objectContaining({
              paymentMethods: { card: true, pix: true, boleto: false },
            }),
          },
        }),
      );
    });

    it('throws when planId is missing', async () => {
      await expect(service.setPaymentMethodsFromArgs(ws, { card: true })).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });
  });

  describe('setInstallmentsFromArgs', () => {
    it('forwards maxInstallments', async () => {
      const r = await service.setInstallmentsFromArgs(ws, { planId: 'p1', maxInstallments: 12 });
      expect(r.success).toBe(true);
      expect(prisma.productPlan.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: { maxInstallments: 12 } }),
      );
    });

    it('rejects non-positive installments', async () => {
      await expect(
        service.setInstallmentsFromArgs(ws, { planId: 'p1', maxInstallments: 0 }),
      ).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('setCouponsFromArgs', () => {
    it('coerces acceptCoupons to boolean', async () => {
      const r = await service.setCouponsFromArgs(ws, { planId: 'p1', acceptCoupons: true });
      expect(r.success).toBe(true);
      expect(prisma.productPlan.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: { checkoutImages: expect.objectContaining({ acceptCoupons: true }) },
        }),
      );
    });
  });

  describe('setShippingFromArgs', () => {
    it('forwards shipping config', async () => {
      const r = await service.setShippingFromArgs(ws, {
        planId: 'p1',
        type: 'FIXED',
        fixedValue: 25,
        originCep: '01310-100',
      });
      expect(r.success).toBe(true);
      expect(prisma.productPlan.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: {
            checkoutImages: expect.objectContaining({
              shipping: { type: 'FIXED', fixedValue: 25, originCep: '01310-100' },
            }),
          },
        }),
      );
    });
  });

  describe('setVisibilityForAffiliatesFromArgs', () => {
    it('sets visibleToAffiliates', async () => {
      const r = await service.setVisibilityForAffiliatesFromArgs(ws, {
        planId: 'p1',
        visibleToAffiliates: true,
      });
      expect(r.success).toBe(true);
      expect(prisma.productPlan.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: { visibleToAffiliates: true } }),
      );
    });
  });

  describe('setCustomCommissionFromArgs', () => {
    it('sets custom commission via affiliate config', async () => {
      const r = await service.setCustomCommissionFromArgs(ws, {
        planId: 'p1',
        customCommission: 30,
      });
      expect(r.success).toBe(true);
      expect(prisma.productPlan.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: { checkoutImages: expect.objectContaining({ customCommission: 30 }) },
        }),
      );
    });

    it('rejects negative commission', async () => {
      await expect(
        service.setCustomCommissionFromArgs(ws, { planId: 'p1', customCommission: -1 }),
      ).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('setOrderBumpFromArgs', () => {
    it('persists order bump config into checkoutImages', async () => {
      const r = await service.setOrderBumpFromArgs(ws, {
        planId: 'p1',
        enabled: true,
        bumpProductId: 'prod-2',
        title: 'Leve mais 1',
        discountPercent: 20,
      });
      expect(r.success).toBe(true);
      expect(prisma.productPlan.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: {
            checkoutImages: expect.objectContaining({
              orderBump: {
                enabled: true,
                bumpProductId: 'prod-2',
                title: 'Leve mais 1',
                discountPercent: 20,
              },
            }),
          },
        }),
      );
    });

    it('throws when plan not found', async () => {
      prisma.productPlan.findFirst.mockResolvedValueOnce(null);
      await expect(
        service.setOrderBumpFromArgs(ws, { planId: 'missing', enabled: true }),
      ).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('setImageFromArgs', () => {
    it('persists imageUrl into checkoutImages', async () => {
      const r = await service.setImageFromArgs(ws, {
        planId: 'p1',
        imageUrl: 'https://cdn.example/p.png',
      });
      expect(r.success).toBe(true);
      expect(prisma.productPlan.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: {
            checkoutImages: expect.objectContaining({ imageUrl: 'https://cdn.example/p.png' }),
          },
        }),
      );
    });

    it('throws when imageUrl is missing', async () => {
      await expect(service.setImageFromArgs(ws, { planId: 'p1' })).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });
  });
});
