import { Injectable } from '@nestjs/common';
import type {
  ChannelKind,
  ContingencyPlan,
  DetectionInput,
  MigrationReadiness,
} from './types';
import { filterByWorkspace } from './types';

@Injectable()
export class ContingencyPlanBuilder {
  public build(input: DetectionInput, failingChannel: ChannelKind): ContingencyPlan {
    const nowMs = input.nowMs ?? Date.now();
    const wsEvents = filterByWorkspace(input.events, input.workspaceId);

    const audienceSize = this.estimateAudienceSize(wsEvents, failingChannel);
    const targetChannels = this.rankAlternativeChannels(failingChannel);
    const migrationablePercent = this.estimateMigrationable(wsEvents, targetChannels);

    const steps = this.buildSteps(failingChannel, targetChannels, audienceSize);

    let readiness: MigrationReadiness = 'not_ready';
    if (targetChannels.length >= 2 && migrationablePercent > 30) {
      readiness = 'ready';
    } else if (targetChannels.length >= 1 && migrationablePercent > 10) {
      readiness = 'partial';
    }

    const estimatedMigrationDays = Math.ceil(audienceSize / (100 * targetChannels.length));

    return {
      workspaceId: input.workspaceId,
      failingChannel,
      targetChannels,
      migrationReadiness: readiness,
      estimatedMigrationDays: Math.max(1, Math.min(estimatedMigrationDays, 365)),
      audienceSize,
      migrationablePercent: Math.round(migrationablePercent * 10) / 10,
      steps,
      preparedAt: new Date(nowMs).toISOString(),
    };
  }

  private estimateAudienceSize(
    events: readonly { eventName: string; payload?: Readonly<Record<string, unknown>> }[],
    channel: ChannelKind,
  ): number {
    const uniqueContacts = new Set<string>();
    for (const e of events) {
      const ch = e.payload?.['channel'] as string | undefined;
      if (ch && ch !== channel) {
        continue;
      }
      const contactId = e.payload?.['contactId'] as string | undefined;
      if (contactId) {
        uniqueContacts.add(contactId);
      }
    }
    return uniqueContacts.size > 0 ? uniqueContacts.size : 1;
  }

  private rankAlternativeChannels(failingChannel: ChannelKind): ChannelKind[] {
    const priority: ChannelKind[] = ['email', 'whatsapp', 'sms', 'push', 'instagram', 'messenger', 'tiktok', 'owned_site'];
    return priority.filter((ch) => ch !== failingChannel);
  }

  private estimateMigrationable(
    events: readonly { eventName: string; payload?: Readonly<Record<string, unknown>> }[],
    targetChannels: readonly ChannelKind[],
  ): number {
    let withAlternative = 0;
    for (const e of events) {
      const contactEmail = e.payload?.['contactEmail'] as string | undefined;
      const contactPhone = e.payload?.['contactPhone'] as string | undefined;
      if (
        (contactEmail && targetChannels.includes('email')) ||
        (contactPhone && targetChannels.includes('whatsapp')) ||
        (contactPhone && targetChannels.includes('sms'))
      ) {
        withAlternative++;
      }
    }
    const total = events.length;
    return total > 0 ? (withAlternative / total) * 100 : 0;
  }

  private buildSteps(
    failingChannel: ChannelKind,
    targetChannels: readonly ChannelKind[],
    audienceSize: number,
  ): string[] {
    const steps: string[] = [];
    steps.push(`Identify ${audienceSize} contacts on ${failingChannel}`);
    for (const ch of targetChannels.slice(0, 3)) {
      steps.push(`Prepare ${ch} transport and verify delivery`);
    }
    steps.push(`Begin phased migration in 3 batches of ${Math.ceil(audienceSize / 3)} contacts`);
    steps.push(`Monitor delivery and engagement on new channels`);
    steps.push(`Complete cutover when new channel engagement reaches 80% of original`);
    return steps;
  }
}
