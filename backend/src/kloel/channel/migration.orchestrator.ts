import { Injectable } from '@nestjs/common';
import type {
  ChannelKind,
  DetectionInput,
  MigrationPlan,
} from './types';
import { filterByWorkspace } from './types';

@Injectable()
export class MigrationOrchestrator {
  public plan(
    input: DetectionInput,
    fromChannel: ChannelKind,
    toChannel: ChannelKind,
  ): MigrationPlan {
    const nowMs = input.nowMs ?? Date.now();
    const wsEvents = filterByWorkspace(input.events, input.workspaceId);

    const audienceSize = this.countAudience(wsEvents, fromChannel);
    const phasedSteps = audienceSize > 500 ? 5 : audienceSize > 100 ? 3 : 2;
    const estimatedDays = this.estimateDays(audienceSize, toChannel);

    const migrationEvents = wsEvents.filter(
      (e) => e.eventName.includes('migration') || e.eventName.includes('channel_switch'),
    );
    const riskLevel: 'low' | 'medium' | 'high' =
      migrationEvents.length > 10
        ? 'low'
        : audienceSize > 1000
          ? 'high'
          : 'medium';

    return {
      workspaceId: input.workspaceId,
      fromChannel,
      toChannel,
      audienceSize,
      phasedSteps,
      estimatedDays: Math.max(1, Math.min(estimatedDays, 365)),
      riskLevel,
      preparedAt: new Date(nowMs).toISOString(),
    };
  }

  private countAudience(
    events: readonly { eventName: string; payload?: Readonly<Record<string, unknown>> }[],
    channel: ChannelKind,
  ): number {
    const unique = new Set<string>();
    for (const e of events) {
      const ch = e.payload?.['channel'] as string | undefined;
      if (ch && ch !== channel) {
        continue;
      }
      const contactId = e.payload?.['contactId'] as string | undefined;
      if (contactId) {
        unique.add(contactId);
      }
    }
    return unique.size > 0 ? unique.size : 1;
  }

  private estimateDays(audienceSize: number, toChannel: ChannelKind): number {
    const dailyCapacity =
      toChannel === 'email'
        ? 5000
        : toChannel === 'whatsapp'
          ? 200
          : toChannel === 'sms'
            ? 300
            : toChannel === 'push'
              ? 1000
              : 500;
    return Math.ceil(audienceSize / dailyCapacity);
  }
}
