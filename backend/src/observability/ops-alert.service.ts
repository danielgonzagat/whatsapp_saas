import { Injectable, Logger } from '@nestjs/common';
import * as Sentry from '@sentry/node';
import type { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

/**
 * Centralised alerting for runtime-critical errors that must not go unnoticed.
 *
 * Logs structured OPS_CRITICAL messages, forwards to Sentry when available,
 * and persists an OpsEvent record in the database for dashboard alerting.
 *
 * Designed to be injected as @Optional() into ANY service so the alerting
 * surface can be added progressively without breaking existing tests or
 * requiring module wiring changes.
 */
@Injectable()
export class OpsAlertService {
  private readonly logger = new Logger('OpsAlert');

  constructor(private readonly prisma?: PrismaService) {}

  /**
   * Alert on a critical error that could degrade the platform silently.
   *
   * @param error    The caught Error instance (or unknown).
   * @param context  ServiceName.methodName string for routing.
   * @param extra    Optional workspaceId and structured metadata.
   */
  async alertOnCriticalError(
    error: unknown,
    context: string,
    extra?: {
      workspaceId?: string;
      metadata?: Record<string, unknown>;
    },
  ): Promise<void> {
    const err =
      error instanceof Error
        ? error
        : new Error(typeof error === 'string' ? error : 'unknown error');

    // 1. Structured log with OPS_CRITICAL prefix for monitoring
    this.logger.error(
      `OPS_CRITICAL | ${context}${extra?.workspaceId ? ` | ws=${extra.workspaceId}` : ''} | ${err.message}`,
      err.stack,
    );

    // 2. Forward to Sentry when available
    try {
      Sentry.captureException(err, {
        tags: { type: 'ops_critical', context },
        extra: { ...extra, stack: err.stack },
        level: 'error',
      });
    } catch {
      // Sentry may not be initialised
    }

    // 3. Persist an OpsEvent row for the dashboard
    if (this.prisma) {
      try {
        await this.prisma.opsEvent.create({
          data: {
            type: 'critical_error',
            service: context,
            error: err.message,
            stack: err.stack ?? null,
            workspaceId: extra?.workspaceId ?? null,
            metadata: (extra?.metadata ?? {}) as Prisma.InputJsonValue,
          },
        });
      } catch {
        // Best effort
      }
    }
  }

  /**
   * Alert on a service degradation (non-fatal but notable).
   */
  async alertOnDegradation(
    message: string,
    context: string,
    extra?: {
      workspaceId?: string;
      metadata?: Record<string, unknown>;
    },
  ): Promise<void> {
    this.logger.warn(
      `OPS_DEGRADATION | ${context}${extra?.workspaceId ? ` | ws=${extra.workspaceId}` : ''} | ${message}`,
    );

    try {
      Sentry.captureMessage(`Ops degradation: ${context} - ${message}`, {
        tags: { type: 'ops_degradation', context },
        extra,
        level: 'warning',
      });
    } catch {
      // Sentry may not be initialised
    }

    if (this.prisma) {
      try {
        await this.prisma.opsEvent.create({
          data: {
            type: 'degradation',
            service: context,
            error: message,
            workspaceId: extra?.workspaceId ?? null,
            metadata: (extra?.metadata ?? {}) as Prisma.InputJsonValue,
          },
        });
      } catch {
        // Best effort
      }
    }
  }

  /**
   * Signal a recovery from a previously-alerted condition.
   */
  async alertOnRecovery(
    message: string,
    context: string,
    extra?: {
      workspaceId?: string;
      metadata?: Record<string, unknown>;
    },
  ): Promise<void> {
    this.logger.log(
      `OPS_RECOVERY | ${context}${extra?.workspaceId ? ` | ws=${extra.workspaceId}` : ''} | ${message}`,
    );

    if (this.prisma) {
      try {
        await this.prisma.opsEvent.create({
          data: {
            type: 'recovery',
            service: context,
            error: message,
            workspaceId: extra?.workspaceId ?? null,
            metadata: (extra?.metadata ?? {}) as Prisma.InputJsonValue,
          },
        });
      } catch {
        // Best effort
      }
    }
  }
}
