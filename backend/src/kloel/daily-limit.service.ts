import { Injectable, Optional } from '@nestjs/common';
import { StructuredLogger } from '../logging/structured-logger';
import { PrismaService } from '../prisma/prisma.service';
import { OpsAlertService } from '../observability/ops-alert.service';

type UnknownRecord = Record<string, unknown>;

function todayDate(): Date {
  const d = new Date();
  return new Date(`${d.toISOString().slice(0, 10)}T00:00:00.000Z`);
}

function todayDay(): string {
  return new Date().toISOString().slice(0, 10);
}

@Injectable()
export class DailyLimitService {
  private readonly logger = StructuredLogger.from(DailyLimitService.name);

  constructor(
    private readonly prisma: PrismaService,
    @Optional() private readonly opsAlert?: OpsAlertService,
  ) {}

  async isReply(context?: UnknownRecord): Promise<boolean> {
    const kind = String((context as UnknownRecord)?.['outboundKind'] ?? '').toLowerCase();
    return kind === 'reply' || kind === 'inbound-reply';
  }

  async ensureProactiveDailyLimit(
    workspaceId: string,
    channel: string,
  ): Promise<{ allowed: boolean; remaining: number; capAtDay: number }> {
    const normalizedChannel = String(channel || 'whatsapp').trim().toLowerCase();
    const config = await this.prisma.channelConfig.findUnique({
      where: { workspaceId_channel: { workspaceId, channel: normalizedChannel } },
      select: { dailyMessageLimit: true },
    });
    const cap = config?.dailyMessageLimit ?? 25;
    const day = todayDate();

    try {
      const counter = await this.prisma.dailyLimitCounter.upsert({
        where: {
          workspaceId_channel_day: {
            workspaceId,
            channel: normalizedChannel,
            day,
          },
        },
        update: { used: { increment: 1 }, capAtDay: cap },
        create: { workspaceId, channel: normalizedChannel, day, used: 1, capAtDay: cap },
        select: { used: true, capAtDay: true },
      });

      const used = counter.used;
      const remaining = Math.max(0, cap - used);

      if (used > cap) {
        this.logger.warn(
          `[DailyLimit] Proactive daily limit HIT — ws=${workspaceId} ch=${normalizedChannel} day=${todayDay()} used=${used} cap=${cap}`,
        );
        void this.opsAlert?.alertOnCriticalError(
          new Error(`daily-limit-exceeded: ws=${workspaceId} ch=${normalizedChannel}`),
          'DailyLimitService.ensureProactiveDailyLimit',
        );
        return { allowed: false, remaining: 0, capAtDay: cap };
      }

      return { allowed: true, remaining, capAtDay: cap };
    } catch (err) {
      void this.opsAlert?.alertOnCriticalError(err, 'DailyLimitService.ensureProactiveDailyLimit');
      if (err instanceof Error && err.message.includes('daily-limit')) {
        throw err;
      }
      this.logger.warn(
        `[DailyLimit] DB unavailable for daily limit check (ws=${workspaceId} ch=${normalizedChannel}): ${err instanceof Error ? err.message : 'unknown'}`,
      );
      return { allowed: true, remaining: -1, capAtDay: cap };
    }
  }
}
