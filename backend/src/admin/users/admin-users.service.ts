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
    if (existing) throw adminErrors.emailInUse();

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
    if (!user) throw adminErrors.userNotFound();
    return this.serialize(user);
  }

  async findMe(id: string) {
    return this.findById(id);
  }

  async update(id: string, patch: UpdateAdminUserInput) {
    const current = await this.prisma.adminUser.findUnique({ where: { id } });
    if (!current) throw adminErrors.userNotFound();

    // I-ADMIN-6: only OWNER can promote to OWNER.
    if (patch.role === AdminRole.OWNER && patch.actorRole !== AdminRole.OWNER) {
      throw adminErrors.cannotCreateOwner();
    }
    // Non-OWNER cannot demote an OWNER.
    if (current.role === AdminRole.OWNER && patch.actorRole !== AdminRole.OWNER) {
      throw adminErrors.ownerRequired();
    }

    const data: Prisma.AdminUserUpdateInput = {};
    if (patch.name !== undefined) data.name = patch.name.trim();
    if (patch.status !== undefined) data.status = patch.status;
    if (patch.role !== undefined && patch.role !== current.role) {
      data.role = patch.role;
    }

    const updated = await this.prisma.adminUser.update({ where: { id }, data });

    // If role changed, re-seed default permissions so the matrix matches.
    if (patch.role !== undefined && patch.role !== current.role) {
      await this.prisma.adminPermission.deleteMany({ where: { adminUserId: id } });
      await this.permissions.seedDefaults(id, updated.role);
    }

    await this.audit.append({
      adminUserId: patch.actorId,
      action: 'admin.users.updated',
      entityType: 'AdminUser',
      entityId: id,
      details: {
        before: { role: current.role, status: current.status, name: current.name },
        after: {
          role: patch.role ?? null,
          status: patch.status ?? null,
          name: patch.name ?? null,
        },
      },
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
    if (!target) throw adminErrors.userNotFound();
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
    if (!user) return null;
    // Never return passwordHash or mfaSecret to the client.
    const { passwordHash: _pw, mfaSecret: _mfa, ...safe } = user;
    void _pw;
    void _mfa;
    return safe;
  }
}
