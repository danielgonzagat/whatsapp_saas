/** Admin role type. */
export type AdminRole = 'OWNER' | 'MANAGER' | 'STAFF';

/** Login state type. */
export type LoginState =
  | 'password_change_required'
  | 'mfa_setup_required'
  | 'mfa_required'
  | 'authenticated';

/** Login state response shape. */
export interface LoginStateResponse {
  /** State property. */
  state: Exclude<LoginState, 'authenticated'>;
  /** Token property. */
  token: string;
}

/** Authenticated session shape. */
export interface AuthenticatedSession {
  /** State property. */
  state: 'authenticated';
  /** Access token property. */
  accessToken: string;
  /** Refresh token property. */
  refreshToken: string;
  /** Admin property. */
  admin: {
    id: string;
    name: string;
    email: string;
    role: AdminRole;
  };
}

/** Login response type. */
export type LoginResponse = LoginStateResponse | AuthenticatedSession;

/** Mfa setup payload shape. */
export interface MfaSetupPayload {
  /** Otpauth url property. */
  otpauthUrl: string;
  /** Qr data url property. */
  qrDataUrl: string;
}
