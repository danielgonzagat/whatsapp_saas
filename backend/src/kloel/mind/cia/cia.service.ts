/**
 * MindLearningAdapter (canonical) — re-exported from {@link ./index.ts}.
 *
 * Per ADR-0006, CIA is a **learning adapter** — it feeds priors/baselines/
 * candidates into the Mind but does not make commercial decisions. Per
 * ADR-0013 Wave M4 (row #51), the canonical home for this @Injectable is
 * `backend/src/kloel/mind/cia/`. The legacy path
 * `backend/src/cia/cia.service.ts` is now a `@deprecated` re-export shim
 * during the 4-week alias window.
 *
 * @cluster Mind/CIA
 * @see docs/adr/0006-papeis-cognitivos-canonicos.md
 * @see docs/adr/0013-kloel-mind-unification.md
 */
import { Injectable, Logger, NotFoundException, Optional } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { PrismaService } from '../../../prisma/prisma.service';
import { buildQueueJobId } from '../../../queue/job-id.util';
import { flowQueue } from '../../../queue/queue';
import { AccountAgentService } from '../../../marketing/channels/whatsapp/account-agent.service';
import { AgentEventsService } from '../../../marketing/channels/whatsapp/agent-events.service';
import { CiaRuntimeService } from './cia-runtime.service';
import { MindService } from '../../mind.service';
import { readNumberForce } from '../../../common/parse';
import {
  buildChannelSubtitle,
  buildHumanTaskApprovalMessage,
  buildHumanTaskMetadataUpdate,
  buildHumanTaskRejectionMessage,
  buildNowEvent,
  buildRejectedHumanTaskValue,
  buildResolvedHumanTaskValue,
  collectActiveChannels,
  isActiveHumanTask,
  mapAccountProofRecord,
  mapConversationProofRecord,
  mapCycleProofRecord,
  mapHumanTaskListItem,
  mapMindLift,
  matchHumanTaskCandidate,
  readRecord,
  readText,
  serializeCognitiveHighlight,
} from './cia.service.helpers';
import { MindMemoryItemService } from '../aliases/mind-memory-item.service';

/** Cia service. */
@Injectable()
export class CiaService {
  private readonly logger = new Logger(CiaService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly runtime: CiaRuntimeService,
    private readonly agentEvents: AgentEventsService,
    private readonly accountAgent: AccountAgentService,
    private readonly mind: MindService,
    @Optional() private readonly mindMemory?: MindMemoryItemService,
  ) {}

  /**
   * Canonical Brain → Mind memory delegate. Routes reads/writes through the
   * `MindMemoryItemService` alias when injected, with a raw-Prisma fallback so
   * DI gaps never break behaviour. Byte-identical surface to `prisma.kloelMemory`.
   */
  private get mindMemoryItems(): PrismaService['kloelMemory'] {
    return this.mindMemory?.items ?? this.prisma.kloelMemory;
  }

  /** Get surface. */
  async getSurface(workspaceId: string) {
    const [
      intelligence,
      humanTasks,
      cognitiveHighlights,
      accountRuntime,
      cycleProof,
      accountProof,
      capabilityRegistry,
      conversationActionRegistry,
      mindLift,
      metaConnections,
      integrations,
      pipelineState,
    ] = await Promise.all([
      this.runtime.getOperationalIntelligence(workspaceId),
      this.getHumanTasks(workspaceId),
      this.getCognitiveHighlights(workspaceId),
      this.accountAgent.getRuntime(workspaceId),
      this.getCycleProof(workspaceId),
      this.getAccountProof(workspaceId),
      Promise.resolve(this.accountAgent.getCapabilityRegistry()),
      Promise.resolve(this.accountAgent.getConversationActionRegistry()),
      this.mind.lift(workspaceId, 'followup_timing').catch((err) => {
        this.logger.warn(`MIND lift unavailable for ${workspaceId}: ${String(err)}`);
        return null;
      }),
      this.prisma.metaConnection.findMany({
        where: { workspaceId },
        select: { whatsappPhoneNumberId: true, instagramAccountId: true, pageId: true },
      }),
      this.prisma.integration.findMany({
        where: { workspaceId, isActive: true },
        select: { type: true },
      }),
      this.prisma.pipelineState.findUnique({
        where: { workspaceId },
        select: { state: true },
      }),
    ]);
    const recent = this.agentEvents.getRecent(workspaceId).slice(-12);
    const latest = recent[recent.length - 1] || null;
    const businessState = readRecord(intelligence.businessState);

    const channels = collectActiveChannels(metaConnections, integrations);
    const subtitle = buildChannelSubtitle(channels);

    return {
      title: 'KLOEL',
      subtitle,
      workspaceName: intelligence.workspaceName,
      state: intelligence.runtime?.state || 'IDLE',
      today: {
        soldAmount: readNumberForce(businessState.approvedSalesAmount),
        activeConversations: readNumberForce(businessState.openBacklog),
        pendingPayments: readNumberForce(businessState.pendingPaymentCount),
      },
      now: buildNowEvent(latest),
      recent,
      businessState: intelligence.businessState,
      humanTasks: humanTasks.slice(0, 5),
      cognition: cognitiveHighlights,
      marketSignals: intelligence.marketSignals?.slice?.(0, 5) || [],
      insights: intelligence.insights?.slice?.(0, 5) || [],
      runtime: intelligence.runtime,
      autonomy: intelligence.autonomy,
      accountAgent: accountRuntime,
      cycleProof,
      accountProof,
      capabilityRegistry,
      conversationActionRegistry,
      mindLift: mapMindLift(mindLift),
      commercial: {
        pipelineMode: (pipelineState?.state ?? 'legacy') as 'shadow' | 'active' | 'legacy',
      },
    };
  }

