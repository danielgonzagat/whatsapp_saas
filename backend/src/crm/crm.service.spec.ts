import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { CrmService } from './crm.service';
import { createPartialPrismaMock } from '../../test/helpers/prisma.mock';

type ContactCreateArg = {
  data: { workspace: { connect: { id: string } } };
  include: { tags: boolean };
};

type ContactUpsertArg = {
  where: { workspaceId_phone: { workspaceId: string; phone: string } };
  update: { name: string };
  create: { workspace: { connect: { id: string } } };
};

type ContactFindUniqueArg = {
  where: { workspaceId_phone: { workspaceId: string; phone: string } };
  include: { deals: { take: number } };
};

type PipelineCreateArg = {
  data: {
    workspace: { connect: { id: string } };
    name: string;
    stages: { create: ReadonlyArray<unknown> };
  };
};

type PipelineFindManyArg = {
  where: { workspaceId: string };
};

function firstMockArg<T>(mock: jest.Mock): T {
  const calls = mock.mock.calls as ReadonlyArray<ReadonlyArray<unknown>>;
  const call = calls[0];
  if (!call) {
    throw new Error('Expected mock to be called');
  }
  return call[0] as T;
}

describe('CrmService', () => {
  let service: CrmService;
  let prisma: ReturnType<typeof createPartialPrismaMock>;
  let auditService: { log: jest.Mock };

  beforeEach(async () => {
    prisma = createPartialPrismaMock({
      contact: ['create', 'upsert', 'findUnique', 'findMany', 'count'],
      pipeline: ['create', 'findMany', 'findFirst'],
      deal: ['findFirst', 'findUnique', 'delete'],
    });
    prisma.contact.create.mockImplementation(({ data }) => Promise.resolve({ id: 'c1', ...data }));
    prisma.contact.upsert.mockResolvedValue({ id: 'c1' });
    prisma.contact.findMany.mockResolvedValue([]);
    prisma.contact.count.mockResolvedValue(0);
    prisma.pipeline.create.mockImplementation(({ data }) => Promise.resolve({ id: 'p1', ...data }));
    prisma.pipeline.findMany.mockResolvedValue([]);
    prisma.deal.delete.mockResolvedValue({});
    auditService = { log: jest.fn().mockResolvedValue(undefined) };
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CrmService,
        { provide: PrismaService, useValue: prisma },
        { provide: AuditService, useValue: auditService },
      ],
    }).compile();
    service = module.get(CrmService);
  });

  describe('createContact', () => {
    it('connects contact to workspace by id', async () => {
      await service.createContact('ws-1', { name: 'X', phone: '+5511' });
      const arg = firstMockArg<ContactCreateArg>(prisma.contact.create);
      expect(arg.data.workspace).toEqual({ connect: { id: 'ws-1' } });
      expect(arg.include).toEqual({ tags: true });
    });
  });

  describe('upsertContact', () => {
    it('upserts by (workspaceId, phone) unique key', async () => {
      await service.upsertContact('ws-1', '+5511', { name: 'Alice' });
      const arg = firstMockArg<ContactUpsertArg>(prisma.contact.upsert);
      expect(arg.where).toEqual({
        workspaceId_phone: { workspaceId: 'ws-1', phone: '+5511' },
      });
      expect(arg.update).toEqual({ name: 'Alice' });
      expect(arg.create.workspace).toEqual({ connect: { id: 'ws-1' } });
    });
  });

  describe('getContact', () => {
    it('looks up by composite unique key with tags + recent deals', async () => {
      prisma.contact.findUnique.mockResolvedValue({ id: 'c1', tags: [], deals: [] });
      const result = await service.getContact('ws-1', '+5511');
      expect(result).toEqual({ id: 'c1', tags: [], deals: [] });
      const arg = firstMockArg<ContactFindUniqueArg>(prisma.contact.findUnique);
      expect(arg.where).toEqual({
        workspaceId_phone: { workspaceId: 'ws-1', phone: '+5511' },
      });
      expect(arg.include.deals.take).toBe(50);
    });
  });

  describe('createPipeline', () => {
    it('creates pipeline with default stages, connected to workspace', async () => {
      await service.createPipeline('ws-1', 'Sales');
      const arg = firstMockArg<PipelineCreateArg>(prisma.pipeline.create);
      expect(arg.data.workspace).toEqual({ connect: { id: 'ws-1' } });
      expect(arg.data.name).toBe('Sales');
      expect(arg.data.stages.create).toHaveLength(3);
    });
  });

  describe('listPipelines', () => {
    it('filters by workspaceId', async () => {
      await service.listPipelines('ws-tenant-A');
      const arg = firstMockArg<PipelineFindManyArg>(prisma.pipeline.findMany);
      expect(arg.where).toEqual({ workspaceId: 'ws-tenant-A' });
    });
  });

  describe('getPipeline', () => {
    it('throws NotFoundException when no pipeline exists for workspace', async () => {
      prisma.pipeline.findFirst.mockResolvedValue(null);

      await expect(service.getPipeline('ws-empty')).rejects.toThrow('Pipeline não encontrado');
    });

    it('returns stages with leads and totalValue as bigint', async () => {
      const now = new Date('2026-05-29T12:00:00Z');
      prisma.pipeline.findFirst.mockResolvedValue({
        id: 'p1',
        name: 'Sales Pipeline',
        stages: [
          {
            id: 's1',
            name: 'Lead',
            order: 0,
            deals: [
              { id: 'd1', title: 'Deal A', value: 150.5, updatedAt: now },
              { id: 'd2', title: 'Deal B', value: 99.99, updatedAt: now },
            ],
          },
          {
            id: 's2',
            name: 'Negotiation',
            order: 1,
            deals: [{ id: 'd3', title: 'Deal C', value: 200, updatedAt: now }],
          },
          {
            id: 's3',
            name: 'Closed',
            order: 2,
            deals: [],
          },
        ],
      });

      const result = await service.getPipeline('ws-1');

      expect(result.stages).toHaveLength(3);
      expect(result.stages[0].name).toBe('Lead');
      expect(result.stages[0].leads).toHaveLength(2);
      expect(result.stages[0].leads[0]).toEqual({
        id: 'd1',
        name: 'Deal A',
        value: 15050n,
        lastActivity: now,
      });
      expect(result.stages[0].leads[1].value).toBe(9999n);
      expect(result.stages[1].leads[0].value).toBe(20000n);
      expect(result.stages[2].leads).toEqual([]);
      // 15050 + 9999 + 20000 = 45049
      expect(result.totalValue).toBe(45049n);
    });

    it('filters pipeline by workspaceId', async () => {
      prisma.pipeline.findFirst.mockResolvedValue({
        id: 'p-ws-A',
        stages: [],
      });

      await service.getPipeline('ws-tenant-A');

      expect(prisma.pipeline.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { workspaceId: 'ws-tenant-A' },
        }),
      );
    });

    it('returns zero totalValue for pipeline with no deals', async () => {
      prisma.pipeline.findFirst.mockResolvedValue({
        id: 'p-empty',
        stages: [
          { id: 's1', name: 'Lead', order: 0, deals: [] },
          { id: 's2', name: 'Closed', order: 1, deals: [] },
        ],
      });

      const result = await service.getPipeline('ws-1');

      expect(result.totalValue).toBe(0n);
    });
  });

  describe('deleteDeal', () => {
    it('throws NotFoundException when deal missing', async () => {
      prisma.deal.findUnique.mockResolvedValue(null);
      await expect(service.deleteDeal('ws-1', 'd-missing')).rejects.toThrow(/encontrado/);
    });

    it('throws ForbiddenException when deal belongs to another workspace', async () => {
      prisma.deal.findUnique.mockResolvedValue({
        id: 'd-1',
        stage: { pipeline: { workspaceId: 'OTHER' } },
      });
      await expect(service.deleteDeal('ws-1', 'd-1')).rejects.toThrow(/negado/i);
    });

    it('deletes deal and writes audit log on success', async () => {
      prisma.deal.findUnique.mockResolvedValue({
        id: 'd-1',
        stage: { pipeline: { workspaceId: 'ws-1' } },
      });
      await service.deleteDeal('ws-1', 'd-1');
      expect(prisma.deal.delete).toHaveBeenCalledWith({ where: { id: 'd-1' } });
      expect(auditService.log).toHaveBeenCalled();
    });
  });
});
