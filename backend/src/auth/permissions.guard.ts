import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  SetMetadata,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Permission, ROLE_PERMISSIONS } from './permissions';
import { PrismaService } from '../prisma/prisma.service';

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
    const requiredPermissions = this.reflector.getAllAndOverride<Permission[]>(
      PERMISSIONS_KEY,
      [context.getHandler(), context.getClass()],
    );

    if (!requiredPermissions || requiredPermissions.length === 0) {
      return true;
    }

    const { user } = context.switchToHttp().getRequest();
    if (!user) return false;

    // 1. Fetch Agent to get custom permissions
    // We cache this in a real scenario, or put in JWT
    const agent = await this.prisma.agent.findUnique({
      where: { id: user.userId },
      select: { role: true, permissions: true },
    });

    if (!agent) return false;

    // 2. Resolve Permissions
    // Start with Role defaults
    let userPermissions = ROLE_PERMISSIONS[agent.role] || [];

    // Merge custom permissions (if any)
    if (agent.permissions && Array.isArray(agent.permissions)) {
      // If custom permissions exist, do they ADD to role or REPLACE?
      // Let's assume ADD for now, or we can treat it as a replacement set if present.
      // For "Top 1" flexibility, let's say if permissions is set, it overrides role defaults completely?
      // Or maybe it's an additive list. Let's go with additive for simplicity + override.
      userPermissions = [
        ...new Set([...userPermissions, ...agent.permissions]),
      ];
    }

    // 3. Check
    const hasPermission = requiredPermissions.every((p) =>
      userPermissions.includes(p),
    );

    if (!hasPermission) {
      throw new ForbiddenException('Permissão insuficiente para esta ação');
    }

    return true;
  }
}
