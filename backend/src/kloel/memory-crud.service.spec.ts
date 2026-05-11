import { Test, TestingModule } from '@nestjs/testing';
import { MemoryCrudService } from './memory-crud.service';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { OpsAlertService } from '../observability/ops-alert.service';

type MemoryCrudPrismaMock = {
  kloelMemory: {
    upsert: jest.Mock;
    findMany: jest.Mock;
    count: jest.Mock;
    delete: jest.Mock;
    deleteMany: jest.Mock;
  };
};

describe('MemoryCrudService', () => {
  let service: MemoryCrudService;
  let prisma: MemoryCrudPrismaMock;
  let auditService: Pick<AuditService, 'log'>;
  let opsAlert: Pick<OpsAlertService, 'alertOnCriticalError'>;

  const wsId = 'ws-1';

  beforeEach(async () => {
    prisma = {
      kloelMemory: {
        upsert: jest.fn().mockResolvedValue({}),
        findMany: jest.fn().mockResolvedValue([]),
        count: jest.fn().mockResolvedValue(0),
        delete: jest.fn().mockResolvedValue({}),
        deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
      },
    };

    auditService = {
      log: jest.fn().mockResolvedValue(undefined),
    };

    opsAlert = {
      alertOnCriticalError: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MemoryCrudService,
        { provide: PrismaService, useValue: prisma },
        { provide: AuditService, useValue: auditService },
        { provide: OpsAlertService, useValue: opsAlert },
      ],
    }).compile();

    service = module.get<MemoryCrudService>(MemoryCrudService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('saveMemory', () => {
    it('upserts memory scoped to workspaceId', async () => {
      const memoryRow = {
        id: 'm-1',
        workspaceId: wsId,
        key: 'brandVoice',
        value: { tone: 'formal' },
        category: 'general',
        content: 'brandVoice content',
      };
      prisma.kloelMemory.upsert.mockResolvedValue(memoryRow);

      const result = await service.saveMemory(
        wsId,
        'brandVoice',
        { tone: 'formal' },
        'general',
        'brandVoice content',
      );

      expect(result.id).toBe('m-1');
      expect(result.workspaceId).toBe(wsId);
      expect(result.key).toBe('brandVoice');
      expect(result.category).toBe('general');
      expect(prisma.kloelMemory.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { workspaceId_key: { workspaceId: wsId, key: 'brandVoice' } },
          create: expect.objectContaining({
            workspaceId: wsId,
            key: 'brandVoice',
            category: 'general',
          }),
        }),
      );
    });

    it('stringifies non-string values for content when no content given', async () => {
      const memoryRow = {
        id: 'm-2',
        workspaceId: wsId,
        key: 'prefs',
        value: { lang: 'pt' },
        category: 'general',
        content: '{"lang":"pt"}',
      };
      prisma.kloelMemory.upsert.mockResolvedValue(memoryRow);

      const result = await service.saveMemory(wsId, 'prefs', { lang: 'pt' });

      expect(result.key).toBe('prefs');
      expect(prisma.kloelMemory.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          create: expect.objectContaining({
            content: '{"lang":"pt"}',
          }),
        }),
      );
    });

    it('uses string value directly when no content and value is string', async () => {
      const memoryRow = {
        id: 'm-3',
        workspaceId: wsId,
        key: 'note',
        value: 'just a note',
        category: 'general',
        content: 'just a note',
      };
      prisma.kloelMemory.upsert.mockResolvedValue(memoryRow);

      const result = await service.saveMemory(wsId, 'note', 'just a note');

      expect(result.key).toBe('note');
      expect(prisma.kloelMemory.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          create: expect.objectContaining({
            content: 'just a note',
          }),
        }),
      );
    });

    it('alerts and rethrows on upsert failure', async () => {
      const error = new Error('unique constraint');
      prisma.kloelMemory.upsert.mockRejectedValue(error);

      await expect(
        service.saveMemory(wsId, 'key', 'value'),
      ).rejects.toThrow('unique constraint');
      expect(opsAlert.alertOnCriticalError).toHaveBeenCalledWith(
        error,
        'MemoryCrudService.saveMemory',
      );
    });
  });

  describe('listMemories', () => {
    it('returns paginated memories filtered by workspaceId', async () => {
      const memoryRows = [
        {
          id: 'm-1',
          workspaceId: wsId,
          key: 'k1',
          value: 'v1',
          category: 'general',
          content: 'c1',
        },
      ];
      prisma.kloelMemory.findMany.mockResolvedValue(memoryRows);
      prisma.kloelMemory.count.mockResolvedValue(1);

      const result = await service.listMemories(wsId);

      expect(result.memories).toHaveLength(1);
      expect(result.total).toBe(1);
      expect(prisma.kloelMemory.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { workspaceId: wsId },
          skip: 0,
          take: 20,
          orderBy: { updatedAt: 'desc' },
        }),
      );
    });

    it('filters by category when provided', async () => {
      prisma.kloelMemory.findMany.mockResolvedValue([]);
      prisma.kloelMemory.count.mockResolvedValue(0);

      await service.listMemories(wsId, 'product');

      expect(prisma.kloelMemory.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { workspaceId: wsId, category: 'product' },
        }),
      );
      expect(prisma.kloelMemory.count).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { workspaceId: wsId, category: 'product' },
        }),
      );
    });

    it('respects pagination parameters', async () => {
      prisma.kloelMemory.findMany.mockResolvedValue([]);
      prisma.kloelMemory.count.mockResolvedValue(42);

      await service.listMemories(wsId, undefined, 3, 10);

      expect(prisma.kloelMemory.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          skip: 20,
          take: 10,
        }),
      );
    });

    it('returns empty result when no memories exist', async () => {
      prisma.kloelMemory.findMany.mockResolvedValue([]);
      prisma.kloelMemory.count.mockResolvedValue(0);

      const result = await service.listMemories(wsId);

      expect(result.memories).toHaveLength(0);
      expect(result.total).toBe(0);
    });

    it('preserves content as empty string when row content is null', async () => {
      const rows = [
        {
          id: 'm-1',
          workspaceId: wsId,
          key: 'k1',
          value: 'v1',
          category: 'general',
          content: null,
        },
      ];
      prisma.kloelMemory.findMany.mockResolvedValue(rows);
      prisma.kloelMemory.count.mockResolvedValue(1);

      const result = await service.listMemories(wsId);

      expect(result.memories[0].content).toBe('');
    });
  });

  describe('getMemoryStats', () => {
    it('returns stats grouped by category scoped to workspaceId', async () => {
      const memories = [
        {
          category: 'product',
          updatedAt: new Date('2026-01-01'),
        },
        {
          category: 'product',
          updatedAt: new Date('2026-01-02'),
        },
        {
          category: 'script',
          updatedAt: new Date('2026-01-03'),
        },
      ];
      prisma.kloelMemory.findMany.mockResolvedValue(memories);

      const result = (await service.getMemoryStats(wsId)) as {
        totalMemories: number;
        byCategory: Record<string, number>;
        lastUpdated: Date | null;
      };

      expect(result.totalMemories).toBe(3);
      expect(result.byCategory).toEqual({ product: 2, script: 1 });
      expect(prisma.kloelMemory.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { workspaceId: wsId },
          select: { category: true, updatedAt: true },
          take: 5000,
        }),
      );
    });

    it('returns null lastUpdated when no memories', async () => {
      prisma.kloelMemory.findMany.mockResolvedValue([]);

      const result = (await service.getMemoryStats(wsId)) as {
        lastUpdated: null;
      };

      expect(result.lastUpdated).toBeNull();
    });
  });

  describe('deleteMemory', () => {
    it('deletes memory and audits the action', async () => {
      prisma.kloelMemory.delete.mockResolvedValue({});

      const result = await service.deleteMemory(wsId, 'old-key');

      expect(result).toBe(true);
      expect(prisma.kloelMemory.delete).toHaveBeenCalledWith({
        where: { workspaceId_key: { workspaceId: wsId, key: 'old-key' } },
      });
      expect(auditService.log).toHaveBeenCalledWith(
        expect.objectContaining({
          workspaceId: wsId,
          action: 'DELETE_MEMORY',
          resource: 'KloelMemory',
          resourceId: 'old-key',
        }),
      );
    });

    it('returns false when delete fails (e.g. not found)', async () => {
      prisma.kloelMemory.delete.mockRejectedValue(new Error('not found'));

      const result = await service.deleteMemory(wsId, 'missing-key');

      expect(result).toBe(false);
    });

    it('returns false when kloelMemory delete throws Prisma not-found error', async () => {
      const prismaError = Object.assign(new Error('Record to delete does not exist'), {
        code: 'P2025',
      });
      prisma.kloelMemory.delete.mockRejectedValue(prismaError);

      const result = await service.deleteMemory(wsId, 'nonexistent');

      expect(result).toBe(false);
    });

    it('still deletes when audit log fails (fire-and-forget)', async () => {
      (auditService.log as jest.Mock).mockRejectedValue(new Error('audit down'));
      prisma.kloelMemory.delete.mockResolvedValue({});

      const result = await service.deleteMemory(wsId, 'key');

      expect(result).toBe(true);
      expect(prisma.kloelMemory.delete).toHaveBeenCalled();
    });
  });

  describe('tenant isolation', () => {
    it('saveMemory scoped to correct workspaceId', async () => {
      prisma.kloelMemory.upsert.mockResolvedValue({
        id: 'm-1',
        workspaceId: 'ws-tenant',
        key: 'k',
        value: 'v',
        category: 'general',
        content: 'c',
      });

      await service.saveMemory('ws-tenant', 'k', 'v');

      expect(prisma.kloelMemory.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            workspaceId_key: { workspaceId: 'ws-tenant', key: 'k' },
          },
        }),
      );
    });

    it('listMemories filters by correct workspaceId', async () => {
      prisma.kloelMemory.findMany.mockResolvedValue([]);
      prisma.kloelMemory.count.mockResolvedValue(0);

      await service.listMemories('ws-tenant');

      expect(prisma.kloelMemory.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { workspaceId: 'ws-tenant' },
        }),
      );
    });

    it('deleteMemory isolates by workspaceId in compound key', async () => {
      prisma.kloelMemory.delete.mockResolvedValue({});

      await service.deleteMemory('ws-tenant', 'key-1');

      expect(prisma.kloelMemory.delete).toHaveBeenCalledWith({
        where: {
          workspaceId_key: { workspaceId: 'ws-tenant', key: 'key-1' },
        },
      });
    });

    it('getMemoryStats scoped to correct workspaceId', async () => {
      prisma.kloelMemory.findMany.mockResolvedValue([]);

      await service.getMemoryStats('ws-tenant');

      expect(prisma.kloelMemory.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { workspaceId: 'ws-tenant' },
        }),
      );
    });
  });

  describe('error handling', () => {
    it('saveMemory propagates upsert error and alerts ops', async () => {
      const error = new Error('constraint violation');
      prisma.kloelMemory.upsert.mockRejectedValue(error);

      await expect(service.saveMemory(wsId, 'k', 'v')).rejects.toThrow(
        'constraint violation',
      );
      expect(opsAlert.alertOnCriticalError).toHaveBeenCalled();
    });

    it('listMemories propagates findMany error', async () => {
      prisma.kloelMemory.findMany.mockRejectedValue(new Error('DB down'));

      await expect(service.listMemories(wsId)).rejects.toThrow('DB down');
    });

    it('getMemoryStats propagates findMany error', async () => {
      prisma.kloelMemory.findMany.mockRejectedValue(
        new Error('connection lost'),
      );

      await expect(service.getMemoryStats(wsId)).rejects.toThrow(
        'connection lost',
      );
    });

    it('deleteMemory swallows Prisma errors gracefully', async () => {
      prisma.kloelMemory.delete.mockRejectedValue(new Error('some error'));

      const result = await service.deleteMemory(wsId, 'key');

      expect(result).toBe(false);
    });
  });
});
