/**
 * ============================================
 * WHATSAPP WATCHDOG SESSION SERVICE
 * ============================================
 * Manages in-memory session health state,
 * persists diagnostics to the DB, and runs
 * the per-workspace health check logic.
 * ============================================
 */

import { Injectable, Logger } from '@nestjs/common';
import { Counter, Gauge, register } from 'prom-client';
import { PrismaService } from '../prisma/prisma.service';
import { WhatsAppProviderRegistry } from './providers/provider-registry';
import { asProviderSettings } from './provider-settings.types';
import { toPrismaJsonValue } from '../common/prisma/prisma-json.util';
import { WhatsAppWatchdogRecoveryService } from './whatsapp-watchdog-recovery.service';

export interface SessionHealth {
  workspaceId: string;
  connected: boolean;
  lastCheck: Date;
  consecutiveFailures: number;
  lastReconnectAttempt?: Date;
  upSince?: Date;
  reconnectBlockedReason?: string;
}

/** Manages per-workspace session health state and check logic. */
@Injectable()
export class WhatsAppWatchdogSessionService {
  private readonly logger = new Logger(WhatsAppWatchdogSessionService.name);
  private readonly sessionHealth = new Map<string, SessionHealth>();

  private readonly ALERT_THRESHOLD = 3;
  private readonly pendingStatuses = new Set(['SCAN_QR_CODE', 'QR_PENDING', 'STARTING', 'OPENING']);

  // Prometheus metrics
  private readonly sessionStatusGauge =
    (register.getSingleMetric('whatsapp_session_status') as Gauge<string>) ||
    new Gauge({
      name: 'whatsapp_session_status',
      help: 'WhatsApp session status (1=connected, 0=disconnected)',
      labelNames: ['workspaceId'],
    });

  private readonly healthCheckCounter =
    (register.getSingleMetric('whatsapp_healthcheck_total') as Counter<string>) ||
    new Counter({
      name: 'whatsapp_healthcheck_total',
      help: 'Total health checks',
      labelNames: ['workspaceId', 'status'],
    });

  private readonly reconnectCounter =
    (register.getSingleMetric('whatsapp_reconnect_attempts_total') as Counter<string>) ||
    new Counter({
      name: 'whatsapp_reconnect_attempts_total',
      help: 'Total reconnect attempts',
      labelNames: ['workspaceId', 'result'],
    });

  constructor(
    private readonly prisma: PrismaService,
    private readonly providerRegistry: WhatsAppProviderRegistry,
    private readonly recovery: WhatsAppWatchdogRecoveryService,
  ) {}

  // ---------------------------------------------------------------------------
  // Public read API
  // ---------------------------------------------------------------------------

  getAllSessionsHealth(): SessionHealth[] {
    return Array.from(this.sessionHealth.values());
  }

  getSessionHealth(workspaceId: string): SessionHealth | undefined {
    return this.sessionHealth.get(workspaceId);
  }

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

  // ---------------------------------------------------------------------------
  // Reconnect counter (delegated from recovery service for metric consistency)
  // ---------------------------------------------------------------------------

  incReconnectCounter(workspaceId: string, result: string): void {
    this.reconnectCounter.inc({ workspaceId, result });
  }

  // ---------------------------------------------------------------------------
  // Diagnostics persistence
  // ---------------------------------------------------------------------------

  async persistSessionDiagnostics(
    workspaceId: string,
    update: {
      lastHeartbeatAt?: string | null;
      lastSeenWorkingAt?: string | null;
      lastWatchdogDisconnectedAt?: string | null;
      watchdogReconnectBlockedReason?: string | null;
    },
  ): Promise<void> {
    try {
      await this.prisma.$transaction(async (tx) => {
        const workspace = await tx.workspace.findUnique({
          where: { id: workspaceId },
          select: { providerSettings: true },
        });
        if (!workspace) {
          return;
        }

        const settings = asProviderSettings(workspace.providerSettings);
        const sessionMeta = settings.whatsappWebSession || settings.whatsappApiSession || {};

        await tx.workspace.update({
          where: { id: workspaceId },
          data: {
            providerSettings: toPrismaJsonValue({
              ...settings,
              whatsappApiSession: {
                ...sessionMeta,
                ...update,
                lastUpdated: new Date().toISOString(),
              },
              whatsappWebSession: {
                ...sessionMeta,
                ...update,
                lastUpdated: new Date().toISOString(),
              },
            }),
          },
        });
      });
    } catch (error: unknown) {
      const msg =
        error instanceof Error
          ? error.message
          : typeof error === 'string'
            ? error
            : 'unknown error';
      this.logger.warn(`Failed to persist watchdog diagnostics for ${workspaceId}: ${msg}`);
    }
  }

