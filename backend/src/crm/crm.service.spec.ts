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
      pipeline: ['create', 'findMany'],
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
