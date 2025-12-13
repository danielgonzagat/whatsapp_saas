import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class AdvancedAnalyticsService {
  constructor(private prisma: PrismaService) {}

  private toDayKey(date: Date): string {
    const yyyy = date.getFullYear();
    const mm = String(date.getMonth() + 1).padStart(2, '0');
    const dd = String(date.getDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
  }

  async getAdvancedDashboard(workspaceId: string, startDate: Date, endDate: Date) {
    const [agentPerformance, queueStats] = await Promise.all([
      this.getAgentPerformance(workspaceId, startDate, endDate),
      this.getQueueStats(workspaceId),
    ]);

    const [sales, conversationsAgg, executionsAgg, newContactsCount] = await Promise.all([
      this.prisma.kloelSale.findMany({
        where: {
          workspaceId,
          createdAt: { gte: startDate, lte: endDate },
        },
        select: {
          amount: true,
          status: true,
          paymentMethod: true,
          createdAt: true,
          paidAt: true,
        },
        orderBy: { createdAt: 'asc' },
      }),
      this.prisma.conversation.groupBy({
        by: ['status'],
        where: {
          workspaceId,
          createdAt: { gte: startDate, lte: endDate },
        },
        _count: { id: true },
      }),
      this.prisma.flowExecution.groupBy({
        by: ['status'],
        where: {
          workspaceId,
          createdAt: { gte: startDate, lte: endDate },
        },
        _count: { id: true },
      }),
      this.prisma.contact.count({
        where: {
          workspaceId,
          createdAt: { gte: startDate, lte: endDate },
        },
      }),
    ]);

    const salesTotals = sales.reduce(
      (acc, s) => {
        acc.totalCount += 1;
        acc.totalAmount += s.amount || 0;
        if (s.status === 'paid') {
          acc.paidCount += 1;
          acc.paidAmount += s.amount || 0;
        }
        return acc;
      },
      { totalCount: 0, totalAmount: 0, paidCount: 0, paidAmount: 0 },
    );

    const salesByDayMap = new Map<string, { day: string; paidAmount: number; paidCount: number; totalCount: number }>();
    for (const s of sales) {
      const dayKey = this.toDayKey(s.paidAt || s.createdAt);
      const current = salesByDayMap.get(dayKey) || {
        day: dayKey,
        paidAmount: 0,
        paidCount: 0,
        totalCount: 0,
      };
      current.totalCount += 1;
      if (s.status === 'paid') {
        current.paidAmount += s.amount || 0;
        current.paidCount += 1;
      }
      salesByDayMap.set(dayKey, current);
    }

    const salesByDay = Array.from(salesByDayMap.values()).sort((a, b) => a.day.localeCompare(b.day));

    const conversationsByStatus = conversationsAgg.reduce((acc: Record<string, number>, row) => {
      acc[row.status] = row._count.id;
      return acc;
    }, {});

    const executionsByStatus = executionsAgg.reduce((acc: Record<string, number>, row) => {
      acc[row.status] = row._count.id;
      return acc;
    }, {});

    const executionsTotal = Object.values(executionsByStatus).reduce((sum, value) => sum + value, 0);
    const executionsCompleted = executionsByStatus.COMPLETED || 0;
    const executionsFailed = executionsByStatus.FAILED || 0;

    const topFlowAgg = await this.prisma.flowExecution.groupBy({
      by: ['flowId'],
      where: {
        workspaceId,
        createdAt: { gte: startDate, lte: endDate },
      },
      _count: { id: true },
      orderBy: { _count: { id: 'desc' } },
      take: 5,
    });

    const flowIds = topFlowAgg.map((row) => row.flowId);
    const flows = await this.prisma.flow.findMany({
      where: { id: { in: flowIds }, workspaceId },
      select: { id: true, name: true },
    });
    const flowNameById = new Map(flows.map((f) => [f.id, f.name || f.id]));

    const topFlows = topFlowAgg.map((row) => ({
      flowId: row.flowId,
      name: flowNameById.get(row.flowId) || row.flowId,
      executions: row._count.id,
    }));

    return {
      range: {
        startDate: startDate.toISOString(),
        endDate: endDate.toISOString(),
      },
      sales: {
        totals: {
          totalCount: salesTotals.totalCount,
          totalAmount: Math.round(salesTotals.totalAmount * 100) / 100,
          paidCount: salesTotals.paidCount,
          paidAmount: Math.round(salesTotals.paidAmount * 100) / 100,
          conversionRate: salesTotals.totalCount > 0 ? salesTotals.paidCount / salesTotals.totalCount : 0,
        },
        byDay: salesByDay,
      },
      leads: {
        newContacts: newContactsCount,
      },
      inbox: {
        conversationsByStatus,
        waitingByQueue: queueStats,
      },
      funnels: {
        executionsByStatus,
        totals: {
          total: executionsTotal,
          completed: executionsCompleted,
          failed: executionsFailed,
          completionRate: executionsTotal > 0 ? executionsCompleted / executionsTotal : 0,
        },
        topFlows,
      },
      agents: {
        performance: agentPerformance,
      },
      queues: {
        stats: queueStats,
      },
    };
  }

  async getAgentPerformance(
    workspaceId: string,
    startDate: Date,
    endDate: Date,
  ) {
    // 1. Messages count per agent
    const messages = await this.prisma.message.groupBy({
      by: ['agentId'],
      where: {
        workspaceId,
        agentId: { not: null },
        createdAt: { gte: startDate, lte: endDate },
      },
      _count: { id: true },
    });

    // 2. Average Response Time (Real Calculation)
    // Busca mensagens ordenadas para parear pergunta-resposta
    const interactions = await this.prisma.message.findMany({
      where: {
        workspaceId,
        createdAt: { gte: startDate, lte: endDate },
      },
      select: {
        id: true,
        agentId: true,
        direction: true,
        createdAt: true,
        conversationId: true,
      },
      orderBy: { createdAt: 'asc' },
    });

    // Mapa para acumular tempos por agente
    const agentStats = new Map<string, { totalTime: number; count: number }>();
    // Mapa para rastrear a última mensagem do cliente por conversa que precisa de resposta
    const pendingCustomerMessages = new Map<string, Date>();

    for (const msg of interactions) {
      if (msg.direction === 'INBOUND') {
        // Marca hora que o cliente falou
        pendingCustomerMessages.set(msg.conversationId, msg.createdAt);
      } else if (msg.direction === 'OUTBOUND' && msg.agentId) {
        // Se o agente respondeu e havia uma msg pendente
        const lastCustomerMsgAt = pendingCustomerMessages.get(msg.conversationId);
        if (lastCustomerMsgAt) {
          const responseTimeSeconds = (msg.createdAt.getTime() - lastCustomerMsgAt.getTime()) / 1000;
          
          // Ignora tempos absurdos (ex: > 24h) que distorcem a média (outliers)
          if (responseTimeSeconds < 86400) {
            const current = agentStats.get(msg.agentId) || { totalTime: 0, count: 0 };
            current.totalTime += responseTimeSeconds;
            current.count += 1;
            agentStats.set(msg.agentId, current);
          }
          
          // Limpa pendência
          pendingCustomerMessages.delete(msg.conversationId);
        }
      }
    }

    // Compila resultados
    const stats = messages.map((m) => {
      if (!m.agentId) return { agentId: null, messageCount: m._count.id, avgResponseTime: 0 };
      
      const s = agentStats.get(m.agentId);
      const realAvg = s && s.count > 0 ? Math.round(s.totalTime / s.count) : 0;

      return {
        agentId: m.agentId,
        messageCount: m._count.id,
        avgResponseTime: realAvg, // Real seconds based on interactions
      };
    });

    return stats;
  }

  async getQueueStats(workspaceId: string) {
    const queues = await this.prisma.queue.findMany({
      where: { workspaceId },
      include: {
        _count: {
          select: {
            conversations: { where: { status: 'OPEN', assignedAgentId: null } },
          },
        },
      },
    });

    return queues.map((q) => ({
      id: q.id,
      name: q.name,
      waitingCount: q._count.conversations,
    }));
  }
}
