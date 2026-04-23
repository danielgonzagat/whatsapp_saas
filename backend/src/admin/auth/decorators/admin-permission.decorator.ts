import { SetMetadata } from '@nestjs/common';
import type { AdminAction, AdminModule } from '@prisma/client';

/** Admin_permission_key. */
export const ADMIN_PERMISSION_METADATA = 'adminPermission';

/** Admin permission requirement shape. */
export interface AdminPermissionRequirement {
  /** Module property. */
  module: AdminModule;
  /** Action property. */
  action: AdminAction;
}

/**
 * Restricts a route to admins with a specific (module, action) permission.
 * OWNER bypasses this check. See AdminPermissionGuard.
 */
export const RequireAdminPermission = (module: AdminModule, action: AdminAction) =>
  SetMetadata(ADMIN_PERMISSION_METADATA, { module, action } satisfies AdminPermissionRequirement);
