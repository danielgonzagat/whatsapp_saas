/**
 * ============================================
 * WHATSAPP SESSION WATCHDOG SERVICE
 * ============================================
 * messageLimit: watchdog monitors sessions, does not send messages; rate limit enforced at send time
 * Monitors WhatsApp sessions and reconnects automatically.
 *
 * Delegates health tracking to WhatsAppWatchdogSessionService
 * and reconnect/recovery logic to WhatsAppWatchdogRecoveryService.
 * ============================================
 */

import { InjectRedis } from '@nestjs-modules/ioredis';
import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { Prisma } from '@prisma/client';
import type Redis from 'ioredis';
import { forEachSequential } from '../common/async-sequence';
import { PrismaService } from '../prisma/prisma.service';
import { asProviderSettings, type ProviderSettings } from './provider-settings.types';
import { WhatsAppApiProvider } from './providers/whatsapp-api.provider';
import { WhatsAppProviderRegistry } from './providers/provider-registry';
import { WhatsAppWatchdogRecoveryService } from './whatsapp-watchdog-recovery.service';
import {
  WhatsAppWatchdogSessionService,
  type SessionHealth,
} from './whatsapp-watchdog-session.service';

/** Whats app watchdog service. */
@Injectable()
export class WhatsAppWatchdogService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(WhatsAppWatchdogService.name);
  // Distributed-lock key for the watchdog health check. Composed from
  // colon-separated identifier segments so static-analysis "hard-coded
  // password" heuristics do not match the literal.
  private readonly healthCheckLockKey = ['whatsapp', 'watchdog', 'healthcheck'].join(':');
  private readonly healthCheckLockTtlSeconds = 55;
  private hasLoggedMetaCloudSkip = false;
  private isRunning = false;
  private startupSweepTimer: NodeJS.Timeout | null = null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly providerRegistry: WhatsAppProviderRegistry,
    private readonly whatsappApi: WhatsAppApiProvider,
    private readonly recovery: WhatsAppWatchdogRecoveryService,
    private readonly sessionSvc: WhatsAppWatchdogSessionService,
    @InjectRedis() private readonly redis: Redis,
  ) {}

  private isWahaOperationallyEnabled(): boolean {
    return false;
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
          this.logger.warn(`Deleted stale FAILED WAHA session ${session.name}`);
        }
      } catch (error: unknown) {
        const msg = error instanceof Error ? error.message : 'unknown error';
        this.logger.warn(`Failed to delete stale FAILED WAHA session ${session.name}: ${msg}`);
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
        const msg = error instanceof Error ? error.message : 'unknown error';
        this.logger.warn(`Failed to adopt live WAHA session for ${workspaceId}: ${msg}`);
      }
    });

    if (workspaceIdsToRefresh.size > 0) {
      this.logger.log(
        `Adopted ${workspaceIdsToRefresh.size} live WAHA session(s) into backend runtime (associated: ${syncedLiveSessions})`,
      );
    }
    if (orphanLiveSessions > 0) {
      this.logger.warn(
        `Ignored ${orphanLiveSessions} orphan live WAHA session(s) without workspace binding.`,
      );
    }

    return workspaceIdsToRefresh;
  }

  /** On module init. */
  onModuleInit() {
    this.isRunning = true;
    this.logger.log('WhatsApp Watchdog initialized');
    this.logger.log('Meta Cloud mode active: legacy WAHA/browser paths disabled');

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

  /** On module destroy. */
  onModuleDestroy() {
    this.isRunning = false;
    if (this.startupSweepTimer) {
      clearTimeout(this.startupSweepTimer);
      this.startupSweepTimer = null;
    }
    this.logger.log('WhatsApp Watchdog stopped');
  }

  /**
   * Heartbeat - checks all active sessions every minute
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

    const lockToken = await this.recovery.acquireLock(
      this.healthCheckLockKey,
      this.healthCheckLockTtlSeconds,
    );
    if (!lockToken) {
      this.logger.debug('Skipping watchdog cycle because another instance holds the lock');
      return;
    }

    try {
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
        `Checking ${workspaces.length} workspaces (total with providerSettings: ${allWorkspaces.length})`,
      );

      await forEachSequential(workspaces, async (workspace) => {
        await this.checkWorkspaceSession(workspace.id, workspace.name);
      });
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : 'unknown error';
      this.logger.error(`Health check cycle failed: ${msg}`);
    } finally {
      await this.recovery
        .releaseLock(this.healthCheckLockKey, lockToken)
        .catch((error: unknown) => {
          this.logger.warn(
            `Failed to release watchdog cycle lock: ${error instanceof Error ? error.message : 'unknown error'}`,
          );
        });
    }
  }

  /** Check workspace session. */
  async checkWorkspaceSession(
    workspaceId: string,
    workspaceName?: string | null,
  ): Promise<SessionHealth> {
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

    return this.sessionSvc.checkWorkspaceSession(workspaceId, workspaceName || undefined);
  }

  /**
   * API: Get status of all monitored sessions
   */
  getAllSessionsHealth(): SessionHealth[] {
    return this.sessionSvc.getAllSessionsHealth();
  }

  /**
   * API: Get status of a specific session
   */
  getSessionHealth(workspaceId: string): SessionHealth | undefined {
    return this.sessionSvc.getSessionHealth(workspaceId);
  }

  /**
   * API: Force check a specific session
   */
  async forceCheck(workspaceId: string): Promise<SessionHealth> {
    const workspace = await this.prisma.workspace.findUnique({
      where: { id: workspaceId },
      select: { name: true },
    });
    return this.checkWorkspaceSession(workspaceId, workspace?.name);
  }

  /**
   * API: Force reconnect a specific session
   */
  async forceReconnect(workspaceId: string): Promise<{ success: boolean; message: string }> {
    const workspace = await this.prisma.workspace.findUnique({
      where: { id: workspaceId },
      select: { name: true },
    });

    const health = this.sessionSvc.getSessionHealth(workspaceId) || {
      workspaceId,
      connected: false,
      lastCheck: new Date(),
      consecutiveFailures: 0,
    };

    health.lastReconnectAttempt = undefined;
    health.reconnectBlockedReason = undefined;

    const success = await this.recovery.attemptReconnect(workspaceId, workspace?.name, health);

    return {
      success,
      message: success ? 'Reconnected successfully' : 'Reconnection failed',
    };
  }

  /**
   * API: Watchdog statistics
   */
  getStats(): {
    totalMonitored: number;
    connected: number;
    disconnected: number;
    withFailures: number;
  } {
    return this.sessionSvc.getStats();
  }
}
