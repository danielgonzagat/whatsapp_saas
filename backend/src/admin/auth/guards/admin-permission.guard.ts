import { type CanActivate, type ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AdminRole } from '@prisma/client';
import type { Request } from 'express';
import { adminErrors } from '../../common/admin-api-errors';
import { AdminPermissionsService } from '../../permissions/admin-permissions.service';
import type { AuthenticatedAdmin } from '../admin-token.types';
import {
  ADMIN_PERMISSION_KEY,
  type AdminPermissionRequirement,
} from '../decorators/admin-permission.decorator';

@Injectable()
export class AdminPermissionGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly permissions: AdminPermissionsService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const required = this.reflector.getAllAndOverride<AdminPermissionRequirement | undefined>(
      ADMIN_PERMISSION_KEY,
      [context.getHandler(), context.getClass()],
    );
    if (!required) {
      return true;
    }

    const req = context.switchToHttp().getRequest<Request & { admin?: AuthenticatedAdmin }>();
    if (!req.admin) {
      throw adminErrors.invalidToken();
    }

    // OWNER bypass (I-ADMIN-7).
    if (req.admin.role === AdminRole.OWNER) {
      return true;
    }

    const allowed = await this.permissions.allows(
      req.admin.id,
      req.admin.role,
      required.module,
      required.action,
    );
    if (!allowed) {
      throw adminErrors.permissionDenied(required.module, required.action);
    }
    return true;
  }
}
