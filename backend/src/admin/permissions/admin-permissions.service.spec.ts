import { Test, type TestingModule } from '@nestjs/testing';
import { AdminAction, AdminModule, AdminRole } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { AdminPermissionsService } from './admin-permissions.service';

type PermissionRow = {
  adminUserId: string;
  module: AdminModule;
  action: AdminAction;
  allowed: boolean;
};

type PermissionsPrismaMock = Record<string, unknown> & {
  $transaction: jest.Mock;
  adminPermission: {
    findUnique: jest.Mock;
    findMany: jest.Mock;
    createMany: jest.Mock;
    deleteMany: jest.Mock;
  };
  adminAuditLog: {
    create: jest.Mock;
  };
};

function buildPrismaMock(overrides: Partial<PermissionsPrismaMock> = {}): PermissionsPrismaMock {
  const txMock: PermissionsPrismaMock = {
    $transaction: jest
      .fn()
      .mockImplementation(async (callback: (tx: PermissionsPrismaMock) => Promise<unknown>) =>
        callback(txMock),
      ),
    adminPermission: {
      findUnique: jest.fn().mockResolvedValue(null),
      findMany: jest.fn().mockResolvedValue([]),
      createMany: jest.fn().mockResolvedValue({ count: 1 }),
      deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
    },
    adminAuditLog: {
      create: jest.fn().mockResolvedValue({ id: 'audit_1' }),
    },
    ...overrides,
  };
  return txMock;
}

