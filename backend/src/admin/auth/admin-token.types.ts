import type { AdminRole } from '@prisma/client';

/**
 * Scope of a JWT issued by AdminAuthService. Used to gate what each token can
 * do: a `password_change` token only unlocks POST /admin/auth/change-password,
 * an `mfa_setup` token only unlocks the MFA setup endpoints, etc.
 */
export type AdminTokenScope = 'password_change' | 'mfa_setup' | 'mfa_verify' | 'full';

export interface AdminJwtPayload {
  sub: string; // admin_users.id
  scope: AdminTokenScope;
  aud: 'adm.kloel.com';
  iat: number;
  exp: number;
  sid?: string; // admin_sessions.id, only on `full` scope
}

/**
 * Authenticated admin snapshot attached to req.admin by AdminAuthGuard.
 */
export interface AuthenticatedAdmin {
  id: string;
  name: string;
  email: string;
  role: AdminRole;
  sessionId: string;
  scope: AdminTokenScope;
}
