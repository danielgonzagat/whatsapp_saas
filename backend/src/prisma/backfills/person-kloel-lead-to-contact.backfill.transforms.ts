import type {
  BackfillContact,
  BackfillKloelLead,
  FunnelColumn,
} from './person-kloel-lead-to-contact.backfill.types';

/**
 * Compute the WRITE-IF-NULL funnel patch for an existing Contact: only keys the
 * Contact has not already set (live-traffic wins) are emitted. `totalMessages`
 * is treated as "unset" when it is still the default `0`.
 *
 * Returns an empty object when the Contact is already fully enriched - the
 * caller uses emptiness to decide whether a write is needed at all.
 */
export function computeFunnelPatch(
  lead: BackfillKloelLead,
  existing: Pick<
    BackfillContact,
    'leadStatus' | 'leadStage' | 'lastMessage' | 'lastIntent' | 'totalMessages'
  >,
): Partial<Record<FunnelColumn, string | number>> {
  const patch: Partial<Record<FunnelColumn, string | number>> = {};
  if (existing.leadStatus === null) {
    patch.leadStatus = lead.status;
  }
  if (existing.leadStage === null) {
    patch.leadStage = lead.stage;
  }
  if (existing.lastMessage === null && lead.lastMessage !== null) {
    patch.lastMessage = lead.lastMessage;
  }
  if (existing.lastIntent === null && lead.lastIntent !== null) {
    patch.lastIntent = lead.lastIntent;
  }
  if (existing.totalMessages === 0 && lead.totalMessages > 0) {
    patch.totalMessages = lead.totalMessages;
  }
  return patch;
}

/** Build the full funnel column set used when CREATING a brand-new Contact. */
export function buildContactCreateData(lead: BackfillKloelLead): Record<string, unknown> {
  return {
    workspaceId: lead.workspaceId,
    phone: lead.phone,
    ...(lead.name !== null ? { name: lead.name } : {}),
    ...(lead.email !== null ? { email: lead.email } : {}),
    kloelLeadId: lead.id,
    leadStatus: lead.status,
    leadStage: lead.stage,
    ...(lead.lastMessage !== null ? { lastMessage: lead.lastMessage } : {}),
    ...(lead.lastIntent !== null ? { lastIntent: lead.lastIntent } : {}),
    totalMessages: lead.totalMessages,
  };
}
