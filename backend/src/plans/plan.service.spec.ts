import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { PlanService } from './plan.service';

describe('PlanService', () => {
  let service: PlanService;
  let prisma: {
    product: { findFirst: jest.Mock };
    productPlan: {
      findFirst: jest.Mock;
      findMany: jest.Mock;
      create: jest.Mock;
      update: jest.Mock;
      delete: jest.Mock;
    };
  };
  let events: { emit: jest.Mock };
  let audit: { log: jest.Mock };
  const ws = 'ws-1';

  beforeEach(async () => {
    prisma = {
      product: { findFirst: jest.fn().mockResolvedValue(null) },
      productPlan: {
        findFirst: jest.fn().mockResolvedValue(null),
        findMany: jest.fn().mockResolvedValue([]),
        create: jest.fn(),
        update: jest.fn(),
        delete: jest.fn(),
      },
    };
    events = { emit: jest.fn() };
    audit = { log: jest.fn().mockResolvedValue(undefined) };
    const m: TestingModule = await Test.createTestingModule({
      providers: [
        PlanService,
        { provide: PrismaService, useValue: prisma },
        { provide: EventEmitter2, useValue: events },
        { provide: AuditService, useValue: audit },
      ],
    }).compile();
    service = m.get(PlanService);
  });

  afterEach(() => jest.clearAllMocks());

  describe('create', () => {
    const dto = { productId: 'prod-1', name: 'Pro', price: 49.9 };

    it('creates plan scoped to workspace product', async () => {
      prisma.product.findFirst.mockResolvedValue({ id: 'prod-1', workspaceId: ws });
      prisma.productPlan.create.mockResolvedValue({
        id: 'plan-1',
        name: 'Pro',
        price: 49.9,
        active: true,
        productId: 'prod-1',
      });
      const r = await service.create(ws, dto);
      expect(r.success).toBe(true);
      expect(r.plan.name).toBe('Pro');
    });

    it('throws NotFoundException when product not in workspace', async () => {
      prisma.product.findFirst.mockResolvedValue(null);
      await expect(service.create(ws, dto)).rejects.toThrow(NotFoundException);
    });

    it('defaults billingType to ONE_TIME', async () => {
      prisma.product.findFirst.mockResolvedValue({ id: 'prod-1', workspaceId: ws });
      prisma.productPlan.create.mockResolvedValue({
        id: 'p1',
        name: 'Pro',
        price: 49.9,
        billingType: 'ONE_TIME',
      });
      await service.create(ws, dto);
      expect(prisma.productPlan.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ billingType: 'ONE_TIME' }) }),
      );
    });

    it('defaults itemsPerPlan and maxInstallments to 1', async () => {
      prisma.product.findFirst.mockResolvedValue({ id: 'prod-1', workspaceId: ws });
      prisma.productPlan.create.mockResolvedValue({ id: 'p1', name: 'Pro', price: 49.9 });
      await service.create(ws, dto);
      expect(prisma.productPlan.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ itemsPerPlan: 1, maxInstallments: 1 }),
        }),
      );
    });

    it('emits plan.created event', async () => {
      prisma.product.findFirst.mockResolvedValue({ id: 'prod-1', workspaceId: ws });
      prisma.productPlan.create.mockResolvedValue({ id: 'p1', name: 'Pro', price: 49.9 });
      await service.create(ws, dto);
      expect(events.emit).toHaveBeenCalledWith(
        'plan.created',
        expect.objectContaining({ planId: 'p1', workspaceId: ws }),
      );
    });

    it('audit-logs when actor provided', async () => {
      prisma.product.findFirst.mockResolvedValue({ id: 'prod-1', workspaceId: ws });
      prisma.productPlan.create.mockResolvedValue({ id: 'p1', name: 'Pro', price: 49.9 });
      await service.create(ws, dto, { id: 'actor-1' });
      expect(audit.log).toHaveBeenCalledWith(
        expect.objectContaining({ workspaceId: ws, agentId: 'actor-1', action: 'plan.create' }),
      );
    });

    it('skips audit when no actor', async () => {
      prisma.product.findFirst.mockResolvedValue({ id: 'prod-1', workspaceId: ws });
      prisma.productPlan.create.mockResolvedValue({ id: 'p1', name: 'Pro', price: 49.9 });
      await service.create(ws, dto);
      expect(audit.log).not.toHaveBeenCalled();
    });

    it('survives when cognitive spine is unavailable (optional dep)', async () => {
      prisma.product.findFirst.mockResolvedValue({ id: 'prod-1', workspaceId: ws });
      prisma.productPlan.create.mockResolvedValue({ id: 'p1', name: 'Pro', price: 49.9 });
      const r = await service.create(ws, dto);
      expect(r.success).toBe(true);
    });
  });

  describe('findByProduct', () => {
    it('returns plans scoped to workspace product', async () => {
      prisma.productPlan.findMany.mockResolvedValue([{ id: 'p1', name: 'Pro' }]);
      const r = await service.findByProduct(ws, 'prod-1');
      expect(r.success).toBe(true);
      expect(r.plans).toHaveLength(1);
    });

    it('returns empty array for no plans', async () => {
      prisma.productPlan.findMany.mockResolvedValue([]);
      const r = await service.findByProduct(ws, 'prod-1');
      expect(r.plans).toHaveLength(0);
    });
  });

  describe('findById', () => {
    it('returns workspace-scoped plan', async () => {
      prisma.productPlan.findFirst.mockResolvedValue({ id: 'p1', name: 'Pro' });
      expect((await service.findById(ws, 'p1'))?.name).toBe('Pro');
    });
    it('returns null for missing', async () => {
      prisma.productPlan.findFirst.mockResolvedValue(null);
      expect(await service.findById(ws, 'nx')).toBeNull();
    });
  });

  describe('update', () => {
    const existing = { id: 'p1', productId: 'prod-1', name: 'Old', price: 10, checkoutImages: {} };

    it('updates plan fields', async () => {
      prisma.productPlan.findFirst.mockResolvedValue(existing);
      prisma.productPlan.update.mockResolvedValue({ ...existing, name: 'New', price: 20 });
      const r = await service.update(ws, 'p1', { name: 'New', price: 20 });
      expect(r.success).toBe(true);
      expect(r.plan.name).toBe('New');
    });

    it('throws NotFoundException for missing plan', async () => {
      prisma.productPlan.findFirst.mockResolvedValue(null);
      await expect(service.update(ws, 'p1', { name: 'X' })).rejects.toThrow(NotFoundException);
    });

    it('returns no-changes when dto is empty', async () => {
      prisma.productPlan.findFirst.mockResolvedValue(existing);
      const r = await service.update(ws, 'p1', {});
      expect(r.message).toBe('No changes');
      expect(prisma.productPlan.update).not.toHaveBeenCalled();
    });

    it('emits plan.updated event', async () => {
      prisma.productPlan.findFirst.mockResolvedValue(existing);
      prisma.productPlan.update.mockResolvedValue(existing);
      await service.update(ws, 'p1', { name: 'X' });
      expect(events.emit).toHaveBeenCalledWith(
        'plan.updated',
        expect.objectContaining({ planId: 'p1' }),
      );
    });

    it('audit-logs with actor', async () => {
      prisma.productPlan.findFirst.mockResolvedValue(existing);
      prisma.productPlan.update.mockResolvedValue(existing);
      await service.update(ws, 'p1', { name: 'X' }, { id: 'a1' });
      expect(audit.log).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'plan.update', agentId: 'a1' }),
      );
    });
  });

  describe('delete', () => {
    const plan = { id: 'p1', productId: 'prod-1', name: 'Pro' };

    it('deletes plan and returns message', async () => {
      prisma.productPlan.findFirst.mockResolvedValue(plan);
      prisma.productPlan.delete.mockResolvedValue(plan);
      const r = await service.delete(ws, 'p1');
      expect(r.success).toBe(true);
      expect(r.message).toContain('Pro');
    });

    it('throws NotFoundException for missing', async () => {
      prisma.productPlan.findFirst.mockResolvedValue(null);
      await expect(service.delete(ws, 'nx')).rejects.toThrow(NotFoundException);
    });

    it('emits plan.deleted + audits', async () => {
      prisma.productPlan.findFirst.mockResolvedValue(plan);
      prisma.productPlan.delete.mockResolvedValue(plan);
      await service.delete(ws, 'p1', { id: 'actor-1' });
      expect(events.emit).toHaveBeenCalledWith(
        'plan.deleted',
        expect.objectContaining({ planId: 'p1' }),
      );
      expect(audit.log).toHaveBeenCalledWith(expect.objectContaining({ action: 'plan.delete' }));
    });
  });

  describe('setPaymentMethods', () => {
    it('persists payment methods config', async () => {
      prisma.productPlan.findFirst.mockResolvedValue({ id: 'p1', checkoutImages: {} });
      prisma.productPlan.update.mockResolvedValue({ id: 'p1' });
      const r = await service.setPaymentMethods(ws, 'p1', { pix: true, card: false });
      expect(r.success).toBe(true);
    });

    it('throws NotFoundException when plan missing', async () => {
      prisma.productPlan.findFirst.mockResolvedValue(null);
      await expect(service.setPaymentMethods(ws, 'p1', {})).rejects.toThrow(NotFoundException);
    });
  });

  describe('setCoupons', () => {
    it('enables coupons', async () => {
      prisma.productPlan.findFirst.mockResolvedValue({ id: 'p1', checkoutImages: {} });
      prisma.productPlan.update.mockResolvedValue({ id: 'p1' });
      const r = await service.setCoupons(ws, 'p1', true);
      expect(r.success).toBe(true);
    });

    it('disables coupons', async () => {
      prisma.productPlan.findFirst.mockResolvedValue({
        id: 'p1',
        checkoutImages: { acceptCoupons: true },
      });
      prisma.productPlan.update.mockResolvedValue({ id: 'p1' });
      await service.setCoupons(ws, 'p1', false);
      expect(prisma.productPlan.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            checkoutImages: expect.objectContaining({ acceptCoupons: false }),
          }),
        }),
      );
    });
  });

  describe('setShipping', () => {
    it('configures shipping', async () => {
      prisma.productPlan.findFirst.mockResolvedValue({ id: 'p1', checkoutImages: {} });
      prisma.productPlan.update.mockResolvedValue({ id: 'p1' });
      const r = await service.setShipping(ws, 'p1', { type: 'FIXED', fixedValue: 15 });
      expect(r.success).toBe(true);
    });
  });

  describe('setAffiliateConfig', () => {
    it('updates affiliate visibility', async () => {
      prisma.productPlan.findFirst.mockResolvedValue({ id: 'p1', checkoutImages: {} });
      prisma.productPlan.update.mockResolvedValue({ id: 'p1', visibleToAffiliates: true });
      const r = await service.setAffiliateConfig(ws, 'p1', { visibleToAffiliates: true });
      expect(r.success).toBe(true);
    });
  });
});
