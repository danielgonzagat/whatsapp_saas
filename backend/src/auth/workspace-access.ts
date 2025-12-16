import { ForbiddenException, Logger, UnauthorizedException } from '@nestjs/common';

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
    Logger.warn(
      'AUTH_OPTIONAL=true em produção deixa endpoints acessíveis sem token. Desative para segurança.',
      'Auth',
    );
  }

  // Dev/optional mode: permite somente workspace explícito (NUNCA fallback default)
  if (optional && (!user || !user.workspaceId)) {
    if (process.env.NODE_ENV === 'production') {
      throw new UnauthorizedException('Token obrigatório');
    }
    if (!requested) {
      throw new UnauthorizedException('workspaceId explícito obrigatório (AUTH_OPTIONAL)');
    }
    return requested;
  }

  if (!user || !user.workspaceId) {
    throw new UnauthorizedException('Token obrigatório');
  }

  // Regra: workspace efetivo é o do token. O requested só pode existir se for igual.
  if (requested && requested !== user.workspaceId) {
    throw new ForbiddenException('Acesso negado a este workspace');
  }
  return user.workspaceId;
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
