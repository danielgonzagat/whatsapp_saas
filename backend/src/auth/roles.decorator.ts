import { SetMetadata } from '@nestjs/common';

/** Roles_key. */
export const ROLES_KEY = 'roles';
/** Roles. */
export const Roles = (...roles: string[]) => SetMetadata(ROLES_KEY, roles);
