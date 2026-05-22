import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
/**
 * @cluster whatsapp_saas/backend/analytics
 * L11 multi-agent TaskGraph annotation (batched by tools/auto-pr/batch-job.mjs).
 */
export class QueueStatsService {
  private readonly logger = new Logger(QueueStatsService.name);

  constructor(private prisma: PrismaService) {
    this.logger.log('QueueStatsService initialized');
  }

  /** Get queue stats. */
  async getQueueStats(workspaceId: string) {
    const queues = await this.prisma.queue.findMany({
      where: { workspaceId },
      select: {
        id: true,
        name: true,
        _count: {
          select: {
            conversations: { where: { status: 'OPEN', assignedAgentId: null } },
          },
        },
      },
      take: 100,
    });

    return queues.map((q) => ({
      id: q.id,
      name: q.name,
      waitingCount: q._count.conversations,
    }));
  }
}
