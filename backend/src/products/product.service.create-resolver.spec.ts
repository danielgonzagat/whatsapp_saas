import { Test, TestingModule } from '@nestjs/testing';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { ProductService } from './product.service';
import { MindEventSpine } from '../kloel/mind/coordination';

describe('ProductService.create (resolver-compatible 2-arg)', () => {
  let service: ProductService;
  let prisma: {
    product: { create: jest.Mock };
  };
  let audit: { log: jest.Mock };

  const ws = 'ws-1';

  beforeEach(async () => {
    prisma = {
      product: {
        create: jest.fn().mockImplementation(({ data }: { data: Record<string, unknown> }) =>
          Promise.resolve({
            id: 'prod-new',
            workspaceId: ws,
            ...data,
            createdAt: new Date(),
            updatedAt: new Date(),
          }),
        ),
      },
    };
    audit = { log: jest.fn() };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ProductService,
        { provide: PrismaService, useValue: prisma },
        { provide: EventEmitter2, useValue: { emit: jest.fn() } },
        { provide: AuditService, useValue: audit },
        { provide: MindEventSpine, useValue: { recordCommercial: jest.fn().mockResolvedValue('ok') } },
      ],
    }).compile();
    service = module.get(ProductService);
  });

  it('creates product with 2-arg resolver convention (no actor)', async () => {
    // Resolver calls: create(workspaceId, { name, price })
    const result = await service.create(ws, { name: 'ResolverProd', price: 59.9 });
    expect(result.success).toBe(true);
    expect(result.product?.name).toBe('ResolverProd');
    expect(result.product?.status).toBe('DRAFT');
    expect(audit.log).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'product.create',
        agentId: 'kloel-resolver',
      }),
    );
  });

  it('still works with 3-arg (actor) calling convention', async () => {
    const result = await service.create(ws, { name: 'OldStyle', price: 29.9 }, { id: 'agent-7' });
    expect(result.success).toBe(true);
    expect(audit.log).toHaveBeenCalledWith(
      expect.objectContaining({
        agentId: 'agent-7',
      }),
    );
  });
});
