import { ForbiddenException, Logger, UnauthorizedException } from '@nestjs/common';

interface TokenUser {
  workspaceId?: string;
  sub?: string;
  email?: string;
}

function isAuthOptionalDevMode(): boolean {
  return process.env.AUTH_OPTIONAL === 'true' && process.env.NODE_ENV !== 'production';
}

function warnIfAuthOptionalInProduction(): void {
  if (process.env.AUTH_OPTIONAL === 'true' && process.env.NODE_ENV === 'production') {
    Logger.warn(
      'AUTH_OPTIONAL=true em produção deixa endpoints acessíveis sem token. Desative para segurança.',
      'Auth',
    );
  }
}

function resolveOptionalModeWorkspace(requested: string | undefined): string {
  if (process.env.NODE_ENV === 'production') {
    throw new UnauthorizedException('Token obrigatório');
  }
  if (!requested) {
    throw new UnauthorizedException('workspaceId explícito obrigatório (AUTH_OPTIONAL)');
  }
  return requested;
}

/**
 * Assegura que o usuário autenticado tem acesso ao workspace solicitado.
 * - Se não houver user → Unauthorized
 * - Se workspaceId for passado e diferente do do token → Forbidden
 * - Caso contrário, retorna o workspaceId efetivo (do token)
 */
export function assertWorkspaceAccess(
  requested: string | undefined,
  user: TokenUser | undefined | null,
): string {
  warnIfAuthOptionalInProduction();

  const missingToken = !user || !user.workspaceId;

  // Dev/optional mode: permite somente workspace explícito (NUNCA fallback default)
  if (isAuthOptionalDevMode() && missingToken) {
    return resolveOptionalModeWorkspace(requested);
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

function asStringOrUndefined(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined;
}

function readWorkspaceIdFrom(bag: Record<string, unknown> | undefined): string | undefined {
  return asStringOrUndefined(bag?.workspaceId);
}

function pickWorkspaceIdCandidate(
  explicit: string | undefined,
  source:
    | {
        params?: Record<string, unknown>;
        body?: Record<string, unknown>;
        query?: Record<string, unknown>;
      }
    | null
    | undefined,
): string | undefined {
  const fromExplicit = asStringOrUndefined(explicit);
  if (fromExplicit) return fromExplicit;
  const bags = [source?.params, source?.body, source?.query];
  for (const bag of bags) {
    const candidate = readWorkspaceIdFrom(bag);
    if (candidate) return candidate;
  }
  return undefined;
}

/**
 * Resolve um workspaceId válido a partir do request + validação de acesso.
 * - Tenta explicit > params > body > query
 * - Exige token válido (req.user)
 */
export function resolveWorkspaceId(
  req: {
    user?: TokenUser | null;
    params?: Record<string, unknown>;
    body?: Record<string, unknown>;
    query?: Record<string, unknown>;
  },
  explicit?: string,
): string {
  const candidate = pickWorkspaceIdCandidate(explicit, req);
  return assertWorkspaceAccess(candidate, req?.user);
}
