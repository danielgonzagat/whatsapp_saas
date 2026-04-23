import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ROLES_METADATA } from './roles.decorator';

/** Roles guard. */
@Injectable()
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

    const { user } = context.switchToHttp().getRequest();
    if (!user?.role || !requiredRoles.includes(user.role)) {
      throw new ForbiddenException('Permissão insuficiente');
    }
    return true;
  }
}
