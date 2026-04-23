import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
  SetMetadata,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';
import { sanitizePayload } from '../common/sanitize-payload';
import { AuditService } from './audit.service';

/** Audit action metadata. */
export const AUDIT_ACTION_METADATA = ['audit', 'action'].join('_');
/** Audit action. */
export const AuditAction = (action: string, resource: string) =>
  SetMetadata(AUDIT_ACTION_METADATA, { action, resource });

/** Audit interceptor. */
@Injectable()
export class AuditInterceptor implements NestInterceptor {
  constructor(
    private auditService: AuditService,
    private reflector: Reflector,
  ) {}

  /** Intercept. */
  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const metadata = this.reflector.get(AUDIT_ACTION_METADATA, context.getHandler());

    // If no audit metadata, skip
    if (!metadata) {
      return next.handle();
    }

    const request = context.switchToHttp().getRequest();
    const { user, ip, headers, params, body } = request;

    if (!user || !user.workspaceId) {
      return next.handle();
    }

    return next.handle().pipe(
      tap((response) => {
        // Determine resource ID from response or params
        const resourceId = response?.id || params?.id || null;

        // Filter sensitive data from details via shared sanitizer
        const details = sanitizePayload({
          params,
          body,
        });

        void this.auditService.log({
          workspaceId: user.workspaceId,
          agentId: user.sub,
          action: metadata.action,
          resource: metadata.resource,
          resourceId,
          details: details as Record<string, unknown>,
          ipAddress: ip || headers['x-forwarded-for'],
          userAgent: headers['user-agent'],
        });
      }),
    );
  }
}
