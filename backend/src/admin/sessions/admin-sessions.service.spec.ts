import { Test, TestingModule } from '@nestjs/testing';
import { AdminRole } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { AdminSessionsService } from './admin-sessions.service';

describe('AdminSessionsService', () => {
  let service: AdminSessionsService;

  const adminUserId = 'admin_1';
  const targetId = 'admin_2';

  const sessionRecord = {
    id: 'session_1',
    adminUserId,
    ip: '127.0.0.1',
    userAgent: 'TestAgent',
    createdAt: new Date('2026-01-01'),
    expiresAt: new Date('2026-06-01'),
    revokedAt: null as Date | null,
  };

  const mockSessionFindUnique = jest.fn();
  const mockSessionUpdate = jest.fn();
  const mockAuditLogCreate = jest.fn();

  const mockTx = {
    adminSession: { findUnique: mockSessionFindUnique, update: mockSessionUpdate },
    adminAuditLog: { create: mockAuditLogCreate },
  };

  const mockSessionFindMany = jest.fn();
  const mockTransaction = jest.fn();

  const prismaMock = {
    adminSession: { findMany: mockSessionFindMany },
    $transaction: mockTransaction,
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    mockSessionFindMany.mockResolvedValue([sessionRecord]);
    mockTransaction.mockImplementation(async (cbOrArray: unknown) => {
      if (typeof cbOrArray === 'function') {
        return (cbOrArray as (tx: unknown) => unknown)(mockTx);
      }
      return [];
    });
    mockSessionFindUnique.mockResolvedValue(sessionRecord);
    mockSessionUpdate.mockResolvedValue({ ...sessionRecord, revokedAt: new Date() });
    mockAuditLogCreate.mockResolvedValue({});

    const module: TestingModule = await Test.createTestingModule({
      providers: [AdminSessionsService, { provide: PrismaService, useValue: prismaMock }],
    }).compile();

    service = module.get(AdminSessionsService);
  });

  describe('listOwn', () => {
    it('returns sessions for the given admin user', async () => {
      const result = await service.listOwn(adminUserId);

      expect(result).toHaveLength(1);
      expect(result[0].id).toBe('session_1');
      expect(mockSessionFindMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { adminUserId },
        }),
      );
    });

    it('returns empty array when admin has no sessions', async () => {
      mockSessionFindMany.mockResolvedValueOnce([]);

      const result = await service.listOwn('admin_unknown');

      expect(result).toHaveLength(0);
    });
  });

  describe('listForUser', () => {
    it('returns sessions for the given target user', async () => {
      const result = await service.listForUser(targetId);

      expect(result).toHaveLength(1);
      expect(result[0].id).toBe('session_1');
      expect(mockSessionFindMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { adminUserId: targetId },
        }),
      );
    });

    it('returns empty array when target has no sessions', async () => {
      mockSessionFindMany.mockResolvedValueOnce([]);

      const result = await service.listForUser('admin_unknown');

      expect(result).toHaveLength(0);
    });
  });

  describe('revoke', () => {
    it('marks session as revoked and creates audit log', async () => {
      await service.revoke('session_1', adminUserId, AdminRole.MANAGER);

      expect(mockSessionUpdate).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'session_1' },
          data: { revokedAt: expect.any(Date) as unknown },
        }),
      );
      expect(mockAuditLogCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            adminUserId,
            action: 'admin.sessions.revoked',
            entityType: 'AdminSession',
            entityId: 'session_1',
          }),
        }),
      );
    });

    it('throws sessionNotFound when session does not exist', async () => {
      mockSessionFindUnique.mockResolvedValueOnce(null);

      await expect(service.revoke('session_unknown', adminUserId, AdminRole.OWNER)).rejects.toThrow(
        /Sess.o n.o encontrada/i,
      );
    });

    it('throws cannotRevokeOther when non-OWNER tries to revoke another admin session', async () => {
      mockSessionFindUnique.mockResolvedValueOnce({
        ...sessionRecord,
        adminUserId: targetId,
      });

      await expect(service.revoke('session_1', adminUserId, AdminRole.MANAGER)).rejects.toThrow(
        /n.o pode revogar/i,
      );
    });

    it('allows OWNER to revoke any session', async () => {
      mockSessionFindUnique.mockResolvedValueOnce({
        ...sessionRecord,
        adminUserId: targetId,
      });

      await service.revoke('session_1', adminUserId, AdminRole.OWNER);

      expect(mockSessionUpdate).toHaveBeenCalled();
      expect(mockAuditLogCreate).toHaveBeenCalled();
    });

    it('does nothing when session is already revoked', async () => {
      mockSessionFindUnique.mockResolvedValueOnce({
        ...sessionRecord,
        revokedAt: new Date(),
      });

      await service.revoke('session_1', adminUserId, AdminRole.MANAGER);

      expect(mockSessionUpdate).not.toHaveBeenCalled();
      expect(mockAuditLogCreate).not.toHaveBeenCalled();
    });
  });
});
