import { randomUUID } from 'node:crypto';
import { Inject, Injectable, forwardRef } from '@nestjs/common';
import {
  AUTOPILOT_SWEEP_UNREAD_CONVERSATIONS_JOB,
  buildSweepUnreadConversationsJobData,
} from '../contracts/autopilot-jobs';
import { PrismaService } from '../prisma/prisma.service';
import { buildQueueJobId } from '../queue/job-id.util';
import { autopilotQueue } from '../queue/queue';
import { AgentEventsService } from './agent-events.service';
import { CiaChatFilterService } from './cia-chat-filter.service';
import { CiaInlineFallbackService } from './cia-inline-fallback.service';
import { CiaRemoteBacklogService } from './cia-remote-backlog.service';
import { CiaRuntimeStateService } from './cia-runtime-state.service';
import { asProviderSettings } from './provider-settings.types';
import { WhatsAppProviderRegistry } from './providers/provider-registry';
import { WhatsAppCatchupService } from './whatsapp-catchup.service';
import { WorkerRuntimeService } from './worker-runtime.service';
import { CIA_BOOTSTRAP_AUTO_CONTINUE_LIMIT, CiaBootstrapService } from './cia-bootstrap.service';

type BacklogMode = 'reply_all_recent_first' | 'reply_only_new' | 'prioritize_hot';
type WorkspaceAutonomyMode = 'OFF' | 'LIVE' | 'BACKLOG' | 'FULL' | 'HUMAN_ONLY' | 'SUSPENDED';
const safeStr = (v: unknown, fb = ''): string =>
  typeof v === 'string' ? v : typeof v === 'number' || typeof v === 'boolean' ? String(v) : fb;

/**
 * Orchestrates the backlog run: decides between queue-based (BullMQ worker),
 * inline fallback, or remote fallback execution. Also handles ensureBacklogCoverage
 * — the recurring maintenance check that keeps the backlog drained while live.
 */
