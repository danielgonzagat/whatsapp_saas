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
const AUDIT_ACTION_METADATA = ['audit', 'action'].join('_');
type AuditMetadata = { action: string; resource: string };
type AuditRequestRecord = Record<string, unknown>;

interface AuditRequest {
  user?: unknown;
  ip?: string;
  headers?: AuditRequestRecord;
  params?: unknown;
  body?: unknown;
}

function isRecord(value: unknown): value is AuditRequestRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function readStringProperty(source: unknown, key: string): string | undefined {
  if (!isRecord(source)) {
    return undefined;
  }
  const value = source[key];
  return typeof value === 'string' && value.trim() ? value : undefined;
}

function readHeader(headers: unknown, key: string): string | undefined {
  if (!isRecord(headers)) {
    return undefined;
  }
  const value = headers[key];
  if (typeof value === 'string' && value.trim()) {
    return value;
  }
  if (Array.isArray(value)) {
    const firstString = value.find((entry): entry is string => typeof entry === 'string');
    return firstString?.trim() ? firstString : undefined;
  }
  return undefined;
}

function readResourceId(response: unknown, params: unknown): string | undefined {
  return readStringProperty(response, 'id') ?? readStringProperty(params, 'id');
}

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
    const metadata = this.reflector.get<AuditMetadata>(AUDIT_ACTION_METADATA, context.getHandler());

    // If no audit metadata, skip
    if (!metadata) {
      return next.handle();
    }

    const request = context.switchToHttp().getRequest<AuditRequest>();
    const { user, ip, headers, params, body } = request;
    const workspaceId = readStringProperty(user, 'workspaceId');
    const agentId = readStringProperty(user, 'sub');

    if (!workspaceId) {
      return next.handle();
    }

    return next.handle().pipe(
      tap((response) => {
        // Determine resource ID from response or params
        const resourceId = readResourceId(response, params);

        // Filter sensitive data from details via shared sanitizer
        const details = sanitizePayload({
          params,
          body,
        });

        const ipAddress = ip || readHeader(headers, 'x-forwarded-for');
        const userAgent = readHeader(headers, 'user-agent');
        void this.auditService.log({
          workspaceId,
          ...(agentId !== undefined ? { agentId } : {}),
          action: metadata.action,
          resource: metadata.resource,
          ...(resourceId !== undefined ? { resourceId } : {}),
          details: details as Record<string, unknown>,
          ...(ipAddress !== undefined ? { ipAddress } : {}),
          ...(userAgent !== undefined ? { userAgent } : {}),
        });
      }),
    );
  }
}
