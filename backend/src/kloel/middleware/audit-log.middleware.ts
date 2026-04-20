import { Injectable, Logger, NestMiddleware, OnModuleDestroy } from '@nestjs/common';
import { NextFunction, Request, Response } from 'express';
import { sanitizePayload } from '../../common/sanitize-payload';
import { validateNoInternalAccess } from '../../common/utils/url-validator';
import { PrismaService } from '../../prisma/prisma.service';

interface AuditLogEntry {
  timestamp: Date;
  method: string;
  path: string;
  workspaceId?: string;
  userId?: string;
  ip: string;
  userAgent: string;
  statusCode: number;
  responseTimeMs: number;
  requestBody?: Record<string, unknown>;
  error?: string;
}

/**
 * Parses a response body into a record-shaped object for inspection, or
 * returns `undefined` if the body cannot be interpreted as structured JSON.
 * Pulled out of the AuditLogMiddleware class so each branch is its own
 * statement and `extractError` stays at CCN 3.
 */
function parseErrorPayload(responseBody: unknown): Record<string, unknown> | undefined {
  if (typeof responseBody !== 'string') {
    return responseBody as Record<string, unknown>;
  }
  try {
    return JSON.parse(responseBody) as Record<string, unknown>;
  } catch {
    return undefined;
  }
}

/**
 * Returns the first non-empty string message from `obj.message` or `obj.error`,
 * or `null` when neither field provides a usable string.
 */
function extractErrorMessage(obj: Record<string, unknown>): string | null {
  const message = obj?.message;
  if (typeof message === 'string' && message.trim()) {
    return message;
  }
  const error = obj?.error;
  if (typeof error === 'string' && error.trim()) {
    return error;
  }
  return null;
}

const HEALTH_PATH_FRAGMENTS = ['/health', '/diag'] as const;
const MUTATION_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);
const LOGGED_GET_PATH_FRAGMENTS = ['/kloel', '/agent', '/payment', '/autopilot'] as const;

function isHealthCheckPath(path: string): boolean {
  return HEALTH_PATH_FRAGMENTS.some((fragment) => path.includes(fragment));
}

function matchesLoggedGetPath(path: string): boolean {
  return LOGGED_GET_PATH_FRAGMENTS.some((fragment) => path.includes(fragment));
}

/**
 * Middleware de Audit Logging para APIs KLOEL.
 * Registra todas as operacoes para auditoria e debugging.
 * Sensitive fields are stripped via the shared sanitizePayload helper.
 */
@Injectable()
export class AuditLogMiddleware implements NestMiddleware, OnModuleDestroy {
  private readonly logger = new Logger('AuditLog');
  private logBuffer: AuditLogEntry[] = [];
  private readonly BUFFER_SIZE = 50;
  private readonly FLUSH_INTERVAL_MS = 30000; // 30 segundos

  private flushInterval?: NodeJS.Timeout;

  constructor(private readonly prisma: PrismaService) {
    const isTestEnv = !!process.env.JEST_WORKER_ID || process.env.NODE_ENV === 'test';

    // Flush buffer periodicamente
    if (!isTestEnv) {
      this.flushInterval = setInterval(() => {
        void this.flushBuffer();
      }, this.FLUSH_INTERVAL_MS);
      this.flushInterval.unref?.();
    }
  }

  /** On module destroy. */
  onModuleDestroy(): void {
    if (this.flushInterval) {
      clearInterval(this.flushInterval);
      this.flushInterval = undefined;
    }
  }

  /** Use. */
  use(req: Request, res: Response, next: NextFunction): void {
    const startTime = Date.now();
    const { method, path, ip } = req;

    // Capturar resposta
    // messageLimit: this is HTTP response send, not WhatsApp message send
    const originalSend = res.send.bind(res);
    let responseBody: unknown;

    res.send = (body: unknown): Response => {
      responseBody = body;
      return originalSend(body);
    };

    res.on('finish', () => {
      const responseTimeMs = Date.now() - startTime;
      const statusCode = res.statusCode;
      const workspaceId = this.resolveWorkspaceId(req);

      if (this.shouldLog(method, path, statusCode)) {
        const logEntry = this.buildAuditLogEntry({
          req,
          method,
          path,
          ip,
          workspaceId,
          statusCode,
          responseTimeMs,
          responseBody,
        });
        this.recordAuditLogEntry(logEntry, method, path);
      }

      this.maybeLogSlowRequest(responseTimeMs, method, path, workspaceId);
    });

    next();
  }

  private resolveWorkspaceId(req: Request): string | undefined {
    return req.params.workspaceId || req.body?.workspaceId || (req.query.workspaceId as string);
  }

