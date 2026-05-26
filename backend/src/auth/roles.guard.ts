import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ROLES_METADATA } from './roles.decorator';

/** JWT user payload as decoded by JwtAuthGuard and attached to request.user. */
interface JwtUser {
  role?: string;
}

/** Roles guard. */
@Injectable()
/**
 * @cluster whatsapp_saas/backend/auth
 * L11 multi-agent TaskGraph annotation (batched by tools/auto-pr/batch-job.mjs).
 */
export class RolesGuard implements CanActivate {
  constructor(private reflector: Reflector) {}

  /** Can activate. */
  canActivate(context: ExecutionContext): boolean {
    const requiredRoles =
      this.reflector.getAllAndOverride<string[]>(ROLES_METADATA, [
        context.getHandler(),
        context.getClass(),
      ]) || [];

    if (!requiredRoles.length) {
      return true;
    }

    const { user } = context.switchToHttp().getRequest<{ user?: JwtUser | null }>();
    if (!user?.role || !requiredRoles.includes(user.role)) {
      throw new ForbiddenException('Permissão insuficiente');
    }
    return true;
  }
}
