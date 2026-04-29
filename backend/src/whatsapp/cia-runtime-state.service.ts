import { Injectable, Logger, Optional } from '@nestjs/common';
import { toPrismaJsonValue } from '../common/prisma/prisma-json.util';
import { OpsAlertService } from '../observability/ops-alert.service';
import { PrismaService } from '../prisma/prisma.service';
import { buildQueueJobId } from '../queue/job-id.util';
import { autopilotQueue } from '../queue/queue';
import { AgentEventsService } from './agent-events.service';
import { asProviderSettings } from './provider-settings.types';

const CIA_CONTACT_CATALOG_LOOKBACK_DAYS = Math.max(
  7,
  Number.parseInt(process.env.CIA_CONTACT_CATALOG_LOOKBACK_DAYS || '30', 10) || 30,
);

const CIA_RUNTIME_STALE_RUN_MS = Math.max(
  60_000,
  Number.parseInt(process.env.CIA_RUNTIME_STALE_RUN_MS || `${10 * 60 * 1000}`, 10) ||
    10 * 60 * 1000,
);

type WorkspaceAutonomyMode = 'OFF' | 'LIVE' | 'BACKLOG' | 'FULL' | 'HUMAN_ONLY' | 'SUSPENDED';

function safeStr(v: unknown, fb = ''): string {
  return typeof v === 'string'
    ? v
    : typeof v === 'number' || typeof v === 'boolean'
      ? String(v)
      : fb;
}

/**
 * Manages CIA runtime state persistence: workspace autonomy snapshots,
 * autonomy run records, and contact catalog scheduling.
 * Extracted from CiaRuntimeService to keep that file under 600 lines.
 */
@Injectable()
export class CiaRuntimeStateService {
  private readonly logger = new Logger(CiaRuntimeStateService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly agentEvents: AgentEventsService,
    @Optional() private readonly opsAlert?: OpsAlertService,
  ) {}

  async persistRuntimeSnapshot(workspaceId: string, update: Record<string, unknown>) {
    const workspace = await this.prisma.workspace.findUnique({
      where: { id: workspaceId },
      select: { providerSettings: true },
    });

    if (!workspace) {
      return;
    }

    const settings = asProviderSettings(workspace.providerSettings);

    await this.prisma.workspace.update({
      where: { id: workspaceId },
      data: {
        providerSettings: toPrismaJsonValue({
          ...settings,
          ciaRuntime: {
            ...(settings.ciaRuntime || {}),
            ...update,
          },
        }),
      },
    });
  }

  async resetStaleRuntimeRunIfNeeded(
    workspaceId: string,
    runtime: Record<string, unknown>,
    reason: string,
  ): Promise<Record<string, unknown> | null> {
    const currentRunId = safeStr(runtime.currentRunId).trim();
    if (!currentRunId) {
      return null;
    }

    const startedAtRaw = safeStr(
      runtime.lastProgressAt || runtime.startedAt || runtime.updatedAt,
    ).trim();
    const startedAt = startedAtRaw ? new Date(startedAtRaw) : null;
    if (!startedAt || Number.isNaN(startedAt.getTime())) {
      return null;
    }

    if (Date.now() - startedAt.getTime() < CIA_RUNTIME_STALE_RUN_MS) {
      return null;
    }

    await this.updateAutonomyRunStatus(workspaceId, currentRunId, 'FAILED');
    const nextRuntime = {
      ...runtime,
      currentRunId: null,
      state: 'LIVE_READY',
      staleRunRecoveredAt: new Date().toISOString(),
      staleRunRecoveredFrom: currentRunId,
      lastRuntimeResetReason: `${reason}_stale_run_recovered`,
    };

    await this.persistRuntimeSnapshot(workspaceId, nextRuntime);
    return nextRuntime;
  }

  async scheduleContactCatalogRefresh(
    workspaceId: string,
    reason: string,
  ): Promise<{ scheduled: boolean; reason?: string }> {
    try {
      await autopilotQueue.add(
        'catalog-contacts-30d',
        {
          workspaceId,
          days: CIA_CONTACT_CATALOG_LOOKBACK_DAYS,
          reason,
        },
        {
          jobId: buildQueueJobId('catalog-contacts-30d', workspaceId),
          removeOnComplete: true,
        },
      );
      return { scheduled: true };
    } catch (error: unknown) {
      const err =
        error instanceof Error
          ? error
          : new Error(typeof error === 'string' ? error : 'unknown error');
      const message = String(err?.message || '');
      if (message.includes('Job is already waiting')) {
        void this.opsAlert?.alertOnDegradation(
          message,
          'CiaRuntimeStateService.scheduleContactCatalogRefresh',
          { workspaceId },
        );
        return { scheduled: false, reason: 'already_waiting' };
      }
      void this.opsAlert?.alertOnCriticalError(
        err,
        'CiaRuntimeStateService.scheduleContactCatalogRefresh',
        { workspaceId },
      );
      return { scheduled: false, reason: message || 'schedule_failed' };
    }
  }

