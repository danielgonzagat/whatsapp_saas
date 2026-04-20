import { SetMetadata } from '@nestjs/common';

/** Admin_public_key. */
export const ADMIN_PUBLIC_KEY = 'adminPublic';

/**
 * Marks a route as not requiring any admin authentication. Used on the
 * initial login endpoint. AdminAuthGuard short-circuits on this marker.
 */
export const AdminPublic = () => SetMetadata(ADMIN_PUBLIC_KEY, true);
