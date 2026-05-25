import { Test, TestingModule } from '@nestjs/testing';
import { AdminRole } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { AuthService } from '../../auth/auth.service';
import { AdminAccountsService } from './admin-accounts.service';
import { AdminAccountStateAction } from './dto/update-account-state.dto';
import { AdminKycService } from './kyc/admin-kyc.service';
import { AdminAuditService } from '../audit/admin-audit.service';
import { createPartialPrismaMock } from '../../../test/helpers/prisma.mock';

const mockListAccounts = jest.fn<Promise<unknown>, unknown[]>();
const mockGetDetail = jest.fn<Promise<unknown>, unknown[]>();
const mockListKycQueue = jest.fn<Promise<unknown>, unknown[]>();
jest.mock('./queries/list-accounts.query', () => ({
  listAdminAccounts: (...args: unknown[]) => mockListAccounts(...args),
}));
jest.mock('./queries/detail-account.query', () => ({
  getAdminAccountDetail: (...args: unknown[]) => mockGetDetail(...args),
}));
jest.mock('./queries/kyc-queue.query', () => ({
  listKycQueue: (...args: unknown[]) => mockListKycQueue(...args),
}));
const mockAsProviderSettings = jest.fn<Record<string, unknown>, unknown[]>();
jest.mock('../../whatsapp/provider-settings.types', () => ({
  asProviderSettings: (...args: unknown[]) => mockAsProviderSettings(...args),
}));
describe('AdminAccountsService', () => {
  let service: AdminAccountsService;
  const actorId = 'admin_1';
  const mockTxWorkspaceFindUnique = jest.fn<Promise<unknown>, unknown[]>();
  const mockTxWorkspaceUpdate = jest.fn<Promise<unknown>, unknown[]>();
  const mockTxAuditLogCreate = jest.fn<Promise<unknown>, unknown[]>();
  const mockTxAgentUpdateMany = jest.fn<Promise<unknown>, unknown[]>();
  const mockPrismaTx: Record<string, Record<string, jest.Mock>> = {
    workspace: { findUnique: mockTxWorkspaceFindUnique, update: mockTxWorkspaceUpdate },
    adminAuditLog: { create: mockTxAuditLogCreate },
    agent: { updateMany: mockTxAgentUpdateMany },
  };
  const mockAuth = {
    issueTokensForAgentId: jest.fn<Promise<unknown>, unknown[]>(),
  };
  const mockKyc = {
    approveAgent: jest.fn<Promise<void>, unknown[]>(),
    rejectAgent: jest.fn<Promise<void>, unknown[]>(),
    reverifyAgent: jest.fn<Promise<void>, unknown[]>(),
  };
  const mockAudit = {
    append: jest.fn<Promise<void>, unknown[]>(),
  };

  const mockPrismaTransaction = jest.fn<Promise<unknown>, unknown[]>();

  const prismaMock = createPartialPrismaMock(
    { workspace: ['findUnique'] },
  );
  const mockPrismaWorkspaceFindUnique = prismaMock.workspace.findUnique;
  prismaMock.$transaction = mockPrismaTransaction;

  const workspaceRecord = {
    id: 'ws_1',
    name: 'Test Workspace',
    providerSettings: {},
    agents: [{ id: 'agent_1', email: 'owner@test.com' }],
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    mockListAccounts.mockResolvedValue({ items: [], total: 0 });
    mockGetDetail.mockResolvedValue(null);
    mockListKycQueue.mockResolvedValue({ items: [], total: 0 });
    mockAsProviderSettings.mockReturnValue({});
    mockAuth.issueTokensForAgentId.mockResolvedValue({ accessToken: 'at', refreshToken: 'rt' });
    mockAudit.append.mockResolvedValue(undefined);
    mockKyc.approveAgent.mockResolvedValue(undefined);
    mockKyc.rejectAgent.mockResolvedValue(undefined);
    mockKyc.reverifyAgent.mockResolvedValue(undefined);

    mockPrismaTransaction.mockImplementation(async (cbOrArray: unknown) => {
      if (typeof cbOrArray === 'function') {
        return (cbOrArray as (tx: unknown) => unknown)(mockPrismaTx);
      }
      return [];
    });
    mockPrismaWorkspaceFindUnique.mockResolvedValue(null);

    mockTxWorkspaceFindUnique.mockResolvedValue(null);
    mockTxWorkspaceUpdate.mockResolvedValue({});
    mockTxAuditLogCreate.mockResolvedValue({});
    mockTxAgentUpdateMany.mockResolvedValue({ count: 1 });

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AdminAccountsService,
        { provide: PrismaService, useValue: prismaMock },
        { provide: AuthService, useValue: mockAuth },
        { provide: AdminKycService, useValue: mockKyc },
        { provide: AdminAuditService, useValue: mockAudit },
      ],
    }).compile();

    service = module.get(AdminAccountsService);
  });

  describe('list', () => {
    it('delegates to listAdminAccounts query', async () => {
      const rows = [
        {
          id: 'ws_1',
          name: 'WS',
          email: 'a@b.com',
          role: 'ADMIN',
          kycStatus: 'approved',
          accountState: {},
          createdAt: new Date().toISOString(),
        },
      ];
      mockListAccounts.mockResolvedValueOnce({ items: rows, total: 1 });

      const result = await service.list({ skip: 0, take: 10 });

      expect(result).toEqual({ items: rows, total: 1 });
      expect(mockListAccounts).toHaveBeenCalledWith(prismaMock, { skip: 0, take: 10 });
    });

    it('returns empty list when no accounts match', async () => {
      mockListAccounts.mockResolvedValueOnce({ items: [], total: 0 });

      const result = await service.list({});

      expect(result.items).toHaveLength(0);
      expect(result.total).toBe(0);
    });
  });

  describe('detail', () => {
    it('returns account detail when workspace exists', async () => {
      const detail = { id: 'ws_1', name: 'WS', plan: 'free', agentCount: 1, status: 'active' };
      mockGetDetail.mockResolvedValueOnce(detail);

      const result = await service.detail('ws_1');

      expect(result).toEqual(detail);
      expect(mockGetDetail).toHaveBeenCalledWith(prismaMock, 'ws_1');
    });

    it('throws when workspace not found', async () => {
      mockGetDetail.mockResolvedValueOnce(null);

      await expect(service.detail('unknown')).rejects.toThrow(/n.o encontrado/i);
    });
  });

  describe('kycQueue', () => {
    it('delegates to listKycQueue with default limit', async () => {
      mockListKycQueue.mockResolvedValueOnce({ items: [], total: 0 });

      await service.kycQueue();

      expect(mockListKycQueue).toHaveBeenCalledWith(prismaMock, 50);
    });

    it('passes custom limit', async () => {
      mockListKycQueue.mockResolvedValueOnce({ items: [], total: 0 });

      await service.kycQueue(20);

      expect(mockListKycQueue).toHaveBeenCalledWith(prismaMock, 20);
    });
  });

  describe('kyc delegation', () => {
    it('delegates approveKyc to kyc service', async () => {
      await service.approveKyc('agent_1', actorId, 'looks good');
      expect(mockKyc.approveAgent).toHaveBeenCalledWith('agent_1', actorId, 'looks good');
    });

    it('delegates rejectKyc to kyc service', async () => {
      await service.rejectKyc('agent_1', actorId, 'bad docs');
      expect(mockKyc.rejectAgent).toHaveBeenCalledWith('agent_1', actorId, 'bad docs');
    });

    it('delegates reverifyKyc to kyc service', async () => {
      await service.reverifyKyc('agent_1', actorId, 'need new docs');
      expect(mockKyc.reverifyAgent).toHaveBeenCalledWith('agent_1', actorId, 'need new docs');
    });
  });

  describe('updateState', () => {
    beforeEach(() => {
      mockTxWorkspaceFindUnique.mockResolvedValue({
        id: 'ws_1',
        name: 'Test WS',
        providerSettings: {},
      });
      mockAsProviderSettings.mockReturnValue({});
    });

    it('suspends a workspace', async () => {
      await service.updateState('ws_1', actorId, AdminAccountStateAction.SUSPEND, {});

      expect(mockTxWorkspaceUpdate).toHaveBeenCalled();
      expect(mockTxAuditLogCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            action: 'admin.accounts.suspend',
            entityType: 'Workspace',
            entityId: 'ws_1',
          }),
        }),
      );
    });

    it('blocks a workspace', async () => {
      await service.updateState('ws_1', actorId, AdminAccountStateAction.BLOCK, {});

      expect(mockTxAuditLogCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ action: 'admin.accounts.block' }),
        }),
      );
    });

    it('unblocks a workspace', async () => {
      mockAsProviderSettings.mockReturnValue({ accountAdmin: { blocked: true } });

      await service.updateState('ws_1', actorId, AdminAccountStateAction.UNBLOCK, {});

      expect(mockTxAuditLogCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ action: 'admin.accounts.unblock' }),
        }),
      );
    });

    it('freezes a balance', async () => {
      await service.updateState('ws_1', actorId, AdminAccountStateAction.FREEZE, {
        frozenBalanceInCents: 500,
      });

      expect(mockTxWorkspaceUpdate).toHaveBeenCalled();
      expect(mockTxAuditLogCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ action: 'admin.accounts.freeze' }),
        }),
      );
    });

    it('unfreezes a balance', async () => {
      mockAsProviderSettings.mockReturnValue({ accountAdmin: { frozenBalanceInCents: 1000 } });

      await service.updateState('ws_1', actorId, AdminAccountStateAction.UNFREEZE, {});

      expect(mockTxAuditLogCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ action: 'admin.accounts.unfreeze' }),
        }),
      );
    });

    it('throws when workspace not found', async () => {
      mockTxWorkspaceFindUnique.mockResolvedValueOnce(null);

      await expect(
        service.updateState('unknown', actorId, AdminAccountStateAction.SUSPEND, {}),
      ).rejects.toThrow(/n.o encontrado/i);
    });

    it('writes audit log with reason on state change', async () => {
      mockTxWorkspaceFindUnique.mockResolvedValue({
        id: 'ws_2',
        name: 'WS2',
        providerSettings: {},
      });

      await service.updateState('ws_2', actorId, AdminAccountStateAction.BLOCK, {
        reason: 'fraud',
      });

      expect(mockTxAuditLogCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            adminUserId: actorId,
            action: 'admin.accounts.block',
            details: expect.objectContaining({ reason: 'fraud' }),
          }),
        }),
      );
    });
  });

  describe('bulkUpdateState', () => {
    it('processes multiple workspaceIds sequentially', async () => {
      mockTxWorkspaceFindUnique.mockResolvedValue({
        id: 'ws_1',
        name: 'WS',
        providerSettings: {},
      });

      const result = await service.bulkUpdateState(
        ['ws_1', 'ws_2'],
        actorId,
        AdminAccountStateAction.SUSPEND,
        {},
      );

      expect(result.updated).toBe(2);
      expect(mockTxWorkspaceUpdate).toHaveBeenCalledTimes(2);
    });
  });

  describe('resetOwnerPassword', () => {
    it('resets owner password and returns credentials', async () => {
      mockPrismaWorkspaceFindUnique.mockResolvedValue(workspaceRecord);

      const result = await service.resetOwnerPassword('ws_1', actorId);

      expect(result.ownerAgentId).toBe('agent_1');
      expect(result.ownerEmail).toBe('owner@test.com');
      expect(result.temporaryPassword).toBeTruthy();
      expect(mockTxAgentUpdateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'agent_1', workspaceId: 'ws_1' },
          data: expect.objectContaining({ password: expect.stringMatching(/.+/) }),
        }),
      );
    });

    it('uses provided temporary password when given', async () => {
      mockPrismaWorkspaceFindUnique.mockResolvedValue(workspaceRecord);

      const result = await service.resetOwnerPassword('ws_1', actorId, 'MyPass123');

      expect(result.temporaryPassword).toBe('MyPass123');
    });

    it('throws when workspace not found', async () => {
      mockPrismaWorkspaceFindUnique.mockResolvedValue(null);

      await expect(service.resetOwnerPassword('unknown', actorId)).rejects.toThrow(
        /n.o encontrado/i,
      );
    });

    it('throws when workspace has no owner agent', async () => {
      mockPrismaWorkspaceFindUnique.mockResolvedValue({
        ...workspaceRecord,
        agents: [],
      });

      await expect(service.resetOwnerPassword('ws_1', actorId)).rejects.toThrow(/n.o encontrado/i);
    });

    it('writes audit log on password reset', async () => {
      mockPrismaWorkspaceFindUnique.mockResolvedValue(workspaceRecord);

      await service.resetOwnerPassword('ws_1', actorId);

      expect(mockTxAuditLogCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            action: 'admin.accounts.owner_password_reset',
          }),
        }),
      );
    });
  });

  describe('impersonateOwner', () => {
    it('rejects non-OWNER role', async () => {
      await expect(service.impersonateOwner('ws_1', actorId, AdminRole.MANAGER)).rejects.toThrow(
        /owner/i,
      );
    });

    it('issues tokens when caller is OWNER', async () => {
      mockPrismaWorkspaceFindUnique.mockResolvedValue(workspaceRecord);

      const result = await service.impersonateOwner('ws_1', actorId, AdminRole.OWNER);

      expect(result).toEqual({ accessToken: 'at', refreshToken: 'rt' });
      expect(mockAuth.issueTokensForAgentId).toHaveBeenCalledWith('agent_1');
      expect(mockAudit.append).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'admin.accounts.impersonated_owner',
        }),
      );
    });

    it('throws when workspace not found', async () => {
      mockPrismaWorkspaceFindUnique.mockResolvedValue(null);

      await expect(service.impersonateOwner('unknown', actorId, AdminRole.OWNER)).rejects.toThrow(
        /n.o encontrado/i,
      );
    });
  });
});
