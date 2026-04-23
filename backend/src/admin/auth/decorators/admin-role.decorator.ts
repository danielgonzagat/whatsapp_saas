import { SetMetadata } from '@nestjs/common';
import type { AdminRole } from '@prisma/client';

/** Admin_role_key. */
export const ADMIN_ROLE_METADATA = 'adminRole';

/**
 * Restricts a route to one or more admin roles.
 * Usage: `@RequireAdminRole('OWNER')` or `@RequireAdminRole('OWNER', 'MANAGER')`.
 */
export const RequireAdminRole = (...roles: AdminRole[]) => SetMetadata(ADMIN_ROLE_METADATA, roles);
