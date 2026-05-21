import { ExecutionContext, Injectable } from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';
import { createHash } from 'node:crypto';

function sha256(text: string): string {
  return createHash('sha256').update(text).digest('hex');
}

type RequestLike = {
  ip?: string;
  userId?: string;
  workspaceId?: string;
  params?: Record<string, string | undefined>;
  headers?: Record<string, string | string[] | undefined>;
};

function resolveUserId(req: RequestLike): string | undefined {
  const user = (req as Record<string, unknown>).user as { sub?: string } | undefined;
  if (user?.sub) {
    return user.sub;
  }
  return undefined;
}

function resolveWorkspaceId(req: RequestLike): string | undefined {
  if (req.workspaceId) {
    return req.workspaceId;
  }
  const paramId = req.params?.workspaceId;
  if (typeof paramId === 'string' && paramId.length > 0) {
    return paramId;
  }
  const headerId = req.headers?.['x-workspace-id'];
  if (typeof headerId === 'string' && headerId.length > 0) {
    return headerId;
  }
  return undefined;
}

/**
 * Global throttler guard with per-tenant, per-user key extraction.
 *
 * Extends the standard {@link ThrottlerGuard} to:
 * - Include the resolved workspace/tenant identifier and userId in every
 *   storage key so rate budgets are isolated.
 * - Bypass rate-limiting entirely when the runtime is a non-production
 *   test harness.
 *
 * Route-class bucket selection is handled by the `skipIf` predicates
 * defined in {@link THROTTLE_TIERS}, which read the `@RouteClass(...)`
 * decorator metadata.
 */
@Injectable()
export class RouteClassGuard extends ThrottlerGuard {
  protected override async shouldSkip(_context: ExecutionContext): Promise<boolean> {
    if (process.env.NODE_ENV === 'production') {
      return false;
    }
    if (process.env.JEST_WORKER_ID) {
      return true;
    }
    if (process.env.NODE_ENV === 'test') {
      return true;
    }
    if (process.env.E2E_TEST_MODE === 'true') {
      return true;
    }
    if (process.env.OPENAI_API_KEY === 'e2e-dummy-key') {
      return true;
    }
    return false;
  }

  protected override generateKey(context: ExecutionContext, suffix: string, name: string): string {
    const req = context.switchToHttp().getRequest<RequestLike>();
    const tenant = resolveWorkspaceId(req);
    const user = resolveUserId(req);
    const prefix = `${context.getClass().name}-${context.getHandler().name}-${name}`;

    const parts: string[] = [suffix];
    if (tenant) {
      parts.push(`tenant:${tenant}`);
    }
    if (user) {
      parts.push(`user:${user}`);
    }

    return sha256(`${prefix}-${parts.join('-')}`);
  }
}
