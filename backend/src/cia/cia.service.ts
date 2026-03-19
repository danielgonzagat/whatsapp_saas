import { Injectable, NotFoundException } from '@nestjs/common';
import { flowQueue } from '../queue/queue';
import { AgentEventsService } from '../whatsapp/agent-events.service';
import { CiaRuntimeService } from '../whatsapp/cia-runtime.service';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class CiaService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly runtime: CiaRuntimeService,
    private readonly agentEvents: AgentEventsService,
  ) {}

  async getSurface(workspaceId: string) {
    const intelligence = await this.runtime.getOperationalIntelligence(workspaceId);
    const humanTasks = await this.getHumanTasks(workspaceId);
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
      marketSignals: intelligence.marketSignals?.slice?.(0, 5) || [],
      insights: intelligence.insights?.slice?.(0, 5) || [],
      runtime: intelligence.runtime,
      autonomy: intelligence.autonomy,
    };
  }

  async activateAutopilotTotal(workspaceId: string, limit?: number) {
    return this.runtime.activateAutopilotTotal(workspaceId, limit);
  }

  async getHumanTasks(workspaceId: string) {
    const items = await this.prisma.kloelMemory.findMany({
      where: {
        workspaceId,
        category: 'human_task',
      },
      orderBy: { createdAt: 'desc' },
      take: 50,
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
    const approvedReply = String(
      input?.message || task.suggestedReply || '',
    ).trim();

    if (approvedReply && task.phone) {
      await flowQueue.add(
        'send-message',
        {
          workspaceId,
          to: task.phone,
          user: task.phone,
          message: approvedReply,
          externalId: `cia-human-task:${task.id}`,
        },
        {
          jobId: `cia-human-task:${task.id}`,
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

  private async findHumanTask(workspaceId: string, taskId: string) {
    const candidates = await this.prisma.kloelMemory.findMany({
      where: {
        workspaceId,
        category: 'human_task',
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
