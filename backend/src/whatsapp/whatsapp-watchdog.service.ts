/**
 * ============================================
 * WHATSAPP SESSION WATCHDOG SERVICE
 * ============================================
 * Monitora sessões WhatsApp e reconecta automaticamente.
 *
 * Features:
 * - Heartbeat periódico para cada workspace
 * - Auto-reconnect quando desconectado
 * - Métricas de uptime por workspace
 * - Alertas para ops quando falha persistente
 * - Cooldown entre tentativas de reconexão
 * ============================================
 */

import {
  Injectable,
  Logger,
  OnModuleInit,
  OnModuleDestroy,
} from '@nestjs/common';
import { InjectRedis } from '@nestjs-modules/ioredis';
import { Cron, CronExpression } from '@nestjs/schedule';
import { Prisma } from '@prisma/client';
import { randomUUID } from 'crypto';
import type Redis from 'ioredis';
import { PrismaService } from '../prisma/prisma.service';
import { WhatsAppProviderRegistry } from './providers/provider-registry';
import { WhatsAppCatchupService } from './whatsapp-catchup.service';
import { Counter, Gauge, register } from 'prom-client';

interface SessionHealth {
  workspaceId: string;
  connected: boolean;
  lastCheck: Date;
  consecutiveFailures: number;
  lastReconnectAttempt?: Date;
  upSince?: Date;
  reconnectBlockedReason?: string;
}

