import { createParamDecorator, type ExecutionContext } from '@nestjs/common';
import type { Request } from 'express';
import type { AuthenticatedAdmin } from '../admin-token.types';

/**
 * Extracts the AuthenticatedAdmin attached to the request by AdminAuthGuard.
 * Usage: `@CurrentAdmin() admin: AuthenticatedAdmin`.
 */
export const CurrentAdmin = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): AuthenticatedAdmin => {
    const req = ctx.switchToHttp().getRequest<Request & { admin?: AuthenticatedAdmin }>();
    if (!req.admin) {
      throw new Error('CurrentAdmin used on a route that is not protected by AdminAuthGuard');
    }
    return req.admin;
  },
);
