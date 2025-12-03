import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class SmartTimeService {
  constructor(private prisma: PrismaService) {}

  async getBestTimeToSend(workspaceId: string, contactId?: string) {
    // If contactId is provided, analyze specific contact habits
    // Otherwise, analyze workspace global habits

    const whereClause: any = {
      workspaceId,
      direction: 'INBOUND', // We want to know when THEY write
    };

    if (contactId) {
      whereClause.contactId = contactId;
    }

    const messages = await this.prisma.message.findMany({
      where: whereClause,
      select: { createdAt: true },
      take: 1000, // Sample size
    });

    if (messages.length === 0) return { hour: 10, reason: 'Default (No data)' }; // Default 10 AM

    const hourCounts = new Array(24).fill(0);
    messages.forEach((m) => {
      const hour = new Date(m.createdAt).getHours();
      hourCounts[hour]++;
    });

    const bestHour = hourCounts.indexOf(Math.max(...hourCounts));

    return {
      hour: bestHour,
      distribution: hourCounts,
      reason: contactId
        ? 'Based on contact history'
        : 'Based on workspace average',
    };
  }
}
