import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from '../prisma/prisma.service';
import { MindPerceptionService } from './mind-perception.service';

describe('MindPerceptionService', () => {
  type SourceFindManyCall = [{ where: { workspaceId: string; createdAt: { gt: Date } } }];

  let service: MindPerceptionService;
  let prisma: {
    autopilotEvent: { findMany: jest.Mock };
    message: { findMany: jest.Mock };
    kloelSale: { findMany: jest.Mock };
    checkoutOrder: { findMany: jest.Mock };
    product: { findMany: jest.Mock };
  };

  beforeEach(async () => {
    prisma = {
      autopilotEvent: { findMany: jest.fn().mockResolvedValue([]) },
      message: { findMany: jest.fn().mockResolvedValue([]) },
      kloelSale: { findMany: jest.fn().mockResolvedValue([]) },
      checkoutOrder: { findMany: jest.fn().mockResolvedValue([]) },
      product: { findMany: jest.fn().mockResolvedValue([]) },
    };
    const module: TestingModule = await Test.createTestingModule({
      providers: [MindPerceptionService, { provide: PrismaService, useValue: prisma }],
    }).compile();
    service = module.get(MindPerceptionService);
  });

  it('enforces workspace isolation on all 5 source tables', async () => {
    await service.since('ws-tenant-A', new Date('2026-01-01'));
    const autopilotCalls = prisma.autopilotEvent.findMany.mock.calls as SourceFindManyCall[];
    const messageCalls = prisma.message.findMany.mock.calls as SourceFindManyCall[];
    const saleCalls = prisma.kloelSale.findMany.mock.calls as SourceFindManyCall[];
    const checkoutOrderCalls = prisma.checkoutOrder.findMany.mock.calls as SourceFindManyCall[];
    const productCalls = prisma.product.findMany.mock.calls as SourceFindManyCall[];
    expect(autopilotCalls[0][0].where.workspaceId).toBe('ws-tenant-A');
    expect(messageCalls[0][0].where.workspaceId).toBe('ws-tenant-A');
    expect(saleCalls[0][0].where.workspaceId).toBe('ws-tenant-A');
    expect(checkoutOrderCalls[0][0].where.workspaceId).toBe('ws-tenant-A');
    expect(productCalls[0][0].where.workspaceId).toBe('ws-tenant-A');
  });

  it('merges and sorts events ascending by occurredAt', async () => {
    prisma.message.findMany.mockResolvedValue([
      {
        id: 'm1',
        contactId: 'c1',
        direction: 'INBOUND',
        type: 'TEXT',
        content: 'hi',
        createdAt: new Date('2026-01-03'),
        conversation: { channel: 'whatsapp' },
      },
    ]);
    prisma.kloelSale.findMany.mockResolvedValue([
      {
        id: 's1',
        leadId: 'lead-1',
        productName: 'X',
        amount: 100,
        status: 'paid',
        paymentMethod: 'pix',
        createdAt: new Date('2026-01-01'),
      },
    ]);
    const result = await service.since('ws-1', new Date('2025-12-31'));
    expect(result.map((e) => e.kind)).toEqual(['sale.completed', 'message.received']);
  });

  it('maps sale status="paid" → kind="sale.completed", others stay as sale.<status>', async () => {
    prisma.kloelSale.findMany.mockResolvedValue([
      {
        id: 's1',
        leadId: null,
        productName: 'X',
        amount: 1,
        status: 'paid',
        paymentMethod: 'pix',
        createdAt: new Date(0),
      },
      {
        id: 's2',
        leadId: null,
        productName: 'Y',
        amount: 2,
        status: 'failed',
        paymentMethod: 'card',
        createdAt: new Date(1),
      },
    ]);
    const events = await service.since('ws-1', new Date(0));
    expect(events.map((e) => e.kind)).toEqual(['sale.completed', 'sale.failed']);
  });

  it('classifies checkout price bands correctly', async () => {
    prisma.checkoutOrder.findMany.mockResolvedValue([
      {
        id: 'o1',
        status: 'PAID',
        customerEmail: 'a',
        paymentMethod: 'pix',
        totalInCents: 5_000,
        utmSource: null,
        createdAt: new Date(1),
      },
      {
        id: 'o2',
        status: 'PAID',
        customerEmail: 'b',
        paymentMethod: 'pix',
        totalInCents: 30_000,
        utmSource: null,
        createdAt: new Date(2),
      },
      {
        id: 'o3',
        status: 'PAID',
        customerEmail: 'c',
        paymentMethod: 'pix',
        totalInCents: 75_000,
        utmSource: null,
        createdAt: new Date(3),
      },
      {
        id: 'o4',
        status: 'PAID',
        customerEmail: 'd',
        paymentMethod: 'pix',
        totalInCents: 200_000,
        utmSource: null,
        createdAt: new Date(4),
      },
    ]);
    const events = await service.since('ws-1', new Date(0));
    const bands = events.map((e) => (e.payload as { priceBand: string }).priceBand);
    expect(bands).toEqual(['under_100', '100_499', '500_999', '1000_plus']);
  });

  it('normalizes blank channel to "unknown"', async () => {
    prisma.message.findMany.mockResolvedValue([
      {
        id: 'm1',
        contactId: 'c1',
        direction: 'OUTBOUND',
        type: 'TEXT',
        content: 'x',
        createdAt: new Date(1),
        conversation: { channel: '' },
      },
    ]);
    const events = await service.since('ws-1', new Date(0));
    expect((events[0].payload as { channel: string }).channel).toBe('unknown');
    expect(events[0].kind).toBe('message.sent');
  });

  it('uses createdAt:{gt: watermark} as filter for incremental reads', async () => {
    const watermark = new Date('2026-04-01');
    await service.since('ws-1', watermark);
    for (const table of [
      prisma.autopilotEvent.findMany,
      prisma.message.findMany,
      prisma.kloelSale.findMany,
      prisma.checkoutOrder.findMany,
    ]) {
      const calls = table.mock.calls as SourceFindManyCall[];
      expect(calls[0][0].where.createdAt).toEqual({ gt: watermark });
    }
  });

  it('reads Products via updatedAt and classifies created vs updated', async () => {
    const watermark = new Date('2026-06-01');
    prisma.product.findMany.mockResolvedValue([
      {
        id: 'p1',
        name: 'Widget',
        price: 99.9,
        currency: 'BRL',
        category: 'tools',
        format: 'PHYSICAL',
        status: 'APPROVED',
        active: true,
        featured: false,
        createdAt: new Date('2026-06-02'),
        updatedAt: new Date('2026-06-02'),
      },
      {
        id: 'p2',
        name: 'Ebook',
        price: 29.9,
        currency: 'BRL',
        category: 'books',
        format: 'DIGITAL',
        status: 'DRAFT',
        active: false,
        featured: false,
        createdAt: new Date('2026-05-15'),
        updatedAt: new Date('2026-06-03'),
      },
    ]);
    const events = await service.since('ws-1', watermark);
    expect(events).toHaveLength(2);
    expect(events[0].kind).toBe('product.created');
    expect(events[0].subject).toBe('product:p1');
    expect(events[0].payload).toMatchObject({ productId: 'p1', name: 'Widget', price: 99.9 });
    expect(events[1].kind).toBe('product.updated');
    expect(events[1].subject).toBe('product:p2');

    const productCalls = prisma.product.findMany.mock.calls as SourceFindManyCall[];
    expect(productCalls[0][0].where.updatedAt).toEqual({ gt: watermark });
  });
});