  // ---------------------------------------------------------------------------
  // Reconnect block detection
  // ---------------------------------------------------------------------------

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

  async getReconnectBlockReason(workspaceId: string): Promise<string | null> {
    const workspace = await this.prisma.workspace.findUnique({
      where: { id: workspaceId },
      select: { providerSettings: true },
    });

    const settings = asProviderSettings(workspace?.providerSettings);
    const sessionMeta = settings.whatsappWebSession || settings.whatsappApiSession || {};
    const recoveryBlockedReason = String(sessionMeta.recoveryBlockedReason || '').trim();

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

  // ---------------------------------------------------------------------------
  // Per-session handlers
  // ---------------------------------------------------------------------------

  private async handleConnectedSession(
    workspaceId: string,
    workspaceName: string | undefined,
    health: SessionHealth,
    wasConnected: boolean,
    now: Date,
  ): Promise<void> {
    if (!wasConnected) {
      health.upSince = now;
      this.logger.log(`Session reconnected: ${workspaceName || workspaceId}`);
    }
    health.consecutiveFailures = 0;
    health.reconnectBlockedReason = undefined;

    await this.persistSessionDiagnostics(workspaceId, {
      lastHeartbeatAt: now.toISOString(),
      lastSeenWorkingAt: now.toISOString(),
      lastWatchdogDisconnectedAt: null,
      watchdogReconnectBlockedReason: null,
    });

    if (!wasConnected) {
      await this.recovery.tryBootstrapAutonomy(workspaceId, workspaceName, 'watchdog_reconnected');
    }

    await this.recovery.maintainConnectedWorkspace(
      workspaceId,
      workspaceName,
      !wasConnected ? 'watchdog_reconnected' : 'watchdog_connected_scan',
    );
  }

  private async handleDisconnectedSession(
    workspaceId: string,
    workspaceName: string | undefined,
    health: SessionHealth,
    normalizedStatus: string,
    now: Date,
  ): Promise<void> {
    health.consecutiveFailures++;

    this.logger.warn(
      `Session disconnected: ${workspaceName || workspaceId} ` +
        `(failures: ${health.consecutiveFailures}, status: ${normalizedStatus})`,
    );

    const reconnectBlockedReason = await this.getReconnectBlockReason(workspaceId);
    health.reconnectBlockedReason = reconnectBlockedReason || undefined;

    await this.persistSessionDiagnostics(workspaceId, {
      lastWatchdogDisconnectedAt: now.toISOString(),
      watchdogReconnectBlockedReason: reconnectBlockedReason || null,
    });

    if (reconnectBlockedReason) {
      this.logger.error(
        `Auto-reconnect blocked for ${workspaceName || workspaceId}: ${reconnectBlockedReason}`,
      );
    } else if (this.recovery.shouldAttemptReconnect(health)) {
      await this.recovery.attemptReconnect(workspaceId, workspaceName, health);
    }

    if (health.consecutiveFailures === this.ALERT_THRESHOLD) {
      await this.recovery.alertOps(workspaceId, workspaceName, health);
    }
  }

  // ---------------------------------------------------------------------------
  // Main check entry point
  // ---------------------------------------------------------------------------

  async checkWorkspaceSession(workspaceId: string, workspaceName?: string): Promise<SessionHealth> {
    const now = new Date();
    const health = this.sessionHealth.get(workspaceId) || {
      workspaceId,
      connected: false,
      lastCheck: now,
      consecutiveFailures: 0,
    };

    try {
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

      this.sessionStatusGauge.set({ workspaceId }, status.connected ? 1 : 0);
      this.healthCheckCounter.inc({ workspaceId, status: metricStatus });

      if (status.connected) {
        await this.handleConnectedSession(workspaceId, workspaceName, health, wasConnected, now);
      } else if (this.pendingStatuses.has(normalizedStatus)) {
        health.consecutiveFailures = 0;
        health.reconnectBlockedReason = undefined;
        this.logger.debug(
          `Session awaiting action: ${workspaceName || workspaceId} (status: ${normalizedStatus})`,
        );
      } else {
        await this.handleDisconnectedSession(
          workspaceId,
          workspaceName,
          health,
          normalizedStatus,
          now,
        );
      }
    } catch (error: unknown) {
      const msg =
        error instanceof Error
          ? error.message
          : typeof error === 'string'
            ? error
            : 'unknown error';
      health.consecutiveFailures++;
      health.lastCheck = now;
      this.healthCheckCounter.inc({ workspaceId, status: 'error' });
      this.logger.error(`Check failed for ${workspaceName || workspaceId}: ${msg}`);
    }

    this.sessionHealth.set(workspaceId, health);
    return health;
  }
}
