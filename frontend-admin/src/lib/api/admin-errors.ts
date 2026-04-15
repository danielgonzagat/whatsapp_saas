/**
 * Mirrors the AdminErrorCode type from the backend
 * (backend/src/admin/common/admin-api-errors.ts). The frontend branches on
 * `code` to decide what screen to render next (password change / MFA setup /
 * MFA verify / authenticated).
 */
export type AdminErrorCode =
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
  | 'admin.internal.crypto_failure';

export interface AdminApiErrorShape {
  code: AdminErrorCode | string;
  message: string;
  [extra: string]: unknown;
}

export class AdminApiClientError extends Error {
  readonly code: string;
  readonly status: number;
  readonly extra: Record<string, unknown>;

  constructor(status: number, payload: AdminApiErrorShape) {
    super(payload.message || 'Erro desconhecido');
    this.name = 'AdminApiClientError';
    this.code = payload.code;
    this.status = status;
    this.extra = payload;
  }
}
