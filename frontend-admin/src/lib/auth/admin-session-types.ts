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
  state: Exclude<LoginState, 'authenticated'>;
  token: string;
}

/** Authenticated session shape. */
export interface AuthenticatedSession {
  state: 'authenticated';
  accessToken: string;
  refreshToken: string;
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
  otpauthUrl: string;
  qrDataUrl: string;
}
