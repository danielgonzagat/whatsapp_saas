import { Injectable, NestInterceptor, ExecutionContext, CallHandler, Logger } from '@nestjs/common';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';
import { AuditService } from './audit.service';
import { Reflector } from '@nestjs/core';
import { sanitizePayload } from '../common/sanitize-payload';

export const AUDIT_ACTION_KEY = 'audit_action';
export const AuditAction = (action: string, resource: string) =>
  SetMetadata(AUDIT_ACTION_KEY, { action, resource });

import { SetMetadata } from '@nestjs/common';

@Injectable()
export class AuditInterceptor implements NestInterceptor {
  private readonly logger = new Logger(AuditInterceptor.name);

  constructor(
    private auditService: AuditService,
    private reflector: Reflector,
  ) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const metadata = this.reflector.get(AUDIT_ACTION_KEY, context.getHandler());

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
          details,
          ipAddress: ip || headers['x-forwarded-for'],
          userAgent: headers['user-agent'],
        });
      }),
    );
  }
}
