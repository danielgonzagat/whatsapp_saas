import { ForbiddenException, UnauthorizedException } from '@nestjs/common';

/**
 * Assegura que o usuário autenticado tem acesso ao workspace solicitado.
 * - Se não houver user → Unauthorized
 * - Se workspaceId for passado e diferente do do token → Forbidden
 * - Caso contrário, retorna o workspaceId efetivo (do token)
 */
export function assertWorkspaceAccess(
  requested: string | undefined,
  user: any,
): string {
  const optional = process.env.AUTH_OPTIONAL === 'true';
  if (optional && process.env.NODE_ENV === 'production') {
    console.warn(
      '⚠️ AUTH_OPTIONAL=true em produção deixa endpoints acessíveis sem token. Desative para segurança.',
    );
  }

  // Dev/optional mode: allow explicit workspace or fallback to 'default'
  if (optional && (!user || !user.workspaceId)) {
    return requested || 'default';
  }

  if (!user || !user.workspaceId) {
    throw new UnauthorizedException('Token obrigatório');
  }

  const effective = requested || user.workspaceId;
  if (effective !== user.workspaceId) {
    throw new ForbiddenException('Acesso negado a este workspace');
  }
  return effective;
}

/**
 * Resolve um workspaceId válido a partir do request + validação de acesso.
 * - Tenta explicit > params > body > query
 * - Exige token válido (req.user)
 */
export function resolveWorkspaceId(req: any, explicit?: string): string {
  const candidate =
    explicit ??
    req?.params?.workspaceId ??
    req?.body?.workspaceId ??
    req?.query?.workspaceId;

  return assertWorkspaceAccess(candidate, req?.user);
}
