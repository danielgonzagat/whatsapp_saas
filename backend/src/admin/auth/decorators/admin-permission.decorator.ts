import { SetMetadata } from '@nestjs/common';
import type { AdminAction, AdminModule } from '@prisma/client';

/** Admin_permission_key. */
export const ADMIN_PERMISSION_KEY = 'adminPermission';

/** Admin permission requirement shape. */
export interface AdminPermissionRequirement {
  module: AdminModule;
  action: AdminAction;
}

/**
 * Restricts a route to admins with a specific (module, action) permission.
 * OWNER bypasses this check. See AdminPermissionGuard.
 */
export const RequireAdminPermission = (module: AdminModule, action: AdminAction) =>
  SetMetadata(ADMIN_PERMISSION_KEY, { module, action } satisfies AdminPermissionRequirement);
