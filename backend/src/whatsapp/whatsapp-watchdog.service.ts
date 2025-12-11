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

import { Injectable, Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../prisma/prisma.service';
import { WhatsAppProviderRegistry } from './providers/provider-registry';
import { Counter, Gauge } from 'prom-client';

interface SessionHealth {
  workspaceId: string;
  connected: boolean;
  lastCheck: Date;
  consecutiveFailures: number;
  lastReconnectAttempt?: Date;
  upSince?: Date;
}

@Injectable()
export class WhatsAppWatchdogService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(WhatsAppWatchdogService.name);
  private readonly sessionHealth = new Map<string, SessionHealth>();
  private readonly MAX_CONSECUTIVE_FAILURES = 5;
  private readonly RECONNECT_COOLDOWN_MS = 60_000; // 1 minuto entre tentativas
  private readonly ALERT_THRESHOLD = 3; // Alertar após 3 falhas
  private isRunning = false;

  // Métricas Prometheus
  private readonly sessionStatusGauge = new Gauge({
    name: 'whatsapp_session_status',
    help: 'WhatsApp session status (1=connected, 0=disconnected)',
    labelNames: ['workspaceId'],
  });

  private readonly reconnectCounter = new Counter({
    name: 'whatsapp_reconnect_attempts_total',
    help: 'Total reconnect attempts',
    labelNames: ['workspaceId', 'result'],
  });

  private readonly healthCheckCounter = new Counter({
    name: 'whatsapp_healthcheck_total',
    help: 'Total health checks',
    labelNames: ['workspaceId', 'status'],
  });

  constructor(
    private readonly prisma: PrismaService,
    private readonly providerRegistry: WhatsAppProviderRegistry,
  ) {}

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

    try {
      // Buscar workspaces com WhatsApp configurado (qualquer provider)
      const workspaces = await this.prisma.workspace.findMany({
        where: {
          OR: [
            { providerSettings: { path: ['whatsappProvider'], not: 'none' } },
            { providerSettings: { path: ['meta', 'token'], not: '' } },
            { providerSettings: { path: ['wpp'], not: {} } },
          ],
        },
        select: {
          id: true,
          name: true,
          providerSettings: true,
        },
      });

      this.logger.debug(`🐕 Checking ${workspaces.length} workspaces`);

      for (const workspace of workspaces) {
        await this.checkWorkspaceSession(workspace.id, workspace.name);
      }
    } catch (error: any) {
      this.logger.error(`❌ Health check cycle failed: ${error.message}`);
    }
  }

  /**
   * Verifica e tenta reconectar uma sessão específica
   */
  async checkWorkspaceSession(workspaceId: string, workspaceName?: string): Promise<SessionHealth> {
    const now = new Date();
    let health = this.sessionHealth.get(workspaceId) || {
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

      // Atualizar métricas
      this.sessionStatusGauge.set({ workspaceId }, status.connected ? 1 : 0);
      this.healthCheckCounter.inc({ workspaceId, status: status.connected ? 'ok' : 'disconnected' });

      if (status.connected) {
        // Sessão OK
        if (!wasConnected) {
          health.upSince = now;
          this.logger.log(`✅ Session reconnected: ${workspaceName || workspaceId}`);
        }
        health.consecutiveFailures = 0;
      } else {
        // Sessão desconectada
        health.consecutiveFailures++;

        this.logger.warn(
          `⚠️ Session disconnected: ${workspaceName || workspaceId} ` +
          `(failures: ${health.consecutiveFailures}, status: ${status.status})`
        );

        // Tentar reconectar se dentro do cooldown
        if (this.shouldAttemptReconnect(health)) {
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
      this.logger.error(`❌ Check failed for ${workspaceName || workspaceId}: ${error.message}`);
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
    health.lastReconnectAttempt = new Date();

    try {
      this.logger.log(`🔄 Attempting reconnect: ${workspaceName || workspaceId}`);

      // Tentar iniciar sessão
      const result = await this.providerRegistry.startSession(workspaceId);

      if (result.success) {
        this.reconnectCounter.inc({ workspaceId, result: 'success' });
        this.logger.log(`✅ Reconnect successful: ${workspaceName || workspaceId}`);
        health.consecutiveFailures = 0;
        health.connected = true;
        health.upSince = new Date();
        return true;
      } else {
        this.reconnectCounter.inc({ workspaceId, result: 'failed' });
        this.logger.warn(`⚠️ Reconnect failed: ${workspaceName || workspaceId} - ${result.message}`);
        return false;
      }
    } catch (error: any) {
      this.reconnectCounter.inc({ workspaceId, result: 'error' });
      this.logger.error(`❌ Reconnect error: ${workspaceName || workspaceId} - ${error.message}`);
      return false;
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
      if (elapsed < this.RECONNECT_COOLDOWN_MS) {
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
          message: `WhatsApp session disconnected for ${workspaceName || workspaceId}. ` +
                   `${health.consecutiveFailures} consecutive failures.`,
          at: new Date().toISOString(),
          env: process.env.NODE_ENV || 'development',
        }),
      });
      this.logger.warn(`🚨 Alert sent for workspace ${workspaceName || workspaceId}`);
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
  async forceReconnect(workspaceId: string): Promise<{ success: boolean; message: string }> {
    const workspace = await this.prisma.workspace.findUnique({
      where: { id: workspaceId },
      select: { name: true },
    });

    let health = this.sessionHealth.get(workspaceId) || {
      workspaceId,
      connected: false,
      lastCheck: new Date(),
      consecutiveFailures: 0,
    };

    // Reset cooldown para permitir reconexão imediata
    health.lastReconnectAttempt = undefined;
    
    const success = await this.attemptReconnect(workspaceId, workspace?.name, health);
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
      connected: sessions.filter(s => s.connected).length,
      disconnected: sessions.filter(s => !s.connected).length,
      withFailures: sessions.filter(s => s.consecutiveFailures > 0).length,
    };
  }
}
