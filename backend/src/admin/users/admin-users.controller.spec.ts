import { AdminAction, AdminModule, AdminRole } from '@prisma/client';
import { AdminUsersController } from './admin-users.controller';
import type { AuthenticatedAdmin } from '../auth/admin-token.types';

describe('AdminUsersController', () => {
  const users = {
    findMe: jest.fn(),
    list: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    setPermissions: jest.fn(),
  };

  const permissions = {
    listFor: jest.fn(),
  };

  let controller: AdminUsersController;

  const admin: AuthenticatedAdmin = {
    id: 'a-1',
    name: 'Owner Admin',
    email: 'owner@kloel.com',
    role: AdminRole.OWNER,
    sessionId: 's-1',
    scope: 'full',
  };

  beforeEach(() => {
    jest.clearAllMocks();
    controller = new AdminUsersController(users as never, permissions as never);
  });

  describe('GET /admin/users/me', () => {
    it('returns current admin payload', async () => {
      const expected = { id: 'a-1', name: 'Owner Admin', email: 'owner@kloel.com', role: AdminRole.OWNER };
      users.findMe.mockResolvedValue(expected);

      const result = await controller.me(admin);

      expect(users.findMe).toHaveBeenCalledWith('a-1');
      expect(result).toEqual(expected);
    });
  });

  describe('GET /admin/users (list)', () => {
    it('invokes users.list and returns array', async () => {
      const expected = [
        { id: 'a-1', name: 'Owner Admin', role: AdminRole.OWNER },
        { id: 'a-2', name: 'Member', role: AdminRole.ADMIN },
      ];
      users.list.mockResolvedValue(expected);

      const result = await controller.list();

      expect(users.list).toHaveBeenCalled();
      expect(result).toEqual(expected);
      expect(Array.isArray(result)).toBe(true);
    });
  });

  describe('POST /admin/users (create)', () => {
    it('passes CreateAdminUserDto and creator context to service', async () => {
      const dto = {
        name: 'New Admin',
        email: 'new@kloel.com',
        temporaryPassword: 'TempPass12345!',
        role: AdminRole.ADMIN,
      };
      const created = { id: 'a-3', name: 'New Admin', email: 'new@kloel.com', role: AdminRole.ADMIN };
      users.create.mockResolvedValue(created);

      const result = await controller.create(dto, admin);

      expect(users.create).toHaveBeenCalledWith({
        name: 'New Admin',
        email: 'new@kloel.com',
        temporaryPassword: 'TempPass12345!',
        role: AdminRole.ADMIN,
        createdById: 'a-1',
        createdByRole: AdminRole.OWNER,
      });
      expect(result).toEqual(created);
    });

    it('forwards creator role as OWNER for audit trail', async () => {
      const dto = {
        name: 'Sub Admin',
        email: 'sub@kloel.com',
        temporaryPassword: 'TempPass12345!',
        role: AdminRole.SUPPORT,
      };
      const subAdmin: AuthenticatedAdmin = {
        id: 'a-2',
        name: 'Sub',
        email: 'sub@kloel.com',
        role: AdminRole.ADMIN,
        sessionId: 's-2',
        scope: 'full',
      };
      users.create.mockResolvedValue({ id: 'a-4', role: AdminRole.SUPPORT });

      await controller.create(dto, subAdmin);

      expect(users.create).toHaveBeenCalledWith(
        expect.objectContaining({
          createdById: 'a-2',
          createdByRole: AdminRole.ADMIN,
        }),
      );
    });
  });

  describe('PATCH /admin/users/:id (update)', () => {
    it('passes id and UpdateAdminUserDto to service with actor context', async () => {
      const dto = { name: 'Updated Name', role: AdminRole.ADMIN };
      const updated = { id: 'u-1', name: 'Updated Name', role: AdminRole.ADMIN };
      users.update.mockResolvedValue(updated);

      const result = await controller.update('u-1', dto, admin);

      expect(users.update).toHaveBeenCalledWith('u-1', {
        name: 'Updated Name',
        role: AdminRole.ADMIN,
        actorRole: AdminRole.OWNER,
        actorId: 'a-1',
      });
      expect(result).toEqual(updated);
    });

    it('only passes defined fields from UpdateAdminUserDto', async () => {
      const dto = { name: 'New Name' };
      users.update.mockResolvedValue({ id: 'u-1', name: 'New Name' });

      await controller.update('u-1', dto, admin);

      expect(users.update).toHaveBeenCalledWith('u-1', {
        name: 'New Name',
        actorRole: AdminRole.OWNER,
        actorId: 'a-1',
      });
    });
  });

  describe('PUT /admin/users/:id/permissions (setPermissions)', () => {
    it('invokes users.setPermissions with target id, actor id and payload', async () => {
      const dto = {
        permissions: [
          { module: AdminModule.IAM, action: AdminAction.VIEW, allowed: true },
          { module: AdminModule.IAM, action: AdminAction.CREATE, allowed: false },
        ],
      };
      const expected = [
        { module: AdminModule.IAM, action: AdminAction.VIEW, allowed: true, adminUserId: 'u-2' },
        { module: AdminModule.IAM, action: AdminAction.CREATE, allowed: false, adminUserId: 'u-2' },
      ];
      users.setPermissions.mockResolvedValue(expected);

      const result = await controller.setPermissions('u-2', dto, admin);

      expect(users.setPermissions).toHaveBeenCalledWith('u-2', 'a-1', dto.permissions);
      expect(result).toEqual(expected);
    });
  });

  describe('GET /admin/users/:id/permissions (getPermissions)', () => {
    it('delegates to permissions.listFor', async () => {
      const expected = [
        { module: AdminModule.IAM, action: AdminAction.VIEW, allowed: true, adminUserId: 'u-1' },
      ];
      permissions.listFor.mockResolvedValue(expected);

      const result = await controller.getPermissions('u-1');

      expect(permissions.listFor).toHaveBeenCalledWith('u-1');
      expect(result).toEqual(expected);
    });
  });
});
