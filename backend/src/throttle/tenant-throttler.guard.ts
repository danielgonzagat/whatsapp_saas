import { ExecutionContext, Injectable } from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';
import { createHash } from 'node:crypto';

function sha256(text: string): string {
  return createHash('sha256').update(text).digest('hex');
}

type RequestLike = {
  ip?: string;
  workspaceId?: string;
  params?: Record<string, string | undefined>;
  headers?: Record<string, string | string[] | undefined>;
};

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
 * Throttler guard with per-tenant key extraction and test-mode bypass.
 *
 * Extends the standard {@link ThrottlerGuard} to:
 * - Include the resolved workspace/tenant identifier in every storage
 *   key so rate budgets are isolated per tenant.
 * - Bypass rate-limiting entirely when the runtime is unmistakably a
 *   non-production test harness (Jest, Playwright e2e CI, or explicit
 *   {@code E2E_TEST_MODE=true}).
 */
@Injectable()
export class TenantThrottlerGuard extends ThrottlerGuard {
  protected override async shouldSkip(): Promise<boolean> {
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

  protected override generateKey(
    context: ExecutionContext,
    suffix: string,
    name: string,
  ): string {
    const req = context.switchToHttp().getRequest<RequestLike>();
    const tenant = resolveWorkspaceId(req);
    const prefix = `${context.getClass().name}-${context.getHandler().name}-${name}`;
    const tenantSuffix = tenant ? `${suffix}-tenant:${tenant}` : suffix;
    return sha256(`${prefix}-${tenantSuffix}`);
  }
}
