import { Request } from 'express';
import { JwtPayload } from './jwt-payload.interface';

/**
 * Request after JwtAuthGuard has attached the decoded token to `request.user`.
 * WorkspaceGuard may also set `request.workspaceId`.
 */
export interface AuthenticatedRequest extends Request {
  user: JwtPayload;
  /** Propagated by WorkspaceGuard from the token's workspaceId */
  workspaceId?: string;
}

/**
 * Request with raw body buffer — used by webhook endpoints that need
 * to verify signatures (Stripe, Meta, etc.).
 */
export interface RawBodyRequest extends Request {
  rawBody?: Buffer;
}
