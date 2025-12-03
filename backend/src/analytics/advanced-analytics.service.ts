import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class AdvancedAnalyticsService {
  constructor(private prisma: PrismaService) {}

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
