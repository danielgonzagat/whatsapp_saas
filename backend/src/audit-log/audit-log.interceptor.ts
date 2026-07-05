import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';
import { AuditLogService } from './audit-log.service';

@Injectable()
export class AuditLogInterceptor implements NestInterceptor {
  constructor(private readonly auditLogService: AuditLogService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const req = context.switchToHttp().getRequest();
    const start = Date.now();

    return next.handle().pipe(
      tap({
        next: () => {
          const res = context.switchToHttp().getResponse();
          this.auditLogService.writeEntry({
            timestamp: new Date().toISOString(),
            method: req.method as string,
            url: req.url as string,
            statusCode: res.statusCode as number,
            durationMs: Date.now() - start,
            ip: req.ip as string | undefined,
            userAgent: (req.headers?.['user-agent'] as string) ?? undefined,
            requestId: req.id as string | undefined,
          });
        },
        error: (err: unknown) => {
          const res = context.switchToHttp().getResponse();
          const message = err instanceof Error ? err.message : String(err);
          this.auditLogService.writeEntry({
            timestamp: new Date().toISOString(),
            method: req.method as string,
            url: req.url as string,
            statusCode: res.statusCode || 500,
            durationMs: Date.now() - start,
            ip: req.ip as string | undefined,
            userAgent: (req.headers?.['user-agent'] as string) ?? undefined,
            requestId: req.id as string | undefined,
            error: message,
          });
        },
      }),
    );
  }
}