  async finalizeSilentLiveMode(workspaceId: string, reason: string, runId?: string) {
    const catalog = await this.scheduleContactCatalogRefresh(workspaceId, reason);

    await this.updateWorkspaceAutonomy(workspaceId, {
      mode: 'FULL',
      reason,
      autopilot: {
        enabledByOwnerDecision: true,
        lastMode: 'reply_only_new',
        lastTrigger: reason,
        lastModeAt: new Date().toISOString(),
      },
      runtime: {
        state: 'LIVE_READY',
        currentRunId: null,
        mode: 'reply_only_new',
        autoStarted: false,
        catalogStatus: catalog.scheduled ? 'scheduled' : catalog.reason || 'idle',
      },
      autonomy: {
        reactiveEnabled: true,
        proactiveEnabled: false,
      },
    });

    await this.persistRuntimeSnapshot(workspaceId, {
      state: 'LIVE_READY',
      currentRunId: null,
      mode: 'reply_only_new',
      catalogStatus: catalog.scheduled ? 'scheduled' : catalog.reason || 'idle',
      lastCatalogScheduleReason: reason,
      lastCatalogScheduledAt: new Date().toISOString(),
    });

    await this.agentEvents.publish({
      type: 'status',
      workspaceId,
      runId,
      phase: 'live_ready',
      persistent: true,
      message: catalog.scheduled
        ? 'Backlog concluído. Vou manter a resposta ao vivo e iniciar a catalogação silenciosa dos contatos recentes.'
        : 'Backlog concluído. Vou manter a resposta ao vivo e permanecer em modo silencioso.',
      meta: { catalog },
    });
  }

  async updateWorkspaceAutonomy(
    workspaceId: string,
    input: {
      mode: WorkspaceAutonomyMode;
      reason: string;
      autopilot?: Record<string, unknown>;
      runtime?: Record<string, unknown>;
      autonomy?: Record<string, unknown>;
    },
  ) {
    const workspace = await this.prisma.workspace.findUnique({
      where: { id: workspaceId },
      select: { providerSettings: true },
    });

    if (!workspace) {
      return;
    }

    const settings = asProviderSettings(workspace.providerSettings);
    const autonomy = settings.autonomy || {};
    const now = new Date().toISOString();
    const autopilotEnabled = ['LIVE', 'BACKLOG', 'FULL'].includes(input.mode);

    await this.prisma.workspace.update({
      where: { id: workspaceId },
      data: {
        providerSettings: toPrismaJsonValue({
          ...settings,
          autopilot: {
            ...(settings.autopilot || {}),
            enabled: autopilotEnabled,
            ...input.autopilot,
          },
          autonomy: {
            ...autonomy,
            autoBootstrapOnConnected:
              input.autonomy?.autoBootstrapOnConnected ?? autonomy.autoBootstrapOnConnected ?? true,
            reactiveEnabled:
              input.autonomy?.reactiveEnabled ??
              (input.mode === 'OFF' || input.mode === 'HUMAN_ONLY' || input.mode === 'SUSPENDED'
                ? false
                : true),
            proactiveEnabled: input.autonomy?.proactiveEnabled ?? input.mode === 'FULL',
            mode: input.mode,
            reason: input.reason,
            lastTransitionAt: now,
          },
          ciaRuntime: {
            ...(settings.ciaRuntime || {}),
            ...(input.runtime || {}),
          },
        }),
      },
    });
  }

  async createAutonomyRun(
    runId: string,
    workspaceId: string,
    mode: WorkspaceAutonomyMode,
    meta?: Record<string, unknown>,
  ) {
    try {
      await this.prisma.autonomyRun.create({
        data: {
          id: runId,
          workspaceId,
          mode,
          status: 'RUNNING',
          meta: meta as import('@prisma/client').Prisma.InputJsonValue,
        },
      });
    } catch {
      // PULSE:OK — AutonomyRun record creation is best-effort; autonomy still executes
    }
  }

  async updateAutonomyRunStatus(workspaceId: string, runId: string | undefined, status: string) {
    if (!runId) {
      return;
    }

    try {
      await this.prisma.autonomyRun.updateMany({
        where: { id: runId, workspaceId },
        data: {
          status,
          endedAt:
            status === 'COMPLETED' || status === 'FAILED' || status === 'PAUSED'
              ? new Date()
              : undefined,
        },
      });
    } catch {
      // PULSE:OK — AutonomyRun status update is best-effort; status tracked in-memory
    }
  }

  async createExecution(workspaceId: string, runId: string, action: string) {
    return this.prisma.autonomyExecution.create({
      data: {
        workspaceId,
        actionType: action,
        idempotencyKey: `${workspaceId}:${runId}:${Date.now()}`,
        request: { runId },
        status: 'RUNNING',
      },
    });
  }

  async completeExecution(id: string, workspaceId: string, result: unknown) {
    return this.prisma.autonomyExecution.updateMany({
      where: { id, workspaceId },
      data: { status: 'COMPLETED', response: toPrismaJsonValue(result ?? {}) },
    });
  }

  /** Log a runtime warning (delegated helper for CiaRuntimeService). */
  warn(message: string) {
    this.logger.warn(message);
  }
}
