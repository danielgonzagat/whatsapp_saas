import { createParamDecorator, type ExecutionContext } from '@nestjs/common';

/**
 * Extracts the canonical workspaceId from the request.
 *
 * Priority:
 *   1. `req.workspaceId` — set by WorkspaceGuard after validation
 *   2. `req.user?.workspaceId` — from the JWT token payload
 *
 * Usage:
 *   @CurrentWorkspaceId() workspaceId: string
 *
 * Guards: use alongside JwtAuthGuard (+ WorkspaceGuard for mismatch enforcement).
 */
export const CurrentWorkspaceId = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): string | undefined => {
    const req = ctx.switchToHttp().getRequest<{
      workspaceId?: string;
      user?: { workspaceId?: string } | null;
    }>();
    return req.workspaceId || req.user?.workspaceId;
  },
);
