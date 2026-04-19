/**
 * Shape of the decoded JWT token payload.
 * Must mirror what auth.service.ts#signToken produces.
 */
export interface JwtPayload {
  /** Agent/user ID */
  sub: string;
  email: string;
  workspaceId: string;
  role: string;
  name?: string;
  sessionId?: string;
  /** Issued-at (auto-added by jsonwebtoken) */
  iat?: number;
  /** Expiration (auto-added by jsonwebtoken) */
  exp?: number;
}