  /** Activate autopilot total. */
  async activateAutopilotTotal(workspaceId: string, limit?: number) {
    return this.runtime.activateAutopilotTotal(workspaceId, limit);
  }

  /** Get human tasks. */
  async getHumanTasks(workspaceId: string) {
    const items = await this.mindMemoryItems.findMany({
      take: 50,
      where: {
        workspaceId,
        category: 'human_task',
      },
      select: {
        id: true,
        workspaceId: true,
        category: true,
        key: true,
        value: true,
        createdAt: true,
      },
      orderBy: { createdAt: 'desc' },
    });

    return items.map(mapHumanTaskListItem).filter(isActiveHumanTask);
  }

  /** Approve human task. */
  async approveHumanTask(
    workspaceId: string,
    taskId: string,
    input?: {
      message?: string;
      resume?: boolean;
    },
  ) {
    const { record, task } = await this.findHumanTask(workspaceId, taskId);
    const approvedReply = (input?.message || readText(task.suggestedReply)).trim();
    const taskPhone = readText(task.phone);
    const taskConversationId = readText(task.conversationId);
    const resolvedTaskId = readText(task.id) || taskId;

    if (approvedReply && taskPhone) {
      // messageLimit: enforced via PlanLimitsService.trackMessageSend
      await flowQueue.add(
        'send-message',
        {
          workspaceId,
          to: taskPhone,
          user: taskPhone,
          message: approvedReply,
          externalId: buildQueueJobId('cia-human-task', resolvedTaskId),
        },
        {
          jobId: buildQueueJobId('cia-human-task', resolvedTaskId),
          removeOnComplete: true,
        },
      );
    }

    if ((input?.resume ?? true) && taskConversationId) {
      await this.runtime.resumeConversationAutonomy(workspaceId, taskConversationId);
    }

    const resolvedAt = new Date().toISOString();
    const nextValue = buildResolvedHumanTaskValue(task, approvedReply, resolvedAt);

    await this.mindMemoryItems.update({
      where: {
        workspaceId_key: {
          workspaceId,
          key: record.key,
        },
      },
      data: {
        value: nextValue as Prisma.InputJsonValue,
        metadata: buildHumanTaskMetadataUpdate(
          record.metadata,
          'RESOLVED',
          resolvedAt,
        ) as Prisma.InputJsonValue,
      },
    });

    await this.agentEvents.publish({
      type: 'status',
      workspaceId,
      phase: 'human_task_approved',
      persistent: true,
      message: buildHumanTaskApprovalMessage(approvedReply, taskPhone, taskConversationId),
      meta: {
        taskId,
        conversationId: taskConversationId || null,
        phone: taskPhone || null,
      },
    });

    return {
      approved: true,
      taskId,
      sent: !!approvedReply,
      resumed: !!taskConversationId && (input?.resume ?? true),
    };
  }

