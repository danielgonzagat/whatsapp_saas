import { Injectable } from '@nestjs/common';
import { AdminRole, AdminUserStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { AdminAuditService } from '../audit/admin-audit.service';
import { AdminAuthService } from '../auth/admin-auth.service';
import { adminErrors } from '../common/admin-api-errors';
import { AdminPermissionsService } from '../permissions/admin-permissions.service';

export interface CreateAdminUserInput {
  name: string;
  email: string;
  temporaryPassword: string;
  role: AdminRole;
  createdById: string;
  createdByRole: AdminRole;
}

export interface UpdateAdminUserInput {
  name?: string;
  role?: AdminRole;
  status?: AdminUserStatus;
  actorRole: AdminRole;
  actorId: string;
}

@Injectable()
export class AdminUsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly permissions: AdminPermissionsService,
    private readonly audit: AdminAuditService,
  ) {}

  async create(input: CreateAdminUserInput) {
    // I-ADMIN-6: only OWNER can create OWNER.
    if (input.role === AdminRole.OWNER && input.createdByRole !== AdminRole.OWNER) {
      throw adminErrors.cannotCreateOwner();
    }

    const email = input.email.trim().toLowerCase();
    const existing = await this.prisma.adminUser.findUnique({ where: { email } });
    if (existing) {
      throw adminErrors.emailInUse();
    }

    const passwordHash = await AdminAuthService.hashPassword(input.temporaryPassword);

    const user = await this.prisma.adminUser.create({
      data: {
        name: input.name.trim(),
        email,
        passwordHash,
        role: input.role,
        status: AdminUserStatus.ACTIVE,
        mfaPendingSetup: true,
        mfaEnabled: false,
        passwordChangeRequired: true,
        createdById: input.createdById,
      },
    });

    await this.permissions.seedDefaults(user.id, user.role);
    await this.audit.append({
      adminUserId: input.createdById,
      action: 'admin.users.created',
      entityType: 'AdminUser',
      entityId: user.id,
      details: { role: user.role, email: user.email },
    });

    return this.serialize(user);
  }

  async list() {
    const users = await this.prisma.adminUser.findMany({
      orderBy: { createdAt: 'desc' },
    });
    return users.map((u) => this.serialize(u));
  }

  async findById(id: string) {
    const user = await this.prisma.adminUser.findUnique({ where: { id } });
    if (!user) {
      throw adminErrors.userNotFound();
    }
    return this.serialize(user);
  }

  async findMe(id: string) {
    return this.findById(id);
  }

  private assertAdminUpdateAllowed(
    current: { role: AdminRole },
    patch: UpdateAdminUserInput,
  ): void {
    const actorIsOwner = patch.actorRole === AdminRole.OWNER;
    // I-ADMIN-6: only OWNER can promote to OWNER.
    if (patch.role === AdminRole.OWNER && !actorIsOwner) {
      throw adminErrors.cannotCreateOwner();
    }
    // Non-OWNER cannot demote an OWNER.
    if (current.role === AdminRole.OWNER && !actorIsOwner) {
      throw adminErrors.ownerRequired();
    }
  }

  private isRoleChange(
    patch: UpdateAdminUserInput,
    currentRole: AdminRole,
  ): patch is UpdateAdminUserInput & { role: AdminRole } {
    return patch.role !== undefined && patch.role !== currentRole;
  }

  private buildAdminUserUpdateData(
    patch: UpdateAdminUserInput,
    currentRole: AdminRole,
  ): Prisma.AdminUserUpdateInput {
    const data: Prisma.AdminUserUpdateInput = {};
    if (patch.name !== undefined) {
      data.name = patch.name.trim();
    }
    if (patch.status !== undefined) {
      data.status = patch.status;
    }
    if (this.isRoleChange(patch, currentRole)) {
      data.role = patch.role;
    }
    return data;
  }

  private async reseedPermissionsForRoleChange(id: string, role: AdminRole): Promise<void> {
    await this.prisma.adminPermission.deleteMany({ where: { adminUserId: id } });
    await this.permissions.seedDefaults(id, role);
  }

  private buildUpdateAuditDetails(
    current: { role: AdminRole; status: AdminUserStatus; name: string },
    patch: UpdateAdminUserInput,
  ): Prisma.InputJsonValue {
    return {
      before: { role: current.role, status: current.status, name: current.name },
      after: {
        role: patch.role ?? null,
        status: patch.status ?? null,
        name: patch.name ?? null,
      },
    };
  }

  async update(id: string, patch: UpdateAdminUserInput) {
    const current = await this.prisma.adminUser.findUnique({ where: { id } });
    if (!current) {
      throw adminErrors.userNotFound();
    }

    this.assertAdminUpdateAllowed(current, patch);

    const data = this.buildAdminUserUpdateData(patch, current.role);
    const updated = await this.prisma.adminUser.update({ where: { id }, data });

    if (this.isRoleChange(patch, current.role)) {
      await this.reseedPermissionsForRoleChange(id, updated.role);
    }

    await this.audit.append({
      adminUserId: patch.actorId,
      action: 'admin.users.updated',
      entityType: 'AdminUser',
      entityId: id,
      details: this.buildUpdateAuditDetails(current, patch),
    });

    return this.serialize(updated);
  }

  async setPermissions(
    targetId: string,
    actorId: string,
    permissions: Array<{
      module: import('@prisma/client').AdminModule;
      action: import('@prisma/client').AdminAction;
      allowed: boolean;
    }>,
  ) {
    const target = await this.prisma.adminUser.findUnique({ where: { id: targetId } });
    if (!target) {
      throw adminErrors.userNotFound();
    }
    await this.permissions.replace(targetId, target.role, permissions);
    await this.audit.append({
      adminUserId: actorId,
      action: 'admin.users.permissions_replaced',
      entityType: 'AdminUser',
      entityId: targetId,
      details: { count: permissions.length },
    });
    return this.permissions.listFor(targetId);
  }

  private serialize(user: Awaited<ReturnType<PrismaService['adminUser']['findUnique']>>) {
    if (!user) {
      return null;
    }
    // Never return passwordHash or mfaSecret to the client.
    const { passwordHash: _pw, mfaSecret: _mfa, ...safe } = user;
    void _pw;
    void _mfa;
    return safe;
  }
}
