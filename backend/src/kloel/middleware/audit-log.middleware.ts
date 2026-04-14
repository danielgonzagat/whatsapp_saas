import { Injectable, Logger, NestMiddleware, OnModuleDestroy } from '@nestjs/common';
import { NextFunction, Request, Response } from 'express';
import { sanitizePayload } from '../../common/sanitize-payload';
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

  onModuleDestroy(): void {
    if (this.flushInterval) {
      clearInterval(this.flushInterval);
      this.flushInterval = undefined;
    }
  }

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

      // Extrair dados do request
      const user = (req as Request & { user?: { userId?: string; sub?: string } }).user;
      const workspaceId =
        req.params.workspaceId || req.body?.workspaceId || (req.query.workspaceId as string);

      // Sanitizar body para log (remover dados sensiveis via shared helper)
      const sanitizedBody = sanitizePayload(req.body) as Record<string, unknown> | undefined;

      // Determinar se deve logar
      const shouldLog = this.shouldLog(method, path, statusCode);

      if (shouldLog) {
        const logEntry: AuditLogEntry = {
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

        this.logBuffer.push(logEntry);

        // Log imediato para erros ou operacoes criticas
        if (statusCode >= 500 || this.isCriticalOperation(method, path)) {
          this.logger.error('Critical operation', {
            ...logEntry,
            level: statusCode >= 500 ? 'error' : 'warn',
          });
        }

        // Flush se buffer estiver cheio
        if (this.logBuffer.length >= this.BUFFER_SIZE) {
          void this.flushBuffer();
        }
      }

      // Log de performance para requests lentos
      if (responseTimeMs > 3000) {
        this.logger.warn('Slow request detected', {
          method,
          path,
          responseTimeMs,
          workspaceId,
        });
      }
    });

    next();
  }

  private shouldLog(method: string, path: string, statusCode: number): boolean {
    // Sempre logar erros
    if (statusCode >= 400) return true;

    // Nao logar health checks
    if (path.includes('/health') || path.includes('/diag')) {
      return statusCode >= 400;
    }

    // Logar todas as mutacoes
    if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(method)) {
      return true;
    }

    // Logar GETs apenas para certos endpoints
    const logGetPaths = ['/kloel', '/agent', '/payment', '/autopilot'];
    return logGetPaths.some((p) => path.includes(p));
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
    if (!responseBody) return undefined;

    try {
      const parsed = typeof responseBody === 'string' ? JSON.parse(responseBody) : responseBody;

      const obj = parsed as Record<string, unknown>;
      if (typeof obj?.message === 'string' && obj.message.trim()) {
        return obj.message;
      }
      if (typeof obj?.error === 'string' && obj.error.trim()) {
        return obj.error;
      }
      return 'Unknown error';
    } catch {
      return undefined;
    }
  }

  private async flushBuffer(): Promise<void> {
    if (this.logBuffer.length === 0) return;

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
