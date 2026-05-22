import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
/**
 * @cluster whatsapp_saas/backend/analytics
 * L11 multi-agent TaskGraph annotation (batched by tools/auto-pr/batch-job.mjs).
 */
export class AgentPerformanceService {
  private readonly logger = new Logger(AgentPerformanceService.name);

  constructor(private prisma: PrismaService) {
    this.logger.log('AgentPerformanceService initialized');
  }

  /** Get agent performance. */
  async getAgentPerformance(workspaceId: string, startDate: Date, endDate: Date) {
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
      take: 10000,
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
      if (msg.direction === 'INBOUND' && msg.conversationId) {
        pendingCustomerMessages.set(msg.conversationId, msg.createdAt);
      } else if (msg.direction === 'OUTBOUND' && msg.agentId && msg.conversationId) {
        const lastCustomerMsgAt = pendingCustomerMessages.get(msg.conversationId);
        if (lastCustomerMsgAt) {
          const responseTimeSeconds =
            (msg.createdAt.getTime() - lastCustomerMsgAt.getTime()) / 1000;

          if (responseTimeSeconds < 86400) {
            const current = agentStats.get(msg.agentId) || {
              totalTime: 0,
              count: 0,
            };
            current.totalTime += responseTimeSeconds;
            current.count += 1;
            agentStats.set(msg.agentId, current);
          }

          pendingCustomerMessages.delete(msg.conversationId);
        }
      }
    }

    // Compila resultados
    const stats = messages.map((m) => {
      if (!m.agentId) {
        return { agentId: null, messageCount: m._count.id, avgResponseTime: 0 };
      }

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
}