@Injectable()
export class CiaBacklogRunService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly providerRegistry: WhatsAppProviderRegistry,
    private readonly agentEvents: AgentEventsService,
    private readonly chatFilter: CiaChatFilterService,
    private readonly runtimeState: CiaRuntimeStateService,
    private readonly workerRuntime: WorkerRuntimeService,
    private readonly inlineFallback: CiaInlineFallbackService,
    private readonly remoteBacklog: CiaRemoteBacklogService,
    private readonly bootstrapService: CiaBootstrapService,
    @Inject(forwardRef(() => WhatsAppCatchupService))
    private readonly catchupService: WhatsAppCatchupService,
  ) {}

  async startBacklogRun(
    workspaceId: string,
    mode: BacklogMode = 'reply_all_recent_first',
    limit?: number,
    options?: {
      autoStarted?: boolean;
      runtimeState?: string;
      triggeredBy?: string;
    },
  ) {
    const status = await this.providerRegistry.getSessionStatus(workspaceId);
    if (!status.connected) {
      const message = 'Não consigo iniciar o backlog porque o WhatsApp não está conectado.';
      await this.agentEvents.publish({
        type: 'error',
        workspaceId,
        phase: 'backlog_start',
        message,
        persistent: true,
      });
      return {
        queued: false,
        message,
      };
    }

    const workspace = await this.prisma.workspace.findUnique({
      where: { id: workspaceId },
      select: { providerSettings: true },
    });

    const settings = asProviderSettings(workspace?.providerSettings);
    const triggeredBy = options?.triggeredBy || 'owner_command';
    const autonomyMode: WorkspaceAutonomyMode =
      triggeredBy === 'autopilot_total' ? 'FULL' : mode === 'reply_only_new' ? 'LIVE' : 'BACKLOG';

    const runId = randomUUID();
    const queueLimit = Math.max(1, Math.min(2000, Number(limit || 500) || 500));

    await this.runtimeState.createAutonomyRun(runId, workspaceId, autonomyMode, {
      backlogMode: mode,
      autoStarted: options?.autoStarted === true,
      triggeredBy,
      limit: queueLimit,
    });

    await this.runtimeState.updateWorkspaceAutonomy(workspaceId, {
      mode: autonomyMode,
      reason: triggeredBy,
      autopilot: {
        enabledByOwnerDecision: true,
        lastMode: mode,
        lastTrigger: triggeredBy,
        lastModeAt: new Date().toISOString(),
      },
      runtime: {
        currentRunId: runId,
        state:
          mode === 'reply_only_new'
            ? 'LIVE_AUTONOMY'
            : options?.runtimeState || 'EXECUTING_BACKLOG',
        mode,
        startedAt: new Date().toISOString(),
        autoStarted: options?.autoStarted === true,
      },
      autonomy: {
        reactiveEnabled: true,
        proactiveEnabled: false,
        autoBootstrapOnConnected: settings.autonomy?.autoBootstrapOnConnected ?? true,
      },
    });

    if (mode === 'reply_only_new') {
      await this.runtimeState.updateAutonomyRunStatus(workspaceId, runId, 'COMPLETED');

      await this.agentEvents.publish({
        type: 'status',
        workspaceId,
        phase: 'live_ready',
        message:
          'Autonomia ativa. Vou responder automaticamente apenas as novas mensagens a partir de agora.',
        persistent: true,
        runId,
      });

      return {
        queued: true,
        runId,
        mode,
        message: 'Autonomia ativa para novas mensagens. Nenhum sweep de backlog foi iniciado.',
      };
    }

    let previewCandidates = await this.bootstrapService.listPendingConversations(
      workspaceId,
      queueLimit,
    );

    if (!previewCandidates.length) {
      await this.catchupService
        .runCatchupNow(workspaceId, `cia_backlog_${triggeredBy}`)
        .catch(() => ({ scheduled: false }));
      previewCandidates = await this.bootstrapService.listPendingConversations(
        workspaceId,
        queueLimit,
      );
    }

    if (!previewCandidates.length) {
      const sessionKey = await this.bootstrapService.resolveActiveSessionKey(workspaceId);
      const remoteChats = await this.remoteBacklog.listRemotePendingChats(
        workspaceId,
        sessionKey,
        this.chatFilter.resolveInlineBacklogFallbackLimit(queueLimit),
      );
      if (remoteChats.length > 0) {
        const remoteResult = await this.remoteBacklog.runRemoteBacklogInlineFallback(
          workspaceId,
          runId,
          mode,
          remoteChats,
          sessionKey,
        );

        return {
          queued: true,
          runId,
          mode,
          totalQueued: remoteChats.length,
          autoStarted: options?.autoStarted === true,
          inlineFallback: true,
          remoteInlineFallback: true,
          processedInline: remoteResult.processed,
          skippedInline: remoteResult.skipped,
          message: remoteResult.message,
        };
      }
    }

    const workerAvailable = await this.workerRuntime.isAvailable();
    if (!workerAvailable) {
      const inlineCandidates = previewCandidates.slice(
        0,
        this.chatFilter.resolveInlineBacklogFallbackLimit(queueLimit),
      );
      const inlineResult = await this.inlineFallback.runBacklogInlineFallback(
        workspaceId,
        runId,
        mode,
        inlineCandidates,
      );

      return {
        queued: true,
        runId,
        mode,
        totalQueued: previewCandidates.length,
        autoStarted: options?.autoStarted === true,
        inlineFallback: true,
        processedInline: inlineResult.processed,
        skippedInline: inlineResult.skipped,
        message: inlineResult.message,
      };
    }

    await autopilotQueue.add(
      AUTOPILOT_SWEEP_UNREAD_CONVERSATIONS_JOB,
      buildSweepUnreadConversationsJobData({
        workspaceId,
        runId,
        limit: queueLimit,
        mode,
      }),
      {
        jobId: buildQueueJobId('cia-backlog', workspaceId, runId),
        removeOnComplete: true,
      },
    );

    await this.agentEvents.publish({
      type: 'status',
      workspaceId,
      phase: 'backlog_start',
      runId,
      persistent: true,
      message: options?.autoStarted
        ? `Autoexecução iniciada com ${previewCandidates.length} conversas elegíveis para gerar valor imediato.`
        : mode === 'prioritize_hot'
          ? `Vou priorizar os contatos mais recentes e mais quentes. Preparei ${previewCandidates.length} conversas elegíveis para começar.`
          : `Irei responder ${previewCandidates.length} conversas elegíveis por ordem dos mais recentes primeiro.`,
      meta: {
        totalQueued: previewCandidates.length,
        mode,
        autoStarted: options?.autoStarted === true,
      },
    });

    return {
      queued: true,
      runId,
      mode,
      totalQueued: previewCandidates.length,
      autoStarted: options?.autoStarted === true,
      message: options?.autoStarted
        ? 'Autoexecução imediata iniciada.'
        : mode === 'prioritize_hot'
          ? 'Backlog enfileirado com prioridade para contatos quentes.'
          : 'Backlog enfileirado por ordem dos mais recentes.',
    };
  }

  async ensureBacklogCoverage(
    workspaceId: string,
    options:
      | {
          triggeredBy?: string;
          limit?: number;
          allowBootstrap?: boolean;
        }
      | undefined,
    bootstrapFn: () => Promise<unknown>,
    startPresenceHeartbeat: (workspaceId: string) => Promise<void>,
    stopPresenceHeartbeat: (workspaceId: string) => Promise<void>,
  ) {
    const workspace = await this.prisma.workspace.findUnique({
      where: { id: workspaceId },
      select: { providerSettings: true },
    });
    const settings = asProviderSettings(workspace?.providerSettings);
    const autonomy = (settings.autonomy || {}) as Record<string, unknown>;
    const runtime = (settings.ciaRuntime || {}) as Record<string, unknown>;
    const autonomyMode = safeStr(autonomy.mode).trim().toUpperCase();
    const triggeredBy = options?.triggeredBy || 'runtime_maintenance';
    const staleRuntimeReset = await this.runtimeState.resetStaleRuntimeRunIfNeeded(
      workspaceId,
      runtime,
      triggeredBy,
    );
    const effectiveRuntime = staleRuntimeReset ? staleRuntimeReset : runtime;
    const effectiveRuntimeState = safeStr(effectiveRuntime.state).trim().toUpperCase();

    if (autonomy.autoBootstrapOnConnected === false) {
      return { action: 'skipped', reason: 'auto_bootstrap_disabled' };
    }

    if (!autonomyMode || autonomyMode === 'OFF' || effectiveRuntimeState === 'PAUSED') {
      await stopPresenceHeartbeat(workspaceId);
      if (options?.allowBootstrap === false) {
        return { action: 'skipped', reason: 'bootstrap_disallowed' };
      }
      return bootstrapFn();
    }

    if (autonomyMode === 'HUMAN_ONLY' || autonomyMode === 'SUSPENDED') {
      await stopPresenceHeartbeat(workspaceId);
      return { action: 'skipped', reason: 'autonomy_blocked' };
    }

    await startPresenceHeartbeat(workspaceId);

    if (
      ['EXECUTING_BACKLOG', 'EXECUTING_IMMEDIATELY'].includes(effectiveRuntimeState) ||
      safeStr(effectiveRuntime.currentRunId).trim()
    ) {
      return { action: 'skipped', reason: 'run_in_progress' };
    }

    const pendingConversations = await this.bootstrapService.listPendingConversations(
      workspaceId,
      options?.limit || 500,
    );
    if (!pendingConversations.length) {
      const chats = this.chatFilter.normalizeChats(
        await this.providerRegistry.getChats(workspaceId),
      );
      const remotePending = this.chatFilter.selectRemotePendingChats(chats);
      if (remotePending.length > 0) {
        return {
          action: 'backlog_started',
          run: await this.startBacklogRun(
            workspaceId,
            'reply_all_recent_first',
            Math.max(
              1,
              Math.min(options?.limit || CIA_BOOTSTRAP_AUTO_CONTINUE_LIMIT, remotePending.length),
            ),
            {
              autoStarted: true,
              runtimeState: 'EXECUTING_BACKLOG',
              triggeredBy,
            },
          ),
          remotePending: remotePending.length,
        };
      }

      await this.runtimeState.updateWorkspaceAutonomy(workspaceId, {
        mode: 'FULL',
        reason: triggeredBy,
        runtime: {
          state: 'LIVE_READY',
          currentRunId: null,
          mode: 'reply_only_new',
        },
        autonomy: {
          reactiveEnabled: true,
          proactiveEnabled: false,
          autoBootstrapOnConnected: settings.autonomy?.autoBootstrapOnConnected ?? true,
        },
      });
      const catalog = await this.runtimeState.scheduleContactCatalogRefresh(
        workspaceId,
        triggeredBy,
      );

      return {
        action: catalog.scheduled ? 'catalog_scheduled' : 'idle',
        pendingConversations: 0,
        catalog,
      };
    }

    const run = await this.startBacklogRun(
      workspaceId,
      'reply_all_recent_first',
      Math.max(
        1,
        Math.min(options?.limit || CIA_BOOTSTRAP_AUTO_CONTINUE_LIMIT, pendingConversations.length),
      ),
      {
        autoStarted: true,
        runtimeState: 'EXECUTING_BACKLOG',
        triggeredBy,
      },
    );

    return {
      action: 'backlog_started',
      run,
      pendingConversations: pendingConversations.length,
    };
  }
}
