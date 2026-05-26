import { Test, TestingModule } from '@nestjs/testing';
import { ReportService } from './report.service';
import { PrismaService } from '../prisma/prisma.service';
import { createPartialPrismaMock } from '../../test/helpers/prisma.mock';
describe('ReportService', () => {
  let service: ReportService;
  let prismaMock: ReturnType<typeof createPartialPrismaMock>;

  beforeEach(async () => {
    prismaMock = createPartialPrismaMock({
      checkoutOrder: ['count'],
      kloelSale: ['count'],
      checkoutSocialLead: ['count', 'findMany'],
    });

    prismaMock.checkoutOrder.count.mockResolvedValue(0);
    prismaMock.kloelSale.count.mockResolvedValue(0);
    prismaMock.checkoutSocialLead.count.mockResolvedValue(0);
    prismaMock.checkoutSocialLead.findMany.mockResolvedValue([]);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ReportService,
        { provide: PrismaService, useValue: prismaMock },
      ],
    }).compile();

    service = module.get(ReportService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });
  describe('operations', () => {
    it('returns non-negative counts on empty DB', async () => {
      const result = await service.operations('ws-1', { since: new Date(0) });

      expect(result.orders).toBe(0);
      expect(result.sales).toBe(0);
      expect(result.refunds).toBe(0);
      expect(result.abandonments).toBe(0);

      expect(prismaMock.checkoutOrder.count).toHaveBeenCalledWith(
        expect.objectContaining({ where: expect.objectContaining({ workspaceId: 'ws-1' }) }),
      );
      expect(prismaMock.kloelSale.count).toHaveBeenCalledTimes(2);
    });

    it('includes workspaceId in every query', async () => {
      await service.operations('ws-2');

      for (const call of prismaMock.checkoutOrder.count.mock.calls) {
        expect(call[0].where.workspaceId).toBe('ws-2');
      }
      for (const call of prismaMock.kloelSale.count.mock.calls) {
        expect(call[0].where.workspaceId).toBe('ws-2');
      }
      for (const call of prismaMock.checkoutSocialLead.count.mock.calls) {
        expect(call[0].where.workspaceId).toBe('ws-2');
      }
    });

    it('returns positive counts when DB has data', async () => {
      prismaMock.checkoutOrder.count.mockResolvedValue(10);
      prismaMock.kloelSale.count
        .mockResolvedValueOnce(7)
        .mockResolvedValueOnce(2);
      prismaMock.checkoutSocialLead.count.mockResolvedValue(3);

      const result = await service.operations('ws-1');

      expect(result.orders).toBe(10);
      expect(result.sales).toBe(7);
      expect(result.refunds).toBe(2);
      expect(result.abandonments).toBe(3);
    });
  });
  describe('abandonments', () => {
    it('returns empty array on empty DB', async () => {
      const result = await service.abandonments('ws-1');

      expect(result.total).toBe(0);
      expect(result.items).toEqual([]);

      expect(prismaMock.checkoutSocialLead.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            workspaceId: 'ws-1',
            convertedAt: null,
          }),
        }),
      );
    });

    it('maps rows to AbandonmentItem shape', async () => {
      const now = new Date('2026-05-20T12:00:00.000Z');
      const abandoned = new Date('2026-05-20T11:00:00.000Z');
      prismaMock.checkoutSocialLead.findMany.mockResolvedValue([
        {
          id: 'csl-1',
          name: 'João',
          email: 'joao@test.com',
          phone: '5511999999999',
          stepReached: 2,
          abandonedAt: abandoned,
          createdAt: now,
        },
      ]);

      const result = await service.abandonments('ws-1');

      expect(result.total).toBe(1);
      expect(result.items[0]).toEqual({
        id: 'csl-1',
        name: 'João',
        email: 'joao@test.com',
        phone: '5511999999999',
        stepReached: 2,
        abandonedAt: abandoned.toISOString(),
        createdAt: now.toISOString(),
      });
    });

    it('handles null fields in rows', async () => {
      const now = new Date('2026-05-20T12:00:00.000Z');
      prismaMock.checkoutSocialLead.findMany.mockResolvedValue([
        {
          id: 'csl-2',
          name: null,
          email: null,
          phone: null,
          stepReached: 1,
          abandonedAt: null,
          createdAt: now,
        },
      ]);

      const result = await service.abandonments('ws-1');

      expect(result.items[0].name).toBeNull();
      expect(result.items[0].email).toBeNull();
      expect(result.items[0].phone).toBeNull();
      expect(result.items[0].abandonedAt).toBeNull();
    });
  });
});
