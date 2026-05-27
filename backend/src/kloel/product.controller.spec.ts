import { BadRequestException, NotFoundException } from '@nestjs/common';
import { ProductController } from './product.controller';

jest.mock('./product-memory-sync.helpers', () => ({
  syncProductToMemory: jest.fn(),
  deleteProductFromMemory: jest.fn(),
}));

jest.mock('../common/storage/public-storage-url.util', () => ({
  normalizeStorageUrlForRequest: jest.fn((url: string | null | undefined) => url ?? null),
}));

jest.mock('./product-metrics.helpers', () => ({
  buildProductMetrics: jest.fn(() =>
    Promise.resolve(new Map<string, { totalSales: number; totalRevenue: number }>()),
  ),
}));

describe('ProductController', () => {
  const prisma = {
    product: {
      findMany: jest.fn(),
      findFirst: jest.fn(),
      findFirstOrThrow: jest.fn(),
      create: jest.fn(),
      updateMany: jest.fn(),
      deleteMany: jest.fn(),
    },
  } as never;

  let controller: ProductController;

  const mockReq = (overrides: Partial<{ sub: string; workspaceId: string }> = {}) =>
    ({
      user: {
        sub: overrides.sub ?? 'u-1',
        workspaceId: overrides.workspaceId ?? 'ws-1',
      },
      headers: {},
    }) as never;

  beforeEach(() => {
    jest.clearAllMocks();
    controller = new ProductController(prisma as never, undefined);
  });

  describe('listProducts', () => {
    it('returns products array with count', async () => {
      const raw = [{ id: 'p-1', name: 'Curso A' }];
      (prisma as never).product.findMany.mockResolvedValue(raw);
      const result = await controller.listProducts(mockReq());
      expect(result).toHaveProperty('products');
      expect(result).toHaveProperty('count', 1);
    });

    it('applies category filter', async () => {
      (prisma as never).product.findMany.mockResolvedValue([]);
      await controller.listProducts(mockReq(), 'cursos');
      expect((prisma as never).product.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: expect.objectContaining({ category: 'cursos' }) }),
      );
    });

    it('applies active filter', async () => {
      (prisma as never).product.findMany.mockResolvedValue([]);
      await controller.listProducts(mockReq(), undefined, 'true');
      expect((prisma as never).product.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: expect.objectContaining({ active: true }) }),
      );
    });

    it('applies search filter with OR', async () => {
      (prisma as never).product.findMany.mockResolvedValue([]);
      await controller.listProducts(mockReq(), undefined, undefined, 'react');
      expect((prisma as never).product.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: expect.objectContaining({ OR: expect.any(Array) }) }),
      );
    });
  });

  describe('getProductStats', () => {
    it('returns aggregate counts', async () => {
      (prisma as never).product.findMany.mockResolvedValue([
        { id: 'p-1', active: true, name: 'A' },
        { id: 'p-2', active: false, name: 'B' },
      ]);
      const result = await controller.getProductStats(mockReq());
      expect(result).toEqual({
        totalProducts: 2,
        activeProducts: 1,
        totalSales: 0,
        totalRevenue: 0,
      });
    });
  });

  describe('getProduct', () => {
    it('returns product scoped to workspace', async () => {
      (prisma as never).product.findFirst.mockResolvedValue({
        id: 'p-1',
        name: 'A',
        workspaceId: 'ws-1',
      });
      const result = await controller.getProduct(mockReq(), 'p-1');
      expect(result).toHaveProperty('product');
      expect((prisma as never).product.findFirst).toHaveBeenCalledWith({
        where: { id: 'p-1', workspaceId: 'ws-1' },
      });
    });

    it('throws NotFoundException when not found', async () => {
      (prisma as never).product.findFirst.mockResolvedValue(null);
      await expect(controller.getProduct(mockReq(), 'x')).rejects.toThrow(NotFoundException);
    });
  });

  describe('createProduct', () => {
    it('creates product and returns success', async () => {
      (prisma as never).product.create.mockResolvedValue({
        id: 'p-new',
        name: 'X',
        workspaceId: 'ws-1',
      });
      const result = await controller.createProduct(mockReq(), { name: 'X', price: 99.9 });
      expect(result).toHaveProperty('success', true);
    });

    it('returns existing on idempotent retry', async () => {
      const existing = { id: 'p-old', name: 'Retry', workspaceId: 'ws-1' };
      (prisma as never).product.findFirst.mockResolvedValue(existing);
      const result = await controller.createProduct(mockReq(), {
        name: 'Retry',
        price: 50,
        idempotencyKey: 'ik',
      });
      expect(result).toHaveProperty('data', existing);
      expect((prisma as never).product.create).not.toHaveBeenCalled();
    });
  });

  describe('updateProduct', () => {
    it('updates and returns updated record', async () => {
      (prisma as never).product.findFirst
        .mockResolvedValueOnce({ id: 'p-1', name: 'Old', workspaceId: 'ws-1', price: 50 })
        .mockResolvedValueOnce({ id: 'p-1', name: 'New', workspaceId: 'ws-1', price: 99 });
      (prisma as never).product.updateMany.mockResolvedValue({ count: 1 });
      const result = await controller.updateProduct(mockReq(), 'p-1', {
        name: 'New',
        price: 99,
      });
      expect(result).toHaveProperty('success', true);
    });

    it('throws NotFoundException when not in workspace', async () => {
      (prisma as never).product.findFirst.mockResolvedValue(null);
      await expect(
        controller.updateProduct(mockReq(), 'p-other', { name: 'X' }),
      ).rejects.toThrow(NotFoundException);
    });

    it('rejects commissionPercent > 100', async () => {
      (prisma as never).product.findFirst.mockResolvedValue({
        id: 'p-1',
        workspaceId: 'ws-1',
      });
      await expect(
        controller.updateProduct(mockReq(), 'p-1', { commissionPercent: 150 }),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('deleteProduct', () => {
    it('deletes and returns success', async () => {
      (prisma as never).product.findFirst.mockResolvedValue({
        id: 'p-1',
        workspaceId: 'ws-1',
      });
      (prisma as never).product.deleteMany.mockResolvedValue({ count: 1 });
      const result = await controller.deleteProduct(mockReq(), 'p-1');
      expect(result).toEqual({ success: true, deleted: 'p-1' });
    });

    it('throws NotFoundException when not found', async () => {
      (prisma as never).product.findFirst.mockResolvedValue(null);
      await expect(controller.deleteProduct(mockReq(), 'x')).rejects.toThrow(NotFoundException);
    });
  });

  describe('getCategories', () => {
    it('returns distinct non-null categories', async () => {
      (prisma as never).product.findMany.mockResolvedValue([
        { category: 'cursos' },
        { category: 'mentorias' },
        { category: null },
      ]);
      const result = await controller.getCategories(mockReq());
      expect(result).toEqual({ categories: ['cursos', 'mentorias'] });
    });
  });

  describe('importProducts', () => {
    it('reports success/failure counts', async () => {
      (prisma as never).product.create
        .mockResolvedValueOnce({ id: 'p-1', workspaceId: 'ws-1' })
        .mockRejectedValueOnce(new Error('dup'));
      const result = await controller.importProducts(mockReq(), {
        products: [
          { name: 'A', price: 10 },
          { name: 'B', price: 20 },
        ],
      });
      expect(result.imported).toBe(1);
      expect(result.failed).toBe(1);
    });
  });
});
