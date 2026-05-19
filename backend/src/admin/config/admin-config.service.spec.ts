import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from '../../prisma/prisma.service';
import { AdminConfigService } from './admin-config.service';

const mockAsProviderSettings = jest.fn();

jest.mock('../../whatsapp/provider-settings.types', () => ({
  asProviderSettings: (...args: unknown[]) => mockAsProviderSettings(...args),
}));

describe('AdminConfigService', () => {
  let service: AdminConfigService;

  const actorId = 'admin_1';
  const workspaceId = 'ws_1';

  const workspaceRecord = {
    id: workspaceId,
    name: 'Test WS',
    customDomain: null,
    providerSettings: {},
    updatedAt: new Date('2026-01-01'),
    _count: { apiKeys: 0, webhookSubscriptions: 0 },
  };

  const mockWorkspaceCount = jest.fn();
  const mockApiKeyCount = jest.fn();
  const mockWebhookCount = jest.fn();
  const mockWorkspaceFindMany = jest.fn();

  const mockTxWorkspaceFindUnique = jest.fn();
  const mockTxWorkspaceUpdate = jest.fn();
  const mockTxAuditLogCreate = jest.fn();

  const mockTx = {
    workspace: { findUnique: mockTxWorkspaceFindUnique, update: mockTxWorkspaceUpdate },
    adminAuditLog: { create: mockTxAuditLogCreate },
  };

  const prismaMock = {
    workspace: {
      count: mockWorkspaceCount,
      findMany: mockWorkspaceFindMany,
    },
    apiKey: { count: mockApiKeyCount },
    webhookSubscription: { count: mockWebhookCount },
    $transaction: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    mockAsProviderSettings.mockReturnValue({});

    mockWorkspaceCount.mockResolvedValue(1);
    mockApiKeyCount.mockResolvedValue(0);
    mockWebhookCount.mockResolvedValue(0);
    mockWorkspaceFindMany.mockResolvedValue([workspaceRecord]);

    prismaMock.$transaction.mockImplementation(async (ops: unknown[]) => {
      return Promise.all(ops);
    });

    mockTxWorkspaceFindUnique.mockResolvedValue(workspaceRecord);
    mockTxWorkspaceUpdate.mockResolvedValue(workspaceRecord);
    mockTxAuditLogCreate.mockResolvedValue({});

    const module: TestingModule = await Test.createTestingModule({
      providers: [AdminConfigService, { provide: PrismaService, useValue: prismaMock }],
    }).compile();

    service = module.get(AdminConfigService);
  });

  describe('overview', () => {
    it('returns metrics and workspace rows without search', async () => {
      const result = await service.overview();

      expect(result.metrics.totalWorkspaces).toBe(1);
      expect(result.workspaces).toHaveLength(1);
      expect(result.workspaces[0].workspaceId).toBe(workspaceId);
    });

    it('applies search filter', async () => {
      await service.overview('test');

      expect(mockWorkspaceFindMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            OR: expect.arrayContaining([{ name: { contains: 'test', mode: 'insensitive' } }]),
          }),
        }),
      );
    });

    it('returns empty workspaces when no matches', async () => {
      mockWorkspaceFindMany.mockResolvedValueOnce([]);
      mockWorkspaceCount.mockResolvedValueOnce(0);

      const result = await service.overview('no_match');

      expect(result.workspaces).toHaveLength(0);
      expect(result.metrics.totalWorkspaces).toBe(0);
    });
  });

  describe('updateWorkspaceConfig', () => {
    beforeEach(() => {
      prismaMock.$transaction.mockImplementation(async (cb: unknown) => {
        if (typeof cb === 'function') {
          return (cb as (tx: unknown) => unknown)(mockTx);
        }
        return [];
      });
    });

    it('updates settings and creates audit log', async () => {
      const result = await service.updateWorkspaceConfig(workspaceId, actorId, {
        guestMode: true,
      });

      expect(result.workspaceId).toBe(workspaceId);
      expect(mockTxWorkspaceUpdate).toHaveBeenCalled();
      expect(mockTxAuditLogCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            adminUserId: actorId,
            action: 'admin.config.workspace_updated',
            entityType: 'Workspace',
            entityId: workspaceId,
          }),
        }),
      );
    });

    it('throws when workspace not found', async () => {
      mockTxWorkspaceFindUnique.mockResolvedValueOnce(null);

      await expect(
        service.updateWorkspaceConfig('unknown', actorId, { guestMode: true }),
      ).rejects.toThrow(/n.o encontrado/i);
    });

    it('updates autopilot enabled flag', async () => {
      const result = await service.updateWorkspaceConfig(workspaceId, actorId, {
        autopilotEnabled: true,
      });

      expect(result.autopilotEnabled).toBe(false);
    });

    it('updates customDomain', async () => {
      mockTxWorkspaceUpdate.mockResolvedValueOnce({
        ...workspaceRecord,
        customDomain: 'example.com',
      });

      const result = await service.updateWorkspaceConfig(workspaceId, actorId, {
        customDomain: 'example.com',
      });

      expect(result.customDomain).toBe('example.com');
    });

    it('returns updated row with all fields', async () => {
      const result = await service.updateWorkspaceConfig(workspaceId, actorId, {});

      expect(result).toEqual({
        workspaceId,
        name: 'Test WS',
        customDomain: null,
        guestMode: false,
        autopilotEnabled: false,
        authMode: null,
        apiKeysCount: 0,
        webhookSubscriptionsCount: 0,
        updatedAt: workspaceRecord.updatedAt.toISOString(),
      });
    });
  });
});