  /** Reject human task. */
  async rejectHumanTask(workspaceId: string, taskId: string) {
    const { record, task } = await this.findHumanTask(workspaceId, taskId);
    const resolvedAt = new Date().toISOString();
    const nextValue = buildRejectedHumanTaskValue(task, resolvedAt);
    const taskPhone = readText(task.phone);

    await this.mindMemoryItems.update({
      where: {
        workspaceId_key: {
          workspaceId,
          key: record.key,
        },
      },
      data: {
        value: nextValue as Prisma.InputJsonValue,
        metadata: buildHumanTaskMetadataUpdate(
          record.metadata,
          'REJECTED',
          resolvedAt,
        ) as Prisma.InputJsonValue,
      },
    });

    await this.agentEvents.publish({
      type: 'status',
      workspaceId,
      phase: 'human_task_rejected',
      persistent: true,
      message: buildHumanTaskRejectionMessage(taskPhone),
      meta: {
        taskId,
        conversationId: readText(task.conversationId) || null,
        phone: taskPhone || null,
      },
    });

    return {
      rejected: true,
      taskId,
    };
  }

  /** Resume conversation. */
  async resumeConversation(workspaceId: string, conversationId: string) {
    return this.runtime.resumeConversationAutonomy(workspaceId, conversationId);
  }

  /** Get account runtime. */
  async getAccountRuntime(workspaceId: string) {
    return this.accountAgent.getRuntime(workspaceId);
  }

  /** Get capability registry. */
  getCapabilityRegistry() {
    return this.accountAgent.getCapabilityRegistry();
  }

  /** Get conversation action registry. */
  getConversationActionRegistry() {
    return this.accountAgent.getConversationActionRegistry();
  }

  /** Get account approvals. */
  async getAccountApprovals(workspaceId: string) {
    return this.accountAgent.listApprovals(workspaceId);
  }

  /** Approve account approval. */
  async approveAccountApproval(workspaceId: string, approvalId: string) {
    return this.accountAgent.approveCatalogApproval(workspaceId, approvalId);
  }

  /** Reject account approval. */
  async rejectAccountApproval(workspaceId: string, approvalId: string) {
    return this.accountAgent.rejectCatalogApproval(workspaceId, approvalId);
  }

  /** Get account input sessions. */
  async getAccountInputSessions(workspaceId: string) {
    return this.accountAgent.listInputSessions(workspaceId);
  }

  /** Get account work items. */
  async getAccountWorkItems(workspaceId: string) {
    return this.accountAgent.getWorkItems(workspaceId);
  }

  /** Get account proof. */
  async getAccountProof(workspaceId: string) {
    const record = await this.prisma.accountProofSnapshot.findFirst({
      where: { workspaceId },
      orderBy: { createdAt: 'desc' },
    });

    if (record) {
      return mapAccountProofRecord(record);
    }

    return this.getCycleProof(workspaceId);
  }

  /** Get conversation proof. */
  async getConversationProof(workspaceId: string, conversationId: string) {
    const record = await this.prisma.conversationProofSnapshot.findFirst({
      where: {
        workspaceId,
        conversationId,
      },
      orderBy: { createdAt: 'desc' },
    });

    if (!record) {
      return null;
    }

    return mapConversationProofRecord(record);
  }

  /** Get cycle proof. */
  async getCycleProof(workspaceId: string) {
    const record = await this.mindMemoryItems.findUnique({
      where: {
        workspaceId_key: {
          workspaceId,
          key: 'cia_cycle_proof:current',
        },
      },
    });

    if (!record) {
      return null;
    }

    return mapCycleProofRecord(record);
  }

  /** Respond to account input session. */
  async respondToAccountInputSession(workspaceId: string, sessionId: string, answer?: string) {
    return this.accountAgent.respondToInputSession(workspaceId, sessionId, String(answer || ''));
  }

  /** Get cognitive highlights. */
  async getCognitiveHighlights(workspaceId: string) {
    const items = await this.mindMemoryItems.findMany({
      where: {
        workspaceId,
        category: {
          in: ['cognitive_state', 'decision_outcome'],
        },
      },
      select: {
        id: true,
        key: true,
        value: true,
        category: true,
        type: true,
        content: true,
        metadata: true,
        createdAt: true,
      },
      orderBy: { createdAt: 'desc' },
      take: 12,
    });

    return items.map((item) => serializeCognitiveHighlight(item));
  }

  private async findHumanTask(workspaceId: string, taskId: string) {
    const candidates = await this.mindMemoryItems.findMany({
      where: {
        workspaceId,
        category: 'human_task',
      },
      select: {
        id: true,
        key: true,
        value: true,
        category: true,
        type: true,
        content: true,
        metadata: true,
        createdAt: true,
      },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });

    const record = candidates.find((item) => matchHumanTaskCandidate(item, taskId));

    if (!record) {
      throw new NotFoundException('Tarefa humana não encontrada');
    }

    return {
      record,
      task: readRecord(record.value),
    };
  }
}
