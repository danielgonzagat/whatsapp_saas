import { Injectable, NotFoundException } from '@nestjs/common';
import { flowQueue } from '../queue/queue';
import { AgentEventsService } from '../whatsapp/agent-events.service';
import { CiaRuntimeService } from '../whatsapp/cia-runtime.service';
import { AccountAgentService } from '../whatsapp/account-agent.service';
import { PrismaService } from '../prisma/prisma.service';
import { buildQueueJobId } from '../queue/job-id.util';

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
    const businessState = (intelligence.businessState || {}) as Record<string, any>;

    return {
      title: 'KLOEL',
      subtitle: 'Trabalhando no seu WhatsApp',
      workspaceName: intelligence.workspaceName,
      state: intelligence.runtime?.state || 'IDLE',
      today: {
        soldAmount: Number(businessState.approvedSalesAmount || 0) || 0,
        activeConversations: Number(businessState.openBacklog || 0) || 0,
        pendingPayments: Number(businessState.pendingPaymentCount || 0) || 0,
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
        const task = (item.value as Record<string, any>) || {};
        return {
          memoryId: item.id,
          key: item.key,
          ...task,
          status: String(task.status || 'OPEN'),
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
    const approvedReply = String(input?.message || task.suggestedReply || '').trim();

    if (approvedReply && task.phone) {
      // messageLimit: enforced via PlanLimitsService.trackMessageSend
      await flowQueue.add(
        'send-message',
        {
          workspaceId,
          to: task.phone,
          user: task.phone,
          message: approvedReply,
          externalId: buildQueueJobId('cia-human-task', task.id),
        },
        {
          jobId: buildQueueJobId('cia-human-task', task.id),
          removeOnComplete: true,
        },
      );
    }

    if ((input?.resume ?? true) && task.conversationId) {
      await this.runtime.resumeConversationAutonomy(workspaceId, task.conversationId);
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
          ...((record.metadata as Record<string, any>) || {}),
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
        ? `Validação concluída. Enviei a resposta aprovada para ${task.phone || 'o contato'}.`
        : `Validação concluída. Retomei a autonomia da conversa ${task.conversationId || ''}.`,
      meta: {
        taskId,
        conversationId: task.conversationId || null,
        phone: task.phone || null,
      },
    });

    return {
      approved: true,
      taskId,
      sent: !!approvedReply,
      resumed: !!task.conversationId && (input?.resume ?? true),
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
          ...((record.metadata as Record<string, any>) || {}),
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
      message: `Exceção humana dispensada para ${task.phone || 'o contato'}.`,
      meta: {
        taskId,
        conversationId: task.conversationId || null,
        phone: task.phone || null,
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
    const prismaAny = this.prisma as Record<string, any>;
    if (prismaAny?.accountProofSnapshot?.findFirst) {
      const record = await prismaAny.accountProofSnapshot.findFirst({
        where: { workspaceId },
        orderBy: { createdAt: 'desc' },
      });

      if (record) {
        const metadata = (record.metadata as Record<string, any> | null) || {};
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
    }

    return this.getCycleProof(workspaceId);
  }

  async getConversationProof(workspaceId: string, conversationId: string) {
    const prismaAny = this.prisma as Record<string, any>;
    if (!prismaAny?.conversationProofSnapshot?.findFirst) {
      return null;
    }

    const record = await prismaAny.conversationProofSnapshot.findFirst({
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

    const value = (record.value as Record<string, any>) || {};
    return {
      id: record.id,
      key: record.key,
      type: record.type,
      summary: value.summary || record.content || null,
      cycleProofId:
        value.cycleProofId || (record.metadata as Record<string, any> | null)?.cycleProofId || null,
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

    return items.map((item) => {
      const value = (item.value as Record<string, any>) || {};
      return {
        id: item.id,
        category: item.category,
        type: item.type,
        contactId:
          value.contactId || (item.metadata as Record<string, any> | null)?.contactId || null,
        conversationId:
          value.conversationId ||
          (item.metadata as Record<string, any> | null)?.conversationId ||
          null,
        phone: value.phone || (item.metadata as Record<string, any> | null)?.phone || null,
        summary: value.summary || value.message || item.content || 'Sinal cognitivo disponível.',
        nextBestAction: value.nextBestAction || value.action || null,
        intent: value.intent || null,
        stage: value.stage || null,
        outcome: value.outcome || null,
        confidence: value.classificationConfidence || null,
        updatedAt: value.updatedAt || item.createdAt,
      };
    });
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
      const value = (item.value as Record<string, any>) || {};
      return String(value.id || '') === taskId;
    });

    if (!record) {
      throw new NotFoundException('Tarefa humana não encontrada');
    }

    return {
      record,
      task: (record.value as Record<string, any>) || {},
    };
  }
}
