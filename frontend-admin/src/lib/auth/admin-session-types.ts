export type AdminRole = 'OWNER' | 'MANAGER' | 'STAFF';

export type LoginState =
  | 'password_change_required'
  | 'mfa_setup_required'
  | 'mfa_required'
  | 'authenticated';

export interface LoginStateResponse {
  state: Exclude<LoginState, 'authenticated'>;
  token: string;
}

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

export type LoginResponse = LoginStateResponse | AuthenticatedSession;

export interface MfaSetupPayload {
  otpauthUrl: string;
  qrDataUrl: string;
}
