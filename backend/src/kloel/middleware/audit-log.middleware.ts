import { Injectable, NestMiddleware, Logger } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';
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
  requestBody?: any;
  error?: string;
}

/**
 * Middleware de Audit Logging para APIs KLOEL.
 * Registra todas as operações para auditoria e debugging.
 */
@Injectable()
export class AuditLogMiddleware implements NestMiddleware {
  private readonly logger = new Logger('AuditLog');
  private logBuffer: AuditLogEntry[] = [];
  private readonly BUFFER_SIZE = 50;
  private readonly FLUSH_INTERVAL_MS = 30000; // 30 segundos

  constructor(private readonly prisma: PrismaService) {
    // Flush buffer periodicamente
    setInterval(() => this.flushBuffer(), this.FLUSH_INTERVAL_MS);
  }

  use(req: Request, res: Response, next: NextFunction): void {
    const startTime = Date.now();
    const { method, path, ip } = req;

    // Capturar resposta
    const originalSend = res.send.bind(res);
    let responseBody: any;

    res.send = (body: any): Response => {
      responseBody = body;
      return originalSend(body);
    };

    res.on('finish', () => {
      const responseTimeMs = Date.now() - startTime;
      const statusCode = res.statusCode;

      // Extrair dados do request
      const user = (req as any).user;
      const workspaceId =
        req.params.workspaceId ||
        (req.body as any)?.workspaceId ||
        (req.query.workspaceId as string);

      // Sanitizar body para log (remover dados sensíveis)
      const sanitizedBody = this.sanitizeBody(req.body);

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

        // Log imediato para erros ou operações críticas
        if (statusCode >= 500 || this.isCriticalOperation(method, path)) {
          this.logger.error('Critical operation', {
            ...logEntry,
            level: statusCode >= 500 ? 'error' : 'warn',
          });
        }

        // Flush se buffer estiver cheio
        if (this.logBuffer.length >= this.BUFFER_SIZE) {
          this.flushBuffer();
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

    // Não logar health checks
    if (path.includes('/health') || path.includes('/diag')) {
      return statusCode >= 400;
    }

    // Logar todas as mutações
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

    return (
      method !== 'GET' && criticalPaths.some((p) => path.includes(p))
    );
  }

  private sanitizeBody(body: any): any {
    if (!body || typeof body !== 'object') return body;

    const sensitiveFields = [
      'password',
      'token',
      'apiKey',
      'secret',
      'creditCard',
      'cvv',
      'cardNumber',
    ];

    const sanitized = { ...body };

    for (const field of sensitiveFields) {
      if (sanitized[field]) {
        sanitized[field] = '[REDACTED]';
      }
    }

    return sanitized;
  }

  private extractError(responseBody: any): string | undefined {
    if (!responseBody) return undefined;

    try {
      const parsed = typeof responseBody === 'string'
        ? JSON.parse(responseBody)
        : responseBody;

      return parsed.message || parsed.error || 'Unknown error';
    } catch {
      return undefined;
    }
  }

  private async flushBuffer(): Promise<void> {
    if (this.logBuffer.length === 0) return;

    const logsToFlush = [...this.logBuffer];
    this.logBuffer = [];

    try {
      // Em produção, salvar no banco ou enviar para serviço externo
      // Por agora, apenas logar em batch
      this.logger.log(`Flushing ${logsToFlush.length} audit logs`);

      // Opção: salvar em tabela de audit
      // await this.prisma.auditLog.createMany({ data: logsToFlush });

      // Opção: enviar para serviço externo (Datadog, Sentry, etc)
      if (process.env.AUDIT_WEBHOOK_URL) {
        await fetch(process.env.AUDIT_WEBHOOK_URL, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ logs: logsToFlush }),
        }).catch(() => {});
      }
    } catch (err) {
      this.logger.error('Failed to flush audit logs', err);
      // Re-adicionar logs ao buffer para próxima tentativa
      this.logBuffer.unshift(...logsToFlush);
    }
  }
}

/**
 * Decorator para marcar operações como auditáveis com metadados extras.
 */
export function AuditOperation(operationType: string) {
  return (target: any, propertyKey: string, descriptor: PropertyDescriptor) => {
    const originalMethod = descriptor.value;

    descriptor.value = async function (...args: any[]) {
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
      } catch (error) {
        logger.error({
          operation: operationType,
          method: propertyKey,
          duration: Date.now() - startTime,
          success: false,
          error: error.message,
        });
        throw error;
      }
    };

    return descriptor;
  };
}
