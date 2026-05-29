import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import type { Workspace } from '@prisma/client';
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
  type CacheWrapCall = [string, () => Promise<unknown>, { ttl: number }];

  let service: WorkspaceService;
  let prisma: {
    workspace: {
      findUnique: jest.Mock;
      update: jest.Mock;
      delete: jest.Mock;
    };
  };
  let cache: {
    wrap: jest.Mock<Promise<unknown>, CacheWrapCall>;
    del: jest.Mock<Promise<number>, [string]>;
  };

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
      wrap: jest.fn<Promise<unknown>, CacheWrapCall>().mockImplementation(async (_key, fn) => fn()),
      del: jest.fn<Promise<number>, [string]>().mockResolvedValue(0),
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
      const [cacheKey, loader, options] = cache.wrap.mock.calls[0];
      expect(cacheKey).toBe('cache:workspace:ws-1');
      expect(typeof loader).toBe('function');
      expect(options).toEqual({ ttl: 30 });
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
      } as Workspace;
      const result = service.toEngineWorkspace(ws);
      expect(result.id).toBe('ws-1');
      expect(result.jitterMin).toBe(100);
      expect(result.jitterMax).toBe(500);
      expect(typeof result.whatsappProvider).toBe('string');
    });
  });

  describe('updateThemePreference', () => {
    it('stores light theme in providerSettings.ui', async () => {
      prisma.workspace.findUnique.mockResolvedValue({
        id: 'ws-1',
        providerSettings: {},
      });
      const result = await service.updateThemePreference('ws-1', 'light');
      expect(result.theme).toBe('light');
      expect(cache.del).toHaveBeenCalledWith('cache:workspace:ws-1');
      const updateCalls = prisma.workspace.update.mock.calls as Array<
        [{ data: { providerSettings: Record<string, unknown> } }]
      >;
      const updateCall = updateCalls[0]?.[0];
      expect(updateCall?.data.providerSettings).toMatchObject({ ui: { theme: 'light' } });
    });

    it('stores dark theme in providerSettings.ui', async () => {
      prisma.workspace.findUnique.mockResolvedValue({
        id: 'ws-1',
        providerSettings: {},
      });
      const result = await service.updateThemePreference('ws-1', 'dark');
      expect(result.theme).toBe('dark');
    });

    it('preserves existing ui settings when updating theme', async () => {
      prisma.workspace.findUnique.mockResolvedValue({
        id: 'ws-1',
        providerSettings: { ui: { fontSize: 'large', theme: 'light' } },
      });
      await service.updateThemePreference('ws-1', 'dark');
      const calls = prisma.workspace.update.mock.calls as Array<
        [{ data: { providerSettings: Record<string, unknown> } }]
      >;
      expect(calls[0]?.[0]?.data.providerSettings).toMatchObject({
        ui: { fontSize: 'large', theme: 'dark' },
      });
    });

    it('throws NotFoundException when workspace missing', async () => {
      prisma.workspace.findUnique.mockResolvedValue(null);
      await expect(service.updateThemePreference('ws-missing', 'dark')).rejects.toThrow();
    });
  });

  describe('updateInfo (K30 save_business_info)', () => {
    it('updates name and stores businessType/cnpj in providerSettings.businessInfo', async () => {
      prisma.workspace.findUnique.mockResolvedValue({
        id: 'ws-1',
        name: 'old',
        providerSettings: { businessInfo: { existing: 'kept' } },
      });
      await service.updateInfo('ws-1', { name: 'New Co', businessType: 'agency', cnpj: '00.000.000/0001-00' });
      expect(cache.del).toHaveBeenCalledWith('cache:workspace:ws-1');
      const calls = prisma.workspace.update.mock.calls as Array<
        [{ where: { id: string }; data: { name?: string; providerSettings: Record<string, unknown> } }]
      >;
      const args = calls[0]?.[0];
      expect(args?.where.id).toBe('ws-1');
      expect(args?.data.name).toBe('New Co');
      expect(args?.data.providerSettings).toMatchObject({
        businessInfo: { existing: 'kept', businessType: 'agency', cnpj: '00.000.000/0001-00' },
      });
    });

    it('throws NotFoundException when workspace missing', async () => {
      prisma.workspace.findUnique.mockResolvedValue(null);
      await expect(service.updateInfo('missing', { name: 'x' })).rejects.toThrow(NotFoundException);
    });
  });

  describe('updateSettings (K30 update_workspace_settings)', () => {
    it('deep-merges nested objects into providerSettings', async () => {
      prisma.workspace.findUnique.mockResolvedValue({
        id: 'ws-1',
        providerSettings: { ui: { theme: 'dark', fontSize: 'large' }, other: 'kept' },
      });
      await service.updateSettings('ws-1', { ui: { theme: 'light' }, fresh: 'new' });
      expect(cache.del).toHaveBeenCalledWith('cache:workspace:ws-1');
      const calls = prisma.workspace.update.mock.calls as Array<
        [{ data: { providerSettings: Record<string, unknown> } }]
      >;
      const merged = calls[0]?.[0]?.data.providerSettings;
      expect(merged).toMatchObject({
        ui: { theme: 'light', fontSize: 'large' },
        other: 'kept',
        fresh: 'new',
      });
    });
  });

  describe('setHours (K30 set_business_hours)', () => {
    it('persists validated hours in providerSettings.businessHours', async () => {
      prisma.workspace.findUnique.mockResolvedValue({
        id: 'ws-1',
        providerSettings: { other: 'kept' },
      });
      const result = await service.setHours('ws-1', {
        hours: [
          { dayOfWeek: 1, open: '09:00', close: '18:00' },
          { dayOfWeek: 2, open: '09:30', close: '12:00' },
        ],
      });
      expect(result).toEqual({ updated: true });
      const calls = prisma.workspace.update.mock.calls as Array<
        [{ data: { providerSettings: { businessHours: Array<unknown>; other: string } } }]
      >;
      const args = calls[0]?.[0];
      expect(args?.data.providerSettings.other).toBe('kept');
      expect(args?.data.providerSettings.businessHours).toHaveLength(2);
    });

    it('rejects when open >= close', async () => {
      prisma.workspace.findUnique.mockResolvedValue({ id: 'ws-1', providerSettings: {} });
      await expect(
        service.setHours('ws-1', { hours: [{ dayOfWeek: 1, open: '18:00', close: '09:00' }] }),
      ).rejects.toThrow(/open must be before close/);
    });

    it('rejects malformed HH:mm', async () => {
      prisma.workspace.findUnique.mockResolvedValue({ id: 'ws-1', providerSettings: {} });
      await expect(
        service.setHours('ws-1', { hours: [{ dayOfWeek: 1, open: '9:0', close: '18:00' }] }),
      ).rejects.toThrow(/Invalid time format/);
    });
  });

  describe('setPolicy (K30 set_sales_policy)', () => {
    it('stores policy keys in providerSettings.salesPolicy preserving existing values', async () => {
      prisma.workspace.findUnique.mockResolvedValue({
        id: 'ws-1',
        providerSettings: { salesPolicy: { refundPolicy: 'old' }, other: 'kept' },
      });
      const result = await service.setPolicy('ws-1', {
        salesPolicy: 'no returns after 7 days',
        termsUrl: 'https://example.com/terms',
      });
      expect(result).toEqual({ updated: true });
      const calls = prisma.workspace.update.mock.calls as Array<
        [{ data: { providerSettings: { salesPolicy: Record<string, unknown>; other: string } } }]
      >;
      const policy = calls[0]?.[0]?.data.providerSettings.salesPolicy;
      expect(policy).toEqual({
        refundPolicy: 'old',
        salesPolicy: 'no returns after 7 days',
        termsUrl: 'https://example.com/terms',
      });
      expect(calls[0]?.[0]?.data.providerSettings.other).toBe('kept');
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
