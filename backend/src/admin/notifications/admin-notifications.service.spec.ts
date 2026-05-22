import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from '../../prisma/prisma.service';
import { AdminNotificationsService } from './admin-notifications.service';
import { AdminAuditService } from '../audit/admin-audit.service';

describe('AdminNotificationsService', () => {
  let service: AdminNotificationsService;

  const adminUserId = 'admin_1';

  const mockCheckoutOrderFindMany = jest.fn<Promise<unknown>, unknown[]>();
  const mockAgentFindMany = jest.fn<Promise<unknown>, unknown[]>();
  const mockConversationFindMany = jest.fn<Promise<unknown>, unknown[]>();
  const mockAdminLoginAttemptCount = jest.fn<Promise<unknown>, unknown[]>();
  const mockWorkspaceCount = jest.fn<Promise<unknown>, unknown[]>();
  const mockAuditLogFindMany = jest.fn<Promise<unknown>, unknown[]>();
  const mockAuditLogFindFirst = jest.fn<Promise<unknown>, unknown[]>();
  const mockWorkspaceFindMany = jest.fn<Promise<unknown>, unknown[]>();

  const prismaMock = {
    checkoutOrder: { findMany: mockCheckoutOrderFindMany },
    agent: { findMany: mockAgentFindMany },
    conversation: { findMany: mockConversationFindMany },
    adminLoginAttempt: { count: mockAdminLoginAttemptCount },
    workspace: { count: mockWorkspaceCount, findMany: mockWorkspaceFindMany },
    adminAuditLog: { findMany: mockAuditLogFindMany, findFirst: mockAuditLogFindFirst },
  };

  const mockAuditAppend = jest.fn<Promise<void>, unknown[]>();

  const auditMock = {
    append: mockAuditAppend,
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    mockCheckoutOrderFindMany.mockResolvedValue([]);
    mockAgentFindMany.mockResolvedValue([]);
    mockConversationFindMany.mockResolvedValue([]);
    mockAdminLoginAttemptCount.mockResolvedValue(0);
    mockWorkspaceCount.mockResolvedValue(0);
    mockAuditLogFindMany.mockResolvedValue([]);
    mockAuditLogFindFirst.mockResolvedValue(null);
    mockWorkspaceFindMany.mockResolvedValue([]);
    mockAuditAppend.mockResolvedValue(undefined);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AdminNotificationsService,
        { provide: PrismaService, useValue: prismaMock },
        { provide: AdminAuditService, useValue: auditMock },
      ],
    }).compile();

    service = module.get(AdminNotificationsService);
  });

  describe('list', () => {
    it('returns notifications with unreadCount and preferences', async () => {
      mockCheckoutOrderFindMany.mockResolvedValue([
        {
          id: 'cb_1',
          orderNumber: 'KLOEL-001',
          totalInCents: 50000,
          workspaceId: 'ws_1',
          updatedAt: new Date('2026-05-10'),
        },
      ]);
      mockWorkspaceFindMany.mockResolvedValue([{ id: 'ws_1', name: 'Workspace A' }]);

      const result = await service.list(adminUserId);

      expect(result.items).toHaveLength(1);
      expect(result.items[0].type).toBe('chargeback');
      expect(result.items[0].read).toBe(false);
      expect(result.unreadCount).toBe(1);
      expect(result.preferences.chargebacks).toBe(true);
    });

    it('returns empty items when no notifications present', async () => {
      const result = await service.list(adminUserId);

      expect(result.items).toHaveLength(0);
      expect(result.unreadCount).toBe(0);
    });

    it('filters out disabled notification types based on preferences', async () => {
      mockAuditLogFindFirst.mockResolvedValue({
        details: { chargebacks: false },
      });
      mockCheckoutOrderFindMany.mockResolvedValue([
        {
          id: 'cb_1',
          orderNumber: 'KLOEL-001',
          totalInCents: 50000,
          workspaceId: 'ws_1',
          updatedAt: new Date('2026-05-10'),
        },
      ]);
      mockWorkspaceFindMany.mockResolvedValue([{ id: 'ws_1', name: 'Workspace A' }]);

      const result = await service.list(adminUserId);

      expect(result.items).toHaveLength(0);
    });

    it('resolves workspace names for chargebacks', async () => {
      mockCheckoutOrderFindMany.mockResolvedValue([
        {
          id: 'cb_1',
          orderNumber: 'KLOEL-001',
          totalInCents: 50000,
          workspaceId: 'ws_1',
          updatedAt: new Date('2026-05-10'),
        },
      ]);
      mockWorkspaceFindMany.mockResolvedValue([{ id: 'ws_1', name: 'Workspace A' }]);

      const result = await service.list(adminUserId);

      expect(result.items[0].title).toContain('Workspace A');
    });

    it('omits security notification when no failed logins', async () => {
      mockAdminLoginAttemptCount.mockResolvedValue(0);
      mockWorkspaceCount.mockResolvedValue(0);

      const result = await service.list(adminUserId);

      const securityItems = result.items.filter((item) => item.type === 'security');
      expect(securityItems).toHaveLength(0);
    });
  });

  describe('markRead', () => {
    it('creates audit entry via audit.append', async () => {
      const notificationId = 'chargeback:cb_1';

      const result = await service.markRead(adminUserId, notificationId);

      expect(mockAuditAppend).toHaveBeenCalledWith({
        adminUserId,
        action: 'admin.notifications.read',
        entityType: 'AdminNotification',
        entityId: notificationId,
        details: { notificationId },
      });
      expect(result).toEqual({ ok: true });
    });
  });

  describe('updatePreferences', () => {
    it('creates audit entry with DEFAULT_PREFERENCES merged', async () => {
      const preferences = { chargebacks: false, security: false };

      const result = await service.updatePreferences(adminUserId, preferences);

      expect(mockAuditAppend).toHaveBeenCalledWith({
        adminUserId,
        action: 'admin.notifications.preferences.updated',
        entityType: 'AdminNotificationPreferences',
        entityId: adminUserId,
        details: {
          chargebacks: false,
          kyc: true,
          support: true,
          security: false,
          growth: true,
        },
      });
      expect(result).toEqual({ ok: true });
    });
  });
});
