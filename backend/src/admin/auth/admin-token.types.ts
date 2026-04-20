import type { AdminRole } from '@prisma/client';

/**
 * Scope of a JWT issued by AdminAuthService. Used to gate what each token can
 * do: a `password_change` token only unlocks POST /admin/auth/change-password,
 * an `mfa_setup` token only unlocks the MFA setup endpoints, etc.
 */
export type AdminTokenScope = 'password_change' | 'mfa_setup' | 'mfa_verify' | 'full';

/** Admin jwt payload shape. */
export interface AdminJwtPayload {
  /** Sub property. */
  sub: string; // admin_users.id
  /** Scope property. */
  scope: AdminTokenScope;
  /** Aud property. */
  aud: 'adm.kloel.com';
  /** Iat property. */
  iat: number;
  /** Exp property. */
  exp: number;
  /** Sid property. */
  sid?: string; // admin_sessions.id, only on `full` scope
}

/**
 * Authenticated admin snapshot attached to req.admin by AdminAuthGuard.
 */
export interface AuthenticatedAdmin {
  /** Id property. */
  id: string;
  /** Name property. */
  name: string;
  /** Email property. */
  email: string;
  /** Role property. */
  role: AdminRole;
  /** Session id property. */
  sessionId: string;
  /** Scope property. */
  scope: AdminTokenScope;
}
