import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { CrmService } from './crm.service';

describe('CrmService', () => {
  let service: CrmService;
  let prisma: {
    contact: {
      create: jest.Mock;
      upsert: jest.Mock;
      findUnique: jest.Mock;
      findMany: jest.Mock;
      count: jest.Mock;
    };
    pipeline: { create: jest.Mock; findMany: jest.Mock };
    deal: { findFirst: jest.Mock; findUnique: jest.Mock; delete: jest.Mock };
  };
  let auditService: { log: jest.Mock };

  beforeEach(async () => {
    prisma = {
      contact: {
        create: jest.fn().mockImplementation(({ data }) => Promise.resolve({ id: 'c1', ...data })),
        upsert: jest.fn().mockResolvedValue({ id: 'c1' }),
        findUnique: jest.fn(),
        findMany: jest.fn().mockResolvedValue([]),
        count: jest.fn().mockResolvedValue(0),
      },
      pipeline: {
        create: jest.fn().mockImplementation(({ data }) => Promise.resolve({ id: 'p1', ...data })),
        findMany: jest.fn().mockResolvedValue([]),
      },
      deal: {
        findFirst: jest.fn(),
        findUnique: jest.fn(),
        delete: jest.fn().mockResolvedValue({}),
      },
    };
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
      await service.createContact('ws-1', { name: 'X', phone: '+5511' } as never);
      const arg = prisma.contact.create.mock.calls[0][0];
      expect(arg.data.workspace).toEqual({ connect: { id: 'ws-1' } });
      expect(arg.include).toEqual({ tags: true });
    });
  });

  describe('upsertContact', () => {
    it('upserts by (workspaceId, phone) unique key', async () => {
      await service.upsertContact('ws-1', '+5511', { name: 'Alice' } as never);
      const arg = prisma.contact.upsert.mock.calls[0][0];
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
      const arg = prisma.contact.findUnique.mock.calls[0][0];
      expect(arg.where).toEqual({
        workspaceId_phone: { workspaceId: 'ws-1', phone: '+5511' },
      });
      expect(arg.include.deals.take).toBe(50);
    });
  });

  describe('createPipeline', () => {
    it('creates pipeline with default stages, connected to workspace', async () => {
      await service.createPipeline('ws-1', 'Sales');
      const arg = prisma.pipeline.create.mock.calls[0][0];
      expect(arg.data.workspace).toEqual({ connect: { id: 'ws-1' } });
      expect(arg.data.name).toBe('Sales');
      expect(arg.data.stages.create).toHaveLength(3);
    });
  });

  describe('listPipelines', () => {
    it('filters by workspaceId', async () => {
      await service.listPipelines('ws-tenant-A');
      const arg = prisma.pipeline.findMany.mock.calls[0][0];
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
