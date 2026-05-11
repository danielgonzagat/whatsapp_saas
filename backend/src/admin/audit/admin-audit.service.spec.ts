import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from '../../prisma/prisma.service';
import { OpsAlertService } from '../../observability/ops-alert.service';
import { AdminAuditService } from './admin-audit.service';

describe('AdminAuditService', () => {
  let service: AdminAuditService;

  const mockAuditLogCreate = jest.fn<Promise<unknown>, unknown[]>();
  const mockAuditLogFindMany = jest.fn<Promise<unknown>, unknown[]>();
  const mockAuditLogCount = jest.fn<Promise<unknown>, unknown[]>();
  const mockTransaction = jest.fn<Promise<unknown>, unknown[]>();

  const prismaMock = {
    adminAuditLog: {
      create: mockAuditLogCreate,
      findMany: mockAuditLogFindMany,
      count: mockAuditLogCount,
    },
    $transaction: mockTransaction,
  };

  const mockOpsAlert = {
    alertOnCriticalError: jest.fn<Promise<void>, unknown[]>(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    mockAuditLogCreate.mockResolvedValue({ id: 'log_1' });
    mockAuditLogFindMany.mockResolvedValue([]);
    mockAuditLogCount.mockResolvedValue(0);
    mockOpsAlert.alertOnCriticalError.mockResolvedValue(undefined);

    mockTransaction.mockImplementation(async (ops: unknown) => {
      if (typeof ops === 'function') return ops(prismaMock);
      return [[], 0];
    });

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AdminAuditService,
        { provide: PrismaService, useValue: prismaMock },
        { provide: OpsAlertService, useValue: mockOpsAlert },
      ],
    }).compile();

    service = module.get(AdminAuditService);
  });

  describe('append', () => {
    it('creates an audit log entry', async () => {
      await service.append({
        adminUserId: 'admin_1',
        action: 'admin.auth.login',
        entityType: 'AdminUser',
        entityId: 'admin_1',
        details: { via: 'password' },
        ip: '1.2.3.4',
        userAgent: 'test-agent',
      });

      expect(mockAuditLogCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            action: 'admin.auth.login',
            entityType: 'AdminUser',
            entityId: 'admin_1',
            ip: '1.2.3.4',
            userAgent: 'test-agent',
          }),
        }),
      );
    });

    it('omits adminUser connect when adminUserId is null', async () => {
      await service.append({
        action: 'admin.system.event',
        details: { type: 'startup' },
      });

      const callArgs = mockAuditLogCreate.mock.calls[0]?.[0] as Record<string, unknown>;
      const data = callArgs?.data as Record<string, unknown>;
      expect(data.adminUser).toBeUndefined();
    });

    it('handles null details by omitting the field', async () => {
      await service.append({
        action: 'admin.test',
        details: null,
      });

      const callArgs = mockAuditLogCreate.mock.calls[0]?.[0] as Record<string, unknown>;
      const data = callArgs?.data as Record<string, unknown>;
      expect(data.details).toBeUndefined();
    });

    it('handles undefined details by omitting the field', async () => {
      await service.append({
        action: 'admin.test',
      });

      const callArgs = mockAuditLogCreate.mock.calls[0]?.[0] as Record<string, unknown>;
      const data = callArgs?.data as Record<string, unknown>;
      expect(data.details).toBeUndefined();
    });

    it('sets default null for ip and userAgent', async () => {
      await service.append({
        action: 'admin.test',
      });

      expect(mockAuditLogCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            ip: null,
            userAgent: null,
          }),
        }),
      );
    });

    it('swallows database errors and logs warning (does not throw)', async () => {
      mockAuditLogCreate.mockRejectedValueOnce(new Error('DB connection lost'));

      await expect(service.append({ action: 'admin.critical' })).resolves.toBeUndefined();

      expect(mockOpsAlert.alertOnCriticalError).toHaveBeenCalled();
    });

    it('alerts ops on critical append failure', async () => {
      const error = new Error('crash');
      mockAuditLogCreate.mockRejectedValueOnce(error);

      await service.append({ action: 'admin.test' });

      expect(mockOpsAlert.alertOnCriticalError).toHaveBeenCalledWith(
        error,
        'AdminAuditService.create',
      );
    });

    it('only creates entries (append-only contract)', async () => {
      await service.append({ action: 'admin.immutable.test' });

      expect(mockAuditLogCreate).toHaveBeenCalledTimes(1);
    });
  });

  describe('list', () => {
    const logEntry = {
      id: 'log_1',
      action: 'admin.auth.login',
      adminUserId: 'admin_1',
      entityType: 'AdminUser',
      entityId: 'admin_1',
      details: {},
      ip: '1.2.3.4',
      userAgent: 'ua',
      createdAt: new Date(),
      adminUser: {
        id: 'admin_1',
        name: 'Admin',
        email: 'admin@test.com',
        role: 'OWNER' as const,
      },
    };

    beforeEach(() => {
      mockTransaction.mockImplementation(async (ops: unknown) => {
        if (typeof ops === 'function') return ops(prismaMock);
        return [[logEntry], 1];
      });
    });

    it('returns items and total count', async () => {
      const result = await service.list({});

      expect(result.items).toHaveLength(1);
      expect(result.total).toBe(1);
    });

    it('filters by adminUserId', async () => {
      await service.list({ adminUserId: 'admin_1' });

      expect(mockAuditLogFindMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ adminUserId: 'admin_1' }),
        }),
      );
    });

    it('filters by action with contains', async () => {
      await service.list({ action: 'login' });

      expect(mockAuditLogFindMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ action: { contains: 'login' } }),
        }),
      );
    });

    it('filters by entityType', async () => {
      await service.list({ entityType: 'Workspace' });

      expect(mockAuditLogFindMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ entityType: 'Workspace' }),
        }),
      );
    });

    it('filters by date range', async () => {
      const from = new Date('2026-01-01');
      const to = new Date('2026-12-31');

      await service.list({ from, to });

      expect(mockAuditLogFindMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            createdAt: { gte: from, lte: to },
          }),
        }),
      );
    });

    it('clamps take between 1 and 200', async () => {
      await service.list({ take: 500 });

      expect(mockAuditLogFindMany).toHaveBeenCalledWith(expect.objectContaining({ take: 200 }));
    });

    it('uses default take of 50 when not provided', async () => {
      await service.list({});

      expect(mockAuditLogFindMany).toHaveBeenCalledWith(expect.objectContaining({ take: 50 }));
    });

    it('clamps negative skip to 0', async () => {
      await service.list({ skip: -5 });

      expect(mockAuditLogFindMany).toHaveBeenCalledWith(expect.objectContaining({ skip: 0 }));
    });

    it('includes adminUser relation', async () => {
      await service.list({});

      expect(mockAuditLogFindMany).toHaveBeenCalledWith(
        expect.objectContaining({
          include: {
            adminUser: { select: { id: true, name: true, email: true, role: true } },
          },
        }),
      );
    });

    it('sorts by createdAt descending', async () => {
      await service.list({});

      expect(mockAuditLogFindMany).toHaveBeenCalledWith(
        expect.objectContaining({
          orderBy: { createdAt: 'desc' },
        }),
      );
    });

    it('propagates database errors', async () => {
      mockTransaction.mockRejectedValueOnce(new Error('DB timeout'));

      await expect(service.list({})).rejects.toThrow('DB timeout');
    });
  });

  describe('append-only invariant', () => {
    it('has no update or delete methods on the service', () => {
      const proto = Object.getOwnPropertyNames(Object.getPrototypeOf(service));
      const publicMethods = proto.filter(
        (k) =>
          k !== 'constructor' &&
          typeof (service as unknown as Record<string, unknown>)[k] === 'function',
      );
      expect(publicMethods).not.toContain('update');
      expect(publicMethods).not.toContain('delete');
      expect(publicMethods).not.toContain('remove');
    });
  });
});