  private buildAuditLogEntry(params: {
    req: Request;
    method: string;
    path: string;
    ip: string;
    workspaceId?: string;
    statusCode: number;
    responseTimeMs: number;
    responseBody: unknown;
  }): AuditLogEntry {
    const { req, method, path, ip, workspaceId, statusCode, responseTimeMs, responseBody } = params;
    const user = (req as Request & { user?: { userId?: string; sub?: string } }).user;
    const sanitizedBody = sanitizePayload(req.body) as Record<string, unknown> | undefined;

    return {
      timestamp: new Date(),
      method,
      path,
      workspaceId,
      userId: user?.userId || user?.sub,
      ip: ip || 'unknown',
      userAgent: req.headers['user-agent'] || 'unknown',
      statusCode,
      responseTimeMs,
      requestBody: sanitizedBody,
      error: statusCode >= 400 ? this.extractError(responseBody) : undefined,
    };
  }

  private recordAuditLogEntry(logEntry: AuditLogEntry, method: string, path: string): void {
    this.logBuffer.push(logEntry);

    if (logEntry.statusCode >= 500 || this.isCriticalOperation(method, path)) {
      this.logger.error('Critical operation', {
        ...logEntry,
        level: logEntry.statusCode >= 500 ? 'error' : 'warn',
      });
    }

    if (this.logBuffer.length >= this.BUFFER_SIZE) {
      void this.flushBuffer();
    }
  }

  private maybeLogSlowRequest(
    responseTimeMs: number,
    method: string,
    path: string,
    workspaceId?: string,
  ): void {
    if (responseTimeMs <= 3000) {
      return;
    }
    this.logger.warn('Slow request detected', { method, path, responseTimeMs, workspaceId });
  }

  private shouldLog(method: string, path: string, statusCode: number): boolean {
    if (statusCode >= 400) {
      return true;
    }
    if (isHealthCheckPath(path)) {
      return false;
    }
    if (MUTATION_METHODS.has(method)) {
      return true;
    }
    return matchesLoggedGetPath(path);
  }

  private isCriticalOperation(method: string, path: string): boolean {
    const criticalPaths = [
      '/payment/create',
      '/payment/confirm',
      '/agent/process',
      '/auth/login',
      '/auth/reset',
      '/workspace/delete',
      '/billing',
    ];

    return method !== 'GET' && criticalPaths.some((p) => path.includes(p));
  }

  private extractError(responseBody: unknown): string | undefined {
    if (!responseBody) {
      return undefined;
    }
    const parsed = parseErrorPayload(responseBody);
    if (parsed === undefined) {
      return undefined;
    }
    return extractErrorMessage(parsed) ?? 'Unknown error';
  }

  private async flushBuffer(): Promise<void> {
    if (this.logBuffer.length === 0) {
      return;
    }

    const logsToFlush = [...this.logBuffer];
    this.logBuffer = [];

    try {
      this.logger.log(`Flushing ${logsToFlush.length} audit logs`);

      // Persist audit logs to database
      await this.prisma.auditLog
        .createMany({
          data: logsToFlush
            .filter((log) => log.workspaceId)
            .map((log) => ({
              workspaceId: log.workspaceId,
              action: `HTTP_${log.method}`,
              resource: log.path,
              details: JSON.parse(
                JSON.stringify({
                  statusCode: log.statusCode,
                  responseTimeMs: log.responseTimeMs,
                  requestBody: log.requestBody
                    ? (sanitizePayload(log.requestBody) as Record<string, unknown>)
                    : undefined,
                  error: log.error || undefined,
                }),
              ),
              agentId: log.userId,
              ipAddress: log.ip,
              userAgent: log.userAgent,
            })),
          skipDuplicates: true,
        })
        .catch((err: Error) => {
          this.logger.warn(`Failed to persist audit logs to DB: ${err.message}`);
        });

      // Opcao: enviar para servico externo (Datadog, Sentry, etc)
      if (process.env.AUDIT_WEBHOOK_URL) {
        // SSRF protection: validate env-configured webhook URL before use
        validateNoInternalAccess(process.env.AUDIT_WEBHOOK_URL);
        await fetch(process.env.AUDIT_WEBHOOK_URL, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ logs: logsToFlush }),
          signal: AbortSignal.timeout(30000),
        }).catch((err) => this.logger.warn('Failed to send audit webhook', err.message));
      }
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : 'unknown_error';
      this.logger.error('Failed to flush audit logs', errorMessage);
      // Re-adicionar logs ao buffer para proxima tentativa
      this.logBuffer.unshift(...logsToFlush);
    }
  }
}

/**
 * Decorator para marcar operacoes como auditaveis com metadados extras.
 */
export function AuditOperation(operationType: string) {
  return (_target: unknown, propertyKey: string, descriptor: PropertyDescriptor) => {
    const originalMethod = descriptor.value;

    descriptor.value = async function (...args: unknown[]) {
      const logger = new Logger('AuditOperation');
      const startTime = Date.now();

      try {
        const result = await originalMethod.apply(this, args);
        logger.log({
          operation: operationType,
          method: propertyKey,
          duration: Date.now() - startTime,
          success: true,
        });
        return result;
      } catch (error: unknown) {
        logger.error({
          operation: operationType,
          method: propertyKey,
          duration: Date.now() - startTime,
          success: false,
          error: error instanceof Error ? error.message : 'unknown_error',
        });
        throw error;
      }
    };

    return descriptor;
  };
}
