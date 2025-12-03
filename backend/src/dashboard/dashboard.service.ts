import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { InjectRedis } from '@nestjs-modules/ioredis';
import Redis from 'ioredis';

@Injectable()
export class DashboardService {
  constructor(
    private prisma: PrismaService,
    @InjectRedis() private readonly redis: Redis,
  ) {}

  async getStats(workspaceId: string) {
    const workspace = await this.prisma.workspace.findUnique({
      where: { id: workspaceId },
      select: { providerSettings: true },
    });
    const billingSuspended =
      ((workspace?.providerSettings as any)?.billingSuspended ?? false) ===
      true;

    // 1. Basic Counts
    const [totalContacts, totalCampaigns, totalFlows] = await Promise.all([
      this.prisma.contact.count({ where: { workspaceId } }),
      this.prisma.campaign.count({ where: { workspaceId } }),
      this.prisma.flow.count({ where: { workspaceId } }),
    ]);

    // 2. Message Metrics (Real Aggregation)
    // Fetch counts by status for OUTBOUND messages
    const messageStats = await this.prisma.message.groupBy({
      by: ['status'],
      where: {
        workspaceId,
        direction: 'OUTBOUND',
        createdAt: { gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) }, // Last 30 days
      },
      _count: { status: true },
    });

    const statsMap = messageStats.reduce(
      (acc, curr) => {
        acc[curr.status] = curr._count.status;
        return acc;
      },
      {} as Record<string, number>,
    );

    const sent = statsMap['SENT'] || 0;
    const delivered = statsMap['DELIVERED'] || 0;
    const read = statsMap['READ'] || 0;
    const failed = statsMap['FAILED'] || 0;
    const totalOutbound = sent + delivered + read + failed;

    // Delivery Rate: (Delivered + Read) / Total Attempted
    const deliveryRate =
      totalOutbound > 0 ? ((delivered + read) / totalOutbound) * 100 : 0;

    // Read Rate (Open Rate): Read / (Delivered + Read)
    const deliveredOrRead = delivered + read;
    const readRate = deliveredOrRead > 0 ? (read / deliveredOrRead) * 100 : 0;

    // 3. Active Conversations
    const activeConversations = await this.prisma.conversation.count({
      where: { workspaceId, status: 'OPEN' },
    });

    // 4. Flow Executions (Today)
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);

    const flowExecutions = await this.prisma.flowExecution.groupBy({
      by: ['status'],
      where: {
        workspaceId,
        createdAt: { gte: todayStart },
      },
      _count: { status: true },
    });

    const flowStats = flowExecutions.reduce(
      (acc, curr) => {
        acc[curr.status] = curr._count.status;
        return acc;
      },
      {} as Record<string, number>,
    );

    // 5. Health Metrics (Redis Rolling Window)
    const key = `metrics:${workspaceId}`;
    const events = await this.redis.lrange(key, 0, -1);
    let healthScore = 100;
    let avgLatency = 0;

    if (events.length > 0) {
      let success = 0;
      let totalLatency = 0;
      events.forEach((e) => {
        const [ok, lat] = e.split(':');
        if (ok === '1') success++;
        totalLatency += Number(lat || 0);
      });
      healthScore = Math.round((success / events.length) * 100);
      avgLatency = Math.round(totalLatency / events.length);
    }

    return {
      contacts: totalContacts,
      campaigns: totalCampaigns,
      flows: totalFlows,
      messages: totalOutbound,

      // Calculated Rates
      deliveryRate: Number(deliveryRate.toFixed(1)),
      readRate: Number(readRate.toFixed(1)),
      errorRate:
        totalOutbound > 0
          ? Number(((failed / totalOutbound) * 100).toFixed(1))
          : 0,

      // Operational
      activeConversations,
      healthScore,
      avgLatency,

      // Flow Funnel (Today)
      flowCompleted: flowStats['COMPLETED'] || 0,
      flowRunning: flowStats['RUNNING'] || 0,
      flowFailed: flowStats['FAILED'] || 0,

      billingSuspended,
    };
  }
}
