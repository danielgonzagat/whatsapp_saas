import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException, ForbiddenException } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { ProductService } from './product.service';

describe('ProductService', () => {
  let service: ProductService;
  let prisma: {
    product: {
      create: jest.Mock;
      findUnique: jest.Mock;
      findFirst: jest.Mock;
      findMany: jest.Mock;
      count: jest.Mock;
      update: jest.Mock;
    };
  };
  let eventEmitter: { emit: jest.Mock };
  let audit: { log: jest.Mock };

  const ws = 'ws-1';
  const actor = { id: 'agent-1', email: 'a@b.com' };
  const makeProduct = (overrides: Record<string, unknown> = {}) => ({
    id: 'prod-1',
    workspaceId: ws,
    name: 'Test',
    description: 'Desc',
    price: 99.9,
    category: 'cat',
    sku: 'SKU-1',
    format: 'PHYSICAL',
    status: 'DRAFT',
    active: false,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  });

  beforeEach(async () => {
    prisma = {
      product: {
        create: jest.fn().mockImplementation(({ data }) =>
          Promise.resolve({ id: 'prod-1', workspaceId: ws, ...data, createdAt: new Date(), updatedAt: new Date() }),
        ),
        findUnique: jest.fn(),
        findFirst: jest.fn(),
        findMany: jest.fn(),
        count: jest.fn(),
        update: jest.fn().mockImplementation(({ where, data }) =>
          Promise.resolve({ id: where.id, workspaceId: ws, ...data, createdAt: new Date(), updatedAt: new Date() }),
        ),
      },
    };
    eventEmitter = { emit: jest.fn() };
    audit = { log: jest.fn() };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ProductService,
        { provide: PrismaService, useValue: prisma },
        { provide: EventEmitter2, useValue: eventEmitter },
        { provide: AuditService, useValue: audit },
      ],
    }).compile();
    service = module.get(ProductService);
  });

  describe('create', () => {
    it('creates a product with DRAFT status and emits event', async () => {
      const dto = { name: 'Widget', price: 49.99, format: 'DIGITAL' as const };
      const result = await service.create(ws, dto, actor);
      expect(result.success).toBe(true);
      expect(result.product?.name).toBe('Widget');
      expect(result.product?.status).toBe('DRAFT');
      expect(result.product?.active).toBe(false);
      expect(eventEmitter.emit).toHaveBeenCalledWith('product.created', expect.objectContaining({ productId: 'prod-1' }));
      expect(audit.log).toHaveBeenCalledWith(expect.objectContaining({ action: 'product.create' }));
    });

    it('throws ForbiddenException when workspaceId is empty', async () => {
      await expect(service.create('', { name: 'X', price: 10 }, actor)).rejects.toThrow(ForbiddenException);
    });
  });

  describe('update', () => {
    it('updates a product in the same workspace', async () => {
      prisma.product.findUnique.mockResolvedValue(makeProduct());
      const result = await service.update(ws, 'prod-1', { name: 'Updated' }, actor);
      expect(result.success).toBe(true);
      expect(eventEmitter.emit).toHaveBeenCalledWith('product.updated', expect.any(Object));
    });

    it('throws NotFoundException when product missing', async () => {
      prisma.product.findUnique.mockResolvedValue(null);
      await expect(service.update(ws, 'prod-missing', { name: 'X' }, actor)).rejects.toThrow(NotFoundException);
    });

    it('throws ForbiddenException for cross-workspace access', async () => {
      prisma.product.findUnique.mockResolvedValue(makeProduct({ workspaceId: 'ws-other' }));
      await expect(service.update(ws, 'prod-1', { name: 'X' }, actor)).rejects.toThrow(ForbiddenException);
    });
  });

  describe('findById', () => {
    it('returns product scoped to workspace', async () => {
      prisma.product.findFirst.mockResolvedValue(makeProduct());
      const result = await service.findById(ws, 'prod-1');
      expect(result?.id).toBe('prod-1');
      expect(prisma.product.findFirst).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 'prod-1', workspaceId: ws } }));
    });

    it('returns null when not found', async () => {
      prisma.product.findFirst.mockResolvedValue(null);
      const result = await service.findById(ws, 'prod-none');
      expect(result).toBeNull();
    });
  });

  describe('list', () => {
    it('returns paginated products with count', async () => {
      prisma.product.findMany.mockResolvedValue([makeProduct(), makeProduct({ id: 'prod-2' })]);
      prisma.product.count.mockResolvedValue(2);
      const result = await service.list(ws, { page: 1, limit: 10 });
      expect(result.success).toBe(true);
      expect(result.products).toHaveLength(2);
      expect(result.count).toBe(2);
      expect(result.page).toBe(1);
    });

    it('applies search filter', async () => {
      prisma.product.findMany.mockResolvedValue([]);
      prisma.product.count.mockResolvedValue(0);
      await service.list(ws, { search: 'widget' });
      expect(prisma.product.findMany).toHaveBeenCalledWith(expect.objectContaining({
        where: expect.objectContaining({ OR: expect.any(Array) }),
      }));
    });

    it('applies category and status filters', async () => {
      prisma.product.findMany.mockResolvedValue([]);
      prisma.product.count.mockResolvedValue(0);
      await service.list(ws, { category: 'cat', status: 'APPROVED', active: true });
      expect(prisma.product.findMany).toHaveBeenCalledWith(expect.objectContaining({
        where: expect.objectContaining({ category: 'cat', status: 'APPROVED', active: true }),
      }));
    });
  });

  describe('setImage', () => {
    it('updates imageUrl on the product', async () => {
      prisma.product.update.mockResolvedValue(makeProduct({ imageUrl: 'https://img.example/pic.png' }));
      const result = await service.setImage(ws, 'prod-1', 'https://img.example/pic.png', { id: 'agent-1' });
      expect(result.success).toBe(true);
      expect(audit.log).toHaveBeenCalledWith(expect.objectContaining({ action: 'product.setImage' }));
    });
  });

  describe('publish', () => {
    it('sets status to APPROVED and active to true', async () => {
      prisma.product.update.mockResolvedValue(makeProduct({ status: 'APPROVED', active: true }));
      const result = await service.publish(ws, 'prod-1', { id: 'agent-1' });
      expect(result.success).toBe(true);
      expect(eventEmitter.emit).toHaveBeenCalledWith('product.published', expect.any(Object));
    });
  });

  describe('toggleAvailability', () => {
    it('activates a product', async () => {
      prisma.product.update.mockResolvedValue(makeProduct({ active: true }));
      const result = await service.toggleAvailability(ws, 'prod-1', true, { id: 'agent-1' });
      expect(result.success).toBe(true);
      expect(eventEmitter.emit).toHaveBeenCalledWith('product.activated', expect.any(Object));
    });

    it('deactivates a product', async () => {
      prisma.product.update.mockResolvedValue(makeProduct({ active: false }));
      const result = await service.toggleAvailability(ws, 'prod-1', false, { id: 'agent-1' });
      expect(result.success).toBe(true);
      expect(eventEmitter.emit).toHaveBeenCalledWith('product.deactivated', expect.any(Object));
    });
  });

  describe('delete', () => {
    it('soft-deletes a product (sets status to DELETED)', async () => {
      prisma.product.update.mockResolvedValue(makeProduct({ status: 'DELETED', active: false }));
      const result = await service.delete(ws, 'prod-1', { id: 'agent-1' });
      expect(result.success).toBe(true);
      expect(eventEmitter.emit).toHaveBeenCalledWith('product.deleted', expect.any(Object));
    });
  });
});
