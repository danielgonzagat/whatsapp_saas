import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CacheService } from '../common/cache/cache.service';
import { WorkspaceService } from './workspace.service';

describe('WorkspaceService', () => {
  type WorkspaceUpdateCall = [
    {
      data: {
        providerSettings: {
          autopilot: { enabled: boolean };
          conversionFlowId?: string;
        };
      };
    },
  ];

  let service: WorkspaceService;
  let prisma: {
    workspace: {
      findUnique: jest.Mock;
      update: jest.Mock;
      delete: jest.Mock;
    };
  };
  let cache: { wrap: jest.Mock; del: jest.Mock };

  beforeEach(async () => {
    prisma = {
      workspace: {
        findUnique: jest.fn(),
        update: jest
          .fn()
          .mockImplementation(({ data }) => Promise.resolve({ id: 'ws-1', ...data })),
        delete: jest.fn().mockResolvedValue({}),
      },
    };
    // cache.wrap default: re-invoke fn (no cache)
    cache = {
      wrap: jest.fn().mockImplementation(async (_key: string, fn: () => Promise<unknown>) => fn()),
      del: jest.fn().mockResolvedValue(0),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        WorkspaceService,
        { provide: PrismaService, useValue: prisma },
        { provide: CacheService, useValue: cache },
      ],
    }).compile();
    service = module.get(WorkspaceService);
  });

  describe('getWorkspace', () => {
    it('returns workspace when found (via cache.wrap)', async () => {
      prisma.workspace.findUnique.mockResolvedValue({
        id: 'ws-1',
        name: 'X',
        providerSettings: {},
      });
      await expect(service.getWorkspace('ws-1')).resolves.toEqual({
        id: 'ws-1',
        name: 'X',
        providerSettings: {},
      });
      expect(cache.wrap).toHaveBeenCalledWith('cache:workspace:ws-1', expect.any(Function), {
        ttl: 30,
      });
    });

    it('throws NotFoundException when workspace missing', async () => {
      prisma.workspace.findUnique.mockResolvedValue(null);
      await expect(service.getWorkspace('ws-missing')).rejects.toThrow(NotFoundException);
    });
  });

  describe('deleteWorkspace', () => {
    it('invalidates cache and deletes the row', async () => {
      await service.deleteWorkspace('ws-1');
      expect(cache.del).toHaveBeenCalledWith('cache:workspace:ws-1');
      expect(prisma.workspace.delete).toHaveBeenCalledWith({ where: { id: 'ws-1' } });
    });
  });

  describe('getChannels', () => {
    it('reports whatsapp=true and email reflects providerSettings.email.enabled', async () => {
      prisma.workspace.findUnique.mockResolvedValue({
        id: 'ws-1',
        providerSettings: { email: { enabled: true } },
      });
      await expect(service.getChannels('ws-1')).resolves.toEqual({
        whatsapp: true,
        email: true,
      });
    });

    it('defaults email to false when not configured', async () => {
      prisma.workspace.findUnique.mockResolvedValue({ id: 'ws-1', providerSettings: {} });
      await expect(service.getChannels('ws-1')).resolves.toEqual({
        whatsapp: true,
        email: false,
      });
    });
  });

  describe('setJitter', () => {
    it('updates jitterMin/max and invalidates cache', async () => {
      await service.setJitter('ws-1', 500, 1500);
      expect(cache.del).toHaveBeenCalledWith('cache:workspace:ws-1');
      expect(prisma.workspace.update).toHaveBeenCalledWith({
        where: { id: 'ws-1' },
        data: { jitterMin: 500, jitterMax: 1500 },
      });
    });
  });

  describe('toEngineWorkspace', () => {
    it('shapes Workspace into engine workspace dto', () => {
      const ws = {
        id: 'ws-1',
        jitterMin: 100,
        jitterMax: 500,
        providerSettings: { whatsappProvider: 'meta-cloud' },
      } as never;
      const result = service.toEngineWorkspace(ws);
      expect(result.id).toBe('ws-1');
      expect(result.jitterMin).toBe(100);
      expect(result.jitterMax).toBe(500);
      expect(typeof result.whatsappProvider).toBe('string');
    });
  });

  describe('patchSettings', () => {
    it('sets autopilot.enabled when autonomy.mode = LIVE', async () => {
      prisma.workspace.findUnique.mockResolvedValue({
        id: 'ws-1',
        providerSettings: { autopilot: { enabled: false } },
      });
      await service.patchSettings('ws-1', { autonomy: { mode: 'live' } });
      const updateCalls = prisma.workspace.update.mock.calls as WorkspaceUpdateCall[];
      const args = updateCalls[0][0];
      expect(args.data.providerSettings.autopilot.enabled).toBe(true);
    });

    it('preserves existing autopilot.enabled when no autonomy override', async () => {
      prisma.workspace.findUnique.mockResolvedValue({
        id: 'ws-1',
        providerSettings: { autopilot: { enabled: true } },
      });
      await service.patchSettings('ws-1', { conversionFlowId: 'f1' });
      const updateCalls = prisma.workspace.update.mock.calls as WorkspaceUpdateCall[];
      const args = updateCalls[0][0];
      expect(args.data.providerSettings.autopilot.enabled).toBe(true);
      expect(args.data.providerSettings.conversionFlowId).toBe('f1');
    });
  });
});
