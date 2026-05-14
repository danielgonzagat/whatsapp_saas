import { Injectable } from '@nestjs/common';
import type {
  ChannelKind,
  DetectionInput,
  OwnedAudience,
} from './types';
import { filterByWorkspace } from './types';

@Injectable()
export class OwnedAudiencePusher {
  public assess(
    input: DetectionInput,
    fromChannel: ChannelKind,
    toOwnedChannel: ChannelKind,
  ): OwnedAudience {
    const nowMs = input.nowMs ?? Date.now();
    const wsEvents = filterByWorkspace(input.events, input.workspaceId);

    const channelContacts = new Set<string>();
    const migratedContacts = new Set<string>();
    let lastPushAt: string | undefined;

    for (const e of wsEvents) {
      const ch = e.payload?.['channel'] as string | undefined;
      const contactId = e.payload?.['contactId'] as string | undefined;
      if (!contactId) {
        continue;
      }

      if (ch === fromChannel) {
        channelContacts.add(contactId);
      }

      if (ch === toOwnedChannel && e.eventName.includes('migrated')) {
        migratedContacts.add(contactId);
        lastPushAt = e.occurredAt;
      }
    }

    const totalContacts = channelContacts.size;
    const migratedCount = migratedContacts.size;
    const migrationPercent = totalContacts > 0 ? (migratedCount / totalContacts) * 100 : 0;

    return {
      workspaceId: input.workspaceId,
      fromChannel,
      toOwnedChannel,
      totalContacts,
      migratedContacts: migratedCount,
      migrationPercent: Math.round(migrationPercent * 10) / 10,
      lastPushAt,
      assessedAt: new Date(nowMs).toISOString(),
    };
  }
}
