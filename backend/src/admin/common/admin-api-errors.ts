import { HttpException, HttpStatus } from '@nestjs/common';

/**
 * Shared error shapes for the admin module. Each class maps to a distinct
 * client-facing error code so the frontend can branch on the state machine
 * transitions (password_change_required → mfa_setup_required → mfa_required
 * → authenticated) without parsing messages.
 */

type AdminErrorCode =
  | 'admin.auth.invalid_credentials'
  | 'admin.auth.account_locked'
  | 'admin.auth.rate_limited'
  | 'admin.auth.invalid_token'
  | 'admin.auth.token_expired'
  | 'admin.auth.password_change_required'
  | 'admin.auth.mfa_setup_required'
  | 'admin.auth.mfa_required'
  | 'admin.auth.mfa_invalid_code'
  | 'admin.auth.user_suspended'
  | 'admin.auth.user_deactivated'
  | 'admin.authz.forbidden'
  | 'admin.authz.owner_required'
  | 'admin.authz.permission_denied'
  | 'admin.users.email_in_use'
  | 'admin.users.cannot_create_owner'
  | 'admin.users.not_found'
  | 'admin.sessions.not_found'
  | 'admin.sessions.cannot_revoke_other'
  | 'admin.audit.immutable'
  | 'admin.internal.crypto_failure'
  | 'admin.destructive.not_found'
  | 'admin.destructive.invalid_state'
  | 'admin.destructive.expired'
  | 'admin.destructive.challenge_mismatch'
  | 'admin.destructive.handler_missing'
  | 'admin.destructive.undo_token_invalid';

class AdminApiError extends HttpException {
  constructor(
    code: AdminErrorCode,
    message: string,
    status: HttpStatus,
    extra?: Record<string, unknown>,
  ) {
    super({ code, message, ...extra }, status);
  }
}

/** Admin errors. */
export const adminErrors = {
  invalidCredentials: () =>
    new AdminApiError(
      'admin.auth.invalid_credentials',
      'Credenciais inválidas.',
      HttpStatus.UNAUTHORIZED,
    ),
  accountLocked: (until: Date) =>
    new AdminApiError(
      'admin.auth.account_locked',
      'Conta temporariamente bloqueada por excesso de tentativas. Tente novamente mais tarde.',
      HttpStatus.TOO_MANY_REQUESTS,
      { lockedUntil: until.toISOString() },
    ),
  rateLimited: () =>
    new AdminApiError(
      'admin.auth.rate_limited',
      'Muitas tentativas em pouco tempo. Aguarde alguns minutos.',
      HttpStatus.TOO_MANY_REQUESTS,
    ),
  invalidToken: () =>
    new AdminApiError(
      'admin.auth.invalid_token',
      'Sessão inválida. Faça login novamente.',
      HttpStatus.UNAUTHORIZED,
    ),
  tokenExpired: () =>
    new AdminApiError(
      'admin.auth.token_expired',
      'Sessão expirada. Faça login novamente.',
      HttpStatus.UNAUTHORIZED,
    ),
  passwordChangeRequired: (changeToken: string) =>
    new AdminApiError(
      'admin.auth.password_change_required',
      'É necessário trocar a senha antes de continuar.',
      HttpStatus.UNAUTHORIZED,
      { state: 'password_change_required', changeToken },
    ),
  mfaSetupRequired: (setupToken: string) =>
    new AdminApiError(
      'admin.auth.mfa_setup_required',
      'Configure o segundo fator (2FA) antes de continuar.',
      HttpStatus.UNAUTHORIZED,
      { state: 'mfa_setup_required', setupToken },
    ),
  mfaRequired: (mfaToken: string) =>
    new AdminApiError(
      'admin.auth.mfa_required',
      'Código do segundo fator necessário.',
      HttpStatus.UNAUTHORIZED,
      { state: 'mfa_required', mfaToken },
    ),
  mfaInvalidCode: () =>
    new AdminApiError('admin.auth.mfa_invalid_code', 'Código inválido.', HttpStatus.UNAUTHORIZED),
  userSuspended: () =>
    new AdminApiError(
      'admin.auth.user_suspended',
      'Conta suspensa. Contate um administrador.',
      HttpStatus.FORBIDDEN,
    ),
  userDeactivated: () =>
    new AdminApiError('admin.auth.user_deactivated', 'Conta desativada.', HttpStatus.FORBIDDEN),
  forbidden: () =>
    new AdminApiError('admin.authz.forbidden', 'Acesso negado.', HttpStatus.FORBIDDEN),
  ownerRequired: () =>
    new AdminApiError(
      'admin.authz.owner_required',
      'Somente Owners podem realizar esta ação.',
      HttpStatus.FORBIDDEN,
    ),
  permissionDenied: (module: string, action: string) =>
    new AdminApiError(
      'admin.authz.permission_denied',
      `Permissão ${action} em ${module} não concedida.`,
      HttpStatus.FORBIDDEN,
      { module, action },
    ),
  emailInUse: () =>
    new AdminApiError(
      'admin.users.email_in_use',
      'Já existe uma conta admin com esse email.',
      HttpStatus.CONFLICT,
    ),
  cannotCreateOwner: () =>
    new AdminApiError(
      'admin.users.cannot_create_owner',
      'Somente Owners podem criar outros Owners.',
      HttpStatus.FORBIDDEN,
    ),
  userNotFound: () =>
    new AdminApiError('admin.users.not_found', 'Admin não encontrado.', HttpStatus.NOT_FOUND),
  sessionNotFound: () =>
    new AdminApiError('admin.sessions.not_found', 'Sessão não encontrada.', HttpStatus.NOT_FOUND),
  cannotRevokeOther: () =>
    new AdminApiError(
      'admin.sessions.cannot_revoke_other',
      'Você não pode revogar sessões de outros administradores.',
      HttpStatus.FORBIDDEN,
    ),
  cryptoFailure: () =>
    new AdminApiError(
      'admin.internal.crypto_failure',
      'Falha interna ao processar dados sensíveis.',
      HttpStatus.INTERNAL_SERVER_ERROR,
    ),
  destructiveNotFound: (id: string) =>
    new AdminApiError(
      'admin.destructive.not_found',
      `DestructiveIntent ${id} não encontrado.`,
      HttpStatus.NOT_FOUND,
    ),
  destructiveInvalidState: (id: string, message: string) =>
    new AdminApiError(
      'admin.destructive.invalid_state',
      `${message} (intent ${id}).`,
      HttpStatus.CONFLICT,
    ),
  destructiveExpired: (id: string) =>
    new AdminApiError('admin.destructive.expired', `Intent ${id} expirou.`, HttpStatus.GONE),
  destructiveChallengeMismatch: () =>
    new AdminApiError(
      'admin.destructive.challenge_mismatch',
      'Challenge inválido.',
      HttpStatus.UNAUTHORIZED,
    ),
  destructiveHandlerMissing: (kind: string) =>
    new AdminApiError(
      'admin.destructive.handler_missing',
      `Nenhum handler registrado para ${kind}.`,
      HttpStatus.NOT_IMPLEMENTED,
    ),
  destructiveUndoTokenInvalid: () =>
    new AdminApiError(
      'admin.destructive.undo_token_invalid',
      'Token de undo inválido.',
      HttpStatus.UNAUTHORIZED,
    ),
};
