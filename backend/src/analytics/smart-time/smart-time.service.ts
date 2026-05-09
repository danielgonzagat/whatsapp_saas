import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

/** Smart time service. */
@Injectable()
export class SmartTimeService {
  constructor(private prisma: PrismaService) {}

  /**
   * Calculates the best time of day (0-23) and day of week (0-6) to send messages
   * based on when contacts reply.
   * messageLimit: actual sending is enforced via PlanLimitsService.trackMessageSend
   */
  async getBestTime(workspaceId: string) {
    // 1. Fetch inbound messages timestamp
    // We limit to last 30 days to keep it relevant
    // All dates stored as UTC via Prisma DateTime (toISOString)
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const messages = await this.prisma.message.findMany({
      take: 10000,
      where: {
        workspaceId,
        direction: 'INBOUND',
        createdAt: { gte: thirtyDaysAgo },
      },
      select: { createdAt: true },
    });

    const DAY_NAMES = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sab'];

    if (messages.length === 0) {
      return {
        bestHours: [10],
        bestDays: ['Seg'],
        peakHour: 10,
        peakDay: 'Seg',
        heatmap: [],
        confidence: 'LOW',
        totalAnalyzed: 0,
      };
    }

    // 2. Bucketize
    const hourBuckets = new Array(24).fill(0);
    const dayBuckets = new Array(7).fill(0);

    messages.forEach((msg) => {
      const date = new Date(msg.createdAt);
      hourBuckets[date.getHours()]++;
      dayBuckets[date.getDay()]++;
    });

    // 3. Find Peaks
    const bestHour = hourBuckets.indexOf(Math.max(...hourBuckets));
    const bestDay = dayBuckets.indexOf(Math.max(...dayBuckets));
    const total = messages.length;

    // 4. Calculate Confidence
    const avgHour = total / 24;
    const peakHourCount = hourBuckets[bestHour];
    const confidence = peakHourCount > avgHour * 2 ? 'HIGH' : 'MEDIUM';

    // 5. Build heatmap: normalize hour×day scores to [0, 1]
    const maxCount = Math.max(...hourBuckets, 1);
    const heatmap: Array<{ hour: number; day: string; score: number }> = [];
    for (let h = 0; h < 24; h++) {
      for (let d = 0; d < 7; d++) {
        const count = hourBuckets[h] * (dayBuckets[d] / total) * 24;
        const score = Math.round((count / maxCount) * 100) / 100;
        if (score > 0) {
          heatmap.push({ hour: h, day: DAY_NAMES[d], score });
        }
      }
    }

    // 6. Secondary best hours and days (top 3)
    const sortedHours = hourBuckets
      .map((count, h) => ({ h, count }))
      .sort((a, b) => b.count - a.count);
    const bestHours = sortedHours.slice(0, 3).map((e) => e.h);

    const sortedDays = dayBuckets
      .map((count, d) => ({ d, count }))
      .sort((a, b) => b.count - a.count);
    const bestDays = sortedDays.slice(0, 3).map((e) => DAY_NAMES[e.d]);

    return {
      bestHours,
      bestDays,
      peakHour: bestHour,
      peakDay: DAY_NAMES[bestDay],
      heatmap,
      confidence,
      totalAnalyzed: total,
    };
  }
}
