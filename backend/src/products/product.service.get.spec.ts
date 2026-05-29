import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { ProductService } from './product.service';
import { MindEventSpine } from '../kloel/mind/coordination';

describe('ProductService.get (resolver-compatible)', () => {
  let service: ProductService;
  let prisma: {
    product: { findFirst: jest.Mock };
  };

  const ws = 'ws-1';

  const makeProduct = (overrides: Record<string, unknown> = {}) => ({
    id: 'prod-1',
    workspaceId: ws,
    name: 'Test Product',
    price: 99.9,
    status: 'DRAFT',
    active: false,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  });

  beforeEach(async () => {
    prisma = { product: { findFirst: jest.fn() } };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ProductService,
        { provide: PrismaService, useValue: prisma },
        { provide: EventEmitter2, useValue: { emit: jest.fn() } },
        { provide: AuditService, useValue: { log: jest.fn() } },
        { provide: MindEventSpine, useValue: { recordCommercial: jest.fn() } },
      ],
    }).compile();
    service = module.get(ProductService);
  });

  it('returns product when found in workspace', async () => {
    prisma.product.findFirst.mockResolvedValue(makeProduct());
    const result = await service.get(ws, { productId: 'prod-1' });
    expect(result.success).toBe(true);
    expect(result.product?.id).toBe('prod-1');
    expect(result.product?.name).toBe('Test Product');
  });

  it('throws NotFoundException when product not in workspace', async () => {
    prisma.product.findFirst.mockResolvedValue(null);
    await expect(service.get(ws, { productId: 'prod-missing' })).rejects.toThrow(
      NotFoundException,
    );
  });

  it('workspace-scopes the lookup', async () => {
    prisma.product.findFirst.mockResolvedValue(null);
    await expect(service.get('ws-other', { productId: 'prod-1' })).rejects.toThrow(
      NotFoundException,
    );
    expect(prisma.product.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'prod-1', workspaceId: 'ws-other' } }),
    );
  });
});
