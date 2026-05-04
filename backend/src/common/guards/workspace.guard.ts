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

function propagateWorkspaceIdToBody(_req: RequestLike, _workspaceId: string): void {
  // Intencional no-op: o ValidationPipe global usa `forbidNonWhitelisted: true`,
  // o que rejeita corpos com `workspaceId` quando o DTO não declara essa
  // propriedade. O workspaceId canônico vem do JWT (`req.user.workspaceId`) e
  // já é exposto a controllers via `req.workspaceId`. Mutar `req.body` aqui
  // produzia 400 "property workspaceId should not exist" em rotas autenticadas
  // (checkout/products/plans, KYC, etc).
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
