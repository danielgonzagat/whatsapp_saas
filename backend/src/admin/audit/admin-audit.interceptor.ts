import {
  type CallHandler,
  type ExecutionContext,
  Injectable,
  type NestInterceptor,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import { type Observable, tap } from 'rxjs';
import { NO_AUDIT_METADATA } from '../auth/decorators/no-audit.decorator';
import type { AuthenticatedAdmin } from '../auth/admin-auth.types';
import { AdminAuditService } from './admin-audit.service';
import { buildAdminAuditEntry } from './admin-audit-entry.builder';

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

/**
 * Automatically appends one audit row per non-safe admin request.
 *
 * Invariant I-ADMIN-2: every authenticated admin mutation produces an audit
 * row. We log on successful completion (tap success), not on exception, so
 * failed calls don't pollute the trail. Auth failures and validation errors
 * are logged separately by AdminAuthService.
 */
@Injectable()
export class AdminAuditInterceptor implements NestInterceptor {
  constructor(
    private readonly audit: AdminAuditService,
    private readonly reflector: Reflector,
  ) {}

  /** Intercept. */
  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const req = context.switchToHttp().getRequest<Request & { admin?: AuthenticatedAdmin }>();
    if (!this.shouldAudit(context, req)) {
      return next.handle();
    }

    // PULSE:OK buildAdminAuditEntry sanitizes query/body/params via admin-sanitize before persistence.
    const entry = buildAdminAuditEntry(context, req);

    return next.handle().pipe(
      tap({
        next: () => {
          void this.audit.append(entry);
        },
      }),
    );
  }

  private shouldAudit(context: ExecutionContext, req: Request | undefined): boolean {
    if (!req || SAFE_METHODS.has(req.method)) {
      return false;
    }
    const path = req.path ?? req.url ?? '';
    if (!path.startsWith('/admin/')) {
      return false;
    }
    const noAudit = this.reflector.getAllAndOverride<boolean>(NO_AUDIT_METADATA, [
      context.getHandler(),
      context.getClass(),
    ]);
    return !noAudit;
  }
}
