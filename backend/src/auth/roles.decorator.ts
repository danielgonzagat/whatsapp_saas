import { SetMetadata } from '@nestjs/common';

/** Roles metadata. */
export const ROLES_METADATA = 'roles';
/** Roles. */
export const Roles = (...roles: string[]) => SetMetadata(ROLES_METADATA, roles);