describe('AdminPermissionsService', () => {
  let service: AdminPermissionsService;
  let prismaMock: PermissionsPrismaMock;

  beforeEach(async () => {
    prismaMock = buildPrismaMock();
    const moduleRef: TestingModule = await Test.createTestingModule({
      providers: [AdminPermissionsService, { provide: PrismaService, useValue: prismaMock }],
    }).compile();
    service = moduleRef.get(AdminPermissionsService);
  });

  describe('allows', () => {
    it('returns true for OWNER on any (module, action)', async () => {
      const result = await service.allows(
        'admin-1',
        AdminRole.OWNER,
        AdminModule.CONTAS,
        AdminAction.DELETE,
      );
      expect(result).toBe(true);
      expect(prismaMock.adminPermission.findUnique).not.toHaveBeenCalled();
    });

    it('returns false when no row exists (default-deny)', async () => {
      prismaMock.adminPermission.findUnique.mockResolvedValue(null);
      const result = await service.allows(
        'admin-1',
        AdminRole.STAFF,
        AdminModule.CONTAS,
        AdminAction.DELETE,
      );
      expect(result).toBe(false);
    });

    it('returns true when row exists with allowed=true', async () => {
      prismaMock.adminPermission.findUnique.mockResolvedValue({ allowed: true });
      const result = await service.allows(
        'admin-1',
        AdminRole.STAFF,
        AdminModule.CONTAS,
        AdminAction.VIEW,
      );
      expect(result).toBe(true);
    });

    it('returns false when row exists with allowed=false', async () => {
      prismaMock.adminPermission.findUnique.mockResolvedValue({ allowed: false });
      const result = await service.allows(
        'admin-1',
        AdminRole.STAFF,
        AdminModule.CONTAS,
        AdminAction.DELETE,
      );
      expect(result).toBe(false);
    });
  });

  describe('seedDefaults', () => {
    it('does nothing for OWNER (empty matrix)', async () => {
      await service.seedDefaults('admin-1', AdminRole.OWNER);
      expect(prismaMock.adminPermission.createMany).not.toHaveBeenCalled();
    });

    it('creates permission rows for STAFF', async () => {
      await service.seedDefaults('admin-1', AdminRole.STAFF);
      expect(prismaMock.adminPermission.createMany).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.any(Array),
          skipDuplicates: true,
        }),
      );
    });

    it('passes adminUserId into every seed row', async () => {
      await service.seedDefaults('target-admin', AdminRole.STAFF);
      const [call] = prismaMock.adminPermission.createMany.mock.calls;
      const data = call[0].data as PermissionRow[];
      expect(data.length).toBeGreaterThan(0);
      for (const row of data) {
        expect(row.adminUserId).toBe('target-admin');
      }
    });
  });

  describe('replace', () => {
    const targetUserId = 'admin-target';
    const newPermissions = [
      { module: AdminModule.CONTAS, action: AdminAction.VIEW, allowed: true },
      { module: AdminModule.RELATORIOS, action: AdminAction.VIEW, allowed: true },
      { module: AdminModule.RELATORIOS, action: AdminAction.EXPORT, allowed: true },
    ];

    it('does nothing when target role is OWNER', async () => {
      await service.replace(targetUserId, AdminRole.OWNER, newPermissions);
      expect(prismaMock.$transaction).not.toHaveBeenCalled();
    });

    it('writes adminAuditLog entry inside the transaction', async () => {
      await service.replace(targetUserId, AdminRole.STAFF, newPermissions);

      expect(prismaMock.adminAuditLog.create).toHaveBeenCalledWith({
        data: {
          action: 'PERMISSION_REPLACE',
          entityType: 'admin_permission',
          entityId: targetUserId,
          details: expect.objectContaining({
            before: expect.any(Array),
            after: expect.arrayContaining([
              expect.objectContaining({ module: 'CONTAS', action: 'VIEW', allowed: true }),
            ]),
          }),
        },
      });
    });

    it('captures before-state rows in audit details', async () => {
      const existingRows = [
        {
          adminUserId: targetUserId,
          module: AdminModule.CONTAS,
          action: AdminAction.VIEW,
          allowed: false,
        },
        {
          adminUserId: targetUserId,
          module: AdminModule.CONTAS,
          action: AdminAction.EDIT,
          allowed: true,
        },
      ];
      prismaMock.adminPermission.findMany.mockResolvedValue(existingRows);

      await service.replace(targetUserId, AdminRole.STAFF, newPermissions);

      const auditCall = prismaMock.adminAuditLog.create.mock.calls[0];
      const details = auditCall[0].data.details;
      expect(details.before).toEqual([
        { module: 'CONTAS', action: 'VIEW', allowed: false },
        { module: 'CONTAS', action: 'EDIT', allowed: true },
      ]);
    });

    it('deletes old permissions and creates new ones inside the transaction', async () => {
      await service.replace(targetUserId, AdminRole.STAFF, newPermissions);

      expect(prismaMock.adminPermission.deleteMany).toHaveBeenCalledWith({
        where: { adminUserId: targetUserId },
      });
      expect(prismaMock.adminPermission.createMany).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.arrayContaining([
            expect.objectContaining({
              adminUserId: targetUserId,
              module: 'CONTAS',
              action: 'VIEW',
              allowed: true,
            }),
          ]),
          skipDuplicates: true,
        }),
      );
    });

    it('audit entry is created before deleteMany within the transaction', async () => {
      const callOrder: string[] = [];
      const txMock = buildPrismaMock({
        adminAuditLog: {
          create: jest.fn().mockImplementation(() => {
            callOrder.push('audit');
            return Promise.resolve({ id: 'audit_1' });
          }),
        },
        adminPermission: {
          findUnique: prismaMock.adminPermission.findUnique,
          findMany: jest.fn().mockImplementation(() => {
            callOrder.push('findMany');
            return Promise.resolve([]);
          }),
          createMany: jest.fn().mockImplementation(() => {
            callOrder.push('createMany');
            return Promise.resolve({ count: 1 });
          }),
          deleteMany: jest.fn().mockImplementation(() => {
            callOrder.push('deleteMany');
            return Promise.resolve({ count: 0 });
          }),
        },
      });

      const moduleRef: TestingModule = await Test.createTestingModule({
        providers: [AdminPermissionsService, { provide: PrismaService, useValue: txMock }],
      }).compile();
      const svc = moduleRef.get(AdminPermissionsService);

      await svc.replace(targetUserId, AdminRole.STAFF, newPermissions);

      expect(callOrder).toEqual(['findMany', 'audit', 'deleteMany', 'createMany']);
    });

    it('all transaction operations use the same typed tx client', async () => {
      await service.replace(targetUserId, AdminRole.STAFF, newPermissions);

      const txCallback = prismaMock.$transaction.mock.calls[0][0] as unknown;
      expect(typeof txCallback).toBe('function');
    });
  });
});
