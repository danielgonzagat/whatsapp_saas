import { Injectable } from '@nestjs/common';
import { AdminAction, AdminModule, AdminRole } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { flattenDefaults } from './admin-permissions.defaults';

/** Admin permissions service. */
@Injectable()
export class AdminPermissionsService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Returns `true` if the given admin can perform `(module, action)`.
   *
   * Short-circuits for OWNER (I-ADMIN-7). Otherwise, consults the
   * admin_permissions rows keyed by (adminUserId, module, action) and
   * treats absence as deny (default-deny).
   */
  async allows(
    adminUserId: string,
    role: AdminRole,
    module: AdminModule,
    action: AdminAction,
  ): Promise<boolean> {
    if (role === AdminRole.OWNER) {
      return true;
    }

    const row = await this.prisma.adminPermission.findUnique({
      where: {
        adminUserId_module_action: { adminUserId, module, action },
      },
      select: { allowed: true },
    });
    return row?.allowed === true;
  }

  /**
   * Seeds the default matrix for a new admin user. Used by admin-users
   * creation flow. Idempotent via createMany + skipDuplicates.
   */
  async seedDefaults(adminUserId: string, role: AdminRole): Promise<void> {
    const rows = flattenDefaults(role).map((r) => ({
      adminUserId,
      module: r.module,
      action: r.action,
      allowed: r.allowed,
    }));
    if (rows.length === 0) {
      return;
    }
    await this.prisma.adminPermission.createMany({
      data: rows,
      skipDuplicates: true,
    });
  }

  /**
   * OWNER override — replaces the full permission set for a user. Deletes
   * existing rows and re-seeds from the provided flat list. OWNER targets
   * are rejected (OWNER uses the bypass, no rows needed).
   */
  async replace(
    adminUserId: string,
    role: AdminRole,
    permissions: Array<{ module: AdminModule; action: AdminAction; allowed: boolean }>,
  ): Promise<void> {
    if (role === AdminRole.OWNER) {
      return;
    }
    await this.prisma.$transaction([
      this.prisma.adminPermission.deleteMany({ where: { adminUserId } }),
      this.prisma.adminPermission.createMany({
        data: permissions.map((p) => ({
          adminUserId,
          module: p.module,
          action: p.action,
          allowed: p.allowed,
        })),
        skipDuplicates: true,
      }),
    ]);
  }

  /** List for. */
  async listFor(adminUserId: string) {
    return this.prisma.adminPermission.findMany({
      where: { adminUserId },
      orderBy: [{ module: 'asc' }, { action: 'asc' }],
    });
  }
}
