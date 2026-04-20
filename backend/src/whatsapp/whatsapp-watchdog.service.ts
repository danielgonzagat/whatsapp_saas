/**
 * ============================================
 * WHATSAPP SESSION WATCHDOG SERVICE
 * ============================================
 * messageLimit: watchdog monitors sessions, does not send messages; rate limit enforced at send time
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

import { randomUUID } from 'node:crypto';
import { InjectRedis } from '@nestjs-modules/ioredis';
import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { Prisma } from '@prisma/client';
import type Redis from 'ioredis';
import { Counter, Gauge, register } from 'prom-client';
import { forEachSequential } from '../common/async-sequence';
import { toPrismaJsonValue } from '../common/prisma/prisma-json.util';
import { validateNoInternalAccess } from '../common/utils/url-validator';
import { PrismaService } from '../prisma/prisma.service';
import { CiaRuntimeService } from './cia-runtime.service';
import { WhatsAppProviderRegistry } from './providers/provider-registry';
import { asProviderSettings, type ProviderSettings } from './provider-settings.types';
import { WhatsAppApiProvider } from './providers/whatsapp-api.provider';
import { WhatsAppCatchupService } from './whatsapp-catchup.service';

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
    Number.parseInt(process.env.WAHA_WATCHDOG_RECONNECT_LOCK_TTL_SECONDS || '300', 10) || 300,
  );
  private readonly connectedMaintenanceIntervalSeconds = Math.max(
    30,
    Number.parseInt(
      process.env.WAHA_WATCHDOG_CONNECTED_MAINTENANCE_INTERVAL_SECONDS || '300',
      10,
    ) || 300,
  );
  private hasLoggedMetaCloudSkip = false;
  private isRunning = false;
  private startupSweepTimer: NodeJS.Timeout | null = null;
  private readonly pendingStatuses = new Set(['SCAN_QR_CODE', 'QR_PENDING', 'STARTING', 'OPENING']);

  // Métricas Prometheus
  private readonly sessionStatusGauge =
    (register.getSingleMetric('whatsapp_session_status') as Gauge<string>) ||
    new Gauge({
      name: 'whatsapp_session_status',
      help: 'WhatsApp session status (1=connected, 0=disconnected)',
      labelNames: ['workspaceId'],
    });

  private isWahaOperationallyEnabled(): boolean {
    return false;
  }

  private readonly reconnectCounter =
    (register.getSingleMetric('whatsapp_reconnect_attempts_total') as Counter<string>) ||
    new Counter({
      name: 'whatsapp_reconnect_attempts_total',
      help: 'Total reconnect attempts',
      labelNames: ['workspaceId', 'result'],
    });

  private readonly healthCheckCounter =
    (register.getSingleMetric('whatsapp_healthcheck_total') as Counter<string>) ||
    new Counter({
      name: 'whatsapp_healthcheck_total',
      help: 'Total health checks',
      labelNames: ['workspaceId', 'status'],
    });

  constructor(
    private readonly prisma: PrismaService,
    private readonly providerRegistry: WhatsAppProviderRegistry,
    private readonly whatsappApi: WhatsAppApiProvider,
    private readonly catchupService: WhatsAppCatchupService,
    private readonly ciaRuntime: CiaRuntimeService,
    @InjectRedis() private readonly redis: Redis,
  ) {}

  private isRuntimeActive(autonomyMode: string, runtimeState: string): boolean {
    return (
      ['LIVE', 'BACKLOG', 'FULL'].includes(autonomyMode) ||
      ['LIVE_READY', 'LIVE_AUTONOMY', 'EXECUTING_IMMEDIATELY', 'EXECUTING_BACKLOG'].includes(
        runtimeState,
      )
    );
  }

  private async resetStaleRuntime(
    workspaceId: string,
    settings: ReturnType<typeof asProviderSettings>,
    autonomy: NonNullable<ReturnType<typeof asProviderSettings>['autonomy']>,
    runtime: NonNullable<ReturnType<typeof asProviderSettings>['ciaRuntime']>,
    autonomyMode: string,
  ): Promise<void> {
    const now = new Date().toISOString();
    const preserveManualBlock = autonomyMode === 'HUMAN_ONLY' || autonomyMode === 'SUSPENDED';

    await this.prisma.workspace.update({
      where: { id: workspaceId },
      data: {
        providerSettings: toPrismaJsonValue({
          ...settings,
          autonomy: preserveManualBlock
            ? {
                ...autonomy,
                lastRuntimeResetAt: now,
                lastRuntimeResetReason: 'watchdog_stale_bootstrap',
              }
            : {
                ...autonomy,
                mode: null,
                lastRuntimeResetAt: now,
                lastRuntimeResetReason: 'watchdog_stale_bootstrap',
              },
          ciaRuntime: {
            ...runtime,
            state: null,
            currentRunId: null,
            mode: null,
            autoStarted: false,
            lastRuntimeResetAt: now,
            lastRuntimeResetReason: 'watchdog_stale_bootstrap',
          },
        }),
      },
    });

    await this.redis
      .del(
        `cia:bootstrap:${workspaceId}`,
        `whatsapp:catchup:${workspaceId}`,
        `whatsapp:catchup:cooldown:${workspaceId}`,
      )
      .catch(() => undefined);
  }

  private async tryBootstrapAutonomy(
    workspaceId: string,
    workspaceName?: string,
    reason = 'watchdog_connected',
  ): Promise<boolean> {
    const workspace = await this.prisma.workspace.findUnique({
      where: { id: workspaceId },
      select: { providerSettings: true },
    });

    const settings = asProviderSettings(workspace?.providerSettings);
    const autonomy = settings.autonomy ?? {};
    const runtime = settings.ciaRuntime ?? {};
    if (autonomy.autoBootstrapOnConnected === false) {
      return false;
    }

    const autonomyMode = String(autonomy.mode || '').toUpperCase();
    const runtimeState = String(runtime.state || '').toUpperCase();
    const lastBootstrapRaw =
      this.readText(runtime.lastBootstrapAt) || this.readText(runtime.startedAt);
    const lastBootstrapAt = Date.parse(lastBootstrapRaw);

    const runtimeAppearsActive = this.isRuntimeActive(autonomyMode, runtimeState);
    const staleRuntime =
      runtimeAppearsActive &&
      !String(runtime.currentRunId || '').trim() &&
      Number.isFinite(lastBootstrapAt) &&
      lastBootstrapAt > 0 &&
      Date.now() - lastBootstrapAt > 60 * 60 * 1000;

    if (staleRuntime) {
      await this.resetStaleRuntime(workspaceId, settings, autonomy, runtime, autonomyMode);
    } else if (runtimeAppearsActive || Boolean(String(runtime.currentRunId || '').trim())) {
      return false;
    }

    const lockKey = `cia:bootstrap:${workspaceId}`;
    const locked = await this.redis.set(lockKey, reason, 'EX', 120, 'NX');
    if (locked !== 'OK') {
      return false;
    }

    try {
      await this.ciaRuntime.bootstrap(workspaceId);
      return true;
    } catch (error: unknown) {
      const errorInstanceofError =
        error instanceof Error
          ? error
          : new Error(typeof error === 'string' ? error : 'unknown error');
      this.logger.warn(
        `Failed to auto-bootstrap CIA for ${workspaceName || workspaceId}: ${errorInstanceofError.message}`,
      );
      return false;
    }
  }

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

  private async getReconnectBlockReason(workspaceId: string): Promise<string | null> {
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

  private readText(value: unknown): string {
    return typeof value === 'string' ? value : '';
  }

  private isGuestWorkspace(workspaceName?: string, settings?: ProviderSettings | null): boolean {
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
    const settings = asProviderSettings(workspace.providerSettings);
    const lifecycle = settings.whatsappLifecycle ?? {};

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

    return (
      settings?.whatsappProvider === 'whatsapp-api' ||
      settings?.whatsappProvider === 'whatsapp-web-agent' ||
      Boolean(settings?.whatsappApiSession) ||
      Boolean(settings?.whatsappWebSession)
    );
  }

  private getConnectedMaintenanceKey(workspaceId: string): string {
    return `whatsapp:watchdog:connected-maintenance:${workspaceId}`;
  }

  private async maintainConnectedWorkspace(
    workspaceId: string,
    workspaceName?: string,
    reason = 'watchdog_connected_scan',
  ) {
    const maintenanceKey = this.getConnectedMaintenanceKey(workspaceId);
    const reserved = await this.redis.set(
      maintenanceKey,
      reason,
      'EX',
      this.connectedMaintenanceIntervalSeconds,
      'NX',
    );

    if (reserved !== 'OK') {
      return false;
    }

    try {
      await this.catchupService.triggerCatchup(workspaceId, reason);
      await this.ciaRuntime.ensureBacklogCoverage(workspaceId, {
        triggeredBy: reason,
      });
      return true;
    } catch (error: unknown) {
      const errorInstanceofError =
        error instanceof Error
          ? error
          : new Error(typeof error === 'string' ? error : 'unknown error');
      this.logger.warn(
        `Connected maintenance failed for ${workspaceName || workspaceId}: ${errorInstanceofError.message}`,
      );
      return false;
    }
  }

  private async cleanupFailedSessions(): Promise<number> {
    if (!this.isWahaOperationallyEnabled()) {
      return 0;
    }

    const sessions = await this.whatsappApi.listSessions().catch(() => []);
    if (!Array.isArray(sessions) || sessions.length === 0) {
      return 0;
    }

    let deleted = 0;
    await forEachSequential(sessions, async (session) => {
      if (String(session.state || '').toUpperCase() !== 'FAILED') {
        return;
      }

      try {
        const removed = await this.whatsappApi.deleteSession(session.name);
        if (removed) {
          deleted += 1;
          this.logger.warn(`🧹 Deleted stale FAILED WAHA session ${session.name}`);
        }
      } catch (error: unknown) {
        const errorInstanceofError =
          error instanceof Error
            ? error
            : new Error(typeof error === 'string' ? error : 'unknown error');
        this.logger.warn(
          `Failed to delete stale FAILED WAHA session ${session.name}: ${errorInstanceofError.message}`,
        );
      }
    });

    return deleted;
  }

  private async adoptLiveSessions(
    workspaces: Array<{
      id: string;
      name?: string | null;
      providerSettings?: unknown;
    }>,
  ): Promise<Set<string>> {
    if (!this.isWahaOperationallyEnabled()) {
      return new Set();
    }

    const liveSessions = await this.whatsappApi.listSessions().catch(() => []);
    if (!liveSessions.length) {
      return new Set();
    }

    const eligibleStates = new Set(['CONNECTED']);
    const workspaceIdsToRefresh = new Set<string>();
    const workspaceBySessionName = new Map<string, string>();
    let syncedLiveSessions = 0;
    let orphanLiveSessions = 0;

    for (const workspace of workspaces) {
      const settings = asProviderSettings(workspace.providerSettings);
      if (this.isGuestWorkspace(workspace.name || undefined, settings)) {
        continue;
      }

      workspaceBySessionName.set(workspace.id, workspace.id);

      const storedSessionName = String(
        settings?.whatsappWebSession?.sessionName ||
          settings?.whatsappApiSession?.sessionName ||
          '',
      ).trim();
      if (storedSessionName) {
        workspaceBySessionName.set(storedSessionName, workspace.id);
      }
    }

    for (const session of liveSessions) {
      if (!eligibleStates.has(String(session.state || '').toUpperCase())) {
        continue;
      }

      const workspaceId = workspaceBySessionName.get(session.name);
      if (!workspaceId) {
        orphanLiveSessions++;
        continue;
      }

      syncedLiveSessions++;
      workspaceIdsToRefresh.add(workspaceId);
    }

    await forEachSequential(workspaceIdsToRefresh, async (workspaceId) => {
      try {
        await this.providerRegistry.getSessionStatus(workspaceId);
      } catch (error: unknown) {
        const errorInstanceofError =
          error instanceof Error
            ? error
            : new Error(typeof error === 'string' ? error : 'unknown error');
        this.logger.warn(
          `Failed to adopt live WAHA session for ${workspaceId}: ${errorInstanceofError.message}`,
        );
      }
    });

    if (workspaceIdsToRefresh.size > 0) {
      this.logger.log(
        `🔁 Adopted ${workspaceIdsToRefresh.size} live WAHA session(s) into backend runtime (already associated: ${syncedLiveSessions})`,
      );
    }
    if (orphanLiveSessions > 0) {
      this.logger.warn(
        `⚠️ Ignored ${orphanLiveSessions} orphan live WAHA session(s) without workspace binding.`,
      );
    }

    return workspaceIdsToRefresh;
  }

  private getReconnectLockKey(workspaceId: string): string {
    return `whatsapp:watchdog:reconnect:${workspaceId}`;
  }

  private async acquireLock(key: string, ttlSeconds: number): Promise<string | null> {
    const token = randomUUID();
    const acquired = await this.redis.set(key, token, 'EX', ttlSeconds, 'NX');
    return acquired === 'OK' ? token : null;
  }

  private async releaseLock(key: string, token: string): Promise<void> {
    const current = await this.redis.get(key);
    // Not a security-sensitive comparison — comparing Redis lock tokens (random UUIDs)
    // for distributed-lock ownership. Timing leakage is irrelevant here.
    if (current === token) {
      await this.redis.del(key);
    }
  }

  private getReconnectCooldownMs(consecutiveFailures: number): number {
    const exponent = Math.max(0, Math.min(consecutiveFailures - 1, 4));
    return Math.min(this.RECONNECT_COOLDOWN_MS * 2 ** exponent, this.MAX_RECONNECT_BACKOFF_MS);
  }

  private async persistSessionDiagnostics(
    workspaceId: string,
    update: {
      lastHeartbeatAt?: string | null;
      lastSeenWorkingAt?: string | null;
      lastWatchdogDisconnectedAt?: string | null;
      watchdogReconnectBlockedReason?: string | null;
    },
  ) {
    try {
      const workspace = await this.prisma.workspace.findUnique({
        where: { id: workspaceId },
        select: { providerSettings: true },
      });
      if (!workspace) {
        return;
      }

      const settings = asProviderSettings(workspace.providerSettings);
      const sessionMeta = settings.whatsappWebSession || settings.whatsappApiSession || {};

      await this.prisma.workspace.update({
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
    } catch (error: unknown) {
      const errorInstanceofError =
        error instanceof Error
          ? error
          : new Error(typeof error === 'string' ? error : 'unknown error');
      this.logger.warn(
        `Failed to persist watchdog diagnostics for ${workspaceId}: ${errorInstanceofError.message}`,
      );
    }
  }

  onModuleInit() {
    this.isRunning = true;
    this.logger.log('🐕 WhatsApp Watchdog initialized');
    this.logger.log('🧭 Meta Cloud mode active: legacy WAHA/browser paths disabled');

    const runOnStartup =
      process.env.NODE_ENV !== 'test' && process.env.WAHA_WATCHDOG_RUN_ON_STARTUP !== 'false';

    if (runOnStartup) {
      this.startupSweepTimer = setTimeout(() => {
        void this.runHealthCheck().catch((error: unknown) => {
          this.logger.warn(
            `Startup watchdog sweep failed: ${error instanceof Error ? error.message : 'unknown error'}`,
          );
        });
      }, 5_000);
    }
  }

  onModuleDestroy() {
    this.isRunning = false;
    if (this.startupSweepTimer) {
      clearTimeout(this.startupSweepTimer);
      this.startupSweepTimer = null;
    }
    this.logger.log('🐕 WhatsApp Watchdog stopped');
  }

  /**
   * Heartbeat - verifica todas as sessões ativas a cada 2 minutos
   */
  @Cron(CronExpression.EVERY_MINUTE)
  async runHealthCheck() {
    if (!this.isRunning) {
      return;
    }
    if (!this.isWahaOperationallyEnabled()) {
      if (!this.hasLoggedMetaCloudSkip) {
        this.logger.debug('Watchdog sweep skipped: Meta Cloud mode');
        this.hasLoggedMetaCloudSkip = true;
      }
      return;
    }
    this.hasLoggedMetaCloudSkip = false;

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
        take: 500,
      });

      await this.cleanupFailedSessions();
      const adoptedWorkspaceIds = await this.adoptLiveSessions(allWorkspaces);

      const workspaces = allWorkspaces.filter(
        (ws) => this.shouldMonitorWorkspace(ws) || adoptedWorkspaceIds.has(ws.id),
      );

      this.logger.debug(
        `🐕 Checking ${workspaces.length} workspaces (total with providerSettings: ${allWorkspaces.length})`,
      );

      await forEachSequential(workspaces, async (workspace) => {
        await this.checkWorkspaceSession(workspace.id, workspace.name);
      });
    } catch (error: unknown) {
      const errorInstanceofError =
        error instanceof Error
          ? error
          : new Error(typeof error === 'string' ? error : 'unknown error');
      this.logger.error(`❌ Health check cycle failed: ${errorInstanceofError.message}`);
    } finally {
      await this.releaseLock(this.healthCheckLockKey, lockToken).catch((error: unknown) => {
        this.logger.warn(
          `Failed to release watchdog cycle lock: ${error instanceof Error ? error.message : 'unknown error'}`,
        );
      });
    }
  }

  /**
   * Verifica e tenta reconectar uma sessão específica
   */
  private async handleConnectedSession(
    workspaceId: string,
    workspaceName: string | undefined,
    health: SessionHealth,
    wasConnected: boolean,
    now: Date,
  ): Promise<void> {
    if (!wasConnected) {
      health.upSince = now;
      this.logger.log(`✅ Session reconnected: ${workspaceName || workspaceId}`);
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
      await this.tryBootstrapAutonomy(workspaceId, workspaceName, 'watchdog_reconnected');
    }
    await this.maintainConnectedWorkspace(
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
      `⚠️ Session disconnected: ${workspaceName || workspaceId} ` +
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
        `🛑 Auto-reconnect blocked for ${workspaceName || workspaceId}: ${reconnectBlockedReason}`,
      );
    } else if (this.shouldAttemptReconnect(health)) {
      await this.attemptReconnect(workspaceId, workspaceName, health);
    }

    if (health.consecutiveFailures === this.ALERT_THRESHOLD) {
      await this.alertOps(workspaceId, workspaceName, health);
    }
  }

  async checkWorkspaceSession(workspaceId: string, workspaceName?: string): Promise<SessionHealth> {
    if (!this.isWahaOperationallyEnabled()) {
      const now = new Date();
      return {
        workspaceId,
        connected: true,
        lastCheck: now,
        upSince: now,
        consecutiveFailures: 0,
      };
    }

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
          `⏳ Session awaiting action: ${workspaceName || workspaceId} ` +
            `(status: ${normalizedStatus})`,
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
      const errorInstanceofError =
        error instanceof Error
          ? error
          : new Error(typeof error === 'string' ? error : 'unknown error');
      health.consecutiveFailures++;
      health.lastCheck = now;
      this.healthCheckCounter.inc({ workspaceId, status: 'error' });
      this.logger.error(
        `❌ Check failed for ${workspaceName || workspaceId}: ${errorInstanceofError.message}`,
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
      this.logger.log(`🔄 Attempting reconnect: ${workspaceName || workspaceId}`);

      // Tentar iniciar sessão
      const result = await this.providerRegistry.startSession(workspaceId);

      if (result.success) {
        const status = await this.providerRegistry.getSessionStatus(workspaceId);
        const normalizedStatus = String(status.status || 'unknown').toUpperCase();

        if (status.connected) {
          this.reconnectCounter.inc({ workspaceId, result: 'success' });
          this.logger.log(`✅ Reconnect confirmed: ${workspaceName || workspaceId}`);
          health.consecutiveFailures = 0;
          health.connected = true;
          health.upSince = new Date();
          health.reconnectBlockedReason = undefined;
          await this.catchupService.triggerCatchup(workspaceId, 'watchdog_reconnected');
          await this.tryBootstrapAutonomy(workspaceId, workspaceName, 'watchdog_reconnected');
          await this.maintainConnectedWorkspace(workspaceId, workspaceName, 'watchdog_reconnected');
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
      }
      this.reconnectCounter.inc({ workspaceId, result: 'failed' });
      this.logger.warn(`⚠️ Reconnect failed: ${workspaceName || workspaceId} - ${result.message}`);
      return false;
    } catch (error: unknown) {
      const errorInstanceofError =
        error instanceof Error
          ? error
          : new Error(typeof error === 'string' ? error : 'unknown error');
      this.reconnectCounter.inc({ workspaceId, result: 'error' });
      this.logger.error(
        `❌ Reconnect error: ${workspaceName || workspaceId} - ${errorInstanceofError.message}`,
      );
      return false;
    } finally {
      await this.releaseLock(reconnectLockKey, reconnectLockToken).catch((error: unknown) => {
        this.logger.warn(
          `Failed to release reconnect lock for ${workspaceName || workspaceId}: ${error instanceof Error ? error.message : 'unknown error'}`,
        );
      });
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
    if (!webhook) {
      return;
    }

    try {
      validateNoInternalAccess(webhook);
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
        signal: AbortSignal.timeout(10000),
      });
      this.logger.warn(`🚨 Alert sent for workspace ${workspaceName || workspaceId}`);
    } catch (error: unknown) {
      const errorInstanceofError =
        error instanceof Error
          ? error
          : new Error(typeof error === 'string' ? error : 'unknown error');
      // PULSE:OK — Ops alert webhook non-critical; monitoring via logs continues
      this.logger.error(`Failed to send ops alert: ${errorInstanceofError.message}`);
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

    const health = this.sessionHealth.get(workspaceId) || {
      workspaceId,
      connected: false,
      lastCheck: new Date(),
      consecutiveFailures: 0,
    };

    // Reset cooldown para permitir reconexão imediata
    health.lastReconnectAttempt = undefined;
    health.reconnectBlockedReason = undefined;

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
      connected: sessions.filter((s) => s.connected).length,
      disconnected: sessions.filter((s) => !s.connected).length,
      withFailures: sessions.filter((s) => s.consecutiveFailures > 0).length,
    };
  }
}
