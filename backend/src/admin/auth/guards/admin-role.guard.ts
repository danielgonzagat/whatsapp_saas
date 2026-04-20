import { type CanActivate, type ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { AdminRole } from '@prisma/client';
import type { Request } from 'express';
import { adminErrors } from '../../common/admin-api-errors';
import type { AuthenticatedAdmin } from '../admin-token.types';
import { ADMIN_ROLE_KEY } from '../decorators/admin-role.decorator';

/** Admin role guard. */
@Injectable()
export class AdminRoleGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<AdminRole[] | undefined>(ADMIN_ROLE_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!required || required.length === 0) {
      return true;
    }

    const req = context.switchToHttp().getRequest<Request & { admin?: AuthenticatedAdmin }>();
    if (!req.admin) {
      throw adminErrors.invalidToken();
    }
    if (!required.includes(req.admin.role)) {
      if (required.length === 1 && required[0] === 'OWNER') {
        throw adminErrors.ownerRequired();
      }
      throw adminErrors.forbidden();
    }
    return true;
  }
}
