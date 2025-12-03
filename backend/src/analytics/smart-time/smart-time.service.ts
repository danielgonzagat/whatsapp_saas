import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class SmartTimeService {
  private readonly logger = new Logger(SmartTimeService.name);

  constructor(private prisma: PrismaService) {}

  /**
   * Calculates the best time of day (0-23) and day of week (0-6) to send messages
   * based on when contacts reply.
   */
  async getBestTime(workspaceId: string) {
    // 1. Fetch inbound messages timestamp
    // We limit to last 30 days to keep it relevant
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const messages = await this.prisma.message.findMany({
      where: {
        workspaceId,
        direction: 'INBOUND',
        createdAt: { gte: thirtyDaysAgo },
      },
      select: { createdAt: true },
    });

    if (messages.length === 0) {
      return { bestHour: 10, bestDay: 1, confidence: 'LOW' }; // Default: Mon 10am
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
    // Simple heuristic: if peak has > 2x average, confidence is high
    const avgHour = total / 24;
    const peakHourCount = hourBuckets[bestHour];
    const confidence = peakHourCount > avgHour * 2 ? 'HIGH' : 'MEDIUM';

    return {
      bestHour,
      bestDay,
      confidence,
      totalAnalyzed: total,
      distribution: { hours: hourBuckets, days: dayBuckets },
    };
  }
}
