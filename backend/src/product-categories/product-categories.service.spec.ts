import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from '../prisma/prisma.service';
import { ProductCategoriesService } from './product-categories.service';

describe('ProductCategoriesService', () => {
  let service: ProductCategoriesService;
  let prisma: { product: { findMany: jest.Mock } };

  beforeEach(async () => {
    prisma = { product: { findMany: jest.fn() } };
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ProductCategoriesService,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();
    service = module.get(ProductCategoriesService);
  });

  it('lists distinct categories for the workspace', async () => {
    prisma.product.findMany.mockResolvedValue([
      { category: 'books' },
      { category: 'courses' },
    ]);
    const result = await service.listByWorkspace('ws-1');
    expect(result).toEqual([{ category: 'books' }, { category: 'courses' }]);
  });

  it('enforces workspace isolation + active filter + distinct on category', async () => {
    prisma.product.findMany.mockResolvedValue([]);
    await service.listByWorkspace('ws-tenant-A');
    expect(prisma.product.findMany).toHaveBeenCalledWith({
      where: { workspaceId: 'ws-tenant-A', active: true },
      distinct: ['category'],
      orderBy: { category: 'asc' },
      select: { category: true },
    });
  });

  it('returns empty array when workspace has no products', async () => {
    prisma.product.findMany.mockResolvedValue([]);
    await expect(service.listByWorkspace('ws-empty')).resolves.toEqual([]);
  });
});
