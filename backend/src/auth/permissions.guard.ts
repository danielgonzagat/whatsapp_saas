import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  SetMetadata,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PrismaService } from '../prisma/prisma.service';
import { Permission, ROLE_PERMISSIONS } from './permissions';

export const PERMISSIONS_KEY = 'permissions';
export const RequirePermissions = (...permissions: Permission[]) =>
  SetMetadata(PERMISSIONS_KEY, permissions);

@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(
    private reflector: Reflector,
    private prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const requiredPermissions = this.getRequiredPermissions(context);
    if (requiredPermissions.length === 0) {
      return true;
    }

    const { user } = context.switchToHttp().getRequest();
    if (!user?.sub) {
      return false;
    }

    const agent = await this.prisma.agent.findUnique({
      where: { id: user.sub },
      select: { role: true, permissions: true },
    });
    if (!agent) {
      return false;
    }

    const userPermissions = mergeAgentPermissions(agent.role, agent.permissions);
    const hasPermission = requiredPermissions.every((p) => userPermissions.includes(p));
    if (!hasPermission) {
      throw new ForbiddenException('Permissão insuficiente para esta ação');
    }

    return true;
  }

  private getRequiredPermissions(context: ExecutionContext): Permission[] {
    const resolved = this.reflector.getAllAndOverride<Permission[]>(PERMISSIONS_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    return Array.isArray(resolved) ? resolved : [];
  }
}

function mergeAgentPermissions(role: string, customPermissions: unknown): Permission[] {
  const rolePermissions =
    (ROLE_PERMISSIONS as Record<string, Permission[] | undefined>)[role] ?? [];
  if (!Array.isArray(customPermissions)) {
    return rolePermissions;
  }
  return [...new Set([...rolePermissions, ...(customPermissions as Permission[])])];
}
