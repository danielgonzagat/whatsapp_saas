import { Injectable, Logger } from '@nestjs/common';
import { InjectRedis } from '@nestjs-modules/ioredis';
import type { Redis } from 'ioredis';
import { PrismaService } from '../../prisma/prisma.service';
/** Shape returned by the health snapshot. */
export interface SelfHealthSnapshot {
  db: 'ok' | 'down';
  redis: 'ok' | 'down';
  whatsapp: 'connected' | 'disconnected' | 'unknown';
  llm: 'ok' | 'degraded' | 'unknown';
  lastChecked: string;
}
/**
 * SelfHealthService — aggregates infrastructure health signals
 * for the self.health meta-capability.
 *
 * Honest contract: every probe that fails returns 'down' / 'unknown',
 * never fakes an 'ok'.
 */
@Injectable()
export class SelfHealthService {
  private readonly logger = new Logger(SelfHealthService.name);

  constructor(
    private readonly prisma: PrismaService,
    @InjectRedis() private readonly redis: Redis,
  ) {}
  /**
   * Collect a snapshot of infrastructure health for the given workspace.
   */
  async snapshot(workspaceId: string): Promise<SelfHealthSnapshot> {
    const [dbStatus, redisStatus, whatsappStatus, llmStatus] = await Promise.all([
      this.checkDb(),
      this.checkRedis(),
      this.checkWhatsApp(workspaceId),
      this.checkLlm(workspaceId),
    ]);

    return {
      db: dbStatus,
      redis: redisStatus,
      whatsapp: whatsappStatus,
      llm: llmStatus,
      lastChecked: new Date().toISOString(),
    };
  }
  // ── individual probes ──

  private async checkDb(): Promise<'ok' | 'down'> {
    try {
      await this.prisma.$queryRaw<{ '?column?': 1 }[]>`SELECT 1`;
      return 'ok';
    } catch {
      this.logger.warn('DB health probe failed');
      return 'down';
    }
  }
  private async checkRedis(): Promise<'ok' | 'down'> {
    try {
      await this.redis.ping();
      return 'ok';
    } catch {
      this.logger.warn('Redis health probe failed');
      return 'down';
    }
  }
  private async checkWhatsApp(
    workspaceId: string,
  ): Promise<'connected' | 'disconnected' | 'unknown'> {
    try {
      const workspace = await this.prisma.workspace.findUnique({
        where: { id: workspaceId },
        select: { providerSettings: true },
      });
      if (!workspace) return 'unknown';

      const settings = (workspace.providerSettings ?? {}) as Record<string, unknown>;
      const wpp = settings.whatsapp as Record<string, unknown> | undefined;
      if (!wpp) return 'unknown';

      // If the workspace has WhatsApp credentials configured, consider it connected.
      // A full connectivity check would require reaching out to the provider,
      // which is too heavy for a chat-facing health check.
      if (wpp.connected === true || wpp.phoneNumberId || wpp.instanceId) {
        return 'connected';
      }

      return 'disconnected';
    } catch {
      this.logger.warn('WhatsApp health probe failed');
      return 'unknown';
    }
  }
  private async checkLlm(workspaceId: string): Promise<'ok' | 'degraded' | 'unknown'> {
    try {
      const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);
      const recentLlmCall = await this.prisma.auditLog.findFirst({
        where: {
          workspaceId,
          createdAt: { gte: fiveMinutesAgo },
          action: { contains: 'OPENAI', mode: 'insensitive' },
        },
        orderBy: { createdAt: 'desc' },
        select: { id: true, details: true, createdAt: true },
      });

      if (!recentLlmCall) {
        // No recent LLM call — could be idle, not degradada
        return 'unknown';
      }

      const details = (recentLlmCall.details ?? {}) as Record<string, unknown>;
      if (details.error || details.success === false) {
        return 'degraded';
      }

      return 'ok';
    } catch {
      this.logger.warn('LLM health probe failed');
      return 'unknown';
    }
  }
}
