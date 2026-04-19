import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { buildQueueJobId } from '../queue/job-id.util';
import { flowQueue } from '../queue/queue';
import { AccountAgentService } from '../whatsapp/account-agent.service';
import { AgentEventsService } from '../whatsapp/agent-events.service';
import { CiaRuntimeService } from '../whatsapp/cia-runtime.service';

type JsonRecord = Record<string, unknown>;

@Injectable()
export class CiaService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly runtime: CiaRuntimeService,
    private readonly agentEvents: AgentEventsService,
    private readonly accountAgent: AccountAgentService,
  ) {}

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
    ] = await Promise.all([
      this.runtime.getOperationalIntelligence(workspaceId),
      this.getHumanTasks(workspaceId),
      this.getCognitiveHighlights(workspaceId),
      this.accountAgent.getRuntime(workspaceId),
      this.getCycleProof(workspaceId),
      this.getAccountProof(workspaceId),
      Promise.resolve(this.accountAgent.getCapabilityRegistry()),
      Promise.resolve(this.accountAgent.getConversationActionRegistry()),
    ]);
    const recent = this.agentEvents.getRecent(workspaceId).slice(-12);
    const latest = recent[recent.length - 1] || null;
    const businessState = this.readRecord(intelligence.businessState);

    return {
      title: 'KLOEL',
      subtitle: 'Trabalhando no seu WhatsApp',
      workspaceName: intelligence.workspaceName,
      state: intelligence.runtime?.state || 'IDLE',
      today: {
        soldAmount: this.readNumber(businessState.approvedSalesAmount),
        activeConversations: this.readNumber(businessState.openBacklog),
        pendingPayments: this.readNumber(businessState.pendingPaymentCount),
      },
      now: latest
        ? {
            message: latest.message,
            phase: latest.phase || null,
            type: latest.type,
            ts: latest.ts,
          }
        : null,
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
    };
  }

  async activateAutopilotTotal(workspaceId: string, limit?: number) {
    return this.runtime.activateAutopilotTotal(workspaceId, limit);
  }

  async getHumanTasks(workspaceId: string) {
    const items = await this.prisma.kloelMemory.findMany({
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

    return items
      .map((item) => {
        const task = this.readRecord(item.value);
        return {
          memoryId: item.id,
          key: item.key,
          ...task,
          status: this.readText(task.status) || 'OPEN',
        };
      })
      .filter((task) => task.status !== 'REJECTED' && task.status !== 'RESOLVED');
  }

  async approveHumanTask(
    workspaceId: string,
    taskId: string,
    input?: {
      message?: string;
      resume?: boolean;
    },
  ) {
    const { record, task } = await this.findHumanTask(workspaceId, taskId);
    const approvedReply = (input?.message || this.readText(task.suggestedReply)).trim();
    const taskPhone = this.readText(task.phone);
    const taskConversationId = this.readText(task.conversationId);
    const resolvedTaskId = this.readText(task.id) || taskId;

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

    const nextValue = {
      ...task,
      status: 'RESOLVED',
      resolvedAt: new Date().toISOString(),
      approvedReply: approvedReply || null,
    };

    await this.prisma.kloelMemory.update({
      where: {
        workspaceId_key: {
          workspaceId,
          key: record.key,
        },
      },
      data: {
        value: nextValue,
        metadata: {
          ...this.readRecord(record.metadata),
          status: 'RESOLVED',
          resolvedAt: nextValue.resolvedAt,
        },
      },
    });

    await this.agentEvents.publish({
      type: 'status',
      workspaceId,
      phase: 'human_task_approved',
      persistent: true,
      message: approvedReply
        ? `Validação concluída. Enviei a resposta aprovada para ${taskPhone || 'o contato'}.`
        : `Validação concluída. Retomei a autonomia da conversa ${taskConversationId}.`,
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

  async rejectHumanTask(workspaceId: string, taskId: string) {
    const { record, task } = await this.findHumanTask(workspaceId, taskId);
    const nextValue = {
      ...task,
      status: 'REJECTED',
      resolvedAt: new Date().toISOString(),
    };

    await this.prisma.kloelMemory.update({
      where: {
        workspaceId_key: {
          workspaceId,
          key: record.key,
        },
      },
      data: {
        value: nextValue,
        metadata: {
          ...this.readRecord(record.metadata),
          status: 'REJECTED',
          resolvedAt: nextValue.resolvedAt,
        },
      },
    });

    await this.agentEvents.publish({
      type: 'status',
      workspaceId,
      phase: 'human_task_rejected',
      persistent: true,
      message: `Exceção humana dispensada para ${this.readText(task.phone) || 'o contato'}.`,
      meta: {
        taskId,
        conversationId: this.readText(task.conversationId) || null,
        phone: this.readText(task.phone) || null,
      },
    });

    return {
      rejected: true,
      taskId,
    };
  }

  async resumeConversation(workspaceId: string, conversationId: string) {
    return this.runtime.resumeConversationAutonomy(workspaceId, conversationId);
  }

  async getAccountRuntime(workspaceId: string) {
    return this.accountAgent.getRuntime(workspaceId);
  }

  getCapabilityRegistry() {
    return this.accountAgent.getCapabilityRegistry();
  }

  getConversationActionRegistry() {
    return this.accountAgent.getConversationActionRegistry();
  }

  async getAccountApprovals(workspaceId: string) {
    return this.accountAgent.listApprovals(workspaceId);
  }

  async approveAccountApproval(workspaceId: string, approvalId: string) {
    return this.accountAgent.approveCatalogApproval(workspaceId, approvalId);
  }

  async rejectAccountApproval(workspaceId: string, approvalId: string) {
    return this.accountAgent.rejectCatalogApproval(workspaceId, approvalId);
  }

  async getAccountInputSessions(workspaceId: string) {
    return this.accountAgent.listInputSessions(workspaceId);
  }

  async getAccountWorkItems(workspaceId: string) {
    return this.accountAgent.getWorkItems(workspaceId);
  }

  async getAccountProof(workspaceId: string) {
    const record = await this.prisma.accountProofSnapshot.findFirst({
      where: { workspaceId },
      orderBy: { createdAt: 'desc' },
    });

    if (record) {
      const metadata = this.readRecord(record.metadata);
      return {
        id: record.id,
        canonical: true,
        proofType: record.proofType,
        status: record.status,
        cycleProofId: record.cycleProofId || null,
        noLegalActions: Boolean(record.noLegalActions),
        candidateCount: Number(record.candidateCount || 0),
        eligibleActionCount: Number(record.eligibleActionCount || 0),
        blockedActionCount: Number(record.blockedActionCount || 0),
        deferredActionCount: Number(record.deferredActionCount || 0),
        waitingApprovalCount: Number(record.waitingApprovalCount || 0),
        waitingInputCount: Number(record.waitingInputCount || 0),
        silentRemainderCount: Number(record.silentRemainderCount || 0),
        workItemUniverse: record.workItemUniverse || [],
        actionUniverse: record.actionUniverse || [],
        executedActions: record.executedActions || [],
        blockedActions: record.blockedActions || [],
        deferredActions: record.deferredActions || [],
        summary: metadata.summary || null,
        guaranteeReport: metadata.guaranteeReport || null,
        exhaustionReport: metadata.exhaustionReport || null,
        generatedAt: record.createdAt,
      };
    }

    return this.getCycleProof(workspaceId);
  }

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

    return {
      id: record.id,
      canonical: true,
      conversationId: record.conversationId,
      contactId: record.contactId || null,
      phone: record.phone || null,
      status: record.status,
      cycleProofId: record.cycleProofId || null,
      accountProofId: record.accountProofId || null,
      selectedActionType: record.selectedActionType,
      selectedTactic: record.selectedTactic || null,
      governor: record.governor || null,
      renderedMessage: record.renderedMessage || null,
      outcome: record.outcome || null,
      actionUniverse: record.actionUniverse || [],
      tacticUniverse: record.tacticUniverse || [],
      selectedAction: record.selectedAction || null,
      selectedTacticData: record.selectedTacticData || null,
      metadata: record.metadata || null,
      generatedAt: record.createdAt,
    };
  }

  async getCycleProof(workspaceId: string) {
    const record = await this.prisma.kloelMemory.findUnique({
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

    const value = this.readRecord(record.value);
    const metadata = this.readRecord(record.metadata);
    return {
      id: record.id,
      key: record.key,
      type: record.type,
      summary: value.summary || record.content || null,
      cycleProofId: value.cycleProofId || metadata.cycleProofId || null,
      generatedAt: value.generatedAt || record.createdAt,
      guaranteeReport: value.guaranteeReport || null,
      exhaustionReport: value.exhaustionReport || null,
    };
  }

  async respondToAccountInputSession(workspaceId: string, sessionId: string, answer?: string) {
    return this.accountAgent.respondToInputSession(workspaceId, sessionId, String(answer || ''));
  }

  async getCognitiveHighlights(workspaceId: string) {
    const items = await this.prisma.kloelMemory.findMany({
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

    return items.map((item) => this.serializeCognitiveHighlight(item));
  }

  private serializeCognitiveHighlight(item: {
    id: string;
    key: string;
    value: unknown;
    category: string;
    type: string | null;
    content: string | null;
    metadata: unknown;
    createdAt: Date;
  }) {
    const value = this.readRecord(item.value);
    const metadata = this.readRecord(item.metadata);
    return {
      id: item.id,
      category: item.category,
      type: item.type,
      contactId: value.contactId || metadata.contactId || null,
      conversationId: value.conversationId || metadata.conversationId || null,
      phone: value.phone || metadata.phone || null,
      summary: value.summary || value.message || item.content || 'Sinal cognitivo disponível.',
      nextBestAction: value.nextBestAction || value.action || null,
      intent: value.intent || null,
      stage: value.stage || null,
      outcome: value.outcome || null,
      confidence: value.classificationConfidence || null,
      updatedAt: value.updatedAt || item.createdAt,
    };
  }

  private async findHumanTask(workspaceId: string, taskId: string) {
    const candidates = await this.prisma.kloelMemory.findMany({
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

    const record = candidates.find((item) => {
      const value = this.readRecord(item.value);
      return this.readText(value.id) === taskId;
    });

    if (!record) {
      throw new NotFoundException('Tarefa humana não encontrada');
    }

    return {
      record,
      task: this.readRecord(record.value),
    };
  }

  private readRecord(value: unknown): JsonRecord {
    return typeof value === 'object' && value !== null && !Array.isArray(value)
      ? (value as JsonRecord)
      : {};
  }

  private readText(value: unknown): string {
    return typeof value === 'string' ? value : '';
  }

  private readNumber(value: unknown): number {
    if (typeof value === 'number' && Number.isFinite(value)) {
      return value;
    }

    if (typeof value === 'string') {
      const parsed = Number(value);
      return Number.isFinite(parsed) ? parsed : 0;
    }

    return 0;
  }
}
