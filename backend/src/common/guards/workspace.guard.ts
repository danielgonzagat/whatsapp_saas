import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';

type RequestLike = {
  user?: { workspaceId?: string };
  params?: Record<string, string | undefined>;
  body?: Record<string, unknown> | null;
  query?: Record<string, string | undefined>;
  headers?: Record<string, string | string[] | undefined>;
  workspaceId?: string;
};

function resolveRequestedWorkspaceId(req: RequestLike): string | string[] | undefined {
  return (
    req.params?.workspaceId ||
    (req.body?.workspaceId as string | undefined) ||
    req.query?.workspaceId ||
    req.headers?.['x-workspace-id']
  );
}

function propagateWorkspaceIdToBody(req: RequestLike, workspaceId: string): void {
  if (req.body && typeof req.body === 'object' && !req.body.workspaceId) {
    req.body.workspaceId = workspaceId;
  }
}

/**
 * Garante que o workspaceId do token corresponda ao workspaceId da rota ou payload.
 * Caso não haja workspaceId explícito na requisição, aplica o do usuário autenticado.
 */
@Injectable()
export class WorkspaceGuard implements CanActivate {
  /** Can activate. */
  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest<RequestLike>();
    const userWorkspace = req.user?.workspaceId;

    // Se não temos usuário autenticado, deixa outro guard (ex: JwtAuthGuard) decidir
    if (!userWorkspace) {
      return true;
    }

    const workspaceFromRequest = resolveRequestedWorkspaceId(req);

    // Regra: workspace SEMPRE vem do token. Qualquer workspaceId explícito só pode ser redundante e igual.
    if (workspaceFromRequest && workspaceFromRequest !== userWorkspace) {
      throw new ForbiddenException('workspace_mismatch');
    }

    // Propaga para camadas seguintes (sempre do token)
    req.workspaceId = userWorkspace;
    propagateWorkspaceIdToBody(req, userWorkspace);

    return true;
  }
}