@Injectable()
export class WhatsAppWatchdogService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(WhatsAppWatchdogService.name);
  private readonly sessionHealth = new Map<string, SessionHealth>();
  private readonly MAX_CONSECUTIVE_FAILURES = 5;
  private readonly RECONNECT_COOLDOWN_MS = 60_000; // 1 minuto entre tentativas
  private readonly MAX_RECONNECT_BACKOFF_MS = 15 * 60_000;
  private readonly ALERT_THRESHOLD = 3; // Alertar após 3 falhas
  private readonly healthCheckLockKey = 'whatsapp:watchdog:healthcheck';
  private readonly healthCheckLockTtlSeconds = 55;
  private readonly reconnectLockTtlSeconds = Math.max(
    60,
    parseInt(
      process.env.WAHA_WATCHDOG_RECONNECT_LOCK_TTL_SECONDS || '300',
      10,
    ) || 300,
  );
  private isRunning = false;
  private readonly pendingStatuses = new Set([
    'SCAN_QR_CODE',
    'QR_PENDING',
    'STARTING',
    'OPENING',
  ]);

  // Métricas Prometheus
  private readonly sessionStatusGauge =
    (register.getSingleMetric('whatsapp_session_status') as Gauge<string>) ||
    new Gauge({
      name: 'whatsapp_session_status',
      help: 'WhatsApp session status (1=connected, 0=disconnected)',
      labelNames: ['workspaceId'],
    });

  private readonly reconnectCounter =
    (register.getSingleMetric(
      'whatsapp_reconnect_attempts_total',
    ) as Counter<string>) ||
    new Counter({
      name: 'whatsapp_reconnect_attempts_total',
      help: 'Total reconnect attempts',
      labelNames: ['workspaceId', 'result'],
    });

  private readonly healthCheckCounter =
    (register.getSingleMetric(
      'whatsapp_healthcheck_total',
    ) as Counter<string>) ||
    new Counter({
      name: 'whatsapp_healthcheck_total',
      help: 'Total health checks',
      labelNames: ['workspaceId', 'status'],
    });

  constructor(
    private readonly prisma: PrismaService,
    private readonly providerRegistry: WhatsAppProviderRegistry,
    private readonly catchupService: WhatsAppCatchupService,
    @InjectRedis() private readonly redis: Redis,
  ) {}

  private isNowebStoreMisconfigured(message?: string | null): boolean {
    const normalized = String(message || '').toLowerCase();
    return (
      normalized === 'noweb_store_misconfigured' ||
      normalized.includes('enable noweb store') ||
      normalized.includes('config.noweb.store.enabled') ||
      normalized.includes('config.noweb.store.full_sync') ||
      (normalized.includes('noweb') &&
        normalized.includes('store') &&
        (normalized.includes('full_sync') || normalized.includes('full sync')))
    );
  }

  private async getReconnectBlockReason(
    workspaceId: string,
  ): Promise<string | null> {
    const workspace = await this.prisma.workspace.findUnique({
      where: { id: workspaceId },
      select: { providerSettings: true },
    });

    const settings = (workspace?.providerSettings as Record<string, any>) || {};
    const sessionMeta = (settings.whatsappApiSession || {}) as Record<
      string,
      any
    >;
    const recoveryBlockedReason = String(
      sessionMeta.recoveryBlockedReason || '',
    ).trim();

    if (this.isNowebStoreMisconfigured(recoveryBlockedReason)) {
      return recoveryBlockedReason || 'noweb_store_misconfigured';
    }

    const structuralErrorCandidate = String(
      sessionMeta.lastCatchupError || sessionMeta.disconnectReason || '',
    ).trim();

    if (this.isNowebStoreMisconfigured(structuralErrorCandidate)) {
      return 'noweb_store_misconfigured';
    }

    return null;
  }

  private isGuestWorkspace(
    workspaceName?: string,
    settings?: Record<string, any> | null,
  ): boolean {
    const normalizedName = String(workspaceName || '')
      .trim()
      .toLowerCase();

    if (normalizedName === 'guest workspace') {
      return true;
    }

    return (
      settings?.guestMode === true ||
      settings?.anonymousGuest === true ||
      settings?.workspaceMode === 'guest' ||
      settings?.authMode === 'anonymous' ||
      settings?.auth?.anonymous === true
    );
  }

  private shouldMonitorWorkspace(workspace: {
    name?: string | null;
    providerSettings?: unknown;
  }): boolean {
    const settings = (workspace.providerSettings as Record<string, any>) || {};
    const lifecycle = (settings.whatsappLifecycle || {}) as Record<string, any>;

    if (this.isGuestWorkspace(workspace.name || undefined, settings)) {
      return false;
    }

    if (
      lifecycle.watchdogEnabled === false ||
      lifecycle.autoManage === false ||
      lifecycle.autoReconnect === false
    ) {
      return false;
    }

    return !!settings.whatsappApiSession;
  }

  private getReconnectLockKey(workspaceId: string): string {
    return `whatsapp:watchdog:reconnect:${workspaceId}`;
  }

  private async acquireLock(
    key: string,
    ttlSeconds: number,
  ): Promise<string | null> {
    const token = randomUUID();
    const acquired = await this.redis.set(key, token, 'EX', ttlSeconds, 'NX');
    return acquired === 'OK' ? token : null;
  }

  private async releaseLock(key: string, token: string): Promise<void> {
    const current = await this.redis.get(key);
    if (current === token) {
      await this.redis.del(key);
    }
  }

  private getReconnectCooldownMs(consecutiveFailures: number): number {
    const exponent = Math.max(0, Math.min(consecutiveFailures - 1, 4));
    return Math.min(
      this.RECONNECT_COOLDOWN_MS * 2 ** exponent,
      this.MAX_RECONNECT_BACKOFF_MS,
    );
  }

  onModuleInit() {
    this.isRunning = true;
    this.logger.log('🐕 WhatsApp Watchdog initialized');
  }

  onModuleDestroy() {
    this.isRunning = false;
    this.logger.log('🐕 WhatsApp Watchdog stopped');
  }

  /**
   * Heartbeat - verifica todas as sessões ativas a cada 2 minutos
   */
  @Cron(CronExpression.EVERY_MINUTE)
  async runHealthCheck() {
    if (!this.isRunning) return;

    const lockToken = await this.acquireLock(
      this.healthCheckLockKey,
      this.healthCheckLockTtlSeconds,
    );
    if (!lockToken) {
      this.logger.debug('Skipping watchdog cycle because another instance holds the lock');
      return;
    }

    try {
      // WAHA-only: buscamos workspaces que já têm snapshot/configuração WAHA.
      const allWorkspaces = await this.prisma.workspace.findMany({
        where: {
          providerSettings: { not: Prisma.DbNull },
        },
        select: {
          id: true,
          name: true,
          providerSettings: true,
        },
      });

      const workspaces = allWorkspaces.filter((ws) =>
        this.shouldMonitorWorkspace(ws),
      );

      this.logger.debug(
        `🐕 Checking ${workspaces.length} workspaces (total with providerSettings: ${allWorkspaces.length})`,
      );

      for (const workspace of workspaces) {
        await this.checkWorkspaceSession(workspace.id, workspace.name);
      }
    } catch (error: any) {
      this.logger.error(`❌ Health check cycle failed: ${error.message}`);
    } finally {
      await this.releaseLock(this.healthCheckLockKey, lockToken).catch(
        (error: any) => {
          this.logger.warn(
            `Failed to release watchdog cycle lock: ${error?.message || error}`,
          );
        },
      );
    }
  }

  /**
   * Verifica e tenta reconectar uma sessão específica
   */
  async checkWorkspaceSession(
    workspaceId: string,
    workspaceName?: string,
  ): Promise<SessionHealth> {
    const now = new Date();
    const health = this.sessionHealth.get(workspaceId) || {
      workspaceId,
      connected: false,
      lastCheck: now,
      consecutiveFailures: 0,
    };

    try {
      // Verificar status da sessão
      const status = await this.providerRegistry.getSessionStatus(workspaceId);
      const wasConnected = health.connected;
      health.connected = status.connected;
      health.lastCheck = now;
      const normalizedStatus = String(status.status || 'unknown').toUpperCase();
      const metricStatus = status.connected
        ? 'ok'
        : this.pendingStatuses.has(normalizedStatus)
          ? 'pending'
          : 'disconnected';

      // Atualizar métricas
      this.sessionStatusGauge.set({ workspaceId }, status.connected ? 1 : 0);
      this.healthCheckCounter.inc({ workspaceId, status: metricStatus });

      if (status.connected) {
        // Sessão OK
        if (!wasConnected) {
          health.upSince = now;
          this.logger.log(
            `✅ Session reconnected: ${workspaceName || workspaceId}`,
          );
          await this.catchupService.triggerCatchup(
            workspaceId,
            'watchdog_reconnected',
          );
        }
        health.consecutiveFailures = 0;
        health.reconnectBlockedReason = undefined;
      } else if (this.pendingStatuses.has(normalizedStatus)) {
        // Sessão aguardando QR ou ainda inicializando. Não é falha operacional.
        health.consecutiveFailures = 0;
        health.reconnectBlockedReason = undefined;
        this.logger.debug(
          `⏳ Session awaiting action: ${workspaceName || workspaceId} ` +
            `(status: ${normalizedStatus})`,
        );
      } else {
        // Sessão desconectada
        health.consecutiveFailures++;

        this.logger.warn(
          `⚠️ Session disconnected: ${workspaceName || workspaceId} ` +
            `(failures: ${health.consecutiveFailures}, status: ${normalizedStatus})`,
        );

        const reconnectBlockedReason =
          await this.getReconnectBlockReason(workspaceId);
        health.reconnectBlockedReason = reconnectBlockedReason || undefined;

        if (reconnectBlockedReason) {
          this.logger.error(
            `🛑 Auto-reconnect blocked for ${workspaceName || workspaceId}: ${reconnectBlockedReason}`,
          );
        } else if (this.shouldAttemptReconnect(health)) {
          // Tentar reconectar se dentro do cooldown
          await this.attemptReconnect(workspaceId, workspaceName, health);
        }

        // Alertar ops se muitas falhas consecutivas
        if (health.consecutiveFailures === this.ALERT_THRESHOLD) {
          await this.alertOps(workspaceId, workspaceName, health);
        }
      }
    } catch (error: any) {
      health.consecutiveFailures++;
      health.lastCheck = now;
      this.healthCheckCounter.inc({ workspaceId, status: 'error' });
      this.logger.error(
        `❌ Check failed for ${workspaceName || workspaceId}: ${error.message}`,
      );
    }

    this.sessionHealth.set(workspaceId, health);
    return health;
  }

  /**
   * Tenta reconectar uma sessão
   */
  private async attemptReconnect(
    workspaceId: string,
    workspaceName: string | undefined,
    health: SessionHealth,
  ): Promise<boolean> {
    const reconnectLockKey = this.getReconnectLockKey(workspaceId);
    const reconnectLockToken = await this.acquireLock(
      reconnectLockKey,
      this.reconnectLockTtlSeconds,
    );
    if (!reconnectLockToken) {
      this.logger.debug(
        `Skipping reconnect for ${workspaceName || workspaceId}: another instance is already reconnecting this workspace`,
      );
      return false;
    }

    health.lastReconnectAttempt = new Date();

    try {
      this.logger.log(
        `🔄 Attempting reconnect: ${workspaceName || workspaceId}`,
      );

      // Tentar iniciar sessão
      const result = await this.providerRegistry.startSession(workspaceId);

      if (result.success) {
        const status =
          await this.providerRegistry.getSessionStatus(workspaceId);
        const normalizedStatus = String(
          status.status || 'unknown',
        ).toUpperCase();

        if (status.connected) {
          this.reconnectCounter.inc({ workspaceId, result: 'success' });
          this.logger.log(
            `✅ Reconnect confirmed: ${workspaceName || workspaceId}`,
          );
          health.consecutiveFailures = 0;
          health.connected = true;
          health.upSince = new Date();
          health.reconnectBlockedReason = undefined;
          await this.catchupService.triggerCatchup(
            workspaceId,
            'watchdog_reconnected',
          );
          return true;
        }

        if (this.pendingStatuses.has(normalizedStatus)) {
          this.reconnectCounter.inc({ workspaceId, result: 'pending' });
          this.logger.log(
            `⏳ Reconnect pending human action: ${workspaceName || workspaceId} (status: ${normalizedStatus})`,
          );
          health.connected = false;
          health.consecutiveFailures = 0;
          health.reconnectBlockedReason = undefined;
          return false;
        }

        this.reconnectCounter.inc({ workspaceId, result: 'unconfirmed' });
        this.logger.warn(
          `⚠️ Reconnect start succeeded but WAHA is still ${normalizedStatus}: ${workspaceName || workspaceId}`,
        );
        health.connected = false;
        return false;
      } else {
        this.reconnectCounter.inc({ workspaceId, result: 'failed' });
        this.logger.warn(
          `⚠️ Reconnect failed: ${workspaceName || workspaceId} - ${result.message}`,
        );
        return false;
      }
    } catch (error: any) {
      this.reconnectCounter.inc({ workspaceId, result: 'error' });
      this.logger.error(
        `❌ Reconnect error: ${workspaceName || workspaceId} - ${error.message}`,
      );
      return false;
    } finally {
      await this.releaseLock(reconnectLockKey, reconnectLockToken).catch(
        (error: any) => {
          this.logger.warn(
            `Failed to release reconnect lock for ${workspaceName || workspaceId}: ${error?.message || error}`,
          );
        },
      );
    }
  }

  /**
   * Verifica se deve tentar reconectar
   */
  private shouldAttemptReconnect(health: SessionHealth): boolean {
    // Não reconectar se muitas falhas (pode ser problema de QR code)
    if (health.consecutiveFailures > this.MAX_CONSECUTIVE_FAILURES) {
      return false;
    }

    // Respeitar cooldown
    if (health.lastReconnectAttempt) {
      const elapsed = Date.now() - health.lastReconnectAttempt.getTime();
      if (elapsed < this.getReconnectCooldownMs(health.consecutiveFailures)) {
        return false;
      }
    }

    return true;
  }

  /**
   * Alerta equipe de ops sobre falha persistente
   */
  private async alertOps(
    workspaceId: string,
    workspaceName: string | undefined,
    health: SessionHealth,
  ): Promise<void> {
    const webhook = process.env.OPS_WEBHOOK_URL || process.env.DLQ_WEBHOOK_URL;
    if (!webhook) return;

    try {
      await fetch(webhook, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'whatsapp_session_alert',
          severity: 'high',
          workspaceId,
          workspaceName,
          consecutiveFailures: health.consecutiveFailures,
          lastCheck: health.lastCheck.toISOString(),
          message:
            `WhatsApp session disconnected for ${workspaceName || workspaceId}. ` +
            `${health.consecutiveFailures} consecutive failures.`,
          at: new Date().toISOString(),
          env: process.env.NODE_ENV || 'development',
        }),
      });
      this.logger.warn(
        `🚨 Alert sent for workspace ${workspaceName || workspaceId}`,
      );
    } catch (error: any) {
      this.logger.error(`Failed to send ops alert: ${error.message}`);
    }
  }

  /**
   * API: Obter status de todas as sessões monitoradas
   */
  getAllSessionsHealth(): SessionHealth[] {
    return Array.from(this.sessionHealth.values());
  }

  /**
   * API: Obter status de uma sessão específica
   */
  getSessionHealth(workspaceId: string): SessionHealth | undefined {
    return this.sessionHealth.get(workspaceId);
  }

  /**
   * API: Forçar verificação de uma sessão
   */
  async forceCheck(workspaceId: string): Promise<SessionHealth> {
    const workspace = await this.prisma.workspace.findUnique({
      where: { id: workspaceId },
      select: { name: true },
    });
    return this.checkWorkspaceSession(workspaceId, workspace?.name);
  }

  /**
   * API: Forçar reconexão de uma sessão
   */
  async forceReconnect(
    workspaceId: string,
  ): Promise<{ success: boolean; message: string }> {
    const workspace = await this.prisma.workspace.findUnique({
      where: { id: workspaceId },
      select: { name: true },
    });

    const health = this.sessionHealth.get(workspaceId) || {
      workspaceId,
      connected: false,
      lastCheck: new Date(),
      consecutiveFailures: 0,
    };

    // Reset cooldown para permitir reconexão imediata
    health.lastReconnectAttempt = undefined;
    health.reconnectBlockedReason = undefined;

    const success = await this.attemptReconnect(
      workspaceId,
      workspace?.name,
      health,
    );
    this.sessionHealth.set(workspaceId, health);

    return {
      success,
      message: success ? 'Reconnected successfully' : 'Reconnection failed',
    };
  }

  /**
   * API: Estatísticas do watchdog
   */
  getStats(): {
    totalMonitored: number;
    connected: number;
    disconnected: number;
    withFailures: number;
  } {
    const sessions = Array.from(this.sessionHealth.values());
    return {
      totalMonitored: sessions.length,
      connected: sessions.filter((s) => s.connected).length,
      disconnected: sessions.filter((s) => !s.connected).length,
      withFailures: sessions.filter((s) => s.consecutiveFailures > 0).length,
    };
  }
}
