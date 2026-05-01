/**
 * ============================================
 * WHATSAPP WATCHDOG RECOVERY SERVICE
 * ============================================
 * Handles reconnect attempts, autonomy bootstrap,
 * distributed lock helpers, and ops alerting.
 * ============================================
 */

import { randomUUID } from 'node:crypto';
import { InjectRedis } from '@nestjs-modules/ioredis';
import { Injectable, Logger } from '@nestjs/common';
import type Redis from 'ioredis';
import { safeCompareStrings } from '../common/utils/crypto-compare.util';
import { PrismaService } from '../prisma/prisma.service';
import { CiaRuntimeService } from './cia-runtime.service';
import { WhatsAppProviderRegistry } from './providers/provider-registry';
import { asProviderSettings } from './provider-settings.types';
import { WhatsAppCatchupService } from './whatsapp-catchup.service';
import { toPrismaJsonValue } from '../common/prisma/prisma-json.util';
import type { SessionHealth } from './whatsapp-watchdog-session.service';
import { alertOpsHelper } from './__companions__/whatsapp-watchdog-recovery.service.companion';

/** Watchdog recovery and reconnect service. */
@Injectable()
export class WhatsAppWatchdogRecoveryService {
  private readonly logger = new Logger(WhatsAppWatchdogRecoveryService.name);

  private readonly RECONNECT_COOLDOWN_MS = 60_000;
  private readonly MAX_RECONNECT_BACKOFF_MS = 15 * 60_000;
  private readonly MAX_CONSECUTIVE_FAILURES = 5;

  readonly reconnectLockTtlSeconds = Math.max(
    60,
    Number.parseInt(process.env.WAHA_WATCHDOG_RECONNECT_LOCK_TTL_SECONDS || '300', 10) || 300,
  );

  readonly connectedMaintenanceIntervalSeconds = Math.max(
    30,
    Number.parseInt(
      process.env.WAHA_WATCHDOG_CONNECTED_MAINTENANCE_INTERVAL_SECONDS || '300',
      10,
    ) || 300,
  );

  private readonly pendingStatuses = new Set(['SCAN_QR_CODE', 'QR_PENDING', 'STARTING', 'OPENING']);

  constructor(
    private readonly prisma: PrismaService,
    private readonly providerRegistry: WhatsAppProviderRegistry,
    private readonly catchupService: WhatsAppCatchupService,
    private readonly ciaRuntime: CiaRuntimeService,
    @InjectRedis() private readonly redis: Redis,
  ) {}

  // ---------------------------------------------------------------------------
  // Lock helpers
  // ---------------------------------------------------------------------------

  getReconnectLockKey(workspaceId: string): string {
    return `whatsapp:watchdog:reconnect:${workspaceId}`;
  }

  async acquireLock(key: string, ttlSeconds: number): Promise<string | null> {
    const token = randomUUID();
    const acquired = await this.redis.set(key, token, 'EX', ttlSeconds, 'NX');
    return acquired === 'OK' ? token : null;
  }

  async releaseLock(key: string, token: string): Promise<void> {
    const current = await this.redis.get(key);
    // Constant-time comparison: lock tokens are security-relevant — using `===`
    // could leak ownership via timing side channels (Codacy/Semgrep S5547).
    if (current && safeCompareStrings(current, token)) {
      await this.redis.del(key);
    }
  }

  getReconnectCooldownMs(consecutiveFailures: number): number {
    const exponent = Math.max(0, Math.min(consecutiveFailures - 1, 4));
    return Math.min(this.RECONNECT_COOLDOWN_MS * 2 ** exponent, this.MAX_RECONNECT_BACKOFF_MS);
  }

  // ---------------------------------------------------------------------------
  // Connected workspace maintenance
  // ---------------------------------------------------------------------------

  getConnectedMaintenanceKey(workspaceId: string): string {
    return `whatsapp:watchdog:connected-maintenance:${workspaceId}`;
  }

  async maintainConnectedWorkspace(
    workspaceId: string,
    workspaceName?: string,
    reason = 'watchdog_connected_scan',
  ): Promise<boolean> {
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
      await this.ciaRuntime.ensureBacklogCoverage(workspaceId, { triggeredBy: reason });
      return true;
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : 'unknown error';
      this.logger.warn(`Connected maintenance failed for ${workspaceName || workspaceId}: ${msg}`);
      return false;
    }
  }

  // ---------------------------------------------------------------------------
  // Autonomy bootstrap
  // ---------------------------------------------------------------------------

  private readText(value: unknown): string {
    return typeof value === 'string' ? value : '';
  }

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

  async tryBootstrapAutonomy(
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
      const msg =
        error instanceof Error
          ? error.message
          : typeof error === 'string'
            ? error
            : 'unknown error';
      this.logger.warn(`Failed to auto-bootstrap CIA for ${workspaceName || workspaceId}: ${msg}`);
      return false;
    }
  }

  // ---------------------------------------------------------------------------
  // Reconnect decision and execution
  // ---------------------------------------------------------------------------

  shouldAttemptReconnect(health: SessionHealth): boolean {
    if (health.consecutiveFailures > this.MAX_CONSECUTIVE_FAILURES) {
      return false;
    }

    if (health.lastReconnectAttempt) {
      const elapsed = Date.now() - health.lastReconnectAttempt.getTime();
      if (elapsed < this.getReconnectCooldownMs(health.consecutiveFailures)) {
        return false;
      }
    }

    return true;
  }

  async attemptReconnect(
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
      this.logger.log(`Attempting reconnect: ${workspaceName || workspaceId}`);

      const result = await this.providerRegistry.startSession(workspaceId);

      if (result.success) {
        const status = await this.providerRegistry.getSessionStatus(workspaceId);
        const normalizedStatus = String(status.status || 'unknown').toUpperCase();

        if (status.connected) {
          this.logger.log(`Reconnect confirmed: ${workspaceName || workspaceId}`);
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
          this.logger.log(
            `Reconnect pending human action: ${workspaceName || workspaceId} (status: ${normalizedStatus})`,
          );
          health.connected = false;
          health.consecutiveFailures = 0;
          health.reconnectBlockedReason = undefined;
          return false;
        }

        this.logger.warn(
          `Reconnect start succeeded but still ${normalizedStatus}: ${workspaceName || workspaceId}`,
        );
        health.connected = false;
        return false;
      }

      this.logger.warn(`Reconnect failed: ${workspaceName || workspaceId} - ${result.message}`);
      return false;
    } catch (error: unknown) {
      const msg =
        error instanceof Error
          ? error.message
          : typeof error === 'string'
            ? error
            : 'unknown error';
      this.logger.error(`Reconnect error: ${workspaceName || workspaceId} - ${msg}`);
      return false;
    } finally {
      await this.releaseLock(reconnectLockKey, reconnectLockToken).catch((error: unknown) => {
        const msg = error instanceof Error ? error.message : 'unknown error';
        this.logger.warn(
          `Failed to release reconnect lock for ${workspaceName || workspaceId}: ${msg}`,
        );
      });
    }
  }

  // ---------------------------------------------------------------------------
  // Ops alerting
  // ---------------------------------------------------------------------------

  async alertOps(
    workspaceId: string,
    workspaceName: string | undefined,
    health: SessionHealth,
  ): Promise<void> {
    return alertOpsHelper(this.logger, workspaceId, workspaceName, health);
  }
}
