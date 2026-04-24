import { Injectable, Logger, NotFoundException, OnModuleDestroy, Optional } from '@nestjs/common';
import { AuditService } from '../audit/audit.service';
import { PrismaService } from '../prisma/prisma.service';
import { AgentEventsService } from './agent-events.service';
import { CiaBacklogRunService } from './cia-backlog-run.service';
import { CiaBootstrapService } from './cia-bootstrap.service';
import { CiaRuntimeStateService } from './cia-runtime-state.service';
import { asProviderSettings } from './provider-settings.types';
import { WhatsAppProviderRegistry } from './providers/provider-registry';

/** Cia runtime service — orchestrates bootstrap, backlog, and live autonomy. */
@Injectable()
export class CiaRuntimeService implements OnModuleDestroy {
  private readonly logger = new Logger(CiaRuntimeService.name);
  private readonly presenceHeartbeatMs = Math.max(
    10_000,
    Number.parseInt(process.env.CIA_PRESENCE_HEARTBEAT_MS || '25000', 10) || 25_000,
  );
  private readonly presenceHeartbeats = new Map<string, NodeJS.Timeout>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly providerRegistry: WhatsAppProviderRegistry,
    private readonly agentEvents: AgentEventsService,
    private readonly runtimeState: CiaRuntimeStateService,
    private readonly bootstrapService: CiaBootstrapService,
    private readonly backlogRunService: CiaBacklogRunService,
    @Optional() private readonly auditService?: AuditService,
  ) {}

  /** On module destroy. */
  onModuleDestroy() {
    for (const workspaceId of this.presenceHeartbeats.keys()) {
      this.stopPresenceHeartbeat(workspaceId, false).catch(() => undefined);
    }
  }

  private async startPresenceHeartbeat(workspaceId: string) {
    if (process.env.NODE_ENV === 'test' || this.presenceHeartbeats.has(workspaceId)) {
      return;
    }

    await this.providerRegistry.setPresence(workspaceId, 'available').catch(() => undefined);

    let failCount = 0;
    const timer = setInterval(() => {
      void this.providerRegistry
        .setPresence(workspaceId, 'available')
        .then(() => {
          failCount = 0;
        })
        .catch(() => {
          failCount++;
          if (failCount >= 3) {
            clearInterval(timer);
            this.presenceHeartbeats.delete(workspaceId);
            this.logger.warn(
              `Presence heartbeat stopped for ${workspaceId} after 3 consecutive failures`,
            );
          }
        });
    }, this.presenceHeartbeatMs);

    this.presenceHeartbeats.set(workspaceId, timer);
  }

  private async stopPresenceHeartbeat(workspaceId: string, setOffline = true) {
    const existing = this.presenceHeartbeats.get(workspaceId);
    if (existing) {
      clearInterval(existing);
      this.presenceHeartbeats.delete(workspaceId);
    }

    if (setOffline) {
      await this.providerRegistry.setPresence(workspaceId, 'offline').catch(() => undefined);
    }
  }

  // ── Public orchestration ──────────────────────────────────────────────────

  /** Bootstrap: connect to WhatsApp, count pending conversations, start backlog. */
  async bootstrap(workspaceId: string) {
    return this.bootstrapService.run(
      workspaceId,
      (ws, mode, limit, opts) => this.startBacklogRun(ws, mode, limit, opts),
      (ws) => this.startPresenceHeartbeat(ws),
      (ws, setOffline) => this.stopPresenceHeartbeat(ws, setOffline),
    );
  }

  /** Start a backlog run (queue-based, inline fallback, or remote fallback). */
  async startBacklogRun(
    workspaceId: string,
    mode: 'reply_all_recent_first' | 'reply_only_new' | 'prioritize_hot' = 'reply_all_recent_first',
    limit?: number,
    options?: { autoStarted?: boolean; runtimeState?: string; triggeredBy?: string },
  ) {
    return this.backlogRunService.startBacklogRun(workspaceId, mode, limit, options);
  }

  /** Ensure backlog coverage — recurring maintenance triggered by watchdog/cron. */
  async ensureBacklogCoverage(
    workspaceId: string,
    options?: { triggeredBy?: string; limit?: number; allowBootstrap?: boolean },
  ) {
    return this.backlogRunService.ensureBacklogCoverage(
      workspaceId,
      options,
      () => this.bootstrap(workspaceId),
      (ws) => this.startPresenceHeartbeat(ws),
      (ws) => this.stopPresenceHeartbeat(ws),
    );
  }

  /** Get operational intelligence (business state, market signals, human tasks). */
  async getOperationalIntelligence(workspaceId: string) {
    const [workspace, businessState, marketSignals, humanTasks, demandStates, insights] =
      await Promise.all([
        this.prisma.workspace.findUnique({
          where: { id: workspaceId },
          select: { name: true, providerSettings: true },
        }),
        this.prisma.kloelMemory.findUnique({
          where: { workspaceId_key: { workspaceId, key: 'business_state:current' } },
        }),
        this.prisma.kloelMemory.findMany({
          where: { workspaceId, category: 'market_signal' },
          select: { id: true, key: true, value: true, updatedAt: true },
          orderBy: { updatedAt: 'desc' },
          take: 10,
        }),
        this.prisma.kloelMemory.findMany({
          where: { workspaceId, category: 'human_task' },
          select: { id: true, key: true, value: true, createdAt: true },
          orderBy: { createdAt: 'desc' },
          take: 10,
        }),
        this.prisma.kloelMemory.findMany({
          where: { workspaceId, category: 'demand_control' },
          select: { id: true, key: true, value: true, updatedAt: true },
          orderBy: { updatedAt: 'desc' },
          take: 20,
        }),
        this.prisma.systemInsight.findMany({
          where: {
            workspaceId,
            type: { in: ['CIA_HUMAN_TASK', 'CIA_MARKET_SIGNAL', 'CIA_GLOBAL_LEARNING'] },
          },
          select: {
            id: true,
            type: true,
            title: true,
            description: true,
            metadata: true,
            createdAt: true,
          },
          orderBy: { createdAt: 'desc' },
          take: 10,
        }),
      ]);

    return {
      workspaceName: workspace?.name || null,
      runtime: asProviderSettings(workspace?.providerSettings).ciaRuntime || null,
      autonomy: asProviderSettings(workspace?.providerSettings).autonomy || null,
      businessState: businessState?.value || null,
      marketSignals: marketSignals.map((item) => item.value),
      humanTasks: humanTasks.map((item) => item.value),
      demandStates: demandStates.map((item) => item.value),
      insights,
    };
  }

  /** Activate autopilot total (bootstrap + full backlog run). */
  async activateAutopilotTotal(workspaceId: string, limit?: number) {
    const bootstrap = await this.bootstrap(workspaceId);
    if (!bootstrap.connected) {
      return bootstrap;
    }

    const fullRun = await this.startBacklogRun(workspaceId, 'reply_all_recent_first', limit, {
      autoStarted: true,
      runtimeState: 'EXECUTING_BACKLOG',
      triggeredBy: 'autopilot_total',
    });

    await this.agentEvents.publish({
      type: 'status',
      workspaceId,
      phase: 'autopilot_total',
      persistent: true,
      runId: fullRun.runId,
      message:
        'Autopilot Total ativado. Vou assumir backlog, novas mensagens e ciclo contínuo do seu WhatsApp.',
      meta: { fullRun },
    });

    return { ...bootstrap, fullRun, autopilotTotal: true };
  }

  /** Pause autonomy. */
  async pauseAutonomy(workspaceId: string) {
    const workspace = await this.prisma.workspace.findUnique({
      where: { id: workspaceId },
      select: { providerSettings: true },
    });

    const settings = asProviderSettings(workspace?.providerSettings);
    const currentRunId = settings?.ciaRuntime?.currentRunId;

    await this.runtimeState.updateWorkspaceAutonomy(workspaceId, {
      mode: 'OFF',
      reason: 'manual_pause',
      autopilot: { pausedAt: new Date().toISOString() },
      runtime: { state: 'PAUSED' },
      autonomy: {
        reactiveEnabled: false,
        proactiveEnabled: false,
        autoBootstrapOnConnected: settings.autonomy?.autoBootstrapOnConnected ?? true,
      },
    });
    await this.runtimeState.updateAutonomyRunStatus(workspaceId, currentRunId, 'PAUSED');
    await this.stopPresenceHeartbeat(workspaceId);

    await this.agentEvents.publish({
      type: 'status',
      workspaceId,
      phase: 'paused',
      persistent: true,
      message: 'Autonomia pausada. Vou parar de agir até você me reativar.',
    });

    return { paused: true, state: 'PAUSED' };
  }

  /** Resume conversation autonomy. */
  async resumeConversationAutonomy(workspaceId: string, conversationId: string) {
    const conversation = await this.prisma.conversation.findFirst({
      where: { id: conversationId, workspaceId },
      select: {
        id: true,
        mode: true,
        contactId: true,
        contact: { select: { name: true, phone: true } },
      },
    });

    if (!conversation) {
      throw new NotFoundException('Conversa não encontrada');
    }

    if (typeof this.prisma.conversation.updateMany === 'function') {
      await this.prisma.conversation.updateMany({
        where: { id: conversationId, workspaceId },
        data: { mode: 'AI', assignedAgentId: null },
      });
    } else {
      await this.prisma.conversation.update({
        where: { id: conversationId },
        data: { mode: 'AI', assignedAgentId: null },
      });
    }

    await this.agentEvents.publish({
      type: 'status',
      workspaceId,
      phase: 'conversation_resumed',
      persistent: true,
      message: `Retomei a autonomia da conversa com ${conversation.contact?.name || conversation.contact?.phone || 'o contato'}.`,
      meta: {
        conversationId,
        contactId: conversation.contactId,
        phone: conversation.contact?.phone || null,
        previousMode: conversation.mode,
        mode: 'AI',
      },
    });

    return { conversationId, mode: 'AI', resumed: true };
  }

  // ── Execution records — delegated to CiaRuntimeStateService ──────────────

  async createExecution(workspaceId: string, runId: string, action: string) {
    return this.runtimeState.createExecution(workspaceId, runId, action);
  }

  /** Complete execution. */
  async completeExecution(id: string, workspaceId: string, result: unknown) {
    return this.runtimeState.completeExecution(id, workspaceId, result);
  }
}
