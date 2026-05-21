import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  SetMetadata,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtPayload } from '../interfaces/jwt-payload.interface';

/** Metadata key for admin-global-operation. */
export const ADMIN_GLOBAL_OPERATION_KEY = 'adminGlobalOperation';

/**
 * Marks a controller method as a platform-admin global operation that is
 * allowed to query across workspace boundaries.
 *
 * Use this when the operation genuinely needs system-wide scope (e.g.
 * credential rotation, cross-workspace audit, platform maintenance).
 *
 * Usage:
 *   @AdminGlobalOperation('audit log aggregation across workspaces')
 *
 * The guard rejects non-ADMIN callers with ForbiddenException.
 */
export const AdminGlobalOperation = (reason: string) =>
  SetMetadata(ADMIN_GLOBAL_OPERATION_KEY, reason);

/** Guard that enforces @AdminGlobalOperation. */
@Injectable()
export class AdminGlobalOperationGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const reason = this.reflector.getAllAndOverride<string | undefined>(
      ADMIN_GLOBAL_OPERATION_KEY,
      [context.getHandler(), context.getClass()],
    );
    if (!reason) {
      return true;
    }
    const request = context.switchToHttp().getRequest<{ user?: JwtPayload }>();
    const user: JwtPayload | undefined = request.user;
    if (!user || user.role !== 'ADMIN') {
      throw new ForbiddenException(
        'Apenas administradores da plataforma podem executar esta operação.',
      );
    }
    return true;
  }
}
