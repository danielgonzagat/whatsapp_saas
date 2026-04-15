import {
  type CallHandler,
  type ExecutionContext,
  Injectable,
  type NestInterceptor,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import { type Observable, tap } from 'rxjs';
import { NO_AUDIT_KEY } from '../auth/decorators/no-audit.decorator';
import type { AuthenticatedAdmin } from '../auth/admin-token.types';
import { sanitizeForAudit } from '../common/admin-sanitize';
import { AdminAuditService } from './admin-audit.service';

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

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const http = context.switchToHttp();
    const req = http.getRequest<Request & { admin?: AuthenticatedAdmin }>();

    if (!req || SAFE_METHODS.has(req.method)) {
      return next.handle();
    }

    // Only instrument admin routes.
    const path = req.path ?? req.url ?? '';
    if (!path.startsWith('/admin/')) {
      return next.handle();
    }

    const noAudit = this.reflector.getAllAndOverride<boolean>(NO_AUDIT_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (noAudit) return next.handle();

    const controllerName = context.getClass().name;
    const handlerName = context.getHandler().name;
    const action = `${controllerName}.${handlerName}`;

    const details = {
      method: req.method,
      path,
      query: sanitizeForAudit(req.query ?? {}),
      body: sanitizeForAudit(req.body ?? {}),
      params: sanitizeForAudit(req.params ?? {}),
    };

    const ip =
      (req.headers['x-forwarded-for']?.toString().split(',')[0]?.trim() ?? '') ||
      req.ip ||
      req.socket?.remoteAddress ||
      null;
    const userAgent = req.headers['user-agent'] ?? null;

    return next.handle().pipe(
      tap({
        next: () => {
          void this.audit.append({
            adminUserId: req.admin?.id ?? null,
            action,
            details,
            ip,
            userAgent,
          });
        },
      }),
    );
  }
}
