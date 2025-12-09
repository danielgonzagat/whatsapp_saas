import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';

/**
 * Garante que o workspaceId do token corresponda ao workspaceId da rota ou payload.
 * Caso não haja workspaceId explícito na requisição, aplica o do usuário autenticado.
 */
@Injectable()
export class WorkspaceGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest();
    const userWorkspace = req.user?.workspaceId;

    const workspaceFromRequest =
      req.params?.workspaceId ||
      req.body?.workspaceId ||
      req.query?.workspaceId ||
      req.headers?.['x-workspace-id'];

    // Se não temos usuário autenticado, deixa outro guard (ex: JwtAuthGuard) decidir
    if (!userWorkspace) {
      return true;
    }

    const workspaceId = workspaceFromRequest || userWorkspace;

    // Propaga para camadas seguintes para evitar fallback errado
    if (!req.workspaceId) req.workspaceId = workspaceId;
    if (!req.body?.workspaceId && workspaceId) req.body.workspaceId = workspaceId;

    if (workspaceId !== userWorkspace) {
      throw new ForbiddenException('workspace_mismatch');
    }

    return true;
  }
}