/**
 * Shape of the decoded JWT token payload.
 * Must mirror what auth.service.ts#signToken produces.
 */
export interface JwtPayload {
  /** Agent/user ID */
  sub: string;
  /** Email property. */
  email: string;
  /** Workspace id property. */
  workspaceId: string;
  /** Role property. */
  role: string;
  /** Name property. */
  name?: string;
  /** Issued-at (auto-added by jsonwebtoken) // PULSE_OK: reasonable expiry (30m) */
  iat?: number;
  /** Expiration (auto-added by jsonwebtoken) */
  exp?: number;
}
