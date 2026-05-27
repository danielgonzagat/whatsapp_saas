import { Test, TestingModule } from '@nestjs/testing';
import { AdminAction, AdminModule, AdminRole, AdminUserStatus } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { AdminPermissionsService } from '../permissions/admin-permissions.service';
import { AdminAuditService } from '../audit/admin-audit.service';
import { AdminUsersService } from './admin-users.service';
import { createPartialPrismaMock } from '../../../test/helpers/prisma.mock';

jest.mock('../auth/admin-auth.service', () => ({
  AdminAuthService: { hashPassword: jest.fn(() => Promise.resolve('hashed')) },
}));

describe('AdminUsersService', () => {
  let service: AdminUsersService;

  const actorId = 'admin_1';

  const adminUser = {
    id: 'user_1',
    name: 'Admin',
    email: 'admin@test.com',
    role: AdminRole.MANAGER,
    status: AdminUserStatus.ACTIVE,
    passwordHash: '$2b$secret',
    mfaSecret: 'encrypted-secret',
    mfaEnabled: false,
    mfaPendingSetup: true,
    passwordChangeRequired: true,
    lockedUntil: null as Date | null,
    failedLoginCount: 0,
    lastLoginAt: null as Date | null,
    createdById: null as string | null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const mockAdminPermissionDeleteMany = jest.fn<Promise<unknown>, unknown[]>();
  const mockAdminPermissionCreateMany = jest.fn<Promise<unknown>, unknown[]>();
  const mockAdminSessionUpdateMany = jest.fn<Promise<unknown>, unknown[]>();

  const mockTx = {
    adminUser: {
      findUnique: jest.fn<Promise<unknown>, unknown[]>(),
      update: jest.fn<Promise<unknown>, unknown[]>(),
    },
    adminPermission: {
      deleteMany: mockAdminPermissionDeleteMany,
      createMany: mockAdminPermissionCreateMany,
    },
    adminSession: {
      updateMany: mockAdminSessionUpdateMany,
    },
    adminAuditLog: { create: jest.fn<Promise<unknown>, unknown[]>() },
  };

  const mockPrismaTransaction = jest.fn<Promise<unknown>, unknown[]>();

  const prismaMock = createPartialPrismaMock({
    adminUser: ['findUnique', 'findMany', 'create', 'update'],
  });
  const mockAdminUserFindUnique = prismaMock.adminUser.findUnique;
  const mockAdminUserFindMany = prismaMock.adminUser.findMany;
  const mockAdminUserCreate = prismaMock.adminUser.create;
  const mockAdminUserUpdate = prismaMock.adminUser.update;
  prismaMock.$transaction = mockPrismaTransaction;

  const mockPermissions = {
    seedDefaults: jest.fn<Promise<void>, unknown[]>(),
    replace: jest.fn<Promise<void>, unknown[]>(),
    listFor: jest.fn<Promise<unknown>, unknown[]>(),
  };

  const mockAudit = {
    append: jest.fn<Promise<void>, unknown[]>(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    mockAdminUserFindUnique.mockResolvedValue(null);
    mockAdminUserFindMany.mockResolvedValue([]);
    mockAdminUserCreate.mockResolvedValue(adminUser);
    mockAdminUserUpdate.mockResolvedValue(adminUser);
    mockAdminPermissionDeleteMany.mockResolvedValue({ count: 0 });
    mockAdminPermissionCreateMany.mockResolvedValue({ count: 0 });
    mockAdminSessionUpdateMany.mockResolvedValue({ count: 0 });
    mockPermissions.seedDefaults.mockResolvedValue(undefined);
    mockPermissions.replace.mockResolvedValue(undefined);
    mockPermissions.listFor.mockResolvedValue([]);
    mockAudit.append.mockResolvedValue(undefined);

    mockPrismaTransaction.mockImplementation(async (cbOrArray: unknown) => {
      if (typeof cbOrArray === 'function') {
        return (cbOrArray as (tx: unknown) => unknown)(mockTx);
      }
      return [];
    });
    mockTx.adminUser.findUnique.mockResolvedValue(adminUser);
    mockTx.adminUser.update.mockResolvedValue({ ...adminUser, role: AdminRole.OWNER });
    mockTx.adminAuditLog.create.mockResolvedValue({ id: 'log_1' });

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AdminUsersService,
        { provide: PrismaService, useValue: prismaMock },
        { provide: AdminPermissionsService, useValue: mockPermissions },
        { provide: AdminAuditService, useValue: mockAudit },
      ],
    }).compile();

    service = module.get(AdminUsersService);
  });

  describe('create', () => {
    const createInput = {
      name: 'New Admin',
      email: 'new@test.com',
      temporaryPassword: 'Temp@123',
      role: AdminRole.MANAGER,
      createdById: actorId,
      createdByRole: AdminRole.OWNER,
    };

    beforeEach(() => {
      mockAdminUserFindUnique.mockResolvedValue(null);
    });

    it('creates admin user with hashed password and seeds permissions + audit', async () => {
      const result = await service.create(createInput);

      expect(mockAdminUserCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            name: 'New Admin',
            email: 'new@test.com',
            passwordHash: 'hashed',
            role: AdminRole.MANAGER,
          }),
        }),
      );
      expect(mockPermissions.seedDefaults).toHaveBeenCalledWith(adminUser.id, AdminRole.MANAGER);
      expect(mockAudit.append).toHaveBeenCalledWith(
        expect.objectContaining({
          adminUserId: actorId,
          action: 'admin.users.created',
          entityType: 'AdminUser',
          entityId: adminUser.id,
        }),
      );
      expect(result).not.toHaveProperty('passwordHash');
      expect(result).not.toHaveProperty('mfaSecret');
    });

    it('throws when role is OWNER but creator is not OWNER', async () => {
      const ownerInput = {
        ...createInput,
        role: AdminRole.OWNER,
        createdByRole: AdminRole.MANAGER,
      };

      await expect(service.create(ownerInput)).rejects.toThrow(/owner/i);
    });

    it('throws emailInUse when email exists', async () => {
      mockAdminUserFindUnique.mockResolvedValueOnce(adminUser);

      await expect(service.create(createInput)).rejects.toThrow(/email/i);
    });
  });

  describe('list', () => {
    it('returns all users serialized (no passwordHash)', async () => {
      mockAdminUserFindMany.mockResolvedValueOnce([adminUser]);

      const result = await service.list();

      expect(result).toHaveLength(1);
      expect(result[0]).not.toHaveProperty('passwordHash');
      expect(result[0]).not.toHaveProperty('mfaSecret');
      expect(mockAdminUserFindMany).toHaveBeenCalledWith({
        orderBy: { createdAt: 'desc' },
      });
    });
  });

  describe('findById', () => {
    it('returns user when found', async () => {
      mockAdminUserFindUnique.mockResolvedValueOnce(adminUser);

      const result = await service.findById('user_1');

      expect(result).not.toHaveProperty('passwordHash');
      expect(result).toHaveProperty('id', 'user_1');
    });

    it('throws when user not found', async () => {
      mockAdminUserFindUnique.mockResolvedValueOnce(null);

      await expect(service.findById('unknown')).rejects.toThrow(/n.o encontrado/i);
    });
  });

  describe('findMe', () => {
    it('delegates to findById', async () => {
      mockAdminUserFindUnique.mockResolvedValueOnce(adminUser);

      const result = await service.findMe('user_1');

      expect(result).not.toHaveProperty('passwordHash');
      expect(result).toHaveProperty('id', 'user_1');
    });
  });

  describe('update', () => {
    const patch = {
      name: 'Updated Name',
      status: AdminUserStatus.ACTIVE,
      actorRole: AdminRole.OWNER,
      actorId,
    };

    it('updates user fields and creates audit', async () => {
      const result = await service.update('user_1', patch);

      expect(mockTx.adminUser.update).toHaveBeenCalled();
      expect(mockAdminSessionUpdateMany).not.toHaveBeenCalled();
      expect(mockTx.adminAuditLog.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            adminUserId: actorId,
            action: 'admin.users.updated',
            entityType: 'AdminUser',
            entityId: 'user_1',
          }),
        }),
      );
      expect(result).not.toHaveProperty('passwordHash');
    });

    it('throws when user not found', async () => {
      mockTx.adminUser.findUnique.mockResolvedValueOnce(null);

      await expect(service.update('unknown', patch)).rejects.toThrow(/n.o encontrado/i);
    });

    it('rejects non-OWNER promoting to OWNER', async () => {
      const nonOwnerPatch = {
        ...patch,
        role: AdminRole.OWNER,
        actorRole: AdminRole.MANAGER,
      };

      await expect(service.update('user_1', nonOwnerPatch)).rejects.toThrow(/owner/i);
    });

    it('reseeds permissions on role change', async () => {
      const existingUser = { ...adminUser, role: AdminRole.MANAGER };
      mockTx.adminUser.findUnique.mockResolvedValueOnce(existingUser);

      await service.update('user_1', { ...patch, role: AdminRole.STAFF });

      expect(mockAdminPermissionDeleteMany).toHaveBeenCalledWith({
        where: { adminUserId: 'user_1' },
      });
    });

    it('revokes active sessions when role changes', async () => {
      const existingUser = { ...adminUser, role: AdminRole.MANAGER };
      mockTx.adminUser.findUnique.mockResolvedValueOnce(existingUser);
      mockAdminSessionUpdateMany.mockResolvedValueOnce({ count: 2 });

      await service.update('user_1', { ...patch, role: AdminRole.STAFF });

      const roleChangeSessionUpdate = mockAdminSessionUpdateMany.mock.calls[0][0];
      expect(roleChangeSessionUpdate).toEqual({
        where: {
          adminUserId: 'user_1',
          revokedAt: null,
          expiresAt: { gt: roleChangeSessionUpdate.where.expiresAt.gt },
        },
        data: { revokedAt: roleChangeSessionUpdate.data.revokedAt },
      });
      expect(roleChangeSessionUpdate.where.expiresAt.gt).toBeInstanceOf(Date);
      expect(roleChangeSessionUpdate.data.revokedAt).toBeInstanceOf(Date);
      expect(mockTx.adminAuditLog.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            details: expect.objectContaining({ revokedSessions: 2 }),
          }),
        }),
      );
    });

    it('revokes active sessions when status changes', async () => {
      mockAdminSessionUpdateMany.mockResolvedValueOnce({ count: 1 });

      await service.update('user_1', { ...patch, status: AdminUserStatus.SUSPENDED });

      const statusChangeSessionUpdate = mockAdminSessionUpdateMany.mock.calls[0][0];
      expect(statusChangeSessionUpdate).toEqual({
        where: {
          adminUserId: 'user_1',
          revokedAt: null,
          expiresAt: { gt: statusChangeSessionUpdate.where.expiresAt.gt },
        },
        data: { revokedAt: statusChangeSessionUpdate.data.revokedAt },
      });
      expect(statusChangeSessionUpdate.where.expiresAt.gt).toBeInstanceOf(Date);
      expect(statusChangeSessionUpdate.data.revokedAt).toBeInstanceOf(Date);
    });
  });

  describe('setPermissions', () => {
    const perms = [{ module: AdminModule.HOME, action: AdminAction.VIEW, allowed: true }];

    beforeEach(() => {
      mockAdminUserFindUnique.mockResolvedValue(adminUser);
    });

    it('calls permissions.replace + audit', async () => {
      const result = await service.setPermissions('user_1', actorId, perms);

      expect(mockPermissions.replace).toHaveBeenCalledWith('user_1', adminUser.role, perms);
      expect(mockAudit.append).toHaveBeenCalledWith(
        expect.objectContaining({
          adminUserId: actorId,
          action: 'admin.users.permissions_replaced',
          entityType: 'AdminUser',
          entityId: 'user_1',
          details: { count: 1 },
        }),
      );
      expect(result).toEqual([]);
    });

    it('throws when user not found', async () => {
      mockAdminUserFindUnique.mockResolvedValueOnce(null);

      await expect(service.setPermissions('unknown', actorId, perms)).rejects.toThrow(
        /n.o encontrado/i,
      );
    });
  });
});
