import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { JwtPayload } from '../interfaces/jwt-payload.interface';

/**
 * Extract the authenticated user (or a specific field) from the request.
 *
 * Usage:
 *   @CurrentUser() user: JwtPayload          // full payload
 *   @CurrentUser('workspaceId') ws: string    // single field
 */
export const CurrentUser = createParamDecorator(
  (data: keyof JwtPayload | undefined, ctx: ExecutionContext) => {
    const request = ctx.switchToHttp().getRequest();
    const user: JwtPayload | null | undefined = request.user;
    return data ? user?.[data] : (user ?? undefined);
  },
);
