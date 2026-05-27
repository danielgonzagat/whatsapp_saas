import { AdminRole } from '@prisma/client';
import type { AuthenticatedAdmin } from '../auth/admin-token.types';
import { AdminAccountsController } from './admin-accounts.controller';
import { AdminAccountStateAction } from './dto/update-account-state.dto';

describe('AdminAccountsController', () => {
  const accounts = {
    list: jest.fn(),
    kycQueue: jest.fn(),
    detail: jest.fn(),
    bulkUpdateState: jest.fn(),
    updateState: jest.fn(),
    resetOwnerPassword: jest.fn(),
    impersonateOwner: jest.fn(),
    approveKyc: jest.fn(),
    rejectKyc: jest.fn(),
    reverifyKyc: jest.fn(),
  };

  let controller: AdminAccountsController;

  const admin: AuthenticatedAdmin = {
    id: 'a-1',
    name: 'Owner Admin',
    email: 'owner@kloel.com',
    role: AdminRole.OWNER,
    sessionId: 's-1',
    scope: 'full',
  };

  const otherAdmin: AuthenticatedAdmin = {
    id: 'a-2',
    name: 'Super Admin',
    email: 'super@kloel.com',
    role: AdminRole.SUPER_ADMIN,
    sessionId: 's-2',
    scope: 'full',
  };

  beforeEach(() => {
    jest.clearAllMocks();
    controller = new AdminAccountsController(accounts as never);
  });

  describe('GET /admin/accounts (list) — happy path', () => {
    it('calls service.list with query params and returns result', async () => {
      const mockResult = { items: [], total: 0 };
      accounts.list.mockResolvedValue(mockResult);

      const result = await controller.list({
        search: 'kloel',
        kycStatus: 'pending',
        skip: 0,
        take: 10,
      });

      expect(accounts.list).toHaveBeenCalledWith({
        search: 'kloel',
        kycStatus: 'pending',
        skip: 0,
        take: 10,
      });
      expect(result).toBe(mockResult);
    });

    it('calls service.list with empty query when no params provided', async () => {
      const mockResult = { items: [], total: 0 };
      accounts.list.mockResolvedValue(mockResult);

      await controller.list({});

      expect(accounts.list).toHaveBeenCalledWith({});
    });
  });

  describe('GET /admin/accounts/kyc/queue (kycQueue)', () => {
    it('delegates to service.kycQueue and returns result', async () => {
      const mockResult = { items: [] };
      accounts.kycQueue.mockResolvedValue(mockResult);

      const result = await controller.kycQueue();

      expect(accounts.kycQueue).toHaveBeenCalledTimes(1);
      expect(result).toBe(mockResult);
    });
  });

  describe('GET /admin/accounts/:workspaceId (detail)', () => {
    it('calls service.detail with workspaceId and returns result', async () => {
      const mockDetail = { id: 'ws-1', name: 'Test Workspace' };
      accounts.detail.mockResolvedValue(mockDetail);

      const result = await controller.detail('ws-1');

      expect(accounts.detail).toHaveBeenCalledWith('ws-1');
      expect(result).toBe(mockDetail);
    });
  });

  describe('POST /admin/accounts/bulk/state (bulkUpdateState) — alternate route happy', () => {
    it('calls service.bulkUpdateState with workspaceIds, admin.id, action, and optional fields', async () => {
      const mockResult = { updated: 2 };
      accounts.bulkUpdateState.mockResolvedValue(mockResult);

      const result = await controller.bulkUpdateState(
        {
          workspaceIds: ['ws-1', 'ws-2'],
          action: AdminAccountStateAction.SUSPEND,
          reason: 'Violation',
        },
        admin,
      );

      expect(accounts.bulkUpdateState).toHaveBeenCalledWith(
        ['ws-1', 'ws-2'],
        'a-1',
        AdminAccountStateAction.SUSPEND,
        { reason: 'Violation' },
      );
      expect(result).toBe(mockResult);
    });
  });

  describe('POST /admin/accounts/:workspaceId/state (updateState)', () => {
    it('calls service.updateState with workspaceId, admin.id, action, and frozenBalanceInCents', async () => {
      accounts.updateState.mockResolvedValue(undefined);

      await controller.updateState(
        'ws-1',
        { action: AdminAccountStateAction.FREEZE, reason: 'Audit', frozenBalanceInCents: 5000 },
        admin,
      );

      expect(accounts.updateState).toHaveBeenCalledWith(
        'ws-1',
        'a-1',
        AdminAccountStateAction.FREEZE,
        { reason: 'Audit', frozenBalanceInCents: 5000 },
      );
    });
  });

  describe('POST /admin/accounts/:workspaceId/reset-password (resetPassword)', () => {
    it('calls service.resetOwnerPassword with workspaceId, admin.id, and temporaryPassword', async () => {
      const mockResult = {
        ownerAgentId: 'agent-1',
        ownerEmail: 'o@x.com',
        temporaryPassword: 'tmp123',
      };
      accounts.resetOwnerPassword.mockResolvedValue(mockResult);

      const result = await controller.resetPassword('ws-1', { temporaryPassword: 'tmp123' }, admin);

      expect(accounts.resetOwnerPassword).toHaveBeenCalledWith('ws-1', 'a-1', 'tmp123');
      expect(result).toBe(mockResult);
    });
  });

  describe('POST /admin/accounts/:workspaceId/impersonate (impersonateOwner)', () => {
    it('calls service.impersonateOwner with workspaceId, admin.id, and admin.role', async () => {
      const mockSession = { accessToken: 'at', refreshToken: 'rt' };
      accounts.impersonateOwner.mockResolvedValue(mockSession);

      const result = await controller.impersonateOwner('ws-1', admin);

      expect(accounts.impersonateOwner).toHaveBeenCalledWith('ws-1', 'a-1', AdminRole.OWNER);
      expect(result).toBe(mockSession);
    });
  });

  describe('POST /admin/accounts/agents/:agentId/kyc/approve (approveKyc)', () => {
    it('calls service.approveKyc with agentId, admin.id, and optional note', async () => {
      accounts.approveKyc.mockResolvedValue(undefined);

      await controller.approveKyc('agent-1', { note: 'All good' }, admin);

      expect(accounts.approveKyc).toHaveBeenCalledWith('agent-1', 'a-1', 'All good');
    });

    it('calls service.approveKyc with undefined note when note is absent', async () => {
      accounts.approveKyc.mockResolvedValue(undefined);

      await controller.approveKyc('agent-1', {}, admin);

      expect(accounts.approveKyc).toHaveBeenCalledWith('agent-1', 'a-1', undefined);
    });
  });

  describe('POST /admin/accounts/agents/:agentId/kyc/reject (rejectKyc)', () => {
    it('calls service.rejectKyc with agentId, admin.id, and reason', async () => {
      accounts.rejectKyc.mockResolvedValue(undefined);

      await controller.rejectKyc('agent-1', { reason: 'Invalid docs' }, admin);

      expect(accounts.rejectKyc).toHaveBeenCalledWith('agent-1', 'a-1', 'Invalid docs');
    });
  });

  describe('POST /admin/accounts/agents/:agentId/kyc/reverify (reverifyKyc)', () => {
    it('calls service.reverifyKyc with agentId, admin.id, and reason', async () => {
      accounts.reverifyKyc.mockResolvedValue(undefined);

      await controller.reverifyKyc('agent-1', { reason: 'Recheck needed' }, admin);

      expect(accounts.reverifyKyc).toHaveBeenCalledWith('agent-1', 'a-1', 'Recheck needed');
    });
  });

  describe('error propagation', () => {
    it('propagates service.list rejection as thrown error', async () => {
      const error = new Error('Database connection lost');
      accounts.list.mockRejectedValue(error);

      await expect(controller.list({})).rejects.toThrow('Database connection lost');
    });

    it('propagates service.detail rejection as thrown error', async () => {
      const error = new Error('Workspace not found');
      accounts.detail.mockRejectedValue(error);

      await expect(controller.detail('ws-missing')).rejects.toThrow('Workspace not found');
    });

    it('propagates service.updateState rejection as thrown error', async () => {
      const error = new Error('Cannot update state');
      accounts.updateState.mockRejectedValue(error);

      await expect(
        controller.updateState('ws-1', { action: AdminAccountStateAction.BLOCK }, admin),
      ).rejects.toThrow('Cannot update state');
    });
  });

  describe('identity propagation', () => {
    it('passes admin.id to service.bulkUpdateState when called with otherAdmin', async () => {
      accounts.bulkUpdateState.mockResolvedValue({ updated: 1 });

      await controller.bulkUpdateState(
        { workspaceIds: ['ws-1'], action: AdminAccountStateAction.UNBLOCK },
        otherAdmin,
      );

      expect(accounts.bulkUpdateState).toHaveBeenCalledWith(
        ['ws-1'],
        'a-2',
        AdminAccountStateAction.UNBLOCK,
        {},
      );
    });

    it('passes admin.id from second admin to service.resetOwnerPassword', async () => {
      accounts.resetOwnerPassword.mockResolvedValue({
        ownerAgentId: 'a',
        ownerEmail: 'e@x.com',
        temporaryPassword: 'p',
      });

      await controller.resetPassword('ws-1', {}, otherAdmin);

      expect(accounts.resetOwnerPassword).toHaveBeenCalledWith('ws-1', 'a-2', undefined);
    });

    it('passes admin.id to service.approveKyc with a third admin identity', async () => {
      accounts.approveKyc.mockResolvedValue(undefined);
      const admin3: AuthenticatedAdmin = {
        id: 'a-3',
        name: 'Mod',
        email: 'mod@kloel.com',
        role: AdminRole.MANAGER,
        sessionId: 's-3',
        scope: 'full',
      };

      await controller.approveKyc('agent-1', { note: 'Ok' }, admin3);

      expect(accounts.approveKyc).toHaveBeenCalledWith('agent-1', 'a-3', 'Ok');
    });
  });
});
