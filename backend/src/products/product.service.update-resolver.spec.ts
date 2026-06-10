import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { ProductService } from './product.service';
import { MindEventSpine } from '../kloel/mind/coordination';

describe('ProductService.update (resolver-compatible 2-arg)', () => {
  let service: ProductService;
  let prisma: {
    product: {
      findUnique: jest.Mock;
      findFirst: jest.Mock;
      update: jest.Mock;
    };
  };

  const ws = 'ws-1';

  const makeProduct = (overrides: Record<string, unknown> = {}) => ({
    id: 'prod-1',
    workspaceId: ws,
    name: 'Old',
    price: 99.9,
    status: 'DRAFT',
    active: false,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  });

  beforeEach(async () => {
    prisma = {
      product: {
        findUnique: jest.fn(),
        findFirst: jest.fn(),
        update: jest
          .fn()
          .mockImplementation(
            ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) =>
              Promise.resolve({
                id: where.id,
                workspaceId: ws,
                name: 'Old',
                price: 99.9,
                ...data,
                createdAt: new Date(),
                updatedAt: new Date(),
              }),
          ),
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ProductService,
        { provide: PrismaService, useValue: prisma },
        { provide: AuditService, useValue: { log: jest.fn() } },
        {
          provide: MindEventSpine,
          useValue: { recordCommercial: jest.fn().mockResolvedValue('ok') },
        },
      ],
    }).compile();
    service = module.get(ProductService);
  });

  it('updates product with 2-arg resolver convention (productId embedded in args)', async () => {
    prisma.product.findFirst.mockResolvedValue(makeProduct());
    // Resolver calls: update(workspaceId, { productId, name, ... })
    const result = await service.update(ws, { productId: 'prod-1', name: 'UpdatedViaResolver' });
    expect(result.success).toBe(true);
    const updateCalls1 = prisma.product.update.mock.calls as Array<
      [{ where: { id: string; workspaceId: string }; data: { name?: string } }]
    >;
    expect(updateCalls1[0]?.[0]?.where).toEqual({ id: 'prod-1', workspaceId: ws });
    expect(updateCalls1[0]?.[0]?.data?.name).toBe('UpdatedViaResolver');
  });

  it('still works with 4-arg direct calling convention', async () => {
    prisma.product.findFirst.mockResolvedValue(makeProduct());
    const result = await service.update(
      ws,
      'prod-1',
      { name: 'UpdatedOldStyle' },
      { id: 'agent-3' },
    );
    expect(result.success).toBe(true);
    const updateCalls2 = prisma.product.update.mock.calls as Array<[{ data: { name?: string } }]>;
    expect(updateCalls2[0]?.[0]?.data?.name).toBe('UpdatedOldStyle');
  });

  it('handles resolver args with no additional fields gracefully', async () => {
    prisma.product.findFirst.mockResolvedValue(makeProduct());
    const result = await service.update(ws, { productId: 'prod-1' });
    expect(result.success).toBe(true);
    // No fields to update — should still succeed (prisma.update is called with empty data)
  });
});
